package com.xcentic.bhy.permissions

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.xcentic.bhy.specs.NativeDriverPermissionsSpec

/**
 * Overlay and battery-optimisation access — the two grants going on duty needs
 * that `PermissionsAndroid` cannot see or ask for. See `NativeDriverPermissions`
 * for why they are different from ordinary runtime permissions.
 *
 * Both requests are settings screens rather than dialogs, so the pattern is the
 * same for each: start the screen with `startActivityForResult` and, when the
 * driver comes back, **re-read the actual state** instead of trusting
 * `resultCode`. Neither screen reports the outcome — the overlay one returns
 * `RESULT_CANCELED` even when the driver flipped the switch on — so the result
 * callback is used purely as a "they're back now" signal.
 *
 * That signal is also not entirely reliable: some OEM ROMs return from the
 * overlay screen immediately, before the driver has done anything. The JS side
 * re-reads both grants whenever the app comes to the foreground, which is what
 * actually settles the state; the promises here are the fast path, not the
 * source of truth.
 */
class DriverPermissionsModule(reactContext: ReactApplicationContext) :
    NativeDriverPermissionsSpec(reactContext) {

  companion object {
    const val NAME = "DriverPermissions"

    private const val OVERLAY_REQUEST = 7401
    private const val BATTERY_REQUEST = 7402

    private const val E_NO_ACTIVITY = "no_activity"
    private const val E_UNAVAILABLE = "unavailable"
  }

  /** The settings screen currently open, if any, and the promise waiting on it. */
  private var pending: Promise? = null
  private var pendingRequest = 0

  private val activityListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != pendingRequest) {
            return
          }
          val promise = pending ?: return
          settle()
          promise.resolve(
              if (requestCode == OVERLAY_REQUEST) canDrawOverlaysNow()
              else isIgnoringBatteryNow()
          )
        }
      }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(activityListener)
    // A reload with a settings screen open would otherwise leave the JS promise
    // hanging forever.
    pending?.resolve(false)
    settle()
    super.invalidate()
  }

  /* ------------------------------------------------ reads */

  override fun canDrawOverlays(promise: Promise) {
    promise.resolve(canDrawOverlaysNow())
  }

  override fun isIgnoringBatteryOptimizations(promise: Promise) {
    promise.resolve(isIgnoringBatteryNow())
  }

  private fun canDrawOverlaysNow(): Boolean =
      Settings.canDrawOverlays(reactApplicationContext)

  private fun isIgnoringBatteryNow(): Boolean {
    // No PowerManager means no Doze to be exempted from — nothing to ask for.
    val power =
        reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            ?: return true
    return power.isIgnoringBatteryOptimizations(reactApplicationContext.packageName)
  }

  /* ------------------------------------------------ requests */

  override fun requestOverlay(promise: Promise) {
    if (canDrawOverlaysNow()) {
      promise.resolve(true)
      return
    }
    launch(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri()),
        // Some ROMs have no per-app overlay screen; the app's own details page
        // always exists and carries the same toggle.
        fallback =
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri()),
        requestCode = OVERLAY_REQUEST,
        promise = promise,
    )
  }

  override fun requestIgnoreBatteryOptimizations(promise: Promise) {
    if (isIgnoringBatteryNow()) {
      promise.resolve(true)
      return
    }
    launch(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri()),
        // The one-tap dialog is missing on a fair number of Chinese ROMs. The
        // full list is a worse experience but it is always there.
        fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        requestCode = BATTERY_REQUEST,
        promise = promise,
    )
  }

  /* ------------------------------------------------ plumbing */

  private fun packageUri(): Uri = Uri.parse("package:${reactApplicationContext.packageName}")

  private fun launch(intent: Intent, fallback: Intent, requestCode: Int, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject(E_NO_ACTIVITY, "The app is not in the foreground.")
      return
    }

    // A second tap while a screen is already open: let the first promise go
    // rather than leaving it to time out on the JS side.
    pending?.resolve(false)
    pending = promise
    pendingRequest = requestCode

    try {
      activity.startActivityForResult(intent, requestCode)
      return
    } catch (_: ActivityNotFoundException) {
      // Fall through.
    }

    try {
      activity.startActivityForResult(fallback, requestCode)
    } catch (_: ActivityNotFoundException) {
      settle()
      promise.reject(E_UNAVAILABLE, "This device has no settings screen for that.")
    }
  }

  private fun settle() {
    pending = null
    pendingRequest = 0
  }
}

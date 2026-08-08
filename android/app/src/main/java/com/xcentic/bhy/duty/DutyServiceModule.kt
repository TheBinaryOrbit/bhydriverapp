package com.xcentic.bhy.duty

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.xcentic.bhy.specs.NativeDutyServiceSpec

/**
 * Starts and stops [DutyService] from the duty switch.
 *
 * Every failure resolves `false` rather than rejecting. Android refuses a
 * foreground service start for reasons the driver cannot act on and did not
 * cause — a location grant revoked from the notification shade while the app was
 * closed, an OEM background-start restriction — and none of them are worth
 * failing the switch over. The driver still goes on duty; what they lose is duty
 * surviving them leaving the app, which the caller reports in its own words.
 *
 * @see NativeDutyService for the JS-side contract.
 */
class DutyServiceModule(reactContext: ReactApplicationContext) :
    NativeDutyServiceSpec(reactContext) {

  companion object {
    const val NAME = "DutyService"
  }

  override fun getName(): String = NAME

  override fun start(title: String, body: String, promise: Promise) {
    try {
      DutyService.start(reactApplicationContext, title, body)
      promise.resolve(true)
    } catch (error: Exception) {
      // Two refusals in particular: a `SecurityException` on API 34+ when the
      // `location` service type has no location grant left behind it, and
      // `ForegroundServiceStartNotAllowedException` on API 31+ for a start from
      // the background. Caught together rather than separately — the second is
      // an API-31 type this app cannot name without resolving it on devices
      // that have never heard of it, and the driver's move is the same for
      // both: check the permissions and flip the switch again.
      Log.w(NAME, "Foreground service refused the start", error)
      promise.resolve(false)
    }
  }

  override fun stop() {
    DutyService.stop(reactApplicationContext)
  }

  override fun isRunning(): Boolean = DutyService.isRunning
}

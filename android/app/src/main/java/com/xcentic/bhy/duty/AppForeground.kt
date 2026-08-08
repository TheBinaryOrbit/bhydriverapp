package com.xcentic.bhy.duty

import android.app.Activity
import android.app.Application
import android.os.Bundle

/**
 * Whether any of this app's own screens is in front of the driver.
 *
 * Registered from `MainApplication`, and it has to be: an `Application` is
 * created before its first activity, so the count starts at zero and stays
 * honest. Registering the same callbacks from [DutyService] would miss the
 * resume that already happened — the driver taps the duty switch *in* the app,
 * so by the time the service exists `MainActivity` is long since resumed and the
 * count would read empty for a screen that is plainly on.
 *
 * Counted rather than a boolean because a resume overlaps the pause of the
 * activity it replaces; a boolean would read "gone" for one frame on every
 * navigation and blink the bubble.
 */
object AppForeground : Application.ActivityLifecycleCallbacks {

  /**
   * Ran on the main thread after every change. One slot, because there is one
   * consumer — [DutyService], for as long as a shift is running.
   */
  var onChange: (() -> Unit)? = null

  private var resumed = 0

  val isForeground: Boolean
    get() = resumed > 0

  override fun onActivityResumed(activity: Activity) {
    resumed++
    onChange?.invoke()
  }

  override fun onActivityPaused(activity: Activity) {
    resumed = (resumed - 1).coerceAtLeast(0)
    onChange?.invoke()
  }

  override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit

  override fun onActivityStarted(activity: Activity) = Unit

  override fun onActivityStopped(activity: Activity) = Unit

  override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit

  override fun onActivityDestroyed(activity: Activity) = Unit
}

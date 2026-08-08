package com.xcentic.bhy.duty

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.xcentic.bhy.MainActivity
import com.xcentic.bhy.R

/**
 * Duty, kept running while the driver is somewhere else — or nowhere at all.
 *
 * The service holds no socket, takes no fixes and knows nothing about rides.
 * All of that stays in JS, where it already works. What it provides is the
 * three things JS cannot give itself:
 *
 * 1. **A process Android will not suspend**, plus the `location` service type
 *    that makes background fixes legal from API 29 on.
 * 2. **A live JS runtime.** React Native's timers are driven by a Choreographer
 *    frame callback that `onHostPause` removes, so `setInterval` — and with it
 *    the 5s `driver:location` ping — stops the moment the last activity pauses.
 *    The one documented exception is an active headless task, which puts the
 *    callback back (`JavaTimerManager.onHeadlessJsTaskStart`). So this service
 *    holds a task open for the entire shift. Keeping the process alive without
 *    it buys a driver who is in the index and not moving, which is worse than
 *    being offline: dispatch keeps sending them rides at a stale position.
 * 3. **A way back from nothing.** Swiping the app out of recents destroys the
 *    activity, and Android may reclaim the process outright. Either way the
 *    service comes back, starts a React context of its own, and the task
 *    reconnects — see `dutyTask` in `src/services/dutyTask.ts`.
 *
 * Duty therefore ends when the driver ends it, and not before.
 *
 * @see com.xcentic.bhy.duty.DutyServiceModule for the JS entry point.
 */
class DutyService : Service() {

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val TAG = "DutyService"
    private const val CHANNEL_ID = "duty"
    private const val NOTIFICATION_ID = 4701

    /** Matches `AppRegistry.registerHeadlessTask` in `index.js`. */
    private const val TASK_KEY = "DutyTask"

    /**
     * Read from the JS thread by `isRunning()`, written on the main thread by
     * the lifecycle callbacks below — hence `@Volatile`.
     *
     * A static flag rather than `ActivityManager.getRunningServices`, which has
     * been deprecated to "your own services only" for years and still lies about
     * timing: it reports a service as running for a moment after `stopSelf`.
     */
    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context, title: String, body: String) {
      val intent =
          Intent(context, DutyService::class.java).apply {
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
          }
      // Obliges us to call `startForeground` within a few seconds or Android
      // kills the app with an ANR — `onStartCommand` does it first thing,
      // before anything that can throw. Via `ContextCompat` because the direct
      // call is API 26 and this app still ships to 24.
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, DutyService::class.java))
    }
  }

  /** The headless task holding the JS runtime open, once one is running. */
  private var taskId: Int? = null

  /** Set while waiting on a React context that did not exist yet. */
  private var pendingInstanceListener: ReactInstanceEventListener? = null

  /** The floating logo. Up whenever the shift is running behind another app. */
  private val bubble by lazy { DutyBubble(this) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    // `AppForeground` counts from `MainApplication`, so it is already correct by
    // the time a shift starts; the service only asks to be told when it changes.
    AppForeground.onChange = ::updateBubble
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /**
     * A null intent means Android restarted us after reclaiming the process,
     * and that restart brings back the service but **not** the app's JS: a
     * service start creates no React context, so the socket is gone and this
     * driver is no longer in the dispatch index however alive the notification
     * looks. Saying "you're online" here would be the exact lie the whole
     * feature exists to prevent, so the restarted notification says what is
     * actually true and asks for the one thing that fixes it — a tap, which
     * opens the app and lets `driver:resumed` put the shift back together.
     */
    val restarted = intent == null
    val title =
        if (restarted) getString(R.string.duty_interrupted_title)
        else intent.getStringExtra(EXTRA_TITLE).orEmpty()
    val body =
        if (restarted) getString(R.string.duty_interrupted_body)
        else intent.getStringExtra(EXTRA_BODY).orEmpty()

    @Suppress("InlinedApi")
    ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(title, body),
        // Declaring the type is what separates "a service in the foreground"
        // from "a service Android will deliver background fixes to". It must
        // match the `foregroundServiceType` in the manifest. The constant is
        // API 29 but inlines to an int, and `ServiceCompat` drops it below that
        // release — where there were no service types to declare.
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
    )
    isRunning = true
    holdJsRuntime()
    updateBubble()

    // Duty ends when the driver ends it. If Android reclaims the process
    // mid-shift the driver has no idea it happened, so the service comes back —
    // and this time it can put the shift back together itself.
    return START_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    // Before `releaseJsRuntime`, so the bubble cannot outlive the shift even if
    // finishing the task throws on a context that is already gone.
    bubble.hide()
    AppForeground.onChange = null
    releaseJsRuntime()
    super.onDestroy()
  }

  /**
   * Shown while the driver is on duty and looking at something else — including
   * at nothing at all, which is what an app swiped out of recents leaves behind.
   *
   * Hidden while the app is in front of them: the duty switch is right there,
   * and a badge over the screen that already says "online" only covers it up.
   */
  private fun updateBubble() {
    if (isRunning && !AppForeground.isForeground) {
      bubble.show()
    } else {
      bubble.hide()
    }
  }

  /* ------------------------------------------------ the JS runtime */

  /**
   * Starts the headless task, creating a React context first if there is none.
   *
   * There will be one already whenever the driver flipped the switch themselves.
   * There will not be after a `START_STICKY` restart: a service start builds no
   * context on its own, so without this the notification would sit there
   * claiming a shift that has no socket behind it.
   */
  private fun holdJsRuntime() {
    if (taskId != null || pendingInstanceListener != null) {
      return
    }
    val host = (application as? ReactApplication)?.reactHost ?: return

    val existing = host.currentReactContext
    if (existing != null) {
      startTask(existing)
      return
    }

    val listener =
        object : ReactInstanceEventListener {
          override fun onReactContextInitialized(context: ReactContext) {
            host.removeReactInstanceEventListener(this)
            pendingInstanceListener = null
            // The service may have been stopped while the context was still
            // starting — in which case there is no shift left to hold open.
            if (isRunning) {
              startTask(context)
            }
          }
        }
    pendingInstanceListener = listener
    host.addReactInstanceEventListener(listener)
    host.start()
  }

  /**
   * `timeout = 0` because a shift has no length known in advance, and
   * `isAllowedInForeground = true` because the task starts on the tap that puts
   * the driver online — with the app very much in the foreground — and has to
   * survive being backgrounded rather than begin there.
   */
  private fun startTask(context: ReactContext) {
    UiThreadUtil.runOnUiThread {
      if (taskId != null || !isRunning) {
        return@runOnUiThread
      }
      try {
        taskId =
            HeadlessJsTaskContext.getInstance(context)
                .startTask(
                    HeadlessJsTaskConfig(
                        TASK_KEY,
                        Arguments.createMap(),
                        /* timeout = */ 0,
                        /* isAllowedInForeground = */ true,
                    )
                )
      } catch (error: Exception) {
        // The context died between being handed over and being used. The
        // notification is already up and the driver is still in the index; the
        // next start command tries again.
        Log.w(TAG, "Could not start the duty JS task", error)
      }
    }
  }

  private fun releaseJsRuntime() {
    val host = (application as? ReactApplication)?.reactHost

    pendingInstanceListener?.let {
      host?.removeReactInstanceEventListener(it)
      pendingInstanceListener = null
    }

    val id = taskId ?: return
    taskId = null
    val context = host?.currentReactContext ?: return
    // Letting the task run on would leave RN's timers armed for a driver who is
    // offline — the battery complaint this whole service is otherwise careful
    // to avoid.
    HeadlessJsTaskContext.getInstance(context).finishTask(id)
  }

  /**
   * Swiping the app away is not going off duty.
   *
   * A driver clearing their recents mid-shift is tidying, not ending a shift —
   * and the rider tracking them has no idea either happened. Duty is only ever
   * ended by the switch, so this deliberately does not call `stopSelf`.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
  }

  private fun buildNotification(title: String, body: String): Notification {
    ensureChannel()

    val open =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentIntent(open)
        // There is no "dismiss" for going off duty — the switch is in the app,
        // so the notification's only job is to be a way back to it.
        .setOngoing(true)
        .setSilent(true)
        .setShowWhen(false)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
  }

  /**
   * `IMPORTANCE_LOW` on purpose: no sound, no heads-up. This notification sits
   * there for an entire shift, and a driver who is buzzed by it once will turn
   * the channel off — taking the ride notifications with it.
   *
   * The `Compat` classes no-op below API 26, where channels do not exist and
   * the importance is carried by the notification's own priority instead.
   */
  private fun ensureChannel() {
    NotificationManagerCompat.from(this)
        .createNotificationChannel(
            NotificationChannelCompat.Builder(
                    CHANNEL_ID,
                    NotificationManagerCompat.IMPORTANCE_LOW,
                )
                .setName(getString(R.string.duty_channel_name))
                .setDescription(getString(R.string.duty_channel_description))
                .setShowBadge(false)
                .build()
        )
  }
}

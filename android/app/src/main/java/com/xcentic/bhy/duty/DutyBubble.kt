package com.xcentic.bhy.duty

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import com.xcentic.bhy.R
import kotlin.math.abs

/**
 * The Bharat Yaatri disc that floats over everything while the driver is online.
 *
 * The persistent notification already says "on duty", and for a driver it is the
 * wrong surface: they are inside Maps with the shade closed, or they swiped the
 * app out of recents and now have no reason to believe anything survived it. The
 * bubble is the answer to "am I still online?" that costs no gesture at all —
 * it is simply there, and a tap is the way back into the app.
 *
 * Owned by [DutyService] rather than by a React module on purpose: its lifetime
 * is exactly duty's lifetime, which outlives the activity, the React context and
 * on a `START_STICKY` restart the process itself.
 *
 * Needs `SYSTEM_ALERT_WINDOW`, asked for at the duty sheet and skippable. A
 * driver who skipped it keeps the notification and loses only this.
 */
class DutyBubble(private val context: Context) {

  private var view: View? = null
  private var params: WindowManager.LayoutParams? = null

  /**
   * Where the driver last parked it, kept across hide/show so returning from the
   * app does not throw the bubble back to its starting corner — a control that
   * moves on its own is one the driver stops trusting the position of.
   */
  private var restingX: Int? = null
  private var restingY: Int? = null

  val isShowing: Boolean
    get() = view != null

  /** Main thread only. Does nothing if already up, or if the grant is missing. */
  @SuppressLint("ClickableViewAccessibility")
  fun show() {
    if (view != null || !Settings.canDrawOverlays(context)) {
      return
    }

    val inflated = LayoutInflater.from(context).inflate(R.layout.duty_bubble, null, false)
    val lp = layoutParams()
    try {
      windowManager().addView(inflated, lp)
    } catch (_: WindowManager.BadTokenException) {
      // The grant went away between the check and the add — the driver was in
      // settings as the shift started. The notification still covers this.
      return
    }

    view = inflated
    params = lp
    inflated.setOnTouchListener(DragToMove())
  }

  /** Main thread only. Tolerates being called when nothing is up. */
  fun hide() {
    val current = view ?: return
    view = null
    params = null
    try {
      windowManager().removeView(current)
    } catch (_: IllegalArgumentException) {
      // Not attached any more. Nothing to undo.
    }
  }

  /* ------------------------------------------------ touch */

  /**
   * Drag to move, tap to open.
   *
   * The two are told apart by the touch slop rather than by a `GestureDetector`:
   * the only gestures this window has are "put it somewhere else" and "take me
   * to the app", and a detector would add a long-press timeout to a control that
   * has no long press.
   */
  private inner class DragToMove : View.OnTouchListener {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop

    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      val lp = params ?: return false

      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = lp.x
          startY = lp.y
          dragging = false
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (!dragging && abs(dx) < slop && abs(dy) < slop) {
            return true
          }
          dragging = true
          lp.x = startX + dx.toInt()
          lp.y = startY + dy.toInt()
          apply(v, lp)
          return true
        }

        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> {
          if (dragging) {
            settle(v, lp)
          } else {
            v.performClick()
            openApp()
          }
          return true
        }
      }
      return false
    }
  }

  /**
   * Parks the bubble against whichever side edge it is nearer, the way every
   * floating control on Android behaves — left free and it ends up over the
   * middle of the screen the driver is trying to read.
   */
  private fun settle(v: View, lp: WindowManager.LayoutParams) {
    val metrics = context.resources.displayMetrics
    val maxX = (metrics.widthPixels - v.width).coerceAtLeast(0)
    val maxY = (metrics.heightPixels - v.height).coerceAtLeast(0)

    lp.x = if (lp.x + v.width / 2 >= metrics.widthPixels / 2) maxX else 0
    lp.y = lp.y.coerceIn(0, maxY)
    apply(v, lp)

    restingX = lp.x
    restingY = lp.y
  }

  private fun apply(v: View, lp: WindowManager.LayoutParams) {
    try {
      windowManager().updateViewLayout(v, lp)
    } catch (_: IllegalArgumentException) {
      // Removed mid-drag, which is what going off duty during one looks like.
    }
  }

  /* ------------------------------------------------ plumbing */

  private fun windowManager(): WindowManager =
      context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

  /**
   * `singleTask` in the manifest means this resumes the driver's existing task
   * where they left it, rather than starting a second copy of the app. This is
   * also the path that works when the app was swiped out of recents — there is
   * no activity to resume, so the launch intent starts one.
   */
  private fun openApp() {
    val launch =
        context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(launch)
  }

  private fun layoutParams(): WindowManager.LayoutParams =
      WindowManager.LayoutParams(
              WindowManager.LayoutParams.WRAP_CONTENT,
              WindowManager.LayoutParams.WRAP_CONTENT,
              overlayWindowType(),
              // NOT_FOCUSABLE so the app underneath keeps the keyboard and the
              // back button. The bubble still gets its own touches — this is not
              // NOT_TOUCHABLE, which would make it a decoration.
              WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
              PixelFormat.TRANSLUCENT,
          )
          .apply {
            gravity = Gravity.TOP or Gravity.START
            val metrics = context.resources.displayMetrics
            // Right edge, below the middle: clear of the status bar and within
            // reach of the thumb of whichever hand is holding the phone. A ride
            // card lands centred and covers it — added later, so it wins the
            // z-order — which is the right way round: the card is the thing to
            // answer, and the bubble is only there when there is nothing to.
            x = restingX ?: (metrics.widthPixels - (64 * metrics.density).toInt())
            y = restingY ?: (metrics.heightPixels * 0.55f).toInt()
          }

  /**
   * Android 8 replaced the old overlay window types with the single
   * `TYPE_APPLICATION_OVERLAY`. `TYPE_PHONE` is the deprecated equivalent and
   * the only one API 24 and 25 understand — both sit behind the same
   * `SYSTEM_ALERT_WINDOW` grant.
   */
  @Suppress("DEPRECATION")
  private fun overlayWindowType(): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      }
}

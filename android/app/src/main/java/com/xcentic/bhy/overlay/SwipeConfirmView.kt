package com.xcentic.bhy.overlay

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.FrameLayout
import android.widget.TextView
import com.xcentic.bhy.R

/**
 * Slide to confirm, the same gesture the bid card uses in the app.
 *
 * A bid is money, and this card arrives unannounced on a phone in a cradle in a
 * moving car — a tap-sized target in that setting is a bid placed by a pothole.
 * So the driver has to drag [COMMIT] of the track before anything is sent, and
 * anything short of that springs back with nothing spent.
 *
 * The Kotlin twin of `components/quickride/SwipeAction.tsx`, deliberately down to
 * the geometry: the same 56dp rail, the same 48dp knob, the same three quarters
 * of travel. A driver who has learnt the gesture in the app already knows this
 * one, and the overlay is the surface where there is least time to learn.
 *
 * @see RideOverlayModule which owns the card this sits in.
 */
class SwipeConfirmView
@JvmOverloads
constructor(context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0) :
    FrameLayout(context, attrs, defStyleAttr) {

  companion object {
    /** How much of the track has to be crossed for the swipe to count. */
    private const val COMMIT = 0.75f

    /** Knob inset, matching `PAD` in `SwipeAction`. */
    private const val KNOB_PADDING_DP = 4

    private const val KNOB_SIZE_DP = 48
  }

  /** Fired once, on a completed swipe. */
  var onConfirm: (() -> Unit)? = null

  private val label: TextView
  private val knob: View

  private val slop = ViewConfiguration.get(context).scaledTouchSlop

  private var downX = 0f
  private var dragging = false
  /** Latched after a completed swipe so a second drag cannot bid twice. */
  private var spent = false

  init {
    LayoutInflater.from(context).inflate(R.layout.overlay_swipe, this, true)
    label = findViewById(R.id.overlay_swipe_label)
    knob = findViewById(R.id.overlay_swipe_knob)
    setBackgroundResource(R.drawable.overlay_swipe_track)
    // Without this the view is not a touch target and the card behind it —
    // which is nothing, this is the bottom of the stack — would get the events.
    isClickable = true
  }

  fun setLabel(text: String) {
    label.text = text
  }

  /* ------------------------------------------------ touch */

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (spent) {
      return true
    }

    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        dragging = false
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        val dx = event.x - downX
        // Rightward only, and only once it is clearly a drag: the driver's
        // thumb lands on this rail on its way to somewhere else often enough
        // that a twitch must not start the gesture.
        if (!dragging && dx > slop) {
          dragging = true
        }
        if (dragging) {
          knob.translationX = dx.coerceIn(0f, travel())
          fadeLabel()
        }
        return true
      }

      MotionEvent.ACTION_UP,
      MotionEvent.ACTION_CANCEL -> {
        val end = travel()
        if (dragging && knob.translationX >= end * COMMIT) {
          spent = true
          // Run it to the end first. The driver let go three quarters of the
          // way across and the card is about to vanish; a knob left mid-track
          // reads as "it didn't take".
          knob
              .animate()
              .translationX(end)
              .setDuration(90)
              .withEndAction {
                label.alpha = 0f
                onConfirm?.invoke()
              }
              .start()
        } else {
          settle()
        }
        dragging = false
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  /** Springs the knob home, leaving the driver exactly where they started. */
  private fun settle() {
    knob.animate().translationX(0f).setDuration(140).withEndAction { fadeLabel() }.start()
    label.animate().alpha(1f).setDuration(140).start()
  }

  /** Hands the rail to the knob as it crosses — gone by the halfway mark. */
  private fun fadeLabel() {
    val end = travel()
    label.alpha = (1f - (knob.translationX / end) * 2f).coerceIn(0f, 1f)
  }

  /** How far the knob can go. Never zero — it divides [fadeLabel]. */
  private fun travel(): Float {
    val density = resources.displayMetrics.density
    val knobWidth = if (knob.width > 0) knob.width else (KNOB_SIZE_DP * density).toInt()
    val padding = KNOB_PADDING_DP * density * 2
    return (width - knobWidth - padding).coerceAtLeast(1f)
  }
}

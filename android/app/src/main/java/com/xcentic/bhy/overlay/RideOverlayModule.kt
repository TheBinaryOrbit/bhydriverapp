package com.xcentic.bhy.overlay

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.CountDownTimer
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.SeekBar
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.xcentic.bhy.R
import com.xcentic.bhy.specs.NativeRideOverlaySpec
import java.text.NumberFormat
import java.util.Locale

/**
 * The ride request card, drawn in its own window on top of the foreground app.
 *
 * The window is `TYPE_APPLICATION_OVERLAY` and deliberately **not focusable**:
 * the driver may be following a turn in Maps when this lands, and a card that
 * steals focus would eat their next tap and swallow the back button. It occupies
 * the top of the screen, passes everything outside itself through to the app
 * below, and takes touches only on its own controls.
 *
 * Those controls are the whole card now, not a button: a stepper and a slider to
 * name a fare inside the server's bid range, and a slide-to-confirm to commit —
 * the same three the app shows, in the same order, at the same sizes. A driver
 * who wanted anything other than the offered fare used to have to open the app
 * and find the ride again with sixty seconds running; now they drag. There is no
 * "open in app" any more for the same reason: nothing is left over there that
 * this card cannot do, and a second button only competes for the thumb.
 *
 * There is at most one card at a time. A second request replaces the first
 * rather than stacking, because two cards means the driver clears one to read
 * the other and the timer runs on both while they do.
 *
 * @see NativeRideOverlay for the JS-side contract and the payload shape.
 * @see SwipeConfirmView for the gesture.
 */
class RideOverlayModule(reactContext: ReactApplicationContext) :
    NativeRideOverlaySpec(reactContext) {

  companion object {
    const val NAME = "RideOverlay"

    private const val ACTION_BID = "bid"
    private const val ACTION_DISMISS = "dismiss"

    /** Indian digit grouping, matching `toLocaleString('en-IN')` in `format.ts`. */
    private val MONEY: NumberFormat =
        NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN"))
  }

  private var view: View? = null
  private var timer: CountDownTimer? = null

  /**
   * Held so the card can still report which ride it belonged to after it has
   * been torn down — the timeout path emits `dismiss` for a view that is on its
   * way out.
   */
  private var showingRideId: String? = null

  /* ------------------------------------------------ the bid in progress */

  /**
   * What the driver has the slider on right now, in rupees. Read at the moment
   * the swipe completes, which is the only thing that makes it a bid.
   *
   * Kept in Kotlin rather than pushed to JS on every move: the fare changes
   * under a dragging thumb, and a bridge hop per frame is a slider that stutters
   * on the one surface with no time to spare.
   */
  private var fare = 0

  private var bidMin = 0
  private var bidMax = 0
  private var bidStep = 1

  /** Every fare the slider can stop on. Built by [fareStops]; empty when hidden. */
  private var fares: List<Int> = emptyList()

  /** The `{fare}` template from JS, re-substituted on every move. */
  private var swipeTemplate = ""
  private var currency = ""

  override fun getName(): String = NAME

  override fun invalidate() {
    // A reload with a card up would otherwise leave an orphaned window on
    // screen with no JS left to answer its buttons.
    UiThreadUtil.runOnUiThread { tearDown() }
    super.invalidate()
  }

  /* ------------------------------------------------ state */

  override fun isShowing(): Boolean = view != null

  private fun canDrawOverlays(): Boolean = Settings.canDrawOverlays(reactApplicationContext)

  /* ------------------------------------------------ show */

  override fun show(card: ReadableMap, promise: Promise) {
    if (!canDrawOverlays()) {
      // Not an error: the driver skipped this grant at the duty sheet, and the
      // caller falls back to a notification.
      promise.resolve(false)
      return
    }

    val rideId = card.getString("rideId").orEmpty()
    if (rideId.isEmpty()) {
      promise.resolve(false)
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        tearDown()
        addCard(card, rideId)
        promise.resolve(true)
      } catch (_: WindowManager.BadTokenException) {
        // The grant was revoked between the check above and the add — rare, but
        // it happens when the driver is in settings as a request arrives.
        tearDown()
        promise.resolve(false)
      }
    }
  }

  private fun addCard(card: ReadableMap, rideId: String) {
    val context = reactApplicationContext
    val inflated =
        LayoutInflater.from(context).inflate(R.layout.ride_overlay_card, null, false)

    inflated.findViewById<TextView>(R.id.overlay_fare).text = card.getString("fare").orEmpty()
    inflated.findViewById<TextView>(R.id.overlay_detail).text = card.getString("detail").orEmpty()
    inflated.findViewById<TextView>(R.id.overlay_pickup).text = card.getString("pickup").orEmpty()
    inflated.findViewById<TextView>(R.id.overlay_drop).text = card.getString("drop").orEmpty()

    inflated.findViewById<View>(R.id.overlay_close).setOnClickListener {
      finish(ACTION_DISMISS, rideId)
    }

    bindBid(inflated, card)

    val swipe = inflated.findViewById<SwipeConfirmView>(R.id.overlay_swipe)
    swipe.onConfirm = { finish(ACTION_BID, rideId) }
    swipe.setLabel(swipeLabel())

    windowManager(context).addView(inflated, layoutParams())
    view = inflated
    showingRideId = rideId

    startCountdown(
        inflated.findViewById(R.id.overlay_countdown),
        // A card with no expiry would sit there forever; treat it as already
        // gone rather than as unlimited.
        seconds = card.getDouble("expiresInSeconds").toLong().coerceAtLeast(0),
    )
  }

  /* ------------------------------------------------ the fare */

  /**
   * Wires the stepper and the slider, or takes them off the card.
   *
   * A range needs `bidMax > bidMin` to be worth drawing. Without one the section
   * goes, the swipe stays, and it commits at `bidStart` — which is the offered
   * fare, and exactly what the fixed button used to do. Better a card with one
   * price on it than a slider that can only be dragged to the number it is
   * already on.
   */
  private fun bindBid(root: View, card: ReadableMap) {
    currency = card.getString("currency").orEmpty()
    swipeTemplate = card.getString("swipeLabel").orEmpty()

    bidMin = card.getDouble("bidMin").toInt()
    bidMax = card.getDouble("bidMax").toInt()
    bidStep = card.getDouble("bidStep").toInt().coerceAtLeast(1)
    fare = card.getDouble("bidStart").toInt()

    val section = root.findViewById<View>(R.id.overlay_bid_section)
    if (bidMax <= bidMin) {
      section.visibility = View.GONE
      fares = emptyList()
      return
    }

    fare = fare.coerceIn(bidMin, bidMax)

    root.findViewById<TextView>(R.id.overlay_fare_label).text =
        card.getString("fareLabel").orEmpty()
    root.findViewById<TextView>(R.id.overlay_bid_min).text = money(bidMin)
    root.findViewById<TextView>(R.id.overlay_bid_max).text = money(bidMax)

    val value = root.findViewById<TextView>(R.id.overlay_bid_value)
    val swipe = root.findViewById<SwipeConfirmView>(R.id.overlay_swipe)
    val slider = root.findViewById<SeekBar>(R.id.overlay_bid_slider)

    fares = fareStops(bidMin, bidMax, bidStep, fare)

    // `SeekBar` counts from zero in whole units, so it indexes the stops rather
    // than carrying rupees. `android:min` would allow an offset range directly
    // but is API 26, and this app still ships to 24.
    slider.max = fares.size - 1
    slider.progress = fares.indexOf(fare).coerceAtLeast(0)

    slider.setOnSeekBarChangeListener(
        object : SeekBar.OnSeekBarChangeListener {
          override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
            fare = fares[progress.coerceIn(0, fares.size - 1)]
            value.text = money(fare)
            swipe.setLabel(swipeLabel())
          }

          override fun onStartTrackingTouch(bar: SeekBar) = Unit

          override fun onStopTrackingTouch(bar: SeekBar) = Unit
        }
    )

    // Through the slider rather than straight at `fare`, so the thumb, the
    // number and the swipe label can only ever say the same thing.
    root.findViewById<View>(R.id.overlay_bid_minus).setOnClickListener {
      slider.progress = (slider.progress - 1).coerceAtLeast(0)
    }
    root.findViewById<View>(R.id.overlay_bid_plus).setOnClickListener {
      slider.progress = (slider.progress + 1).coerceAtMost(slider.max)
    }

    value.text = money(fare)
  }

  /**
   * Every fare the slider can stop on, in order.
   *
   * Spelt out as a list rather than computed from the thumb position, because
   * three numbers have to be landable *exactly* and arithmetic off the floor
   * hits none of them reliably. The server's range does not arrive on round
   * hundreds — `224` to `336` around an offer of `280` is a typical one — so a
   * grid of `min + k·step` runs 224, 234, 244… and the rider's own offer is not
   * on it. The card would open at ₹274 and a driver who swiped straight away
   * would underbid by six rupees they never chose.
   *
   * So the stops are the round steps the app's `FareSlider` uses — absolute
   * multiples of [step], not offsets from the floor — plus the three endpoints
   * that have to be reachable: the floor, the ceiling, and the offer itself.
   */
  private fun fareStops(min: Int, max: Int, step: Int, start: Int): List<Int> {
    val stops = mutableListOf(min, max, start.coerceIn(min, max))
    // The first round step strictly above the floor; `min` is already in.
    var rupees = ((min / step) + 1) * step
    while (rupees < max) {
      stops.add(rupees)
      rupees += step
    }
    return stops.distinct().sorted()
  }

  private fun swipeLabel(): String = swipeTemplate.replace("{fare}", money(fare))

  private fun money(rupees: Int): String = currency + MONEY.format(rupees)

  /**
   * The seconds left, counted down on the card itself.
   *
   * The driver is deciding whether this ride is worth leaving their current
   * screen for, and "how long have I got" is most of that decision. At zero the
   * card removes itself and reports a `dismiss`, because a bid placed after the
   * window closes is one the server rejects.
   */
  private fun startCountdown(label: TextView, seconds: Long) {
    val rideId = showingRideId ?: return
    if (seconds <= 0) {
      finish(ACTION_DISMISS, rideId)
      return
    }

    label.text = seconds.toString()
    timer =
        object : CountDownTimer(seconds * 1000, 1000) {
              override fun onTick(remainingMs: Long) {
                label.text = ((remainingMs + 999) / 1000).toString()
              }

              override fun onFinish() {
                finish(ACTION_DISMISS, rideId)
              }
            }
            .also { it.start() }
  }

  /* ------------------------------------------------ hide */

  override fun hide() {
    UiThreadUtil.runOnUiThread { tearDown() }
  }

  /** Takes the card down *and* tells JS why. Every control ends up here. */
  private fun finish(action: String, rideId: String) {
    // Read before the teardown, which clears it.
    val chosen = fare
    tearDown()
    emitOnAction(
        Arguments.createMap().apply {
          putString("action", action)
          putString("rideId", rideId)
          putDouble("fare", chosen.toDouble())
        }
    )
  }

  /**
   * Main thread only. Tolerates being called twice, and tolerates a view that
   * the window manager has already lost — both happen when a tap and the
   * countdown finishing land in the same frame.
   */
  private fun tearDown() {
    timer?.cancel()
    timer = null

    val current = view ?: return
    view = null
    showingRideId = null
    fare = 0
    fares = emptyList()
    try {
      windowManager(reactApplicationContext).removeView(current)
    } catch (_: IllegalArgumentException) {
      // Not attached any more. Nothing to undo.
    }
  }

  /* ------------------------------------------------ plumbing */

  private fun windowManager(context: Context): WindowManager =
      context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

  /**
   * `singleTask` in the manifest means this resumes the existing task with the
   * card list already loaded, rather than starting a second copy of the app.
   *
   * Public because JS needs it too: a bid placed from the card is followed
   * straight back into the app, and the caller may be a headless task with no
   * activity of its own to start one from.
   */
  override fun openApp() {
    val context = reactApplicationContext
    val launch =
        context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(launch)
  }

  private fun layoutParams(): WindowManager.LayoutParams =
      WindowManager.LayoutParams(
              WindowManager.LayoutParams.MATCH_PARENT,
              WindowManager.LayoutParams.WRAP_CONTENT,
              overlayWindowType(),
              // NOT_FOCUSABLE keeps the keyboard and the back button with the app
              // underneath; the card still receives its own touches. WATCH_OUTSIDE
              // is deliberately absent — a stray tap elsewhere on screen must not
              // count as declining a ride.
              WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
              PixelFormat.TRANSLUCENT,
          )
          .apply {
            // Centred, which also spares the window any guessing about insets it
            // cannot read: pinned to the top it had to clear the status bar and
            // whatever notch the phone has by a hardcoded margin, and the card is
            // tall enough now that the guess was starting to cost it room.
            gravity = Gravity.CENTER
          }

  /**
   * Android 8 replaced every one of the old overlay window types with the single
   * `TYPE_APPLICATION_OVERLAY`, which the system can dim and dismiss. `TYPE_PHONE`
   * is the deprecated equivalent and the only one API 24 and 25 understand —
   * both are gated behind the same `SYSTEM_ALERT_WINDOW` grant.
   */
  @Suppress("DEPRECATION")
  private fun overlayWindowType(): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      }
}

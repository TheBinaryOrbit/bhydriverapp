package com.xcentic.bhy.overlay

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.xcentic.bhy.R

/**
 * The ring and the buzz the ride card arrives with.
 *
 * The card is drawn over whatever the driver is actually looking at — usually
 * Maps, often in a cradle — and a window that appears in silence on a phone
 * nobody is holding is a request that expires unseen. This is what turns the
 * overlay from something the driver has to notice into something that reaches
 * them.
 *
 * Sound plays on the **ringtone** stream rather than media: it belongs with the
 * driver's ring volume, it survives navigation audio playing underneath it, and
 * a driver who has silenced their phone has silenced it too. The buzz starts
 * with it and outlives the ringer by one mode — a phone on vibrate still
 * vibrates, which is the whole point of that setting.
 *
 * Both halves are finite and neither loops: the clip runs about as long as a
 * QuickRide window does, the buzz for [CYCLES] of [PATTERN] over roughly the
 * first seven seconds of it. Anything that takes the card down stops both early,
 * because the alert belongs to the card and not to the request.
 *
 * @see RideOverlayModule which starts this with the window and stops it with the
 *   teardown.
 */
class RideRingtone(private val context: Context) {

  companion object {
    /**
     * Rest, then buzz — one cycle, laid out as Android reads a waveform: gaps at
     * the even indices, pulses at the odd ones. Long pulses rather than a
     * continuous hum, because a phone in a windscreen cradle rattles, and a
     * driver reads a steady buzz as their own phone misbehaving where they read
     * a pulse as somebody calling.
     */
    private val PATTERN = longArrayOf(500, 700)

    /**
     * How many cycles, ≈7s of buzzing.
     *
     * Finite rather than looped for the length of the card: the sound is what
     * carries the rest of the window, and a card that outlives its own alert by
     * a minute — an outstation offer does — would otherwise leave the phone
     * shaking in the cradle the whole time. Long enough to reach a driver who is
     * not holding the phone, short enough that ignoring it is not a punishment.
     */
    private const val CYCLES = 6
  }

  private var player: MediaPlayer? = null

  /** Non-null only while a pattern is running, so [stop] knows to cancel. */
  private var buzzing: Vibrator? = null

  /**
   * Starts the alert, replacing one already playing — a second request replaces
   * the first card, so it replaces the first alert with it.
   *
   * The ringer switch decides how much of it the driver gets: normal rings and
   * buzzes, vibrate buzzes only, silent does neither. An alert that overrides
   * the setting is the one that gets the app muted in system settings instead —
   * and the card still draws in every case, which is the part that cannot be
   * silenced.
   */
  fun start() {
    stop()

    val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    val mode = audio.ringerMode
    if (mode == AudioManager.RINGER_MODE_SILENT) {
      return
    }

    val attributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

    vibrate(attributes)

    if (mode != AudioManager.RINGER_MODE_NORMAL) {
      return
    }

    // `create` prepares the player itself and returns null rather than throwing
    // when it cannot — a missing codec or a device with the stream taken is a
    // card that arrives quietly, not a card that fails to draw.
    val started =
        MediaPlayer.create(context, R.raw.ride_request, attributes, audio.generateAudioSessionId())
            ?: return

    // Through `stop` so a buzz still running ends with the sound, and so the
    // decoder is not held for the rest of the countdown.
    started.setOnCompletionListener { done -> if (player === done) stop() else done.release() }

    player = started
    runCatching { started.start() }
  }

  /** Ends both halves. Safe to call when nothing is playing, and twice. */
  fun stop() {
    buzzing?.let { runCatching { it.cancel() } }
    buzzing = null

    val current = player ?: return
    player = null
    runCatching { current.stop() }
    current.release()
  }

  /* ------------------------------------------------ internals */

  /**
   * Starts the repeating pattern, carrying the ringtone [attributes] so the
   * system files this with incoming calls rather than with a haptic tap — which
   * is what gets it through Do Not Disturb when the driver has allowed calls.
   */
  private fun vibrate(attributes: AudioAttributes) {
    val vibrator = vibrator() ?: return
    if (!vibrator.hasVibrator()) {
      return
    }

    // Spelt out as one long waveform rather than asked to repeat: a repeating
    // pattern only ends when something cancels it, and the buzz has to stop
    // itself for the cards nobody touches. `-1` is "play it once, then stop".
    val waveform = LongArray(PATTERN.size * CYCLES) { PATTERN[it % PATTERN.size] }

    runCatching {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(waveform, -1), attributes)
          } else {
            @Suppress("DEPRECATION") vibrator.vibrate(waveform, -1, attributes)
          }
        }
        .onSuccess { buzzing = vibrator }
  }

  /**
   * Android 12 moved the vibrators behind a manager that can address more than
   * one of them; `VIBRATOR_SERVICE` is the deprecated single-motor equivalent
   * and the only one API 24 through 30 understand.
   */
  private fun vibrator(): Vibrator? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
            ?.defaultVibrator
      } else {
        @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
}

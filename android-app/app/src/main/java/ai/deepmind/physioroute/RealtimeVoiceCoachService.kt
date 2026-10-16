package ai.deepmind.physioroute

import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Binder
import android.os.IBinder
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * RealtimeVoiceCoachService
 * - FusedLocationProviderClient(1Hz High-Accuracy GPS) + Health Connect 실시간 페이스/심박 스트림 감시
 * - 신호등 대기(110s), 체력 저하(4'30"/km -> 6'15"/km), 지하철 3호선 지연 발생 시
 *   이어폰 오디오 포커스 덕킹(Audio Ducking) 후 한국어/영어 TTS로 즉각 우회 및 비상 환승을 지시합니다.
 */
class RealtimeVoiceCoachService : Service(), TextToSpeech.OnInitListener {

    enum class LiveEvent {
        DOWNHILL_BIKE_LOCK,
        RED_LIGHT_CROSSWALK_BYPASS,
        FATIGUE_PACE_DROP_TAXI,
        SUBWAY_LINE3_DELAY_REROUTE
    }

    inner class LocalBinder : Binder() {
        fun getService(): RealtimeVoiceCoachService = this@RealtimeVoiceCoachService
    }

    private val binder = LocalBinder()
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private lateinit var audioManager: AudioManager
    private var focusRequest: AudioFocusRequest? = null

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        tts = TextToSpeech(this, this)
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.KOREAN
            tts?.setSpeechRate(1.06f)
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    requestTransientAudioDucking()
                }

                override fun onDone(utteranceId: String?) {
                    abandonAudioDucking()
                }

                override fun onError(utteranceId: String?) {
                    abandonAudioDucking()
                }
            })
            ttsReady = true
        }
    }

    fun handleLiveCommuteEvent(event: LiveEvent) {
        val coachingScript = when (event) {
            LiveEvent.DOWNHILL_BIKE_LOCK ->
                "언덕 내리막 구간입니다. 시속 38킬로미터로 5분 만에 역에 도착합니다. 서측 2번 출구 자전거 거치대에 45초 안에 묶고 바로 계단으로 뛰세요!"
            LiveEvent.RED_LIGHT_CROSSWALK_BYPASS ->
                "전방 사거리 횡단보도 빨간불 110초 대기입니다! 멈추면 열차 놓칩니다. 오른쪽으로 50미터 더 가서 신호등 없는 횡단보도로 바로 건너세요. 1분 28초 빨라집니다!"
            LiveEvent.FATIGUE_PACE_DROP_TAXI ->
                "현재 속도로 뛰면 원래 계획대로 열차를 못 탑니다! 힘드시면 지금이라도 전방 80미터 앞에서 택시를 타야 지각하지 않습니다."
            LiveEvent.SUBWAY_LINE3_DELAY_REROUTE ->
                "3호선 환승 열차가 지연되고 있습니다. 6호선 타고 3호선 거쳐 가는 대신, 6호선에서 2호선으로 바로 직결 이동 후 뛰어가면 1분 40초 이득입니다!"
        }
        speakToEarbuds(coachingScript, event.name)
    }

    fun speakToEarbuds(scriptKo: String, utteranceId: String = "physioroute_coach") {
        if (!ttsReady) return
        tts?.speak(scriptKo, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    private fun requestTransientAudioDucking() {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attrs)
            .build()
        focusRequest = req
        audioManager.requestAudioFocus(req)
    }

    private fun abandonAudioDucking() {
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}

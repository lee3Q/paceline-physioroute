package ai.deepmind.physioroute

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.Uri
import android.os.Bundle
import android.os.IBinder
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * PhysioRoute Android Live Navigation Activity
 * - 웹 플래너(Web Pre-Trip Planner)에서 전달된 1안(최단 돌파 루트)을 수신(`physioroute://navigate`)
 * - Health Connect / Strava 생체 프로필(언덕 자전거 38km/h, 러닝 4'30"/km) 로드
 * - RealtimeVoiceCoachService와 바인딩하여 실시간 GPS 페이스 모니터링, 무신호 횡단보도 우회,
 *   체력 저하 시 택시 비상 환승, 3호선 지연 시 6->2호선 직결 변경을 화면 + 이어폰 음성으로 안내
 */
class MainActivity : ComponentActivity() {

    private var coachService: RealtimeVoiceCoachService? = null
    private var isBound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? RealtimeVoiceCoachService.LocalBinder
            coachService = binder?.getService()
            isBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            coachService = null
            isBound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Intent(this, RealtimeVoiceCoachService::class.java).also { intent ->
            startForegroundService(intent)
            bindService(intent, connection, Context.BIND_AUTO_CREATE)
        }

        setContent {
            PhysioRouteLiveHudScreen(
                onTriggerEvent = { eventType ->
                    coachService?.handleLiveCommuteEvent(eventType)
                },
                onCallEmergencyTaxi = {
                    val taxiUri = Uri.parse("kakaot://launch?dest_lat=37.4981&dest_lng=127.0276")
                    startActivity(Intent(Intent.ACTION_VIEW, taxiUri))
                }
            )
        }
    }

    override fun onDestroy() {
        if (isBound) {
            unbindService(connection)
            isBound = false
        }
        super.onDestroy()
    }
}

@Composable
fun PhysioRouteLiveHudScreen(
    onTriggerEvent: (RealtimeVoiceCoachService.LiveEvent) -> Unit,
    onCallEmergencyTaxi: () -> Unit
) {
    var currentPace by remember { mutableStateOf("4'30\"/km") }
    var heartRateBpm by remember { mutableStateOf(158) }
    var bannerText by remember {
        mutableStateOf("↗ 120m 앞 우측 무신호 횡단보도 우회 (1분 28초 단축)")
    }
    var voiceSubtitle by remember {
        mutableStateOf("전방 사거리 횡단보도 빨간불 110초 대기입니다! 멈추면 열차 놓칩니다. 오른쪽으로 50미터 더 가서 신호등 없는 횡단보도로 바로 건너세요.")
    }
    var showTaxiBailout by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF070D19))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 상단 이어폰 연결 & 생체 계기판
        Surface(
            color = Color(0xFF111C30),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("🎧 Galaxy Buds3 Pro 보이스 코칭 ON", color = Color(0xFF34D399), fontSize = 12.sp)
                    Text(bannerText, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(currentPace, color = if (showTaxiBailout) Color(0xFFF87171) else Color(0xFF38BDF8), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Text("♥ $heartRateBpm bpm · 마감 02:45", color = Color(0xFF94A3B8), fontSize = 12.sp)
                }
            }
        }

        // 실시간 이어폰 음성 자막 카드
        Surface(
            color = Color(0xFF0F292A),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text("🔊 실시간 이어폰 코칭 (Gemini 4 Argon)", color = Color(0xFF2DD4BF), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(voiceSubtitle, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
        }

        // 돌발 상황 테스트 버튼
        Button(
            onClick = {
                showTaxiBailout = false
                currentPace = "38.0 km/h"
                heartRateBpm = 146
                bannerText = "🚴 언덕 내리막 38km/h ➔ 서측 2번 출구 거치대 45초 묶기"
                voiceSubtitle = "언덕 내리막 구간입니다. 시속 38km로 5분 만에 역에 도착합니다. 서측 2번 출구 자전거 거치대에 45초 안에 묶고 바로 계단으로 뛰세요!"
                onTriggerEvent(RealtimeVoiceCoachService.LiveEvent.DOWNHILL_BIKE_LOCK)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("① 출발: 언덕 자전거 38km/h ➔ 역 앞 묶기")
        }

        Button(
            onClick = {
                showTaxiBailout = false
                currentPace = "4'30\"/km"
                heartRateBpm = 162
                bannerText = "🚦 정면 사거리 110초 적색불 ➔ 우측 50m 무신호 횡단보도 우회!"
                voiceSubtitle = "전방 사거리 횡단보도 빨간불 110초 대기입니다! 멈추면 열차 놓칩니다. 오른쪽으로 50미터 더 가서 신호등 없는 횡단보도로 바로 건너세요. 1분 28초 빨라집니다!"
                onTriggerEvent(RealtimeVoiceCoachService.LiveEvent.RED_LIGHT_CROSSWALK_BYPASS)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("② 사거리 적색불(110초 대기) ➔ 우측 무신호 횡단보도 우회!")
        }

        Button(
            onClick = {
                showTaxiBailout = true
                currentPace = "6'15\"/km 🚨"
                heartRateBpm = 174
                bannerText = "🚨 페이스 하락 (+42초 지각 위험) ➔ 전방 80m 택시 비상 환승"
                voiceSubtitle = "현재 속도로 뛰면 원래 계획대로 열차를 못 탑니다! 힘드시면 지금이라도 전방 80미터 앞에서 택시를 타야 지각하지 않습니다."
                onTriggerEvent(RealtimeVoiceCoachService.LiveEvent.FATIGUE_PACE_DROP_TAXI)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("③ 체력 저하: 페이스 하락(6'15\"/km) ➔ 택시 비상 환승!")
        }

        if (showTaxiBailout) {
            Button(
                onClick = onCallEmergencyTaxi,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("🚕 지금 바로 택시 호출 (전방 80m 승차)", fontWeight = FontWeight.Bold)
            }
        }
    }
}

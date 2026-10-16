# 📱 PhysioRoute Android Live Nav App (`ai.deepmind.physioroute`)

> **역할 분리 아키텍처 (Web Pre-Trip Planner ➔ Android Live Nav App)**
> - **💻 웹(Web Pre-Trip Planner)**: 집이나 사무실에서 출발하기 전 3초 만에 목적지·마감시간·Strava/Samsung Health 내 몸 데이터를 연동해 **1안(최단시간 돌파 루트)** 과 **2안(지각 확률 0.0% P99 안전 루트)** 을 비교·선택하는 계획 도구입니다.
> - **📱 안드로이드 앱(Android Live Nav App)**: 실제로 거리로 나와 시속 38km로 언덕 자전거를 타거나 4'30"/km 페이스로 달리는 동안, **화면이 꺼진 주머니 속에서도 1초 단위 고정밀 GPS(`FusedLocationProviderClient`), 실시간 심박/케이던스(`Health Connect` / `Galaxy Watch`), 이어폰 오디오 포커스 덕킹(`AudioFocusRequest` + `TextToSpeech`)** 으로 횡단보도 우회·택시 비상 환승·지하철 실시간 지연 경로 변경을 귀에 직접 코칭해주는 네이티브 앱입니다.

---

## 왜 실시간 러닝·자전거·횡단보도 우회 네비는 웹이 아니라 Android Native App이어야 하는가?

1. **화면 OFF 상태의 백그라운드 고정밀 GPS 추적 (`FOREGROUND_SERVICE_LOCATION`)**
   - 시속 38km로 금호동 급경사 언덕을 자전거로 내려가거나 역 계단을 향해 전력 질주할 때 스마트폰 화면을 손에 들고 볼 수 없습니다.
   - 모바일 웹 브라우저는 화면이 잠기거나 백그라운드로 전환되는 즉시 GPS 폴링과 타이머가 스로틀링/중단됩니다.
   - Android Native `RealtimeVoiceCoachService`(`ForegroundService`)는 `PRIORITY_HIGH_ACCURACY`(1Hz~5Hz)로 주머니 속에서도 사용자의 위치와 실시간 이동 속도(m/s)를 끊김 없이 추적합니다.

2. **사거리 적색신호(110초 대기) 감지 ➔ 우측 50m 무신호 횡단보도 즉각 우회 코칭**
   - 정면 사거리 진입 80m 전, 사용자의 현재 속도 벡터와 신호 잔여 시간을 계산하여 정지 시 열차 개찰구 마감(08:03:00)을 놓친다고 판단되면, **즉시 이어폰(Galaxy Buds3 Pro)으로 "전방 사거리 빨간불 110초 대기입니다! 오른쪽 50m 무신호 횡단보도로 바로 건너세요"** 라고 음성 인터럽트를 보냅니다.

3. **실시간 페이스 하락(4'30"/km ➔ 6'15"/km) 및 심박수 급등 감지 ➔ 택시 비상 환승 트리거**
   - Android `HealthServicesClient` / `HealthConnectClient` 및 GPS 속도 이동평균을 통해 사용자의 실제 달리기 페이스가 목표 GAP(`4'30"/km`)에서 `6'15"/km`로 떨어지면, 남은 거리 대비 열차 탑승 실패(+42초 지각)를 1초 만에 재계산합니다.
   - 달리기를 강요하는 대신 **"현재 속도로는 열차를 못 탑니다! 전방 80m 대로변에서 바로 택시를 타세요"** 라고 코칭하고 원터치 택시 호출 인텐트(`kakao T` / `Uber`)를 띄웁니다.

4. **오디오 덕킹(Audio Ducking) 및 핸즈프리 블루투스 이어폰 마이크 인터랙션**
   - 러닝 중 음악을 듣고 있어도 `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`으로 음악 볼륨만 살짝 줄인 뒤 `Gemini 4 Argon`의 명확한 보이스 코칭을 송출합니다.
   - 이어폰 줄모콘/터치 한 번으로 `"지금 너무 숨찬데 걸어도 돼?"`, `"앞에 공사 중인데 어디로 돌아가?"`라고 물으면 즉시 현재 GPS 좌표와 남은 마감 시간을 바탕으로 대답합니다.

---

## 디렉터리 구조

```text
android-app/
├── README.md
└── app/
    └── src/
        └── main/
            ├── AndroidManifest.xml
            └── java/ai/deepmind/physioroute/
                ├── MainActivity.kt              # Jetpack Compose Turn-by-Turn HUD & Health Connect 연동 UI
                └── RealtimeVoiceCoachService.kt # Foreground GPS + Pace Drop Detector + Earbud TTS Coach
```

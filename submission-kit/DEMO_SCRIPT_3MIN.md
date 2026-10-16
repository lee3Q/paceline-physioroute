# 🎬 3-Minute Live Demo & Pitch Script — Candidate #5
## PhysioRoute: Run-or-Miss (`http://localhost:8085`)
### Your Personal Commute Chief-of-Staff + Live Pace-Drop Tactical Voice Bailout

> **Target Duration**: 3 minutes 00 seconds (180 seconds)
> **Core Narrative**:
> 1. **"My Competent Subordinate" Framing**: Asking *"How do I get there?"* and getting **⚡ The Absolute Fastest Way** vs **🛡️ The Safest Zero-Risk Way**—factoring in Strava physiology, 38 km/h downhill bike, Ttareungi, sidewalk construction, and street festivals that **neither Map Apps nor standard LLMs can combine**.
> 2. **61s Stale-Telemetry Fail-Closed Gate**: Refusing to command a 38 km/h downhill ride or sprint on >60s stale train data.
> 3. **Climax WOW — 🎧 Live Pace-Drop Detection & Tactical Voice Bailout**: Mid-run pace drops → Engine declares original train impossible (`PLAN_INFEASIBLE`) → **Live Voice Alert** commands an immediate switch to a taxi 80m ahead!

---

## ⏱️ Timeline Overview

| Time | Segment | Visual / Action on `:8085` | Key Judge Takeaway |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:45** | **1. Why Neither Maps Nor Standard LLMs Can Do This** | Show **⚡ Fastest vs 🛡️ Safest** Dual Briefing + Strava / 38 km/h Bike / Sidewalk Construction & Festival inputs | Maps ignore personal Strava physiology & sidewalk festivals/construction; standard LLMs can't compute P99 transit physics. `gemini-4-argon` fuses both! |
| **0:45 – 1:30** | **2. Steep-Hill Physics & Route Inversion (`6→3→2` vs `6→2`)** | Toggle **Walk (15m) → Bike 38 km/h / Run (5m)** + inject **Line 3 Delay / Sidewalk Friction** | Effort level + real-world friction flips which train you catch and reverses the optimal subway corridor. |
| **1:30 – 2:15** | **3. 61s Stale-Data Fail-Closed Gate** | Slide **Telemetry Age to `68s`** | Locks out reckless `RUN / 38 km/h BIKE` commands when subway data is >60s old (`STALE_TRAIN_DATA`). |
| **2:15 – 3:00** | **4. CLIMAX WOW: 🎧 Live Pace-Drop Tactical Voice Bailout** | Trigger **Live Pace-Drop (`4'30"/km → 5'50"/km`)** with **Audio/Voice ON** | Live voice booms out: *"At this pace catching the 08:18 train is impossible—stop running and hail a taxi 80m ahead right now!"* |

---

## 🎙️ Second-by-Second Script (English & 한국어 병기)

### [0:00 – 0:45] Part 1: The Hook — Why Neither Map Apps Nor Standard LLMs Can Be Your Chief-of-Staff (문제 제기: 왜 지도 앱도 일반 LLM도 '내 유능한 부하'처럼 답하지 못하는가?)

**[Screen Action]**
- Open `http://localhost:8085`. Point to the **Dual Executive Briefing (`⚡ Fastest Time-Attack` vs `🛡️ Safest P99 Guaranteed`)** and the real-world context inputs: **Personal Strava Pace, 38 km/h Steep Downhill Bike + Lock, Shared Bike (Ttareungi), Sidewalk Construction, and Street Festival Blockages**.

**[English Script]**
> "Before a critical 09:00 meeting, what do you ask a sharp human chief-of-staff?
> You say: *'Tell me two things: **the absolute fastest way** to get there, and **the safest zero-risk way**.'*
> To answer that in the real world, you must combine **my personal Strava running pace**, **shared bikes or my 38 km/h downhill bicycle ride**, **road surface quality**, **ongoing sidewalk construction**, and **a street festival blocking the pedestrian walkway**.
> Today, **neither Google/Naver Maps nor a standard LLM can do this**.
> Map apps know road graphs, but they are completely blind to unstructured sidewalk construction, festival crowds, and my Strava physiology—they think I walk at 4 km/h on flat ground. Standard LLMs can read a festival notice, but can't compute P99 subway transfer math.
> **`gemini-4-argon`** (`thinking_level='high'`, 1M context) bridges both worlds."

**[한국어 대본]**
> "중요한 일정을 앞두고 내 유능한 부하에게 길을 물어볼 때 우리는 딱 두 가지를 원합니다. **'가장 빨리 가는 법(최단 시간)'**과 **'리스크 없이 가장 안전하게 가는 법(P99 보장)'**입니다.
> 이걸 제대로 답하려면 내 **Strava 달리기 실력**, **공유자전거/따릉이**, **급경사 시속 38km 자전거 다운힐**, **노면 상태**, **현재 인도 보도블록 공사**, **거리 페스티벌로 인한 보행로 통제**까지 전부 고려해야 합니다.
> 지금 이건 **어떤 지도 앱을 써도, 일반 LLM에 넣어도 불가능합니다.** 지도 앱은 인도 공사나 페스티벌 통제 같은 비정형 정보와 내 Strava 신체 능력을 모르고, 일반 LLM은 다중 지하철 환승의 P99 지연 확률을 계산하지 못합니다.
> **`gemini-4-argon` (`thinking_level='high'`)**이 최초로 이 두 세계를 결합했습니다."

---

### [0:45 – 1:30] Part 2: Steep-Hill Physics (15m Walk vs 5m Run/Bike) & Corridor Inversion (급경사 3-모드 물리학 & 노선 역전)

**[Screen Action]**
- Toggle between **Walk (15 min)**, **Strava Run (5 min)**, and **38 km/h Downhill Bike-and-Lock (5 min)**, then inject **+180s Line 3 Transfer / Sidewalk Friction**.

**[English Script]**
> "Look at the steep hill to our Line 6 station: **Walking takes 15 minutes** and misses the 08:18 train. Switching to **Strava Run (5 min)** or **38 km/h Downhill Bike + 45s Station Lock (5 min)** catches the 08:18 departure and unlocks the fast `Line 6→3→2` route (**⚡ Fastest Option**).
> Meanwhile, when Line 3 transfer congestion spikes, `gemini-4-argon` automatically highlights `Line 6→2 (Sindang)` as our **🛡️ Safest P99 Option** so we never breach our 09:00 deadline."

**[한국어 대본]**
> "6호선 역까지 급경사 내리막길은 걸으면 **15분**이 걸려 08:18 열차를 놓치지만, **Strava 러닝(5분)**이나 **시속 38km 자전거 다운힐+역 거치대 잠금(5분)**을 선택하면 앞 열차를 잡아타며 **`6→3→2` 최단 루트(⚡ Fastest)**가 열립니다. 반면 3호선 환승 혼잡이 감지되면 P99 리스크가 안전한 **`6→2(신당 1회 환승)` 루트(🛡️ Safest)**를 동시에 제시합니다."

---

### [1:30 – 2:15] Part 3: 61s Stale-Telemetry Fail-Closed Gate (61초 Stale 데이터 감지 시 Fail-Closed 차단)

**[Screen Action]**
- Slide **Telemetry Age past `60s` (to `68s`)** to trigger the red **`🛑 FAIL-CLOSED HOLD (STALE_TRAIN_DATA)`** state, then reset to fresh (`12s`) for the climax.

**[English Script]**
> "First safety rule: if the live subway API lags past **60 seconds**—watch as I set Telemetry Age to **68 seconds**—the gate immediately locks into **`FAIL-CLOSED HOLD`**, refusing to command a 38 km/h downhill ride on stale data."

**[한국어 대본]**
> "첫 번째 안전장치입니다. 실시간 열차 데이터가 안전 임계치인 **60초**를 넘겨 **68초**가 되는 순간, 게이트가 즉시 **`FAIL-CLOSED HOLD`**로 잠기며 낡은 데이터를 믿고 시속 38km로 언덕을 내려가는 위험한 지시를 원천 차단합니다."

---

### [2:15 – 3:00] Part 4: CLIMAX WOW — 🚦 Zero-Stop Crosswalk Bypass & 🎧 Live Pace-Drop Tactical Voice Bailout (사거리 무신호 횡단보도 무정차 우회 & 페이스 저하 시 즉시 택시 환승 보이스 코칭!)

**[Screen Action]**
- First, highlight the **🚦 Zero-Stop Crosswalk Red-Light Bypass** (110s red light wait → right turn +50m to an unsignalized crosswalk = +22s run, **-88s net saved** with zero momentum loss).
- Next, click/trigger the **🎧 Live Pace-Drop & Tactical Voice Bailout** scenario (`4'30"/km` → `5'50"/km`) and let the **Live Voice Synthesis (TTS)** play out loud!

**[English Script]**
> "Now for our two real-time voice coaching breakthroughs that no navigation app on Earth has:
> First, **Zero-Stop Crosswalk Red-Light Bypass**: when you hit a 110-second red light at a 4-way intersection, stopping kills your running or cycling momentum. Our voice coach tells you in real time: *'Red light ahead—don't stop! Turn right 50 meters to the unsignalized crosswalk (+22 seconds running, saving 88 seconds net)!'*
> Second, watch what happens if sidewalk congestion or fatigue drops my running pace from `4:30/km` to `5:50/km`: *(Click Pace-Drop Trigger — Voice Alert speaks aloud)*
> **🔊 [LIVE VOICE]:** *'Warning: Pace dropped to 5:50 per kilometer. Catching the 08:18 Line 6 train is now physically impossible. Stop running immediately and hail a taxi 80 meters ahead at the intersection to protect your 09:00 deadline!'*
> From preserving your momentum at crosswalks to pivoting you to a taxi when your pace drops, **PhysioRoute** is `gemini-4-argon` acting as your ultimate physical-world guardian. Thank you!"

**[한국어 대본]**
> "이제 세상의 그 어떤 네비게이션도 해내지 못한 **실시간 이어폰 보이스 코칭 2가지 하이라이트**를 보여드리겠습니다!
> 첫째, **🚦 사거리 적색 신호 무정차 우회(Zero-Stop Crosswalk Bypass)**입니다. 뛰거나 자전거를 탈 때 사거리 횡단보도 적색 신호(110초 대기)에 걸려 멈춰 서면 시간도 날리고 달리기 탄력(Momentum)도 완전히 깨집니다. 저희 시스템은 즉시 음성으로 지시합니다: *'전방 사거리 적색 신호 110초 대기! 멈추지 말고 우측으로 50m 더 뛰어가 신호등 없는 횡단보도로 건너세요 (+22초 우회, 순수 88초 단축)!'*
> 둘째, 만약 인도 공사 구간이나 체력 저하로 **러닝 페이스가 4분 30초에서 5분 50초로 떨어지면** 어떻게 될까요? *(버튼 클릭 — 실시간 음성 피드백 출력)*
> **🔊 [실시간 보이스 출력]:** *'경고: 현재 페이스가 km당 5분 50초로 저하되어 원래 계획된 08시 18분 열차 탑승이 불가능합니다. 지금 즉시 달리기를 멈추고 전방 80m 교차로에서 택시로 갈아타십시오!'*
> 횡단보도 탄력 보존부터 페이스 저하 시 즉각적인 택시 환승까지—**PhysioRoute: Run-or-Miss**였습니다. 감사합니다!"

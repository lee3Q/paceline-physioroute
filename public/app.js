
// Safe DOM ID Alias Bridge (syncs 5A HTML IDs with 5B JS IDs)
const _origGetById = document.getElementById.bind(document);
const _idAliases = {
  "buddyDialogue": "buddySpeech",
  "coachQuote": "buddySpeech",
  "etaFastValue": "fastTimeVal",
  "etaSafeValue": "safeTimeVal",
  "paceDisplay": "hudPace",
  "etaDisplay": "hudEta",
  "simPaceBadge": "hudPace",
  "simEtaBadge": "hudEta",
  "runnerSpeedBadge": "hudStatus",
  "coachTranscript": "voiceTranscriptBox",
  "redLightZone": "signalGroup"
};
document.getElementById = function(id) {
  return _origGetById(id) || (_idAliases[id] ? _origGetById(_idAliases[id]) : null);
};

// PACELINE Real-Time Running / Fatigue / Bus Reroute & Voice Coaching Engine
// Candidate #5: Conditional Route Freshness Gate

(function() {
  'use strict';

  // State Management
  const state = {
    selectedProfile: 'hybrid', // runner, cyclist, hybrid, safe
    currentPace: "4'30\"",
    currentSpeed: 13.3, // km/h
    etaFast: "19분 10초",
    etaSafe: "22분 40초",
    animating: false,
    currentAnimationId: null,
    speechActive: false
  };

  // Sound & Speech Synthesis
  function speak(text) {
    const transcriptEl = document.getElementById('voiceTranscriptBox') || document.getElementById('coachTranscript');
    if (transcriptEl) {
      transcriptEl.innerHTML = `<span class="speaking-wave">🔊</span> "${text}"`;
      transcriptEl.classList.remove('hidden');
      transcriptEl.classList.add('pulse-glow');
    }

    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop prior speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.08;
    utterance.pitch = 1.0;

    // Pick Korean voice if available
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KR'));
    if (koVoice) utterance.voice = koVoice;

    utterance.onend = () => {
      if (transcriptEl) transcriptEl.classList.remove('pulse-glow');
    };

    window.speechSynthesis.speak(utterance);
  }

  // Rolling Counter Helper
  function animateValue(elementId, startVal, endVal, duration, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  // API Call Fallback
  async function evaluateRoute(options = {}) {
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // offline/fallback
    }
    return {
      etaFast: "19분 10초",
      etaSafe: "22분 40초",
      savingSeconds: 210,
      confidence: 0.98
    };
  }

  // 1. Onboarding Chips & Preset Click Handler
  function initOnboarding() {
    const chips = document.querySelectorAll('.onboard-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', async (e) => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const presetType = chip.getAttribute('data-preset') || chip.dataset.type || 'runner';
        state.selectedProfile = presetType;

        const buddyDialogue = document.getElementById('buddyDialogue') || document.getElementById('coachQuote');
        const fastEtaEl = document.getElementById('etaFastValue');
        const safeEtaEl = document.getElementById('etaSafeValue');
        const runnerSpeedBadge = document.getElementById('runnerSpeedBadge');

        if (presetType === 'runner') {
          if (buddyDialogue) buddyDialogue.textContent = "러너 모드 활성화! Strava 연동 페이스 4'30\"/km 기준, 고도각 5% 미만 평지 최우선 루트를 탐색합니다.";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "Strava 러닝 4'30\"/km";
          if (fastEtaEl) fastEtaEl.textContent = "19분 10초";
          if (safeEtaEl) safeEtaEl.textContent = "22분 40초";
          speak("러너 모드 활성화! 최적 페이스 4분 30초 기준으로 경로를 최적화합니다.");
        } else if (presetType === 'bike' || presetType === 'cyclist') {
          if (buddyDialogue) buddyDialogue.textContent = "따릉이 & 로드바이크 모드! 금호동 내리막(-11.4%) 38km/h 활주 및 최단 거치소(45초) 우선 배정!";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "내 자전거 38km/h";
          if (fastEtaEl) fastEtaEl.textContent = "12분 20초";
          if (safeEtaEl) safeEtaEl.textContent = "15분 50초";
          speak("자전거 모드 활성화! 다운힐 38킬로미터 활주 경로와 정류장 45초 컷 거치대를 안내합니다.");
        } else if (presetType === 'hybrid') {
          if (buddyDialogue) buddyDialogue.textContent = "하이브리드 모드! 달리기 + 버스 환승 + 무신호 횡단보도 실시간 최적 조합 가동 중.";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "복합 환승 최적화";
          if (fastEtaEl) fastEtaEl.textContent = "17분 45초";
          if (safeEtaEl) safeEtaEl.textContent = "21분 10초";
          speak("하이브리드 모드! 뛰다가 버스나 지하철 환승 기회가 생기면 즉시 알립니다.");
        } else {
          if (buddyDialogue) buddyDialogue.textContent = "안전 우선 모드! 경사도 완만, 보행 신호 여유, 밝은 대로변 루트 안내.";
          if (fastEtaEl) fastEtaEl.textContent = "23분 10초";
          if (safeEtaEl) safeEtaEl.textContent = "25분 00초";
        }

        // Trigger lightweight API update
        evaluateRoute({ preset: presetType });
      });
    });

    const demoPresetBtn = document.getElementById('btnDemoPreset');
    if (demoPresetBtn) {
      demoPresetBtn.addEventListener('click', () => {
        const firstChip = document.querySelector('.onboard-chip[data-preset="hybrid"]') || document.querySelector('.onboard-chip');
        if (firstChip) firstChip.click();
      });
    }
  }

  // Animation Utilities
  function cancelCurrentAnimation() {
    if (state.currentAnimationId) {
      cancelAnimationFrame(state.currentAnimationId);
      state.currentAnimationId = null;
    }
    state.animating = false;
  }

  function resetSimVisuals() {
    cancelCurrentAnimation();
    const runner = document.getElementById('runnerAvatar');
    const bus = document.getElementById('busAvatar');
    const sweat = document.getElementById('sweatEffect');
    const pathBus = document.getElementById('pathBusReroute');
    const pathCross = document.getElementById('pathCrosswalkDetour');
    const redLightZone = document.getElementById('redLightZone');
    const etaBadge = document.getElementById('simEtaBadge');
    const paceBadge = document.getElementById('simPaceBadge');

    if (runner) {
      runner.style.transform = 'translate(0px, 0px) rotate(0deg)';
      runner.style.opacity = '1';
    }
    if (bus) {
      bus.style.opacity = '0';
      bus.style.transform = 'translate(0px, 0px)';
    }
    if (sweat) sweat.style.display = 'none';
    if (pathBus) {
      pathBus.style.opacity = '0';
      pathBus.style.strokeDashoffset = '1000';
    }
    if (pathCross) {
      pathCross.style.opacity = '0';
      pathCross.style.strokeDashoffset = '1000';
    }
    if (redLightZone) redLightZone.style.opacity = '0';
    if (etaBadge) {
      etaBadge.textContent = '08:24 도착 예정 (정상)';
      etaBadge.className = 'eta-badge status-green';
    }
    if (paceBadge) {
      paceBadge.textContent = '페이스: 4\'30" /km';
      paceBadge.className = 'pace-badge';
    }
  }

  // 🔥 DEMO ANIMATION 1: playTiredBusRerouteAnimation()
  // Phase 1 (0.0~2.0s): Normal 4'30" pace, runner moves forward along direct path
  // Phase 2 (2.0~4.0s): Fatigue kicks in! Pace drops to 6'25", sweat drops, ETA flashes 08:31 late!
  // Phase 3 (4.0s~): Voice coaching + Green right-turn route to bus stop, bus arrives in 3 min, ETA recovers to 08:26 safe!
  window.playTiredBusRerouteAnimation = function() {
    resetSimVisuals();
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const bus = document.getElementById('busAvatar');
    const sweat = document.getElementById('sweatEffect');
    const pathBus = document.getElementById('pathBusReroute');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');
    const simProgressBar = document.getElementById('simProgress');

    const totalDuration = 9000; // 9 seconds total demonstration
    const startTime = performance.now();
    let voicedPhase3 = false;

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      if (simProgressBar) simProgressBar.style.width = `${progress * 100}%`;

      // PHASE 1: 0.0s ~ 2.0s (Normal Sprint)
      if (elapsed < 2000) {
        const p = elapsed / 2000;
        const x = p * 120;
        const y = 0;
        if (runner) runner.style.transform = `translate(${x}px, ${y}px) rotate(0deg)`;
        if (paceBadge) {
          paceBadge.textContent = '페이스: 4\'30" /km (목표 유지)';
          paceBadge.className = 'pace-badge status-green';
        }
        if (etaBadge) {
          etaBadge.textContent = '08:24 도착 예정 (정상)';
          etaBadge.className = 'eta-badge status-green';
        }
      }
      // PHASE 2: 2.0s ~ 4.0s (Fatigue & Pace Collapse)
      else if (elapsed >= 2000 && elapsed < 4000) {
        const p = (elapsed - 2000) / 2000;
        // decelerating motion
        const decelX = 120 + Math.pow(p, 0.5) * 60; // slower forward movement
        if (runner) runner.style.transform = `translate(${decelX}px, 0px) rotate(5deg)`;

        if (sweat) {
          sweat.style.display = 'block';
          sweat.style.left = `${decelX + 10}px`;
          sweat.style.top = '-20px';
          sweat.innerHTML = '💦 <span class="badge-fatigue">페이스 저하 감지! (+1\'55")</span>';
        }

        // Live Pace Drop
        if (p < 0.5) {
          if (paceBadge) paceBadge.textContent = '페이스: 5\'40" /km (경사도 오르막)';
        } else {
          if (paceBadge) {
            paceBadge.textContent = '페이스: 6\'25" /km 🚨 급락!';
            paceBadge.className = 'pace-badge status-red blink';
          }
          if (etaBadge) {
            etaBadge.textContent = '08:31 도착 예정 (🚨 지각 위험 +7분!)';
            etaBadge.className = 'eta-badge status-red blink';
          }
        }
      }
      // PHASE 3: 4.0s ~ 9.0s (Voice Guidance + Dynamic Right Turn & Bus Reroute)
      else {
        if (!voicedPhase3) {
          voicedPhase3 = true;
          speak("현재 페이스가 6분 25초로 떨어졌습니다! 이 페이스면 늦어요, 더 뛰어야 해요! 만약 더 뛰기 힘드시다면, 바로 앞 교차로에서 우회전해서 버스를 타는 것도 좋습니다. 버스가 딱 3분 뒤에 옵니다!");
          if (pathBus) {
            pathBus.style.opacity = '1';
            pathBus.style.strokeDashoffset = '0';
            pathBus.classList.add('glow-path');
          }
        }

        const p = (elapsed - 4000) / 5000; // 0 to 1
        // Turn right at intersection (X=180), move down to Bus stop (X=240, Y=100)
        let curX = 180 + p * 60;
        let curY = p * 100;
        let rot = 45; // turning angle

        if (p > 0.6) {
          // Arrived at bus stop, waiting for bus
          curX = 240;
          curY = 100;
          rot = 0;
        }

        if (runner) runner.style.transform = `translate(${curX}px, ${curY}px) rotate(${rot}deg)`;

        // Bus Approaching Animation
        if (bus) {
          bus.style.opacity = '1';
          const busX = 100 + p * 140;
          const busY = 100;
          bus.style.transform = `translate(${busX}px, ${busY}px)`;
        }

        if (sweat) sweat.style.display = 'none';

        if (p > 0.5) {
          if (paceBadge) {
            paceBadge.textContent = '🚌 301번 버스 탑승 대기 (3분 뒤 도착)';
            paceBadge.className = 'pace-badge status-cyan';
          }
          if (etaBadge) {
            etaBadge.textContent = '08:26 AM (✅ 세이프! 버스 환승 성공)';
            etaBadge.className = 'eta-badge status-green pulse';
          }
        }
      }

      if (progress < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }

    state.currentAnimationId = requestAnimationFrame(step);
  };

  // 🔥 DEMO ANIMATION 2: Crosswalk 110s Red Light Detour
  window.playCrosswalkDetourAnimation = function() {
    resetSimVisuals();
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const pathCross = document.getElementById('pathCrosswalkDetour');
    const redLightZone = document.getElementById('redLightZone');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    if (redLightZone) {
      redLightZone.style.opacity = '1';
      redLightZone.classList.add('pulse-red');
    }

    speak("사거리 신호 대기 110초! 직진 대기 대신 우측 50미터 무신호 횡단보도로 돌아 뛰세요. 88초 더 빠릅니다!");

    const duration = 6000;
    const startTime = performance.now();

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);

      if (pathCross) {
        pathCross.style.opacity = '1';
        pathCross.style.strokeDashoffset = `${1000 - p * 1000}`;
      }

      // Detour arc trajectory
      const arcX = p * 280;
      const arcY = Math.sin(p * Math.PI) * 55;
      if (runner) runner.style.transform = `translate(${arcX}px, ${arcY}px) rotate(${arcY * 0.4}deg)`;

      if (paceBadge) paceBadge.textContent = '⚡ 무신호 횡단로 우회 질주 중 (속도 14.2km/h)';
      if (etaBadge) {
        etaBadge.textContent = '신호 대기 스킵 완료 (⚡ -88초 단축!)';
        etaBadge.className = 'eta-badge status-green';
      }

      if (p < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }
    state.currentAnimationId = requestAnimationFrame(step);
  };

  // 🔥 DEMO ANIMATION 3: Subway Delay Reroute
  window.playSubwayRerouteAnimation = function() {
    resetSimVisuals();
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    speak("3호선 옥수-약수 구간 신호 고장 환승 지연 감지! 6호선-3호선-2호선 대신, 6호선에서 신당역 2호선 직결 환승으로 루트를 전환합니다.");

    if (paceBadge) {
      paceBadge.textContent = '🚇 지하철 환승 루트 능동 스위칭';
      paceBadge.className = 'pace-badge status-cyan';
    }
    if (etaBadge) {
      etaBadge.textContent = '신당역 직결 환승으로 9분 손실 방어 완료 (✅ 정시 도착)';
      etaBadge.className = 'eta-badge status-green';
    }
  };

  // 🔥 DEMO ANIMATION 4: Downhill Bike Sprint (-11.4% gradient)
  window.playBikeSprintAnimation = function() {
    resetSimVisuals();
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    speak("금호동 고개 내리막 구간 진입! 경사도 마이너스 11.4퍼센트. 시속 38킬로미터로 다운힐 활주 후 금호역 2번 출구 45초 컷 거치대로 진입합니다.");

    const duration = 4500;
    const startTime = performance.now();

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);

      // Fast downhill swoosh
      const x = p * 320;
      const y = Math.pow(p, 1.8) * 80;
      if (runner) runner.style.transform = `translate(${x}px, ${y}px) rotate(15deg)`;

      if (paceBadge) {
        const curSpd = Math.round(18 + p * 20);
        paceBadge.textContent = `🚴 다운힐 속도: ${curSpd} km/h (경사도 -11.4%)`;
        paceBadge.className = 'pace-badge status-orange';
      }

      if (p > 0.8 && etaBadge) {
        etaBadge.textContent = '금호역 따릉이 45초 즉시 거치 완료! (목적지 도보 30m)';
        etaBadge.className = 'eta-badge status-green';
      }

      if (p < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }
    state.currentAnimationId = requestAnimationFrame(step);
  };

  // Attach button triggers
  function initSimulationTriggers() {
    const btnTired = document.getElementById('btnSimTiredBus') || document.getElementById('btnSendToAndroid');
    if (btnTired) {
      btnTired.addEventListener('click', (e) => {
        e.preventDefault();
        window.playTiredBusRerouteAnimation();
      });
    }

    const btnCrosswalk = document.getElementById('btnSimCrosswalk');
    if (btnCrosswalk) {
      btnCrosswalk.addEventListener('click', (e) => {
        e.preventDefault();
        window.playCrosswalkDetourAnimation();
      });
    }

    const btnSubway = document.getElementById('btnSimSubway');
    if (btnSubway) {
      btnSubway.addEventListener('click', (e) => {
        e.preventDefault();
        window.playSubwayRerouteAnimation();
      });
    }

    const btnBike = document.getElementById('btnSimBike');
    if (btnBike) {
      btnBike.addEventListener('click', (e) => {
        e.preventDefault();
        window.playBikeSprintAnimation();
      });
    }

    const btnReset = document.getElementById('btnSimReset');
    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        resetSimVisuals();
      });
    }
  }

  // DOMContentLoaded Bootstrapper
  document.addEventListener('DOMContentLoaded', () => {
    initOnboarding();
    initSimulationTriggers();
    console.log('[PACELINE 5B Engine] Initialized successfully.');
  });

})();

(() => {
  if (window.__amplifyInjected) return;
  window.__amplifyInjected = true;

  const RAMP_TIME = 0.05;
  const FFT_SIZE = 64;
  const BYPASS = { type: "highpass", frequency: 0, q: 1, gain: 0 };

  let audioCtx = null;
  const boostedElements = new WeakMap();
  let currentGain = 1.0;
  let currentEQ = [BYPASS, BYPASS];
  let eqActive = false;
  let normalizeEnabled = false;

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function smoothSetGain(gainNode, value) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + RAMP_TIME);
  }

  function applyFilterSettings(filter, cfg) {
    if (!cfg || !cfg.type) return;
    filter.type = cfg.type;
    filter.frequency.value = cfg.frequency || 0;
    filter.Q.value = cfg.q || 1;
    filter.gain.value = cfg.gain || 0;
  }

  function boostElement(el) {
    if (boostedElements.has(el)) return boostedElements.get(el);
    try {
      const ctx = getAudioContext();
      const source = ctx.createMediaElementSource(el);
      const gainNode = ctx.createGain();
      gainNode.gain.value = currentGain;
      const biquad1 = ctx.createBiquadFilter();
      const biquad2 = ctx.createBiquadFilter();
      applyFilterSettings(biquad1, currentEQ[0]);
      applyFilterSettings(biquad2, currentEQ[1]);
      const compressor = ctx.createDynamicsCompressor();
      if (normalizeEnabled) {
        compressor.threshold.value = -24; compressor.knee.value = 30;
        compressor.ratio.value = 12; compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
      } else {
        compressor.threshold.value = 0; compressor.ratio.value = 1;
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(gainNode);
      gainNode.connect(biquad1);
      biquad1.connect(biquad2);
      biquad2.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(ctx.destination);
      const state = { source, gainNode, biquad1, biquad2, compressor, analyser };
      boostedElements.set(el, state);
      return state;
    } catch { return null; }
  }

  function hookAll() {
    document.querySelectorAll("video, audio").forEach(el => {
      if (!boostedElements.has(el)) boostElement(el);
    });
  }

  function forEachState(fn) {
    document.querySelectorAll("video, audio").forEach(el => {
      const state = boostedElements.get(el);
      if (state) fn(state);
    });
  }

  function setVolume(multiplier) {
    currentGain = multiplier;
    if (multiplier !== 1.0) hookAll();
    forEachState(s => smoothSetGain(s.gainNode, multiplier));
  }

  function setEQ(eq) {
    currentEQ = Array.isArray(eq) ? eq : [BYPASS, BYPASS];
    eqActive = currentEQ[0].type !== "highpass" || currentEQ[0].frequency !== 0 ||
               currentEQ[1].type !== "highpass" || currentEQ[1].frequency !== 0;
    if (eqActive) hookAll();
    forEachState(s => {
      applyFilterSettings(s.biquad1, eq[0]);
      applyFilterSettings(s.biquad2, eq[1]);
    });
  }

  function setNormalize(enabled) {
    normalizeEnabled = enabled;
    if (enabled) hookAll();
    forEachState(s => {
      if (enabled) {
        s.compressor.threshold.value = -24; s.compressor.knee.value = 30;
        s.compressor.ratio.value = 12; s.compressor.attack.value = 0.003;
        s.compressor.release.value = 0.25;
      } else {
        s.compressor.threshold.value = 0; s.compressor.ratio.value = 1;
      }
    });
  }

  function getAnalyserData() {
    let data = null;
    document.querySelectorAll("video, audio").forEach(el => {
      if (data) return;
      const state = boostedElements.get(el);
      if (state && state.analyser) {
        const bufferLength = state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteFrequencyData(dataArray);
        data = { dataArray: Array.from(dataArray), bufferLength };
      }
    });
    return data;
  }

  const observer = new MutationObserver(() => {
    if (currentGain !== 1.0 || normalizeEnabled || eqActive) {
      hookAll();
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true, subtree: true
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "setVolume") {
      setVolume(msg.value / 100);
      sendResponse({ ok: true });
    }
    if (msg.action === "setEQ") {
      setEQ(msg.eq);
      sendResponse({ ok: true });
    }
    if (msg.action === "setNormalize") {
      setNormalize(msg.enabled);
      sendResponse({ ok: true });
    }
    if (msg.action === "getAnalyserData") {
      sendResponse(getAnalyserData());
    }
    if (msg.action === "getMediaInfo") {
      const meta = navigator.mediaSession && navigator.mediaSession.metadata;
      const media = document.querySelector("video, audio");
      sendResponse({
        title: (meta && meta.title) || document.title || null,
        artist: (meta && meta.artist) || null,
        paused: media ? media.paused : true
      });
    }
    if (msg.action === "getStatus") {
      sendResponse({
        injected: true,
        active: document.querySelectorAll("video, audio").length > 0,
        gain: currentGain,
        mediaCount: document.querySelectorAll("video, audio").length
      });
    }
  });
})();

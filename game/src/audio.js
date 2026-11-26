// Audio prosedural WebAudio — tanpa file suara. Mesin berdengung mengikuti
// throttle, angin menderu mengikuti kecepatan, ring berbunyi, pendaratan
// berdentum. Semua dibuat dari osilator + noise, dimulai setelah gestur
// pertama pemain (kebijakan autoplay browser).
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Mesin: dua osilator sawtooth yang sedikit detune.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Angin: noise putih lewat bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    },
    isMuted() {
      return muted;
    },
    // Dipanggil tiap frame saat terbang: throttle 0..1, speed knot.
    update(throttle, speedKnots, airborne) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const target = airborne ? 0.05 + throttle * 0.075 : 0.02;
      engineGain.gain.setTargetAtTime(target, t, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + throttle * 68, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(78 + throttle * 102, t, 0.1);
      const wind = airborne ? Math.min(0.16, (speedKnots / 180) * 0.16) : 0;
      windGain.gain.setTargetAtTime(wind, t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speedKnots * 4, t, 0.15);
    },
    ring() {
      blip(880, 0.18, 'sine', 0.22);
      blip(1318, 0.3, 'sine', 0.18, 0.09);
    },
    touchdown(soft) {
      blip(soft ? 140 : 70, soft ? 0.25 : 0.5, 'sine', soft ? 0.3 : 0.5);
      if (!soft) blip(48, 0.4, 'triangle', 0.4, 0.02);
    },
    warning() {
      blip(660, 0.12, 'square', 0.08);
      blip(660, 0.12, 'square', 0.08, 0.18);
    },
    click() {
      blip(1200, 0.06, 'sine', 0.12);
    },
    crash() {
      blip(90, 0.7, 'sawtooth', 0.3);
      blip(55, 0.9, 'triangle', 0.35, 0.05);
    },
  };
}

// Synthesized car engine sound using the Web Audio API (no external audio files).
const EngineSound = (() => {
  let ctx = null;
  let masterGain = null;
  let osc1, osc2, engineFilter, oscGain;
  let noiseSource, noiseFilter, noiseGain;
  let lfo, lfoGain;
  let running = false;
  let muted = false;
  const BASE_VOLUME = 0.32;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  function buildNoiseBuffer() {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function start() {
    ensureContext();
    if (running) return;
    running = true;

    osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 50;

    osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 57;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 450;
    engineFilter.Q.value = 0.7;

    oscGain = ctx.createGain();
    oscGain.gain.value = 0.55;

    osc1.connect(engineFilter);
    osc2.connect(engineFilter);
    engineFilter.connect(oscGain);

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buildNoiseBuffer();
    noiseSource.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 650;
    noiseFilter.Q.value = 0.9;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.1;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    // Slow LFO gives the engine a subtle idle "flutter" instead of a flat drone.
    lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 8.5;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(oscGain.gain);

    oscGain.connect(masterGain);
    noiseGain.connect(masterGain);

    osc1.start();
    osc2.start();
    noiseSource.start();
    lfo.start();

    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(muted ? 0 : BASE_VOLUME, now + 0.5);
  }

  function stop() {
    if (!running) return;
    running = false;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.3);
    [osc1, osc2, noiseSource, lfo].forEach((node) => {
      try {
        node.stop(now + 0.35);
      } catch (e) {
        /* already stopped */
      }
    });
  }

  // speed01: 0 (idle) .. 1 (top speed) — raises pitch and brightness like revving an engine.
  function setSpeed(speed01) {
    if (!running || !ctx) return;
    const s = Math.max(0, Math.min(1, speed01));
    const now = ctx.currentTime;
    const jitter = (Math.random() - 0.5) * 2;
    const baseFreq = 45 + s * 95;

    osc1.frequency.setTargetAtTime(baseFreq + jitter, now, 0.06);
    osc2.frequency.setTargetAtTime(baseFreq * 1.14 + jitter, now, 0.06);
    engineFilter.frequency.setTargetAtTime(400 + s * 900, now, 0.12);
    noiseFilter.frequency.setTargetAtTime(500 + s * 1600, now, 0.12);
    noiseGain.gain.setTargetAtTime(0.08 + s * 0.08, now, 0.12);
  }

  function setMuted(value) {
    muted = value;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : BASE_VOLUME, ctx.currentTime, 0.08);
    }
  }

  function isMuted() {
    return muted;
  }

  function makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // One-shot metallic crash: distorted noise burst (crunch) + a low-frequency thud.
  function playCrash() {
    ensureContext();
    if (muted) return;

    const now = ctx.currentTime;
    const duration = 0.6;

    const crashNoise = ctx.createBufferSource();
    crashNoise.buffer = buildNoiseBuffer();

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(420);
    shaper.oversample = '4x';

    const crashFilter = ctx.createBiquadFilter();
    crashFilter.type = 'bandpass';
    crashFilter.Q.value = 0.7;
    crashFilter.frequency.setValueAtTime(2200, now);
    crashFilter.frequency.exponentialRampToValueAtTime(180, now + duration);

    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(0, now);
    noiseEnv.gain.linearRampToValueAtTime(0.9, now + 0.008);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + duration);

    crashNoise.connect(shaper);
    shaper.connect(crashFilter);
    crashFilter.connect(noiseEnv);
    noiseEnv.connect(ctx.destination);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(170, now);
    thud.frequency.exponentialRampToValueAtTime(35, now + 0.35);

    const thudEnv = ctx.createGain();
    thudEnv.gain.setValueAtTime(0.8, now);
    thudEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    thud.connect(thudEnv);
    thudEnv.connect(ctx.destination);

    crashNoise.start(now);
    crashNoise.stop(now + duration + 0.05);
    thud.start(now);
    thud.stop(now + 0.45);
  }

  // Bright rising "ding" for a successful jump-over bonus.
  function playBonus() {
    ensureContext();
    if (muted) return;

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(740, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    const env1 = ctx.createGain();
    env1.gain.setValueAtTime(0.001, now);
    env1.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc1.connect(env1);
    env1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1080, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(1700, now + 0.16);

    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.001, now + 0.05);
    env2.gain.exponentialRampToValueAtTime(0.35, now + 0.07);
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc2.connect(env2);
    env2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.26);
  }

  return { start, stop, setSpeed, setMuted, isMuted, playCrash, playBonus };
})();

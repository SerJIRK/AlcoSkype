// AlcoSkype 2.0 Pro — Процедурный звуковой движок (Web Audio API, 0 внешних MP3)

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.75;
    this.muted = false;
    this.ringtoneTimer = null;
    this.flyNodes = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val)));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  setMuted(flag) {
    this.muted = Boolean(flag);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  createNoiseBuffer(durationSec = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const size = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 1. Звук открытия жестяной пивной банки (металлический щелчок + пшик CO2)
  playCanOpen() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Щелчок язычка (короткий резонансный импульс)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1450, now);
    clickOsc.frequency.exponentialRampToValueAtTime(340, now + 0.045);
    clickGain.gain.setValueAtTime(0.45, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    clickOsc.connect(clickGain).connect(this.masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.06);

    // Второй металлический бряк клапана
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(2200, now + 0.03);
    snapOsc.frequency.exponentialRampToValueAtTime(600, now + 0.075);
    snapGain.gain.setValueAtTime(0.18, now + 0.03);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    snapOsc.connect(snapGain).connect(this.masterGain);
    snapOsc.start(now + 0.03);
    snapOsc.stop(now + 0.085);

    // Пшик газа (высокочастотный фильтрованный шум)
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.45);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(4800, now + 0.04);
    hp.frequency.exponentialRampToValueAtTime(2100, now + 0.36);
    hp.Q.value = 1.2;

    const fizzGain = ctx.createGain();
    fizzGain.gain.setValueAtTime(0.001, now + 0.035);
    fizzGain.gain.linearRampToValueAtTime(0.42, now + 0.07);
    fizzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    noise.connect(hp).connect(fizzGain).connect(this.masterGain);
    noise.start(now + 0.035);
    noise.stop(now + 0.44);
  }

  // 2. Ошибка ввода
  playErrorBuzz() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.14].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now + offset);
      osc.frequency.linearRampToValueAtTime(125, now + offset + 0.11);
      gain.gain.setValueAtTime(0.22, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.13);
    });
  }

  // 3. Классический Skype-рингтон входящего звонка (пузырьковая мелодия)
  startSkypeIncoming() {
    this.stopRingtone();
    const playPhrase = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [
        [523.25, 0.0, 0.14],
        [659.25, 0.15, 0.14],
        [783.99, 0.30, 0.16],
        [1046.5, 0.48, 0.24],
        [783.99, 0.76, 0.14],
        [1046.5, 0.92, 0.32]
      ];
      for (const [freq, start, dur] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.015, now + start + dur);
        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.linearRampToValueAtTime(0.28, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain).connect(this.masterGain);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      }
    };
    playPhrase();
    this.ringtoneTimer = setInterval(playPhrase, 2400);
  }

  // 4. Классический Skype-гудок исходящего звонка
  startSkypeOutgoing() {
    this.stopRingtone();
    const playPulse = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [440, 554.37].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0.001, now + idx * 0.18);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.18 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.42);
        osc.connect(gain).connect(this.masterGain);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.45);
      });
    };
    playPulse();
    this.ringtoneTimer = setInterval(playPulse, 2600);
  }

  stopRingtone() {
    if (this.ringtoneTimer) {
      clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = null;
    }
  }

  playCallConnected() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.22, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.28);
    });
  }

  playCallEnded() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 493.88, 329.63].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.22, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.22);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.25);
    });
  }

  // 5. Звон стекла (отбил бутылку / чокнулись)
  playGlassClink() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const partials = [1920, 2860, 4120, 5480];
    partials.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.992, now + 0.45);
      const amp = 0.24 / (idx + 1);
      gain.gain.setValueAtTime(amp, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48 - idx * 0.07);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  // 6. Разбитое стекло (пропустил бутылку)
  playGlassShatter() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.6);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.48, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    noise.connect(hp).connect(nGain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.58);

    // Осколки
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.035 + Math.random() * 0.03;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2600 + Math.random() * 3800;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }

  // 7. Противное жужжание мухи
  startFlyBuzz() {
    this.stopFlyBuzz();
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 175;
    lfo.type = 'sine';
    lfo.frequency.value = 18;
    lfoGain.gain.value = 26;
    lfo.connect(lfoGain).connect(osc.frequency);

    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 3.2;

    gain.gain.value = 0.13;
    osc.connect(bp).connect(gain).connect(this.masterGain);
    osc.start();
    lfo.start();
    this.flyNodes = { osc, lfo, gain };
  }

  stopFlyBuzz() {
    if (this.flyNodes) {
      try {
        this.flyNodes.osc.stop();
        this.flyNodes.lfo.stop();
      } catch { /* noop */ }
      this.flyNodes = null;
    }
  }

  playSwat() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    noise.connect(bp).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.16);
  }

  // 8. Вестерн-тема для «Алко-ковбоев»
  playWesternTension() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const melody = [
      [587.33, 0.0, 0.25],
      [783.99, 0.28, 0.25],
      [587.33, 0.56, 0.22],
      [783.99, 0.82, 0.22],
      [587.33, 1.08, 0.65],
      [440.0, 1.85, 0.55]
    ];
    for (const [freq, start, dur] of melody) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.04);
    }
  }

  playGunshot() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Ударный саб-бас
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.25);
    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain).connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.3);

    // Пороховой хлопок
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, now);
    lp.frequency.exponentialRampToValueAtTime(400, now + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    noise.connect(lp).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.38);
  }

  // 9. Полиграф (писк радара + вердикт)
  playPolygraphBeep(pitch = 880) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playPolygraphVerdict(isTruth) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = isTruth ? [523.25, 659.25, 783.99] : [220, 207.65, 196];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isTruth ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, now + i * 0.1);
      gain.gain.setValueAtTime(0.22, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.38);
    });
  }

  // 10. Саундборд
  playSoundboard(id) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (id === 'drumroll') {
      // Барабанная дробь + тарелка Ба-дум-тсс!
      for (let i = 0; i < 12; i++) {
        const t = now + i * 0.075;
        const noise = ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.08);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.14 + i * 0.015, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(bp).connect(g).connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.07);
      }
      // Тарелка в конце
      const cym = ctx.createBufferSource();
      cym.buffer = this.createNoiseBuffer(0.9);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.35, now + 0.95);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 1.75);
      cym.connect(hp).connect(cg).connect(this.masterGain);
      cym.start(now + 0.95);
      cym.stop(now + 1.8);
      return;
    }

    if (id === 'crickets') {
      // Сверчки (неловкая тишина)
      [0, 0.55, 1.1].forEach(groupStart => {
        for (let p = 0; p < 4; p++) {
          const t = now + groupStart + p * 0.06;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(4200, t);
          g.gain.setValueAtTime(0.14, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc.connect(g).connect(this.masterGain);
          osc.start(t);
          osc.stop(t + 0.05);
        }
      });
      return;
    }

    if (id === 'trombone') {
      // Грустный тромбон (Wah-wah-wah-waaaah)
      const notes = [
        [293.66, 0.0, 0.32],
        [277.18, 0.36, 0.32],
        [261.63, 0.72, 0.32],
        [246.94, 1.08, 0.95]
      ];
      notes.forEach(([freq, start, dur], idx) => {
        const osc = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + start);
        if (idx === 3) {
          osc.frequency.linearRampToValueAtTime(freq - 24, now + start + dur);
        }
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(950, now + start);
        g.gain.setValueAtTime(0.24, now + start);
        g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(lp).connect(g).connect(this.masterGain);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      });
      return;
    }

    if (id === 'bottlePop') {
      // Хлопок пробки + бульканье
      const pop = ctx.createOscillator();
      const pg = ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(220, now);
      pop.frequency.exponentialRampToValueAtTime(860, now + 0.055);
      pg.gain.setValueAtTime(0.48, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      pop.connect(pg).connect(this.masterGain);
      pop.start(now);
      pop.stop(now + 0.09);

      // Бульки
      for (let i = 0; i < 6; i++) {
        const t = now + 0.16 + i * 0.11;
        const b = ctx.createOscillator();
        const bg = ctx.createGain();
        b.type = 'sine';
        const base = 320 + i * 45;
        b.frequency.setValueAtTime(base, t);
        b.frequency.exponentialRampToValueAtTime(base * 1.55, t + 0.075);
        bg.gain.setValueAtTime(0.18, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
        b.connect(bg).connect(this.masterGain);
        b.start(t);
        b.stop(t + 0.09);
      }
      return;
    }

    if (id === 'cheers') {
      this.playGlassClink();
    }
  }

  playSpeakerTest() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.22, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.25);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.28);
    });
  }

  // Анализатор громкости микрофона (для проверки микрофона и «Алкотестера»)
  createMicMeter(stream) {
    const ctx = this.ensureContext();
    if (!ctx || !stream) return null;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      return {
        getLevel() {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            sum += data[i];
            if (data[i] > peak) peak = data[i];
          }
          const avg = sum / data.length;
          return Math.min(100, Math.round(avg * 0.7 + peak * 0.35));
        },
        destroy() {
          try { source.disconnect(); } catch { /* noop */ }
        }
      };
    } catch {
      return null;
    }
  }
}

export const sound = new SoundEngine();

// All sound is synthesised with the Web Audio API, so there are no audio
// files to load. Wind ambience is panned towards the side it blows from and
// swells with its strength, so you can hear a gust coming.

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.connect(this.master);
    this.applyVolume();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Brown-ish noise: softer and more like moving air than white noise
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.noise = noise;

    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    wind.connect(this.windFilter).connect(this.windGain);
    (this.windPan ? this.windGain.connect(this.windPan) : this.windGain).connect(this.amb);
    wind.start();

    const rain = ctx.createBufferSource();
    rain.buffer = this.whiteNoise();
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(this.rainGain).connect(this.amb);
    rain.start();
  }

  whiteNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  applyVolume() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.volume;
    this.sfx.gain.value = s.sfxVolume;
    this.amb.gain.value = s.ambienceVolume;
  }

  // Called every frame with the current wind (px/s, signed) and rain amount.
  setWeather(wind, precip, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const strength = Math.min(1, Math.abs(wind) / 70);
    this.windGain.gain.setTargetAtTime(active ? 0.08 + strength * 0.5 : 0.05, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + strength * 900, t, 0.2);
    if (this.windPan) this.windPan.pan.setTargetAtTime(-Math.sign(wind) * 0.6 * strength, t, 0.2);
    this.rainGain.gain.setTargetAtTime(active ? precip * 0.12 : 0, t, 0.3);
  }

  tone({ freq = 440, to = freq, dur = 0.1, type = 'square', vol = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  burst({ dur = 0.2, freq = 1200, q = 1, vol = 0.3, type = 'bandpass', delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  play(name) {
    switch (name) {
      case 'jump':
        return this.tone({ freq: 300, to: 520, dur: 0.09, vol: 0.08 });
      case 'walljump':
        return this.tone({ freq: 360, to: 640, dur: 0.1, vol: 0.08 });
      case 'super':
      case 'hyper':
        return this.tone({ freq: 260, to: 900, dur: 0.16, vol: 0.09, type: 'sawtooth' });
      case 'dash':
        return this.burst({ dur: 0.22, freq: 2400, vol: 0.5 });
      case 'land':
        return this.burst({ dur: 0.07, freq: 300, vol: 0.4, type: 'lowpass' });
      case 'grab':
        return this.burst({ dur: 0.05, freq: 900, vol: 0.25 });
      case 'tired':
        return this.tone({ freq: 220, to: 140, dur: 0.25, vol: 0.08, type: 'triangle' });
      case 'refill':
        return this.tone({ freq: 880, dur: 0.05, vol: 0.04, type: 'triangle' });
      case 'cake':
        [660, 880, 1320].forEach((f, i) => this.tone({ freq: f, dur: 0.12, vol: 0.07, type: 'triangle', delay: i * 0.05 }));
        return;
      case 'checkpoint':
        [523, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.25, vol: 0.08, type: 'triangle', delay: i * 0.1 }));
        return;
      case 'died':
        this.tone({ freq: 440, to: 80, dur: 0.35, vol: 0.1, type: 'sawtooth' });
        return this.burst({ dur: 0.3, freq: 600, vol: 0.35, type: 'lowpass' });
      case 'crumble':
        return this.burst({ dur: 0.25, freq: 500, vol: 0.3, type: 'lowpass' });
      case 'bounce':
        return this.tone({ freq: 200, to: 600, dur: 0.2, vol: 0.08, type: 'triangle' });
      case 'gust':
        return this.burst({ dur: 0.9, freq: 500, vol: 0.18, q: 0.5 });
      case 'finish':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.35, vol: 0.08, type: 'triangle', delay: i * 0.12 }));
        return;
      case 'pb':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, dur: 0.3, vol: 0.07, type: 'square', delay: 0.5 + i * 0.09 }));
        return;
      case 'ui':
        return this.tone({ freq: 660, dur: 0.04, vol: 0.04, type: 'triangle' });
    }
  }
}

// Words shown on screen for each sound when captions are on.
export const CAPTIONS = {
  dash: 'whoosh',
  died: 'ouch!',
  cake: 'mint cake: dash and stamina refilled',
  checkpoint: 'cairn reached',
  tired: 'arms tiring',
  bounce: 'boing',
  crumble: 'loose rock gives way',
  finish: 'summit!',
};

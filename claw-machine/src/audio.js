// All sounds are synthesised with WebAudio — no audio files needed.
export class Sfx {
  constructor(muted = false) {
    this.ctx = null;
    this.muted = muted;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);

      // continuous motor hum for the gantry / winch
      this.motorOsc = this.ctx.createOscillator();
      this.motorOsc.type = 'sawtooth';
      this.motorOsc.frequency.value = 60;
      this.motorFilter = this.ctx.createBiquadFilter();
      this.motorFilter.type = 'lowpass';
      this.motorFilter.frequency.value = 380;
      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.value = 0;
      this.motorOsc.connect(this.motorFilter).connect(this.motorGain).connect(this.master);
      this.motorOsc.start();

      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slideTo = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, freq = 2000, q = 1, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  motor(level, pitch = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.motorGain.gain.setTargetAtTime(Math.min(1, level) * 0.075, t, 0.05);
    this.motorOsc.frequency.setTargetAtTime(52 + pitch * 38, t, 0.08);
  }

  coin() {
    this.noise(0.05, { vol: 0.25, freq: 5000, q: 4 });
    this.tone(988, 0.09, { type: 'square', vol: 0.09 });
    this.tone(1319, 0.4, { type: 'square', vol: 0.09, delay: 0.085 });
  }

  start() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.07, delay: i * 0.07 }));
  }

  press() {
    this.noise(0.03, { vol: 0.2, freq: 1800, q: 2 });
    this.tone(220, 0.06, { type: 'triangle', vol: 0.15 });
  }

  clack() {
    this.noise(0.07, { vol: 0.35, freq: 2600, q: 3 });
    this.tone(160, 0.08, { type: 'triangle', vol: 0.18, slideTo: 90 });
  }

  tick() {
    this.tone(1760, 0.05, { type: 'square', vol: 0.06 });
  }

  slip() {
    this.tone(700, 0.35, { type: 'triangle', vol: 0.12, slideTo: 180 });
  }

  lose() {
    this.tone(392, 0.22, { type: 'sawtooth', vol: 0.06 });
    this.tone(370, 0.22, { type: 'sawtooth', vol: 0.06, delay: 0.24 });
    this.tone(349, 0.6, { type: 'sawtooth', vol: 0.06, delay: 0.48, slideTo: 300 });
  }

  win() {
    this.tone(110, 0.18, { type: 'sine', vol: 0.35, slideTo: 55 });
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this.tone(f, 0.16, { type: 'square', vol: 0.07, delay: 0.1 + i * 0.09 });
      this.tone(f * 2, 0.12, { type: 'triangle', vol: 0.04, delay: 0.1 + i * 0.09 });
    });
    for (let i = 0; i < 8; i++) this.tone(2000 + Math.random() * 2000, 0.1, { vol: 0.03, delay: 0.8 + i * 0.05 });
  }
}

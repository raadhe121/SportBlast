// Web Audio sound for Highway Rush 3D. No audio files: everything is synthesised.

let mutedPref = false; // remembered between rounds

export class Sound {
  ctx: AudioContext | null = null;
  muted = mutedPref;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private eg!: GainNode;
  private rainGain!: GainNode;
  private rainWanted = false;
  private oscs: { o: OscillatorNode; mul: number }[] = [];
  private noise!: AudioBuffer;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.55; this.master.connect(c.destination);
    this.filter = c.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.Q.value = 2.2; this.filter.frequency.value = 700;
    this.eg = c.createGain(); this.eg.gain.value = 0;
    this.filter.connect(this.eg); this.eg.connect(this.master);
    this.oscs = ([["sawtooth", 1, 0.34], ["square", 2, 0.12], ["triangle", 0.5, 0.42]] as const).map(([type, mul, vol]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 80 * mul;
      const g = c.createGain(); g.gain.value = vol; o.connect(g); g.connect(this.filter); o.start();
      return { o, mul };
    });
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // rain: looping filtered noise
    const rs = c.createBufferSource(); rs.buffer = buf; rs.loop = true;
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    rs.connect(hp); hp.connect(lp); lp.connect(this.rainGain); this.rainGain.connect(this.master); rs.start();
    this.setRain(this.rainWanted);
  }
  // Pitch follows RPM (which resets on each upshift); nitro opens the filter for a brighter sound.
  engine(rpm: number, nitro: boolean, load: number, on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = rpm / 60 * 2;
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.04);
    this.filter.frequency.setTargetAtTime(500 + (rpm - 2000) * 0.22 + load * 350 + (nitro ? 1700 : 0), t, 0.06);
    this.eg.gain.setTargetAtTime(on ? 0.2 + load * 0.1 + (nitro ? 0.1 : 0) : 0, t, 0.08);
  }
  setRain(on: boolean) {
    this.rainWanted = on;
    if (this.ctx) this.rainGain.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.3);
  }
  private burst(dur: number, vol: number, lo: number, hi: number, thump: boolean) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(hi, t); f.frequency.exponentialRampToValueAtTime(lo, t + dur); f.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, 0, dur + 0.05);
    if (thump) {
      const o = c.createOscillator(), og = c.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
      og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.65);
    }
  }
  crash() { this.burst(0.9, 1.0, 120, 2600, true); }
  hit() { this.burst(0.5, 0.8, 150, 2000, true); }
  /** A car horn: two square-wave notes, quieter the further away the car is. */
  honk(volume: number, pitch: number) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(), lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    const v = 0.16 * volume;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.015); g.gain.setValueAtTime(v, t + 0.22); g.gain.linearRampToValueAtTime(0, t + 0.3);
    for (const f of [pitch, pitch * 1.26]) { const o = c.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.32); }
    lp.connect(g); g.connect(this.master);
  }
  scrape() { this.burst(0.22, 0.22, 1800, 4200, false); }
  setMuted(m: boolean) {
    this.muted = m; mutedPref = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.03);
  }
  suspend() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }
  close() { void this.ctx?.close(); this.ctx = null; }
}

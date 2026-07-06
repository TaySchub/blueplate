/*
  Deckbound — src/audio.js
  100% procedural Web Audio (no files, no deps): the `audio` object.
  Touch only on a dedicated audio branch. The engine never calls this
  directly — src/main.js wires engine FX hooks to these methods.
*/

/* =========================================================================
   4) AUDIO
   ========================================================================= */

const audio = {
  ctx: null, ready: false, muted: false, master: null,
  // LOCAL rng — audio must NEVER touch the global Math.random. The seeded smoke
  // runs (tools/dev/harness.html) replace Math.random, so any draw here would
  // desync the engine's draw sequence and break the smoke baselines. xorshift32.
  _rng: 0x2545f491 >>> 0,
  _rand() { let x = this._rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._rng = x >>> 0; return this._rng / 4294967296; },
  _last: {},   // per-key last-play time (s) for throttling repeat-heavy events
  // True if `key` fired within `gap` seconds — collapses tick-simultaneous
  // multi-fires (zap's 3–4 hands, paparazzi's 2 shots) so nothing machine-guns.
  _throttle(key, gap) { const t = this.ctx ? this.ctx.currentTime : 0; if (this._last[key] != null && t - this._last[key] < gap) return true; this._last[key] = t; return false; },
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      // Shared mix bus: everything routes through a soft limiter + master gain, so
      // 15 towers firing at once can't clip the output.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 26; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.ready = true;
    } catch (e) { console.warn("Deckbound: audio unavailable —", e); }
  },

  // ---- low-level helpers -------------------------------------------------
  // A soft-attack / smooth-release gain envelope. The whole "robotic" problem
  // is mostly hard digital clicks — a gain that jumps to full volume or snaps
  // to zero at frame boundaries. Ramping up over a few ms and decaying with
  // setTargetAtTime (an exponential glide, never a hard stop) removes that.
  env(g, peak, t0, attack = 0.008, release = 0.16, sustain = null) {
    const hold = sustain != null ? sustain : peak;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    if (sustain != null) g.gain.linearRampToValueAtTime(hold, t0 + attack + 0.02);
    g.gain.setTargetAtTime(0.0001, t0 + attack, release);
  },
  // One "voice": 1–3 gently-detuned oscillators through a shared lowpass
  // filter and an enveloped gain, optionally with vibrato and a filter sweep.
  // Detuning a couple of layers a few cents/Hz apart is what makes a tone
  // sound like a played instrument instead of a bare test-tone beep.
  voice(freq, opts = {}) {
    if (!this.ready || this.muted || !this.ctx) return;
    const {
      type = "sine", dur = 0.18, gain = 0.18, freqTo = null,
      detunes = [0], attack = 0.008, release = 0.15,
      filterFreq = null, filterFreqTo = null, filterQ = 0.7,
      vibratoHz = 0, vibratoCents = 0, pan = null,
    } = opts;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const g = ctx.createGain();
    let node = g;
    if (filterFreq != null) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.Q.value = filterQ;
      f.frequency.setValueAtTime(filterFreq, t0);
      if (filterFreqTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreqTo), t0 + dur);
      g.connect(f);
      node = f;
    }
    let out = node;
    if (pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      out = p;
    }
    out.connect(this.master || ctx.destination);   // shared mix bus (soft limiter)

    let lfo = null, lfoGain = null;
    if (vibratoHz > 0 && vibratoCents > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = vibratoHz;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * (Math.pow(2, vibratoCents / 1200) - 1); // cents -> Hz swing
      lfo.connect(lfoGain);
      lfo.start(t0);
      lfo.stop(t0 + dur + release);
    }

    const oscs = detunes.map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const f = freq * Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(f, t0);
      if (freqTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo * Math.pow(2, cents / 1200)), t0 + dur);
      if (lfoGain) lfoGain.connect(osc.frequency);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + release);
      return osc;
    });

    this.env(g, gain, t0, attack, release);
    if (lfo) lfo.onended = () => { lfoGain.disconnect(); };
    oscs[oscs.length - 1].onended = () => { g.disconnect(); };
    return { osc: oscs[0], gain: g };
  },
  // Back-compat-ish simple tone, now routed through voice() so every caller
  // gets the soft envelope + click-free release for free.
  tone(freq, dur, type = "sine", gain = 0.2, freqTo = null, extra = {}) {
    return this.voice(freq, { type, dur, gain, freqTo, ...extra });
  },
  // Filtered noise: white noise through a resonant bandpass/lowpass instead
  // of raw broadband hiss. That's what turns a "static burst" into an organic
  // chomp/crunch/clatter transient — the filter picks out a body/formant the
  // way a real bite or clatter would have, rather than sounding like a radio.
  noiseBurst(dur, gain = 0.25, opts = {}) {
    if (!this.ready || this.muted || !this.ctx) return;
    const { filterType = "bandpass", freq = 1400, freqTo = null, q = 1.0, attack = 0.004, release = null } = opts;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Slightly biased noise generation (average of two randoms) is softer/
    // less "hissy" than pure uniform white noise — a cheap warmth trick.
    for (let i = 0; i < frames; i++) {
      const n = (Math.random() + Math.random() - 1);
      data[i] = n * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType; filt.Q.value = q;
    filt.frequency.setValueAtTime(freq, t0);
    if (freqTo != null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t0 + dur);
    const g = ctx.createGain();
    this.env(g, gain, t0, attack, release != null ? release : Math.max(0.03, dur * 0.5));
    src.connect(filt).connect(g).connect(this.master || ctx.destination);   // shared mix bus
    src.start(t0);
    src.stop(t0 + dur + 0.2);
  },

  // ---- effects ------------------------------------------------------------
  // Attack = what the customer actually DOES, one flavor per tower + per upgrade
  // path (Issue #64). Throttled per-type so tick-simultaneous multi-fires (zap's
  // hands, paparazzi's shots) collapse to one. All wobble uses the LOCAL rng.
  shoot(typeId, path) {
    if (!this.ready || this.muted || !this.ctx) return;
    if (this._throttle("shoot:" + typeId, 0.045)) return;
    const r = 1 + (this._rand() * 0.14 - 0.07); // ±7% pitch wobble (local rng)
    switch (typeId) {
      case "cannon": // Big Appetite — ONE big WET CHOMP (no more inhale-gulp)
        this.voice(150 * r, { type: "sine", detunes: [-7, 0, 8], dur: 0.13, gain: 0.15, freqTo: 58, attack: 0.006, release: 0.12, filterFreq: 700, filterFreqTo: 160 }); // jaws close
        this.noiseBurst(0.07, 0.14, { filterType: "bandpass", freq: 520, freqTo: 180, q: 0.9, attack: 0.002, release: 0.06 });   // wet "chp"
        this.voice(300 * r, { type: "triangle", dur: 0.04, gain: 0.05, freqTo: 140, attack: 0.001, release: 0.04, filterFreq: 2400 }); // teeth click
        break;
      case "frost": // The Photographer — shutter click-clack + flash whine (a camera, not ice)
        this._shutter(path === "longExposure");   // Long Exposure: slow, drawn-out
        break;
      case "sniper": { // The Milkshake Slurper — an actual straw SLURP
        const deep = path === "extraSlurp";        // Extra Slurp: deeper gulp
        this._slurp(deep, r);
        if (path === "sillyStraw") setTimeout(() => this._slurp(deep, 1 + (this._rand() * 0.1 - 0.05)), 70); // two gurgling straws
        break;
      }
      case "zap": // The Kids' Table — little grabby-hand pats
        this._grab(path === "teenageTable", r);    // Teenage Table: lower, bored grabs
        break;
      default: { // The Regular — light fork tink/stab
        const carving = path === "carvingStation"; // Carving Station: heavier shink
        const base = carving ? 250 : 360;
        this.voice(base * r, { type: "triangle", detunes: [-5, 0, 6], dur: 0.08, gain: 0.06, freqTo: base * 0.5, attack: 0.003, release: 0.07, filterFreq: 2000, filterFreqTo: 800 });
        this.noiseBurst(0.03, 0.045, { filterType: "bandpass", freq: carving ? 2200 : 3200, q: 1.6, attack: 0.001, release: 0.03 }); // metallic tink
        if (carving) this.noiseBurst(0.09, 0.05, { filterType: "bandpass", freq: 1500, freqTo: 800, q: 1.4, attack: 0.002, release: 0.07 }); // carving scrape "shink"
        if (path === "forkFrenzy") setTimeout(() => { // rapid-fire flurry: a quick second tink
          this.voice(400 * r, { type: "triangle", dur: 0.05, gain: 0.045, freqTo: 200, attack: 0.002, release: 0.05, filterFreq: 2600 });
          this.noiseBurst(0.02, 0.035, { filterType: "bandpass", freq: 3400, q: 1.6, attack: 0.001, release: 0.02 });
        }, 55);
      }
    }
  },
  // Camera shutter click-clack + a subtle flash-charge whine. slow = Long Exposure.
  _shutter(slow) {
    const g = slow ? 1.6 : 1;
    this.noiseBurst(0.012 * g, 0.09, { filterType: "bandpass", freq: 2600, q: 3, attack: 0.001, release: 0.012 * g });
    setTimeout(() => this.noiseBurst(0.02 * g, 0.07, { filterType: "bandpass", freq: 1500, q: 2.4, attack: 0.001, release: 0.02 * g }), 26 * g);
    this.voice(4200, { type: "sine", dur: 0.10 * g, gain: 0.028, freqTo: 5600, attack: 0.005, release: 0.08 * g, filterFreq: 7000 }); // flash whine
  },
  // Bubbly straw slurp — a resonant downward sip + a warbling gulp. deep = Extra Slurp.
  _slurp(deep, r) {
    const base = deep ? 300 : 420;
    this.noiseBurst(0.16, deep ? 0.11 : 0.09, { filterType: "bandpass", freq: (deep ? 700 : 950) * r, freqTo: deep ? 240 : 320, q: 3.2, attack: 0.006, release: 0.13 });
    this.voice(base * r, { type: "sawtooth", detunes: [-8, 0, 8], dur: 0.16, gain: deep ? 0.06 : 0.045, freqTo: base * 0.55, attack: 0.008, release: 0.12, filterFreq: 1200, filterFreqTo: 500, vibratoHz: 22, vibratoCents: 30 });
  },
  // Little grabby "pat-pat" hand taps. teen = Teenage Table (lower, slower, fewer).
  _grab(teen, r) {
    const n = teen ? 2 : 3, f = teen ? 300 : 520, gap = teen ? 60 : 42;
    for (let i = 0; i < n; i++) setTimeout(() => {
      this.voice(f * r * (1 + i * 0.04), { type: "triangle", dur: 0.04, gain: teen ? 0.05 : 0.045, freqTo: f * 0.6, attack: 0.002, release: 0.04, filterFreq: teen ? 1600 : 2600 });
      this.noiseBurst(0.02, 0.03, { filterType: "bandpass", freq: teen ? 900 : 1500, q: 1.2, attack: 0.001, release: 0.02 });
    }, i * gap);
  },
  hit() { // light fork *tink* on a non-lethal bite — soft triangle, gently filtered
    this.voice(520 + Math.random() * 140, { type: "triangle", detunes: [0, 6], dur: 0.05, gain: 0.03, attack: 0.003, release: 0.05, filterFreq: 2800 });
  },
  kill() { // a satisfying crunch + gulp as a dish is eaten
    const start = 320 + Math.random() * 150;
    this.voice(start, { type: "sawtooth", detunes: [-7, 0, 7], dur: 0.2, gain: 0.11, freqTo: 75, attack: 0.006, release: 0.14, filterFreq: 1600, filterFreqTo: 350 }); // swallow-down gulp, de-buzzed by the filter
    this.noiseBurst(0.16, 0.16, { filterType: "lowpass", freq: 1800, freqTo: 500, q: 0.7, attack: 0.003, release: 0.12 }); // crunch
    setTimeout(() => this.voice(108, { type: "sine", detunes: [0, 5], dur: 0.14, gain: 0.1, freqTo: 58, attack: 0.01, release: 0.14 }), 55); // low "gulp" tail
  },
  // A dish clatters into the trash + a sad little descending trombone — a wasted meal.
  leak() {
    this.noiseBurst(0.13, 0.13, { filterType: "bandpass", freq: 1200, freqTo: 600, q: 1.1, attack: 0.003, release: 0.1 }); // clatter
    [330, 262, 208, 165].forEach((f, i) => setTimeout(() => this.voice(f, {
      type: "sawtooth", detunes: [-6, 0, 6], dur: 0.2, gain: 0.1, freqTo: f * 0.94,
      attack: 0.015, release: 0.16, filterFreq: 1100, filterFreqTo: 500, vibratoHz: 5, vibratoCents: 12,
    }), i * 95));
  },
  upgrade() { // "Order up!" — a bright but rounded diner service-bell ding-ding
    const ding = () => {
      this.voice(1320, { type: "sine", detunes: [0, 3], dur: 0.55, gain: 0.12, attack: 0.004, release: 0.42, filterFreq: 5200 });
      this.voice(1980, { type: "sine", dur: 0.4, gain: 0.045, attack: 0.004, release: 0.3, filterFreq: 6000 });
    };
    ding(); setTimeout(ding, 140);
  },
  build() { this.voice(300, { type: "triangle", detunes: [0, 6], dur: 0.1, gain: 0.13, freqTo: 460, attack: 0.006, release: 0.09, filterFreq: 2200 }); },
  deny() { this.voice(180, { type: "sawtooth", detunes: [0, 5], dur: 0.13, gain: 0.09, freqTo: 120, attack: 0.005, release: 0.1, filterFreq: 900 }); },
  waveStart() { this.voice(330, { type: "triangle", detunes: [-4, 0, 4], dur: 0.18, gain: 0.13, freqTo: 500, attack: 0.008, release: 0.14, filterFreq: 2600 }); },
  buy() {
    this.voice(520, { type: "sine", detunes: [0, 4], dur: 0.11, gain: 0.13, freqTo: 780, attack: 0.006, release: 0.1, filterFreq: 3400 });
    setTimeout(() => this.voice(780, { type: "sine", detunes: [0, 4], dur: 0.13, gain: 0.13, attack: 0.006, release: 0.12, filterFreq: 3800 }), 90);
  },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.voice(f, { type: "triangle", detunes: [-4, 0, 4], dur: 0.28, gain: 0.15, attack: 0.008, release: 0.22, filterFreq: 3600, vibratoHz: 5.5, vibratoCents: 6 }), i * 130)); },
  lose() { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => this.voice(f, { type: "sawtooth", detunes: [-6, 0, 6], dur: 0.32, gain: 0.13, attack: 0.01, release: 0.24, filterFreq: 1400, filterFreqTo: 500 }), i * 150)); },

  // ---- signature + economy hooks (audio pass, Issue #64) ------------------
  // Speed Eater: the bite scatters crumbs — a dry, crispy crunch.
  crumb() {
    if (!this.ready || this.muted || !this.ctx) return;
    this.noiseBurst(0.06, 0.09, { filterType: "bandpass", freq: 3200, freqTo: 1800, q: 1.4, attack: 0.001, release: 0.05 });
    setTimeout(() => this.noiseBurst(0.05, 0.06, { filterType: "highpass", freq: 2600, q: 0.8, attack: 0.001, release: 0.045 }), 40);
  },
  // One Big Bite: the comedic "ptooey" spit — a wet raspberry + a cartoon whistle
  // that flies higher/longer the farther the (lighter) dish is spat (scale 0.5–2).
  knockback(scale) {
    if (!this.ready || this.muted || !this.ctx) return;
    const s = Math.max(0.5, Math.min(2, scale || 1));
    this.noiseBurst(0.09 * s, 0.13, { filterType: "bandpass", freq: 900, freqTo: 300, q: 0.8, attack: 0.002, release: 0.07 * s });   // splutter
    this.voice(220, { type: "sawtooth", detunes: [-10, 0, 10], dur: 0.1 + 0.05 * s, gain: 0.08, freqTo: 90, attack: 0.004, release: 0.1, filterFreq: 1100, filterFreqTo: 400, vibratoHz: 30, vibratoCents: 40 }); // raspberry
    setTimeout(() => this.voice(600 + 500 * s, { type: "triangle", dur: 0.12 + 0.06 * s, gain: 0.05, freqTo: 300 + 900 * s, attack: 0.01, release: 0.1, filterFreq: 4200 }), 60); // dish whistling away
  },
  // Paparazzi: the second shutter of the double-burst, tight behind the base flash.
  doubleFreeze() {
    if (!this.ready || this.muted || !this.ctx) return;
    setTimeout(() => this._shutter(false), 55);
  },
  // Birthday Party: a tiny descending party-horn "pwaap" when the 4th kid piles on
  // (throttled so it garnishes rather than machine-guns).
  fourthHand() {
    if (!this.ready || this.muted || !this.ctx) return;
    if (this._throttle("horn", 1.1)) return;
    this.voice(700, { type: "sawtooth", detunes: [-6, 0, 6], dur: 0.16, gain: 0.06, freqTo: 300, attack: 0.006, release: 0.12, filterFreq: 1800, filterFreqTo: 700, vibratoHz: 14, vibratoCents: 25 });
  },
  // Sell: a cash-register cha-CHING — drawer "chk" + two bright bells (was the build blip).
  sell() {
    if (!this.ready || this.muted || !this.ctx) return;
    this.noiseBurst(0.04, 0.05, { filterType: "highpass", freq: 3000, q: 0.7, attack: 0.001, release: 0.035 });
    const ching = (f, d) => setTimeout(() => {
      this.voice(f, { type: "sine", detunes: [0, 4], dur: 0.5, gain: 0.12, attack: 0.003, release: 0.4, filterFreq: 6500 });
      this.voice(f * 1.5, { type: "sine", dur: 0.4, gain: 0.05, attack: 0.003, release: 0.32, filterFreq: 7000 });
    }, d);
    ching(1568, 30); ching(2093, 150);   // G6 then C7 — "cha-ching"
  },
  // Place: a chair-scoot "scrrt" wood scrape + a soft settle thunk as a customer sits.
  place() {
    if (!this.ready || this.muted || !this.ctx) return;
    this.noiseBurst(0.13, 0.08, { filterType: "bandpass", freq: 380, freqTo: 260, q: 1.6, attack: 0.006, release: 0.1 });
    setTimeout(() => this.voice(150, { type: "sine", detunes: [0, 7], dur: 0.09, gain: 0.09, freqTo: 90, attack: 0.006, release: 0.08, filterFreq: 700 }), 90);
  },
};


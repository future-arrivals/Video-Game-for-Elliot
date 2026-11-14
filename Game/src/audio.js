// Synthesized placeholder sounds (Web Audio only: oscillators, noise, short envelopes; no files).
// They stand in for real recordings later. Kept soft for a living-room TV.
//
//   const audio = createAudio();
//   audio.unlock();            // on every press/tap: creates or resumes the AudioContext
//   audio.play('candy');       // does nothing (and never throws) before unlock
//   audio.setVolume({ master: 0.8, music: 0.6, effects: 1 });

export const SOUND_NAMES = ['step', 'fold', 'open', 'hit', 'bigHit', 'heal', 'candy', 'sting', 'fanfare', 'lose', 'boing', 'select',
  'splash', 'stretch', 'push', 'bell', 'gate', 'join', 'spotted'];

const BASE_GAIN = 0.32; // overall ceiling before the master setting

export function createAudio() {
  let ctx = null, master = null, effects = null, music = null, noise = null;
  const vol = { master: 0.8, music: 0.6, effects: 1 };
  let lastStep = -1;

  function build() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // keeps overlapping hits from clipping
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    effects = ctx.createGain(); effects.connect(master);
    music = ctx.createGain(); music.connect(master);
    const len = Math.floor(ctx.sampleRate * 1.0);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 12345; // fixed seed: the same noise every time
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    applyVolume();
    return true;
  }

  function applyVolume() {
    if (!ctx) return;
    master.gain.value = BASE_GAIN * clamp01(vol.master);
    effects.gain.value = clamp01(vol.effects);
    music.gain.value = clamp01(vol.music);
  }

  // ---- building blocks ----
  // A tone with an attack/decay envelope. freq may be [from, to] for a glide.
  function tone(t, { type = 'sine', freq = 440, dur = 0.15, gain = 0.5, attack = 0.005, out = effects }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g.gain, t, attack, dur, gain);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // Filtered noise burst. filter: { type, freq: n | [from, to], q }.
  function hiss(t, { dur = 0.15, gain = 0.4, attack = 0.005, filter = { type: 'bandpass', freq: 2000, q: 1 }, out = effects }) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = filter.type; f.Q.value = filter.q ?? 1;
    const [f0, f1] = Array.isArray(filter.freq) ? filter.freq : [filter.freq, filter.freq];
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g.gain, t, attack, dur, gain);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function env(p, t, attack, dur, peak) {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(peak, t + attack);
    p.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  }
  const note = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI number -> Hz

  // ---- the sounds ----
  const SOUNDS = {
    step(t) { // soft pencil-on-paper tap
      hiss(t, { dur: 0.05, gain: 0.12, filter: { type: 'bandpass', freq: 1800 + Math.random() * 500, q: 2 } });
    },
    fold(t) { // papery swish, downward
      hiss(t, { dur: 0.26, gain: 0.32, attack: 0.06, filter: { type: 'bandpass', freq: [4200, 900], q: 0.9 } });
      hiss(t + 0.2, { dur: 0.05, gain: 0.18, filter: { type: 'lowpass', freq: 900, q: 1 } });
    },
    open(t) { // swish upward with a light pop
      hiss(t, { dur: 0.24, gain: 0.3, attack: 0.05, filter: { type: 'bandpass', freq: [900, 4200], q: 0.9 } });
      tone(t + 0.2, { type: 'sine', freq: [520, 880], dur: 0.12, gain: 0.22 });
    },
    hit(t) { // thump plus a short crackle
      tone(t, { type: 'sine', freq: [220, 70], dur: 0.16, gain: 0.6 });
      hiss(t, { dur: 0.08, gain: 0.3, filter: { type: 'lowpass', freq: 2500, q: 0.7 } });
    },
    bigHit(t) {
      tone(t, { type: 'sine', freq: [180, 45], dur: 0.32, gain: 0.8 });
      tone(t, { type: 'triangle', freq: [400, 90], dur: 0.18, gain: 0.3 });
      hiss(t, { dur: 0.22, gain: 0.4, filter: { type: 'lowpass', freq: [4000, 600], q: 0.7 } });
    },
    heal(t) { // gentle rising sparkle
      [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.07, { type: 'sine', freq: note(n), dur: 0.35, gain: 0.22, attack: 0.02 }));
    },
    candy(t) { // short and bright
      tone(t, { type: 'triangle', freq: note(88), dur: 0.08, gain: 0.25 });
      tone(t + 0.06, { type: 'triangle', freq: note(93), dur: 0.16, gain: 0.25 });
    },
    sting(t) { // battle start: quick rising run and a held chord
      [60, 64, 67].forEach((n, i) => tone(t + i * 0.06, { type: 'square', freq: note(n), dur: 0.08, gain: 0.08 }));
      [70, 74, 77].forEach(n => tone(t + 0.2, { type: 'triangle', freq: note(n), dur: 0.45, gain: 0.16, attack: 0.01 }));
      hiss(t + 0.2, { dur: 0.2, gain: 0.12, filter: { type: 'highpass', freq: 3000, q: 0.7 } });
    },
    fanfare(t) { // win, about 1.2 s
      const seq = [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.3], [76, 0.78, 0.12], [79, 0.92, 0.32]];
      for (const [n, at, d] of seq) {
        tone(t + at, { type: 'triangle', freq: note(n), dur: d, gain: 0.22, attack: 0.01 });
        tone(t + at, { type: 'square', freq: note(n), dur: d, gain: 0.04, attack: 0.01 });
      }
      [55, 60, 64].forEach(n => tone(t + 0.92, { type: 'sine', freq: note(n), dur: 0.32, gain: 0.12, attack: 0.02 }));
    },
    lose(t) { // slow sad slide down
      [67, 63, 60].forEach((n, i) => tone(t + i * 0.28, { type: 'triangle', freq: note(n), dur: 0.3, gain: 0.2, attack: 0.02 }));
      tone(t + 0.84, { type: 'triangle', freq: [note(55), note(50)], dur: 0.6, gain: 0.2, attack: 0.02 });
    },
    boing(t) { // illegal action: springy wobble
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.3);
      lfo.frequency.value = 18; lg.gain.value = 40;
      lfo.connect(lg); lg.connect(o.frequency);
      env(g.gain, t, 0.005, 0.3, 0.35);
      o.connect(g); g.connect(effects);
      o.start(t); lfo.start(t); o.stop(t + 0.35); lfo.stop(t + 0.35);
    },
    select(t) { // card lift: a little paper flick and a tick
      hiss(t, { dur: 0.05, gain: 0.15, filter: { type: 'highpass', freq: 2500, q: 0.7 } });
      tone(t, { type: 'sine', freq: [700, 1000], dur: 0.07, gain: 0.18 });
    },
    splash(t) { // boulder into water: soft noise burst over a downward plop
      hiss(t, { dur: 0.3, gain: 0.3, attack: 0.012, filter: { type: 'lowpass', freq: [3000, 500], q: 0.7 } });
      tone(t, { type: 'sine', freq: [420, 110], dur: 0.2, gain: 0.4, attack: 0.008 });
      tone(t + 0.1, { type: 'sine', freq: [300, 140], dur: 0.15, gain: 0.15, attack: 0.01 });
    },
    stretch(t) { // rubbery rising glide with a wobble
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.5);
      lfo.frequency.value = 11; lg.gain.value = 22;
      lfo.connect(lg); lg.connect(o.frequency);
      env(g.gain, t, 0.04, 0.5, 0.3);
      o.connect(g); g.connect(effects);
      o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
    },
    push(t) { // heavy stone scrape, then a soft thud
      hiss(t, { dur: 0.3, gain: 0.34, attack: 0.05, filter: { type: 'lowpass', freq: [420, 260], q: 1.2 } });
      tone(t + 0.3, { type: 'sine', freq: [130, 55], dur: 0.1, gain: 0.5, attack: 0.004 });
    },
    bell(t) { // small bright bell: strike plus ringing partials
      [[note(84), 0.2, 0.9], [note(84) * 2.76, 0.07, 0.5], [note(84) * 5.4, 0.03, 0.25]].forEach(([f, g, d]) =>
        tone(t, { type: 'sine', freq: f, dur: d, gain: g, attack: 0.004 }));
      hiss(t, { dur: 0.03, gain: 0.08, filter: { type: 'bandpass', freq: 3500, q: 1 } });
    },
    gate(t) { // creak (narrow rising band) then a soft clack
      hiss(t, { dur: 0.32, gain: 0.3, attack: 0.05, filter: { type: 'bandpass', freq: [350, 900], q: 9 } });
      tone(t, { type: 'triangle', freq: [260, 420], dur: 0.32, gain: 0.05, attack: 0.05 });
      hiss(t + 0.36, { dur: 0.05, gain: 0.25, filter: { type: 'lowpass', freq: 1800, q: 0.8 } });
      tone(t + 0.36, { type: 'sine', freq: [200, 90], dur: 0.08, gain: 0.3 });
    },
    join(t) { // light happy four-note rise
      [72, 76, 79, 84].forEach((n, i) => {
        const last = i === 3;
        tone(t + i * 0.13, { type: 'triangle', freq: note(n), dur: last ? 0.3 : 0.16, gain: 0.2, attack: 0.01 });
        tone(t + i * 0.13, { type: 'sine', freq: note(n + 12), dur: last ? 0.3 : 0.12, gain: 0.05, attack: 0.01 });
      });
    },
    spotted(t) { // "uh-oh" alert: two quick rising notes
      tone(t, { type: 'triangle', freq: note(74), dur: 0.1, gain: 0.25, attack: 0.008 });
      tone(t + 0.12, { type: 'triangle', freq: note(79), dur: 0.17, gain: 0.25, attack: 0.008 });
    },
  };

  return {
    unlock() {
      try {
        if (!ctx && !build()) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch { /* audio unavailable: stay silent */ }
    },
    play(name) {
      try {
        if (!ctx || ctx.state === 'closed' || !SOUNDS[name]) return;
        const t = ctx.currentTime + 0.005;
        if (name === 'step') { if (t - lastStep < 0.12) return; lastStep = t; }
        SOUNDS[name](t);
      } catch { /* never throw from a sound */ }
    },
    setVolume(v = {}) {
      for (const k of ['master', 'music', 'effects']) if (typeof v[k] === 'number') vol[k] = v[k];
      try { applyVolume(); } catch { /* ignore */ }
    },
    get unlocked() { return !!ctx && ctx.state === 'running'; },
  };
}

function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }

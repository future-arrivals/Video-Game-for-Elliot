// Original background music, synthesized with the Web Audio API (no files). Tracks are plain note data:
// flat lists of events { s: step (sixteenth), v: voice, n: MIDI note, d: length in steps, g: gain, i: min intensity }.
//
//   const music = createMusic(audio, { enabled });   // audio from audio.js; starts only once the context is unlocked
//   music.setTrack('field');                          // 'field' | 'spooky' | 'battle' | 'boss' | 'title'; same name = no-op
//   music.setIntensity(1);                            // boss phase 2: arpeggio layer and busier drums
//   music.setEnabled(false);                          // the M key
//
// createSequencer(ctx, destination) is the same scheduler against any context (the offline check uses it).
// A look-ahead timer schedules about 0.2 s ahead from ctx.currentTime; it stops while the page is hidden.
// Nothing here throws to the caller.

export const MUSIC_BUS_GAIN = 0.16;     // music bus level: clearly under the sound effects
const LOOKAHEAD = 0.2;                  // seconds scheduled ahead
const TIMER_MS = 50;
const CROSSFADE = 0.8;                  // seconds

// ---------------------------------------------------------------- note data
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
let badTokens = 0;
function midi(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) { badTokens++; return null; }
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
// Melody: one string per bar, "C5/2 D5/2 r/4 ..." (name/length in sixteenths; r = rest). A bar adds up to 16.
function melody(bars, g = 1) {
  const out = [];
  bars.forEach((bar, b) => {
    let s = b * 16;
    for (const tok of bar.trim().split(/\s+/)) {
      const [nm, len] = tok.split('/'), d = Number(len);
      if (!(d > 0)) { badTokens++; continue; }
      if (nm !== 'r') { const n = midi(nm); if (n != null) out.push({ s, v: 'lead', n, d, g }); }
      s += d;
    }
  });
  return out;
}
const MAJ = [0, 4, 7], MIN = [0, 3, 7];
const CHORDS = {
  C: [0, MAJ], F: [5, MAJ], G: [7, MAJ], Bb: [10, MAJ], Eb: [3, MAJ], Ab: [8, MAJ], A: [9, MAJ], E: [4, MAJ],
  Am: [9, MIN], Dm: [2, MIN], Em: [4, MIN], Gm: [7, MIN],
};
const rootAt = (ch, oct) => 12 * (oct + 1) + CHORDS[ch][0];
function padTones(ch) { let b = 60 + CHORDS[ch][0]; if (b > 66) b -= 12; return CHORDS[ch][1].map(x => b + x); }
const perBar = (chords, fn) => chords.flatMap((ch, b) => fn(ch, b).map(e => ({ ...e, s: e.s + b * 16 })));
const pads = (chords, g = 1) => perBar(chords, ch => padTones(ch).map(n => ({ s: 0, v: 'pad', n, d: 16, g })));
const hits = (v, steps, g = 1, i = 0) => steps.map(s => ({ s, v, n: 0, d: 1, g, i }));
const drums = (chords, fn) => perBar(chords, (ch, b) => fn(b));
const sorted = ev => ev.sort((a, b) => a.s - b.s);

// ---- field (C major): motif C D E D G ----
const FIELD_CH = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G', 'F', 'G', 'Em', 'Am', 'C', 'Am', 'Dm', 'G'];
const FIELD_LEAD = [
  'C5/2 D5/2 E5/4 D5/2 G5/6',   'E5/4 C5/2 D5/2 E5/4 r/4',      'F5/2 E5/2 D5/2 C5/2 A4/4 C5/4', 'D5/4 B4/2 C5/2 D5/4 r/4',
  'C5/2 D5/2 E5/4 D5/2 G5/2 E5/4', 'A5/4 G5/2 E5/2 C5/4 E5/4',   'D5/2 E5/2 F5/4 E5/2 D5/2 C5/4', 'B4/2 C5/2 D5/4 G4/4 r/4',
  'A5/3 A5/3 G5/2 F5/4 C5/4',   'G5/3 G5/3 F5/2 E5/4 D5/4',     'E5/4 G5/4 B5/4 G5/4',           'A5/6 G5/2 E5/4 r/4',
  'C5/2 D5/2 E5/4 D5/2 G5/4 E5/2', 'E5/4 C5/2 D5/2 E5/2 G5/2 A5/4', 'F5/4 A5/4 D5/4 F5/4',       'G5/2 F5/2 E5/2 D5/2 B4/4 D5/4',
];
const fieldBass = (ch, b) => {
  const r = rootAt(ch, 2), P = b % 4 === 3
    ? [[0, 0, 3], [4, 7, 3], [8, 0, 3], [11, 7, 1], [12, 12, 2], [14, 7, 2]]
    : [[0, 0, 3], [4, 7, 3], [8, 0, 3], [12, 7, 3]];
  return P.map(([s, o, d]) => ({ s, v: 'bass', n: r + o, d, g: 1 }));
};
const FIELD = {
  bpm: 108, ev: sorted([
    ...melody(FIELD_LEAD), ...perBar(FIELD_CH, fieldBass), ...pads(FIELD_CH, 0.8),
    ...drums(FIELD_CH, b => [...hits('kick', [0, 8], 0.9), ...hits('hat', [2, 6, 10, 14], 0.8),
      ...(b % 8 === 7 ? hits('hat', [13, 15], 0.5) : [])]),
  ]),
};
const TITLE = { bpm: 92, ev: sorted([...melody(FIELD_LEAD, 0.9), ...pads(FIELD_CH, 1)]) };

// ---- spooky (A minor): motif A B C B E, slow, sparse ----
const SP_CH = ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Dm', 'E', 'F', 'Dm', 'E', 'E', 'Am', 'F', 'Dm', 'E'];
const SP_LEAD = [
  'A5/3 B5/3 C6/4 B5/3 E6/3', 'r/8 C6/4 A5/4',          'D6/4 C6/4 A5/8',            'B5/4 G#5/4 E5/8',
  'A5/3 B5/3 C6/4 B5/3 E6/3', 'r/4 A5/4 C6/4 F6/4',     'E6/4 D6/4 C6/8',            'B5/8 G#5/4 B5/4',
  'F6/8 E6/8',               'D6/8 A5/8',              'G#5/4 B5/4 D6/4 B5/4',      'E6/12 r/4',
  'A5/3 B5/3 C6/4 B5/3 E6/3', 'C6/4 A5/4 F5/8',         'D6/4 E6/4 F6/8',            'E6/6 B5/2 G#5/8',
];
const SPOOKY = {
  bpm: 84, ev: sorted([
    ...melody(SP_LEAD).map(e => ({ ...e, v: 'bell' })),
    ...perBar(SP_CH, (ch, b) => [{ s: 0, v: 'pedal', n: b >= 8 && b < 12 ? rootAt(ch, 2) : 45, d: 16, g: 1 }]),
    ...pads(SP_CH, 0.9),
    ...drums(SP_CH, b => [...hits('tick', [4, 12], 0.6), ...(b % 2 ? hits('tick', [14], 0.3) : [])]),
  ]),
};

// ---- battle (A minor): motif A B C B E, call and response ----
const BT_CH = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'E', 'F', 'G', 'Am', 'Em', 'Am', 'F', 'G', 'E'];
const BT_LEAD = [
  'A4/2 B4/2 C5/4 B4/2 E5/4 r/2', 'r/8 A4/2 C5/2 E5/4',          'F5/2 E5/2 D5/4 C5/2 A4/6',   'r/4 D5/2 E5/2 D5/4 B4/4',
  'A4/2 B4/2 C5/4 B4/2 E5/4 r/2', 'E5/2 D5/2 C5/2 B4/2 A4/8',     'D5/2 E5/2 F5/4 E5/2 A5/4 r/2', 'G#4/2 B4/2 E5/4 G#5/4 B5/4',
  'C6/4 A5/2 C6/2 F5/8',          'B5/4 G5/2 B5/2 D6/8',          'E6/4 C6/4 A5/8',            'G5/4 B5/4 E6/8',
  'A4/2 B4/2 C5/4 B4/2 E5/4 r/2', 'F5/2 G5/2 A5/4 G5/2 C6/4 r/2', 'D5/2 E5/2 F5/2 G5/2 A5/2 B5/2 C6/2 D6/2', 'G#5/2 B5/2 D6/2 E6/2 G#6/4 r/4',
];
const BATTLE = {
  bpm: 132, ev: sorted([
    ...melody(BT_LEAD),
    ...perBar(BT_CH, (ch, b) => {
      const r = rootAt(ch, 2), out = [];
      for (let k = 0; k < 8; k++) {
        const walk = b === 15 ? [0, 0, 3, 3, 7, 7, 12, 12][k] : (k % 4 === 2 ? 12 : 0);
        out.push({ s: k * 2, v: 'bass', n: r + walk, d: 1.6, g: 0.9 });
      }
      return out;
    }),
    ...pads(BT_CH, 0.6),
    ...drums(BT_CH, b => [...hits('kick', b % 2 ? [0, 8, 10] : [0, 8], 0.9), ...hits('snare', [4, 12], 0.9),
      ...hits('hat', [0, 2, 4, 6, 8, 10, 12, 14], 0.6), ...(b === 15 ? hits('snare', [13, 14, 15], 0.6) : [])]),
  ]),
};

// ---- boss (D minor): motif D E F E A, flat second (Eb) and tritone (Ab) ----
const BS_CH = ['Dm', 'Dm', 'Eb', 'Dm', 'Bb', 'Gm', 'Ab', 'A', 'Gm', 'Dm', 'Bb', 'A', 'Dm', 'Eb', 'Gm', 'A'];
const BS_LEAD = [
  'D5/2 E5/2 F5/4 E5/2 A5/6',   'A5/2 G5/2 F5/4 E5/4 D5/4',    'Eb5/2 F5/2 G5/4 F5/2 Bb5/6',  'A5/4 F5/4 Eb5/4 D5/4',
  'Bb4/2 C5/2 D5/4 C5/2 F5/6',  'G5/4 F5/2 G5/2 Bb5/8',        'Ab5/4 G5/4 F5/4 Eb5/4',       'E5/2 F5/2 G5/2 A5/2 C#6/4 A5/4',
  'D6/4 C6/2 Bb5/2 A5/8',       'F5/2 A5/2 D6/4 C6/2 A5/2 F5/4', 'D6/4 Bb5/4 F5/8',            'E5/2 A5/2 C#6/4 E6/8',
  'D5/2 E5/2 F5/4 E5/2 A5/6',   'Eb5/2 F5/2 G5/4 F5/2 Bb5/6',  'G5/4 Bb5/4 D6/4 Bb5/4',       'A5/2 C#6/2 E6/2 A6/2 G6/4 E6/4',
];
const BOSS = {
  bpm: 140, ev: sorted([
    ...melody(BS_LEAD, 1.05),
    ...perBar(BS_CH, (ch, b) => {
      const r = rootAt(ch, 2), out = [];
      for (let k = 0; k < 8; k++) {
        const gal = b % 4 === 3 && k >= 6;
        out.push({ s: k * 2 + (gal ? 0 : 0), v: 'bass', n: r + (k % 2 ? 12 : 0), d: 1.6, g: 1 });
        if (gal) out.push({ s: k * 2 + 1, v: 'bass', n: r + (k === 7 ? 7 : 0), d: 0.8, g: 0.8 });
      }
      return out;
    }),
    ...pads(BS_CH, 0.6),
    ...drums(BS_CH, b => [
      ...hits('kick', [0, 6, 8], 1), ...hits('snare', [4, 12], 1), ...hits('hat', [0, 2, 4, 6, 8, 10, 12, 14], 0.6),
      ...hits('kick', [3, 11, 14], 0.7, 1), ...hits('hat', [1, 3, 5, 7, 9, 11, 13, 15], 0.4, 1), ...hits('snare', [7, 15], 0.4, 1),
      ...(b === 15 ? hits('snare', [13, 14, 15], 0.7) : []),
    ]),
    // phase 2 layer: a fast high arpeggio of each bar's chord
    ...perBar(BS_CH, ch => {
      const t = padTones(ch), seq = [t[0], t[1], t[2], t[0] + 12, t[2], t[1]];
      return Array.from({ length: 16 }, (_, s) => ({ s, v: 'arp', n: seq[s % 6] + 12, d: 1, g: 1, i: 1 }));
    }),
  ]),
};

export const TRACKS = { field: FIELD, spooky: SPOOKY, battle: BATTLE, boss: BOSS, title: TITLE };
for (const t of Object.values(TRACKS)) t.steps = 16 * 16;
export const MOTIFS = { field: 'C5 D5 E5 D5 G5', spooky: 'A5 B5 C6 B5 E6', battle: 'A4 B4 C5 B4 E5', boss: 'D5 E5 F5 E5 A5', title: 'C5 D5 E5 D5 G5' };
export const trackInfo = () => ({ badTokens, tracks: Object.fromEntries(Object.entries(TRACKS).map(([k, t]) => [k, { bpm: t.bpm, bars: 16, events: t.ev.length }])) });

// ---------------------------------------------------------------- voices
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const VOICE_GAIN = { lead: 0.34, bell: 0.3, bass: 0.4, pedal: 0.36, pad: 0.07, kick: 0.7, hat: 0.1, snare: 0.2, tick: 0.08, arp: 0.09 };

function envelope(p, t, attack, peak, end) {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  p.exponentialRampToValueAtTime(0.0001, Math.max(end, t + attack + 0.01));
}

export function createSequencer(ctx, destination, { timer = true } = {}) {
  // music bus: gain -> gentle lowpass -> compressor -> destination
  const bus = ctx.createGain(); bus.gain.value = MUSIC_BUS_GAIN;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
  bus.connect(lp); lp.connect(comp); comp.connect(destination);

  const nlen = Math.floor(ctx.sampleRate), noise = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = noise.getChannelData(0);
  let seed = 4242;
  for (let i = 0; i < nlen; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 2147483648 - 1; }

  let run = null, intensity = 0, handle = null;

  const osc = (type, f, t, t1, g, out) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(out);
    o.start(t); o.stop(t1); return o;
  };
  const gainNode = () => ctx.createGain();
  function noiseHit(t, dur, g, ftype, freq, q, out) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = gainNode();
    s.buffer = noise; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    envelope(gn.gain, t, 0.003, g, t + dur);
    s.connect(f); f.connect(gn); gn.connect(out);
    s.start(t, (t * 7.31) % 0.5); s.stop(t + dur + 0.03);
  }

  function play(e, t, step, out) {
    const dur = e.d * step, g = (VOICE_GAIN[e.v] || 0.1) * (e.g ?? 1);
    switch (e.v) {
      case 'lead': { // soft toy piano: triangle plus a quiet sine an octave up
        const f = hz(e.n), dec = clamp(dur * 0.9, 0.25, 0.5), end = t + 0.006 + dec;
        const a = gainNode(), b = gainNode();
        envelope(a.gain, t, 0.006, g, end); envelope(b.gain, t, 0.006, g * 0.25, t + 0.006 + dec * 0.6);
        osc('triangle', f, t, end + 0.05, a, out); osc('sine', f * 2, t, end + 0.05, b, out);
        break;
      }
      case 'bell': { // bell-like sine with slow vibrato
        const f = hz(e.n), end = t + 0.01 + Math.max(1.1, dur * 0.8), a = gainNode(), b = gainNode();
        envelope(a.gain, t, 0.01, g, end); envelope(b.gain, t, 0.01, g * 0.18, t + 0.6);
        const o1 = osc('sine', f, t, end + 0.05, a, out), o2 = osc('sine', f * 2.005, t, t + 0.65, b, out);
        const lfo = ctx.createOscillator(), lg = gainNode(); lfo.frequency.value = 4.2; lg.gain.value = 9;
        lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); lfo.start(t); lfo.stop(end + 0.05);
        break;
      }
      case 'bass': {
        const end = t + 0.008 + Math.max(0.1, dur * 0.95), a = gainNode();
        envelope(a.gain, t, 0.008, g, end); osc('triangle', hz(e.n), t, end + 0.05, a, out);
        break;
      }
      case 'pedal': { // long low sine that swells in and out
        const a = gainNode(), end = t + dur;
        a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.4);
        a.gain.setValueAtTime(g, end - 0.8); a.gain.exponentialRampToValueAtTime(0.0001, end);
        osc('sine', hz(e.n), t, end + 0.05, a, out);
        break;
      }
      case 'pad': { // two detuned triangles through a lowpass, slow attack
        const lpf = ctx.createBiquadFilter(), a = gainNode(), end = t + dur + 0.3;
        lpf.type = 'lowpass'; lpf.frequency.value = 900; lpf.Q.value = 0.4;
        a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.45);
        a.gain.setValueAtTime(g, t + dur - 0.1); a.gain.exponentialRampToValueAtTime(0.0001, end);
        lpf.connect(a); a.connect(out);
        for (const c of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(e.n); o.detune.value = c; o.connect(lpf); o.start(t); o.stop(end + 0.05); }
        break;
      }
      case 'arp': {
        const end = t + 0.005 + Math.max(0.06, dur * 0.9), a = gainNode();
        envelope(a.gain, t, 0.004, g, end); osc('triangle', hz(e.n), t, end + 0.05, a, out);
        break;
      }
      case 'kick': { // soft pitch-dropping sine
        const a = gainNode(), o = osc('sine', 130, t, t + 0.25, a, out);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12); envelope(a.gain, t, 0.004, g, t + 0.2);
        break;
      }
      case 'hat': noiseHit(t, 0.04, g, 'highpass', 7500, 0.7, out); break;
      case 'tick': noiseHit(t, 0.03, g, 'bandpass', 3200, 2, out); break;
      case 'snare': {
        noiseHit(t, 0.13, g, 'bandpass', 1900, 0.8, out);
        const a = gainNode(); envelope(a.gain, t, 0.003, g * 0.6, t + 0.08); osc('triangle', 190, t, t + 0.12, a, out);
        break;
      }
      default: break;
    }
  }

  function pump(horizon) {
    const r = run; if (!r) return;
    const now = ctx.currentTime;
    for (let guard = 0; guard < 4000; guard++) {
      const e = r.track.ev[r.idx];
      let t = r.t0 + (r.loop * r.track.steps + e.s) * r.step;
      if (t < now - 0.1) { r.t0 += now + 0.05 - t; t = now + 0.05; }       // fell behind (throttled tab): jump forward
      if (t >= horizon) break;
      if ((e.i || 0) <= intensity) { try { play(e, Math.max(t, now), r.step, r.gain); } catch { /* skip one note */ } }
      if (++r.idx >= r.track.ev.length) { r.idx = 0; r.loop++; }
    }
  }
  function startTimer() {
    if (!timer || handle != null || typeof setInterval !== 'function') return;
    handle = setInterval(() => { try { if (!(typeof document !== 'undefined' && document.hidden)) pump(ctx.currentTime + LOOKAHEAD); } catch { /* keep going */ } }, TIMER_MS);
  }
  function stopTimer() { if (handle != null) { clearInterval(handle); handle = null; } }
  if (timer && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      try { if (document.hidden) stopTimer(); else if (run) startTimer(); } catch { /* ignore */ }
    });
  }

  function fadeOut(r, tau = CROSSFADE / 3) {
    try { r.gain.gain.cancelScheduledValues(ctx.currentTime); r.gain.gain.setTargetAtTime(0, ctx.currentTime, tau); } catch { /* ignore */ }
    if (typeof setTimeout === 'function') setTimeout(() => { try { r.gain.disconnect(); } catch { /* gone */ } }, 2500);
  }

  return {
    get current() { return run ? run.name : null; },
    setTrack(name, { fade = CROSSFADE, at = null } = {}) {
      const track = TRACKS[name]; if (!track || (run && run.name === name)) return;
      const now = at ?? ctx.currentTime;
      if (run) fadeOut(run);
      const gain = gainNode(); gain.connect(bus);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + fade);
      run = { name, track, gain, step: 60 / track.bpm / 4, t0: now + 0.1, idx: 0, loop: 0 };
      pump(now + LOOKAHEAD); startTimer();
    },
    setIntensity(v) { intensity = v ? 1 : 0; },
    silence() { if (run) { fadeOut(run, 0.1); run = null; } stopTimer(); },
    pump,
    stop() { this.silence(); },
  };
}

// ---------------------------------------------------------------- the game's music player
export function createMusic(audio, { enabled = true } = {}) {
  let seq = null, wanted = null, intensity = 0, on = !!enabled;
  function ready() {
    try {
      if (!on || !audio || !audio.unlocked) return false;
      if (!seq) { const c = audio.context, out = audio.musicOut; if (!c || !out) return false; seq = createSequencer(c, out); }
      return true;
    } catch { return false; }
  }
  const api = {
    setTrack(name) {
      wanted = name;
      try { if (ready() && TRACKS[name]) { seq.setTrack(name); seq.setIntensity(intensity); } } catch { /* stay silent */ }
    },
    setIntensity(v) { intensity = v ? 1 : 0; try { if (seq) seq.setIntensity(intensity); } catch { /* ignore */ } },
    setEnabled(v) {
      on = !!v;
      try { if (!on) { if (seq) seq.silence(); } else if (wanted) api.setTrack(wanted); } catch { /* ignore */ }
    },
    get enabled() { return on; },
    get track() { return seq ? seq.current : null; },
  };
  return api;
}

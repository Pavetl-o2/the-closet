// La voz del monstruo, sintetizada por formantes.
//
// La referencia es el ReDead de Ocarina of Time: un gemido grave, largo,
// entre quejido y lamento, que suena más a sufrimiento que a amenaza — y un
// alarido áspero cuando te tiene. Lo que hace que se oiga "humano" no es el
// tono sino la envolvente espectral: una fuente con muchos armónicos (dos
// sierras desafinadas y un subarmónico que la vuelve ronca) pasada por tres
// filtros de formante que se mueven de "uuu" a "aaa" y de vuelta, como una
// boca que se abre y se cierra mientras se queja.
//
// Cada llamada crea sus nodos, suena una vez y se desconecta sola. Todo sale
// por el bus espacial del monstruo, así que el gemido viaja con él, se tapa
// detrás de los muros y rebota en el pasillo.

const PRESETS = {
  // Lamento: el sonido de fondo del monstruo, a intervalos
  moan: {
    pitch: [1.0, 1.1, 1.05, 0.95, 0.84, 0.78],
    f1: [300, 420, 640, 600, 460, 340],
    f2: [780, 900, 1080, 1040, 930, 800],
    f3: 2450,
    drive: 2.6,
    sub: 0.32,
    breath: 0.28,
    vibRate: 4.6,
    vibDepth: 0.028,
    tremRate: 6.4,
    tremDepth: 0.3,
    env: [0, 0.55, 1, 0.9, 0.95, 0.7, 0],
  },
  // Alarido al empezar la cacería: agudo, rasgado, con la boca abierta
  scream: {
    pitch: [1.0, 1.7, 1.95, 1.85, 1.5, 1.1],
    f1: [620, 880, 920, 860, 760, 600],
    f2: [1150, 1480, 1550, 1450, 1300, 1100],
    f3: 2900,
    drive: 6,
    sub: 0.12,
    breath: 0.55,
    vibRate: 8.5,
    vibDepth: 0.05,
    tremRate: 11,
    tremDepth: 0.35,
    env: [0, 0.9, 1, 0.95, 0.8, 0.45, 0],
  },
  // Gruñido al perderte: corto, frustrado, con la boca casi cerrada
  growl: {
    pitch: [1.0, 1.12, 1.0, 0.86, 0.74],
    f1: [420, 520, 500, 440, 380],
    f2: [880, 980, 960, 900, 820],
    f3: 2300,
    drive: 5,
    sub: 0.6,
    breath: 0.45,
    vibRate: 3.2,
    vibDepth: 0.02,
    tremRate: 17, // casi un estertor
    tremDepth: 0.45,
    env: [0, 0.8, 1, 0.85, 0.5, 0],
  },
};

const curve = (arr, k = 1) => Float32Array.from(arr, (v) => v * k);

export function monsterVoice(engine, dest, kind, { f0 = 100, dur = 2.2, vol = 0.3, budget = 1 } = {}) {
  if (!engine.canPlay(budget) || !dest) return;
  const P = PRESETS[kind] || PRESETS.moan;
  const ctx = engine.ctx;
  const t = engine.time + 0.01;
  const end = t + dur;

  // --- fuente: dos sierras desafinadas (aspereza por batido) + subarmónico
  const pitch = curve(P.pitch, f0);
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const o3 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sawtooth';
  o3.type = 'triangle';
  o1.frequency.setValueCurveAtTime(pitch, t, dur);
  o2.frequency.setValueCurveAtTime(curve(P.pitch, f0 * 1.013), t, dur);
  o3.frequency.setValueCurveAtTime(curve(P.pitch, f0 * 0.5), t, dur);

  // vibrato lento e irregular: la voz de algo que no controla su garganta
  const vib = ctx.createOscillator();
  vib.frequency.value = P.vibRate * (0.9 + Math.random() * 0.2);
  const vibGain = ctx.createGain();
  vibGain.gain.value = f0 * P.vibDepth;
  vib.connect(vibGain);
  vibGain.connect(o1.frequency);
  vibGain.connect(o2.frequency);

  const g1 = ctx.createGain();
  g1.gain.value = 0.5;
  const g3 = ctx.createGain();
  g3.gain.value = P.sub;
  const mix = ctx.createGain();
  o1.connect(g1).connect(mix);
  o2.connect(g1);
  o3.connect(g3).connect(mix);

  // saturación: la ronquera
  const shaper = ctx.createWaveShaper();
  shaper.curve = engine.shaperCurve(P.drive);
  shaper.oversample = '2x';
  mix.connect(shaper);

  // aire: el aliento que acompaña al gemido, también por los formantes
  const noise = ctx.createBufferSource();
  noise.buffer = engine.noiseBuf;
  noise.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 1300;
  nf.Q.value = 0.6;
  const ng = ctx.createGain();
  ng.gain.value = P.breath;
  noise.connect(nf).connect(ng);

  // --- tracto vocal: tres formantes en paralelo
  const formants = [
    { f: curve(P.f1), q: 5, g: 1.0 },
    { f: curve(P.f2), q: 8, g: 0.55 },
    { f: null, fixed: P.f3, q: 11, g: 0.22 },
  ];
  const vocal = ctx.createGain();
  for (const F of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = F.q;
    if (F.f) bp.frequency.setValueCurveAtTime(F.f, t, dur);
    else bp.frequency.value = F.fixed;
    const fg = ctx.createGain();
    fg.gain.value = F.g * 4; // los pasabanda estrechos se comen mucha energía
    shaper.connect(bp);
    ng.connect(bp);
    bp.connect(fg).connect(vocal);
  }

  // --- temblor (el quiebre del sollozo) y envolvente
  const trem = ctx.createGain();
  trem.gain.value = 1 - P.tremDepth;
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = P.tremRate * (0.85 + Math.random() * 0.3);
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = P.tremDepth;
  tremLfo.connect(tremDepth).connect(trem.gain);

  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueCurveAtTime(curve(P.env, vol), t, dur);

  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 3800;

  vocal.connect(trem).connect(env).connect(soft).connect(dest);

  const srcs = [o1, o2, o3, vib, tremLfo, noise];
  for (const s of srcs) {
    s.start(t);
    s.stop(end + 0.05);
  }
  // Al terminar se desconecta la cabeza de la cadena; el resto lo recoge el GC
  o1.onended = () => { soft.disconnect(); };
  engine.track(o3, dur + 0.05);
}

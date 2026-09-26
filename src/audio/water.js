// Pisadas en agua, sintetizadas por física de burbujas.
//
// El ruido filtrado suena a "shhh", no a agua. Lo que el oído reconoce como
// líquido son burbujas: cada salpicadura atrapa decenas de burbujas de aire
// diminutas y cada una resuena un instante como un seno amortiguado cuyo tono
// SUBE mientras la burbuja sube a la superficie (resonancia de Minnaert: a
// burbuja más pequeña, tono más agudo). Es el modelo de van den Doel
// ("Physically-based models for liquid sounds", 2005).
//
// Una pisada en un charco poco profundo tiene cuatro momentos:
//   1. el golpe plano de la suela contra la lámina de agua (y el suelo debajo)
//   2. la nube de burbujas del impacto, densa al principio
//   3. las gotas que saltaron y vuelven a caer, sueltas
//   4. al levantar el pie, el agua que vuelve a su sitio: burbujas grandes y
//      graves ("blub") y un murmullo de flujo
//
// Se renderizan aquí, una vez, varias variantes de cada tipo en AudioBuffers.
// En juego cada pisada es UNA sola voz (antes eran 6–8 osciladores y ruidos
// sueltos, y en móvil el presupuesto de voces cortaba capas a medias: de ahí
// que sonara roto). Es también exactamente el punto por donde entrarán los
// samples grabados.

const TAU = Math.PI * 2;

// Biquad RBJ aplicado sobre un array (solo para renderizar, no en tiempo real)
function biquad(x, sr, type, f, q) {
  const w = (TAU * f) / sr;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // bandpass (ganancia de pico 1)
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

// Ruido con envolvente (ataque lineal, caída exponencial), filtrado y sumado
function addNoise(out, sr, rand, { t0, attack, tau, amp, type, f, q = 0.7 }) {
  const start = Math.floor(t0 * sr);
  const len = Math.min(out.length - start, Math.ceil((attack + tau * 6) * sr));
  if (len <= 0) return;
  let n = new Float32Array(len);
  for (let i = 0; i < len; i++) n[i] = rand() * 2 - 1;
  n = biquad(n, sr, type, f, q);
  if (type === 'bandpass') n = biquad(n, sr, 'bandpass', f, q); // más pendiente
  const a = Math.max(1, attack * sr);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, i / a) * Math.exp(-Math.max(0, t - attack) / tau);
    out[start + i] += n[i] * env * amp;
  }
}

// Una burbuja: seno amortiguado cuyo tono sube (van den Doel)
// En un charco de dos dedos las burbujas revientan en la superficie casi en
// cuanto nacen: con la amortiguación de agua profunda, las graves quedaban
// sonando como un "bip" y todo sonaba a sintetizador.
const SHALLOW = 2.4;

function addBubble(out, sr, rand, t0, f0, amp, rise) {
  // amortiguación: viscosa + térmica + radiación, en función del tamaño
  const d = (0.043 * f0 + 0.0014 * Math.pow(f0, 1.5)) * SHALLOW;
  const start = Math.floor(t0 * sr);
  const len = Math.min(out.length - start, Math.ceil((5 / d) * sr));
  const sigma = rise * d;
  const att = sr * 0.0006; // sin chasquido de arranque
  let ph = rand() * TAU;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ph += (TAU * f0 * (1 + sigma * t)) / sr;
    out[start + i] += Math.sin(ph) * Math.exp(-d * t) * Math.min(1, i / att) * amp;
  }
}

// Tamaños de burbuja: muchas pequeñas (agudas), pocas grandes (graves)
const bubbleFreq = (rand, lo, hi, skew = 0.8) => lo * Math.pow(hi / lo, Math.pow(rand(), skew));

// Tiempo exponencial: la mayoría pronto, unas pocas tarde
const expo = (rand, mean) => -Math.log(1 - rand() * 0.999) * mean;

const KINDS = {
  // andar: pisada moderada
  walk:    { dur: 0.5,  I: 1.0,  lift: [0.17, 0.25], lo: 650, hi: 4200, slap: [900, 1500], weight: 1 },
  // correr: más energía, el pie sale antes
  run:     { dur: 0.45, I: 1.35, lift: [0.11, 0.16], lo: 600, hi: 4500, slap: [1000, 1700], weight: 1.2 },
  // entrar en el charco: el pie cae desde más alto sobre agua quieta
  enter:   { dur: 0.6,  I: 1.6,  lift: [0.2, 0.28],  lo: 550, hi: 4200, slap: [800, 1400], weight: 1.3 },
  // suela mojada al salir: un chasquido pequeño
  squelch: { dur: 0.22, I: 0.3,  lift: null,         lo: 900, hi: 3800, slap: [1200, 2000], weight: 0.6 },
  // el monstruo: pie descalzo, pesado, más grave
  monster: { dur: 0.65, I: 1.7,  lift: [0.2, 0.3],   lo: 380, hi: 2600, slap: [550, 950],  weight: 1.8 },
};

function renderSplash(sr, rand, k) {
  const out = new Float32Array(Math.ceil(k.dur * sr));
  const I = k.I;
  const r = (a, b) => a + rand() * (b - a);

  // 1. golpe: la suela contra el agua (medios) y contra el suelo (graves)
  addNoise(out, sr, rand, { t0: 0, attack: 0.001, tau: 0.011, amp: 0.9 * I, type: 'bandpass', f: r(...k.slap), q: 0.8 });
  addNoise(out, sr, rand, { t0: 0, attack: 0.002, tau: 0.02 * k.weight, amp: 0.7 * I * k.weight, type: 'lowpass', f: 260, q: 0.7 });

  // 2. nube de burbujas del impacto: muchas, cortas, sobre todo medias-agudas
  const n1 = Math.round(46 * I);
  for (let i = 0; i < n1; i++) {
    const f = bubbleFreq(rand, k.lo * 1.3, k.hi);
    const amp = r(0.12, 0.45) * Math.min(1.3, I);
    addBubble(out, sr, rand, 0.003 + expo(rand, 0.03), f, amp, r(0.15, 0.4));
  }
  // rocío: el siseo fino del agua pulverizada
  addNoise(out, sr, rand, { t0: 0.004, attack: 0.004, tau: 0.045, amp: 0.1 * I, type: 'highpass', f: 3500, q: 0.7 });

  // 3. gotas que vuelven a caer, sueltas
  const n2 = Math.round(9 * I);
  for (let i = 0; i < n2; i++) {
    const f = bubbleFreq(rand, 1400, 4600, 1);
    addBubble(out, sr, rand, r(0.07, k.dur * 0.7), f, r(0.06, 0.2) * Math.min(1.2, I), r(0.2, 0.45));
  }

  // 4. al levantar el pie: el agua vuelve a su sitio
  if (k.lift) {
    const tl = r(...k.lift);
    addNoise(out, sr, rand, { t0: tl - 0.01, attack: 0.02, tau: 0.06, amp: 0.22 * I, type: 'lowpass', f: 700, q: 0.6 });
    const n3 = 2 + Math.round(2 * I);
    for (let i = 0; i < n3; i++) {
      const f = bubbleFreq(rand, k.lo * 0.7, k.lo * 1.6, 1);
      addBubble(out, sr, rand, tl + expo(rand, 0.03), f, r(0.15, 0.3) * I, r(0.25, 0.5));
    }
    for (let i = 0; i < Math.round(8 * I); i++) {
      const f = bubbleFreq(rand, k.lo, k.hi * 0.8);
      addBubble(out, sr, rand, tl + expo(rand, 0.04), f, r(0.05, 0.18) * I, r(0.15, 0.4));
    }
  }

  // limpieza: sin continua, sin agudos ásperos, y cola que muere a cero
  const y = biquad(biquad(out, sr, 'highpass', 45, 0.7), sr, 'lowpass', 8500, 0.7);
  const fade = Math.floor(0.03 * sr);
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  return y;
}

// Banco de variantes por tipo. La pisada normal se renderiza en el acto (es
// la que suena primero); el resto, un tipo por tick, para no congelar el
// arranque en un teléfono. Mientras falte un tipo, `waterStep` usa `walk`.
// `rand` sale de Math.random: cada partida suena un poco distinta.
export function buildWaterBank(ctx, variants = 5) {
  const sr = ctx.sampleRate;
  const bank = {};
  let gain = 0;
  const renderKind = (name) => {
    const list = [];
    for (let v = 0; v < variants; v++) list.push(renderSplash(sr, Math.random, KINDS[name]));
    // Una sola normalización para todo el banco (la de andar): se conservan
    // las diferencias de fuerza entre andar, correr y entrar.
    if (!gain) {
      let peak = 0;
      for (const d of list) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      gain = 0.6 / (peak || 1);
    }
    bank[name] = list.map((data) => {
      const buf = ctx.createBuffer(1, data.length, sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) ch[i] = data[i] * gain;
      return buf;
    });
  };
  const [first, ...rest] = Object.keys(KINDS);
  renderKind(first);
  const next = () => {
    const name = rest.shift();
    if (!name) return;
    renderKind(name);
    setTimeout(next, 0);
  };
  setTimeout(next, 0);
  return bank;
}

// Para las pruebas: todo el banco de una vez
export function buildWaterBankSync(ctx, variants = 5) {
  const bank = buildWaterBank(ctx, variants);
  return new Promise((resolve) => {
    const check = () => (Object.keys(bank).length === Object.keys(KINDS).length ? resolve(bank) : setTimeout(check, 5));
    check();
  });
}

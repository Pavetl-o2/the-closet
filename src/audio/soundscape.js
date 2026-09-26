// Capa de juego del audio: decide QUÉ suena y CUÁNDO. El cómo llega al oído
// (posición, oclusión por muros, reverb de pasillo) lo resuelve AudioEngine.
//
// Todo sigue sintetizado, sin assets, pero cada sonido tiene un sitio real en
// el laberinto. Eso cambia lo que el jugador puede saber:
//
//   · Los pasos vienen de una dirección concreta, y delante y detrás no suenan
//     igual (HRTF).
//   · Un monstruo al otro lado de un muro suena apagado y sin agudos, con más
//     rebote que sonido directo. Al doblar la esquina, se te viene encima.
//   · El monstruo gime (voice.js) desde su cabeza: cuanto más cerca, más
//     fuerte y más seguido. Al lanzarse a por ti, grita.
//   · Los charcos gotean, cada uno a su ritmo, y los focos zumban y chisporrotean.
//
// Encima, una capa de suspenso que no es del mundo sino tuya: el latido, un
// lecho de tensión que se tensa con el peligro, susurros cuando llevas rato
// quieto a oscuras. Ningún sonido falso imita al monstruo (GDD: nunca hacer
// trampa): los ruidos lejanos son del edificio — golpes en tuberías, un
// portazo, algo metálico que cae — pero bastan para dudar.

import { monsterVoice } from './voice.js';
import { buildWaterBank } from './water.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Fracción del presupuesto de voces que puede usar cada tipo de sonido. Lo
// que da información sobre el monstruo entra siempre (1); tus propios pasos
// y el ambiente ceden antes de saturar, para no tragarse nunca un paso que
// venía detrás de ti.
const B = { monstruo: 1, respiracion: 0.8, propio: 0.6, ambiente: 0.5 };

export class Soundscape {
  constructor(engine, cfg) {
    this.engine = engine;
    this.cfg = cfg;
    this.stepTs = [];
    this.dragStep = [];  // alterna pie bueno / pie muerto, por monstruo
    this.moanT = [];     // cuenta atrás al próximo gemido, por monstruo
    this.voiceBus = [];  // bus espacial de la cabeza de cada monstruo
    this.screamCd = [];
    this.monWet = [];    // el monstruo pisó un charco: sus pasos chapotean
    this.breathT = 0;
    this.ambientT = 4;
    this.eventT = rnd(18, 30); // próximo ruido lejano del edificio
    this.stingCd = 0;
    this.floors = null;
    this.drone = null;
    this.onDrip = null;  // (x, z) → ondas visuales en el charco

    // --- tu cuerpo ---
    this.myBreathT = 2;
    this.inhaling = true;
    this.holdT = 0;        // segundos conteniendo la respiración
    this.holding = false;
    this.gasping = 0;      // tras soltarla, jadeas un rato
    this.lastSurface = 'concreto';
    this.inWater = false;
    this.splashAt = -1;    // instante del último chapoteo de entrada
    this.wetSteps = 0;     // pasos con la suela mojada tras salir del agua
    this.stepNoise = 0;

    // --- suspenso ---
    this.danger = 0;       // 0..1, suavizado: lo leen el latido y la imagen
    this.pulse = 0;        // 1 en cada latido, decae: lo lee la imagen
    this.beatT = 1;
    this.stillT = 0;       // segundos quieto a oscuras
    this.whisperT = rnd(10, 18);
    this.prevFlick = true;
    this.lampWatch = [];   // estado previo de cada foco, para oír los apagones
  }

  init() {
    const e = this.engine;
    if (!e.init()) return;
    // Presencia: dos senos graves desafinados que baten entre sí. Nace en el
    // monstruo, no en la mezcla, para que tenga dirección.
    this.drone = e.emitter({ freqs: [41, 47.3], vol: 0 });
    // La linterna zumba mientras está encendida. Es el sonido de ser
    // localizable: mientras lo oyes, algo puede verte.
    this.lampHum = e.hum({ freqs: [119, 238], noiseLevel: 0.02, filterHz: 5200, vol: 0 });
    this.buildBed();
    this.buildLampBuzz();
    // Pisadas en agua: se renderizan una vez por física de burbujas (water.js)
    this.water = buildWaterBank(e.ctx);
    this.lastWater = {};
  }

  // Una pisada en agua: variante distinta a la anterior, con algo de tono y
  // fuerza al azar, para que dos pasos seguidos nunca suenen igual.
  waterStep(kind, vol, at = null) {
    const list = this.water?.[kind] || this.water?.walk;
    if (!list) return;
    let i = (Math.random() * list.length) | 0;
    if (i === this.lastWater[kind]) i = (i + 1) % list.length;
    this.lastWater[kind] = i;
    this.engine.playBuffer(list[i], {
      vol: vol * rnd(0.85, 1.1) * (this.water[kind] ? 1 : 0.7),
      rate: rnd(0.92, 1.08),
      reverbSend: at ? 1.4 : 1.1,
      budget: at ? B.monstruo : B.propio,
      at,
    });
  }

  resume() { this.engine.resume(); }
  silence() { this.engine.silence(); }
  muffle(on) { this.engine.muffle(on); }

  setWorld(mazeInfo, { floors, puddles = [], glass = [], lamps = [] }) {
    this.engine.setWorld(mazeInfo);
    this.maze = mazeInfo;
    this.floors = floors;
    this.puddles = puddles;
    this.glass = glass;
    this.lamps = lamps;
    // Cada charco gotea a su ritmo; unos pocos tienen una gotera activa encima
    this.dripT = puddles.map(() => rnd(0.5, 6));
    this.dripRate = puddles.map(() => (Math.random() < 0.3 ? rnd(1.2, 2.6) : rnd(3.5, 8)));
  }

  // Qué hay bajo tus pies. Los charcos y los vidrios ya están colocados en el
  // mundo; aquí solo se pregunta cuál pisas.
  surfaceAt(x, z) {
    for (const p of this.puddles) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return 'agua';
    }
    for (const g of this.glass) {
      const dx = x - g.x, dz = z - g.z;
      if (dx * dx + dz * dz < g.r * g.r) return 'vidrio';
    }
    return 'concreto';
  }

  // --- capas continuas -----------------------------------------------------

  // Tono de sala y lecho de tensión. El tono de sala es el "silencio" del
  // sitio: aire grave que nunca es cero. La tensión son tres notas que baten
  // (segunda menor y tritono) y un pitido de oído a punto de romperse; solo
  // se oyen cuando algo se acerca.
  buildBed() {
    const e = this.engine;
    const ctx = e.ctx;

    const room = ctx.createBufferSource();
    room.buffer = e.noiseBuf;
    room.loop = true;
    room.playbackRate.value = 0.5;
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.value = 170;
    const roomG = ctx.createGain();
    roomG.gain.value = 0.11;
    room.connect(roomLp).connect(roomG).connect(e.dry);
    room.start();

    const rumble = ctx.createOscillator();
    rumble.frequency.value = 34;
    const rumbleG = ctx.createGain();
    rumbleG.gain.value = 0.03;
    rumble.connect(rumbleG).connect(e.dry);
    rumble.start();

    this.tension = ctx.createGain();
    this.tension.gain.value = 0;
    const tLp = ctx.createBiquadFilter();
    tLp.type = 'lowpass';
    tLp.frequency.value = 700;
    this.tensionLp = tLp;
    this.tension.connect(tLp).connect(e.dry);
    if (e.wet) {
      const s = ctx.createGain();
      s.gain.value = 0.6;
      tLp.connect(s).connect(e.wet);
    }
    const drift = ctx.createOscillator(); // las notas se desafinan despacio
    drift.frequency.value = 0.07;
    const driftG = ctx.createGain();
    driftG.gain.value = 9;
    drift.connect(driftG);
    drift.start();
    for (const [f, type] of [[73.4, 'triangle'], [77.8, 'triangle'], [103.8, 'sine'], [155.6, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      driftG.connect(o.detune);
      o.connect(this.tension);
      o.start();
    }

    // acúfeno: dos senos agudos casi iguales que baten a 5 Hz
    this.ring = ctx.createGain();
    this.ring.gain.value = 0;
    this.ring.connect(e.dry);
    for (const f of [2960, 2965]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(this.ring);
      o.start();
    }
  }

  // Zumbido eléctrico de los focos: dos fuentes que se reasignan a los focos
  // más cercanos, como el pool de luces. El volumen sigue el parpadeo real.
  buildLampBuzz() {
    const e = this.engine;
    const ctx = e.ctx;
    this.buzz = [0, 1].map(() => {
      const bus = e.spatialBus({ reverbSend: 0.6, rolloff: 1.4 });
      const g = ctx.createGain();
      g.gain.value = 0;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 100; // la red a 50 Hz zumba al doble
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400;
      bp.Q.value = 0.9;
      o.connect(bp).connect(g).connect(bus.input);
      o.start();
      return { bus, g, lamp: null };
    });
  }

  // --- sonidos puntuales ------------------------------------------------

  // Clic de la linterna: un interruptor de verdad tiene dos tiempos, el
  // resorte al hundirse y el enganche al soltar. Con la pila baja, además,
  // el contacto chisporrotea.
  click(on = true, battery = 1) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    e.noiseFlat({ type: 'highpass', freq: 2600, q: 0.7, vol: 0.16, attack: 0.001, decay: 0.012, reverbSend: 0.5 });
    e.toneFlat({ type: 'triangle', f0: on ? 2300 : 1900, f1: 1500, vol: 0.05, dur: 0.02, reverbSend: 0.4 });
    e.toneFlat({ f0: 420, f1: 300, vol: 0.05, dur: 0.045, reverbSend: 0.3 }); // cuerpo de plástico
    e.noiseFlat({ type: 'highpass', freq: 3600, q: 0.7, vol: 0.08, attack: 0.001, decay: 0.009, delay: rnd(0.06, 0.09), reverbSend: 0.4 });
    if (on && battery < 0.25) this.crackle(rnd(4, 8), 0.45);
  }

  // Chisporroteo eléctrico pegado a ti (la linterna fallando)
  crackle(n, spread) {
    const e = this.engine;
    for (let i = 0; i < n; i++) {
      e.noiseFlat({
        type: 'highpass', freq: rnd(2500, 5000), q: 0.8, vol: rnd(0.03, 0.08),
        attack: 0.001, decay: rnd(0.003, 0.012), delay: rnd(0, spread), reverbSend: 0.2, budget: B.propio,
      });
    }
  }

  // Tu propio paso, en capas: talón (golpe sordo), peso del cuerpo, la suela
  // que rueda hasta la punta y la arenilla que cruje debajo. Cada capa varía
  // un poco en cada pisada, y los dos pies no suenan exactamente igual.
  //
  // Deja en `stepNoise` cuánto te ha delatado ese paso, para que el juego
  // decida si algo lo ha oído. Chapotear y pisar vidrios suena — y cuesta.
  playerStep(surface, running, foot) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    const v = this.cfg.stepVolume * (running ? 1.8 : 1) * rnd(0.85, 1.1);
    const side = foot ? 1 : 0.93;

    if (surface === 'agua') {
      // Si acabas de entrar, el chapoteo de entrada ya sonó: no se duplica
      if (e.time - this.splashAt > 0.25) this.waterStep(running ? 'run' : 'walk', this.cfg.waterStepVolume);
      this.stepNoise = 1;
      return;
    }

    // talón
    e.noiseFlat({
      type: 'lowpass', freq: rnd(260, 380) * side, q: 1.3, vol: v * 1.5,
      attack: 0.002, decay: running ? 0.05 : 0.07, reverbSend: 0.9, budget: B.propio,
    });
    e.toneFlat({ f0: 92 * side, f1: 46, vol: v * 0.7, dur: 0.1, reverbSend: 0.7, budget: B.propio });
    // la suela rodando hasta la punta
    e.noiseFlat({
      freq: rnd(1300, 2100), q: 1.2, vol: v * 0.45, attack: 0.005, decay: rnd(0.04, 0.07),
      delay: rnd(0.025, 0.05), reverbSend: 1.1, budget: B.propio,
    });

    if (surface === 'vidrio') {
      // Crujido: varias esquirlas partiéndose, nunca dos iguales
      for (let i = 0; i < 4; i++) {
        e.noiseFlat({
          freq: rnd(3200, 6800), q: 7, vol: v * rnd(0.6, 1.3), attack: 0.001,
          decay: rnd(0.02, 0.08), delay: rnd(0, 0.07), reverbSend: 1.2, budget: B.propio,
        });
      }
      e.toneFlat({ type: 'triangle', f0: rnd(2800, 4200), f1: rnd(2400, 3600), vol: v * 0.25, dur: 0.05, delay: 0.02, budget: B.propio });
      this.stepNoise = 0.9;
      return;
    }

    // arenilla bajo la suela
    const grit = e.q.audioVoices >= 16 ? 3 : 1;
    for (let i = 0; i < grit; i++) {
      e.noiseFlat({
        freq: rnd(4500, 7800), q: 8, vol: v * rnd(0.12, 0.3), attack: 0.001,
        decay: rnd(0.006, 0.018), delay: rnd(0, 0.08), reverbSend: 0.8, budget: B.propio,
      });
    }
    if (running) {
      // derrape corto: la suela arrastra al despegar
      e.noiseFlat({
        type: 'highpass', freq: 2200, sweep: 900, q: 0.8, vol: v * 0.3,
        attack: 0.01, decay: 0.09, delay: 0.035, reverbSend: 1, budget: B.propio,
      });
    }
    if (this.wetSteps > 0) {
      // suela mojada: un chasquido húmedo que se va secando paso a paso
      this.wetSteps--;
      this.waterStep('squelch', this.cfg.waterStepVolume * 0.3 * (1 + this.wetSteps));
    }
    this.stepNoise = running ? 0.35 : 0;
  }

  // Tu respiración. Alterna inhalar y exhalar; el ritmo lo marcan el esfuerzo
  // y el miedo.
  playerBreath(volume, exhale) {
    const e = this.engine;
    if (exhale) {
      e.noiseFlat({ freq: 380, q: 1.5, vol: volume, attack: 0.05, decay: 0.38, reverbSend: 0.5, budget: B.respiracion });
    } else {
      e.noiseFlat({ freq: 720, q: 1.9, vol: volume * 0.85, attack: 0.16, decay: 0.24, reverbSend: 0.4, budget: B.respiracion });
    }
  }

  // Soltar el aire de golpe tras haberlo contenido
  gasp() {
    this.engine.noiseFlat({ freq: 520, q: 1.1, vol: 0.3, attack: 0.01, decay: 0.55, reverbSend: 0.8 });
    this.engine.noiseFlat({ freq: 1500, q: 0.8, vol: 0.09, attack: 0.01, decay: 0.3, reverbSend: 0.8 });
  }

  // Arranca una cacería: dos glissandos disonantes, sin situar, como la
  // música: no es algo del mundo, es lo que te pasa a ti. Lo que sí es del
  // mundo es el alarido del monstruo, que sale de su garganta.
  huntSting(mon, index) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    if (mon && index !== undefined) this.scream(mon, index);
    if (this.stingCd > 0) return;
    this.stingCd = 2.5;
    const t = e.time;
    for (const [f0, f1] of [[130, 640], [138, 690]]) {
      const o = e.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.7);
      const g = e.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
      o.connect(g);
      e.flat({ node: o, gain: g, dur: 1, reverbSend: 0.6 });
      o.start(t);
      o.stop(t + 1);
    }
  }

  scream(mon, i) {
    if ((this.screamCd[i] || 0) > 0) return;
    this.screamCd[i] = 7;
    const bus = this.busFor(mon, i);
    monsterVoice(this.engine, bus?.input, 'scream', { f0: rnd(150, 175), dur: rnd(1.1, 1.4), vol: 0.9 });
    this.moanT[i] = rnd(2, 3);
  }

  // Te perdió a oscuras: gruñido corto, frustrado
  lostYou(mon, i) {
    const bus = this.busFor(mon, i);
    monsterVoice(this.engine, bus?.input, 'growl', { f0: rnd(64, 74), dur: rnd(0.9, 1.2), vol: 0.6 });
    this.moanT[i] = rnd(3, 5);
  }

  // Atrapado: el alarido en la cara y un golpe sordo antes del silencio total
  deathSting(mon, i) {
    const e = this.engine;
    if (!e.ctx) return;
    if (mon && i !== undefined) {
      this.screamCd[i] = 0;
      const bus = this.busFor(mon, i);
      monsterVoice(e, bus?.input, 'scream', { f0: rnd(170, 190), dur: 0.9, vol: 1.1 });
    }
    const t = e.time;
    const o = e.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 0.5);
    const g = e.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g);
    e.flat({ node: o, gain: g, dur: 0.65, reverbSend: 0.8 });
    o.start(t);
    o.stop(t + 0.65);
  }

  // La puerta por la que entraste, cerrándose de golpe detrás de ti.
  doorSlam(x, z, delay = 0) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    e.noiseAt(x, 1.2, z, { type: 'lowpass', freq: 420, q: 0.7, vol: 1.1, attack: 0.003, decay: 0.5, reverbSend: 2.2, delay });
    e.toneAt(x, 1.2, z, { f0: 72, f1: 30, vol: 0.9, dur: 0.6, reverbSend: 2, delay });
    e.noiseAt(x, 1.2, z, { freq: 1900, q: 3, vol: 0.18, attack: 0.002, decay: 0.05, reverbSend: 1.5, delay: delay + 0.06 });
    // el pestillo encaja
    e.toneAt(x, 1.2, z, { type: 'triangle', f0: 1250, f1: 980, vol: 0.08, dur: 0.07, reverbSend: 1.5, delay: delay + 0.2 });
    // vibración del marco metálico
    e.toneAt(x, 1.2, z, { type: 'triangle', f0: 310, f1: 290, vol: 0.12, dur: 0.9, reverbSend: 1.4, delay: delay + 0.02 });
  }

  // Paso del monstruo: el golpe grave de un pie descalzo y pesado, la
  // palmada de la planta y el roce del pie muerto arrastrándose. Si pisa
  // agua, chapotea — y eso lo oyes aunque no lo veas.
  footstep(x, z, hunting, drag, wet) {
    const e = this.engine;
    e.toneAt(x, 0.12, z, { f0: 58, f1: 28, vol: hunting ? 0.5 : 0.3, dur: 0.26, reverbSend: 1 });
    e.noiseAt(x, 0.1, z, {
      type: 'lowpass', freq: 520, q: 1, vol: hunting ? 0.22 : 0.13, attack: 0.002, decay: 0.07, reverbSend: 1,
    });
    if (wet) this.waterStep('monster', hunting ? 0.6 : 0.4, [x, 0.05, z]);
    if (drag) {
      // el pie que arrastra raspa el suelo entre golpe y golpe
      e.noiseAt(x, 0.08, z, {
        freq: rnd(900, 1500), sweep: rnd(600, 800), q: 1.1, vol: hunting ? 0.09 : 0.055,
        attack: 0.04, decay: 0.2, reverbSend: 0.8, delay: 0.12,
      });
    }
  }

  // Una gota que cae en un charco: el "plip" es la burbuja que se forma al
  // entrar, un tono que SUBE muy rápido. El eco del pasillo hace el resto.
  drip(x, z, vol) {
    const e = this.engine;
    e.toneAt(x, 0.04, z, {
      f0: rnd(800, 1400), f1: rnd(1900, 3300), vol, dur: rnd(0.035, 0.065), reverbSend: 1.9, budget: B.ambiente,
    });
    e.noiseAt(x, 0.04, z, { freq: 5400, q: 3, vol: vol * 0.3, attack: 0.001, decay: 0.01, reverbSend: 1.2, budget: B.ambiente });
    if (Math.random() < 0.3) {
      e.toneAt(x, 0.04, z, {
        f0: rnd(1200, 1800), f1: rnd(2600, 3600), vol: vol * 0.4, dur: 0.03,
        delay: rnd(0.12, 0.28), reverbSend: 1.9, budget: B.ambiente,
      });
    }
    this.onDrip?.(x, z);
  }

  // Ruidos lejanos del edificio: nunca imitan al monstruo, pero bastan para
  // que te quedes quieto escuchando.
  buildingEvent(x, z) {
    const e = this.engine;
    const kind = ['golpes', 'raspado', 'portazo', 'tuberia', 'metal'][(Math.random() * 5) | 0];
    const a = B.ambiente;
    if (kind === 'golpes') {
      // alguien — algo — golpea una tubería. Ritmo irregular.
      let d = 0;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        e.toneAt(x, 2.3, z, { type: 'triangle', f0: 187, f1: 170, vol: 0.4, dur: 0.35, delay: d, reverbSend: 2, budget: a });
        e.toneAt(x, 2.3, z, { f0: 431, f1: 425, vol: 0.18, dur: 0.5, delay: d, reverbSend: 2, budget: a });
        d += rnd(0.3, 0.9);
      }
    } else if (kind === 'raspado') {
      e.noiseAt(x, 0.5, z, { freq: 700, sweep: 2100, q: 6, vol: 0.22, attack: 0.3, decay: 1.2, reverbSend: 2, budget: a });
      e.noiseAt(x, 0.5, z, { freq: 1500, sweep: 900, q: 5, vol: 0.12, attack: 0.2, decay: 0.8, delay: 1.3, reverbSend: 2, budget: a });
    } else if (kind === 'portazo') {
      this.doorSlam(x, z);
    } else if (kind === 'tuberia') {
      // la tubería gime al dilatarse
      e.toneAt(x, 2.4, z, { type: 'triangle', f0: 64, f1: 51, vol: 0.4, attack: 0.4, dur: 1.8, reverbSend: 2, budget: a });
      e.toneAt(x, 2.4, z, { f0: 131, f1: 118, vol: 0.12, attack: 0.5, dur: 1.5, reverbSend: 2, budget: a });
    } else {
      // algo metálico cae y rebota
      let d = 0;
      let v = 0.3;
      for (let i = 0; i < 5; i++) {
        e.toneAt(x, 0.3, z, { type: 'triangle', f0: rnd(800, 880), f1: 760, vol: v, dur: 0.25, delay: d, reverbSend: 2, budget: a });
        e.toneAt(x, 0.3, z, { f0: rnd(1990, 2100), vol: v * 0.5, dur: 0.18, delay: d, reverbSend: 2, budget: a });
        d += 0.28 * Math.pow(0.7, i);
        v *= 0.6;
      }
    }
  }

  // Susurros: solo si llevas rato quieto a oscuras. No vienen de ningún
  // sitio del laberinto — están pegados a tu oído, a un lado — y no
  // significan nada. O eso parece.
  whisper() {
    const e = this.engine;
    const ctx = e.ctx;
    if (!e.canPlay(B.ambiente)) return;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() < 0.5 ? -0.85 : 0.85;
    pan.connect(e.dry);
    let t = e.time + 0.05;
    const syllables = 5 + ((Math.random() * 6) | 0);
    for (let i = 0; i < syllables; i++) {
      const src = ctx.createBufferSource();
      src.buffer = e.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = [1700, 2400, 3300, 4300, 6000][(Math.random() * 5) | 0];
      bp.Q.value = rnd(2, 6);
      const g = ctx.createGain();
      const len = rnd(0.06, 0.2);
      const v = rnd(0.06, 0.14);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + len * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(bp).connect(g).connect(pan);
      src.start(t, Math.random() * 0.9);
      src.stop(t + len + 0.02);
      t += len + rnd(0.02, 0.14);
    }
    e.voices++;
    setTimeout(() => { e.voices = Math.max(0, e.voices - 1); }, (t - e.time + 0.2) * 1000);
  }

  // Bus espacial de la cabeza del monstruo (se crea al primer uso)
  busFor(mon, i) {
    if (!this.voiceBus[i]) this.voiceBus[i] = this.engine.spatialBus({ reverbSend: 1.2, rolloff: 0.75 });
    const b = this.voiceBus[i];
    if (b) {
      const p = mon.group.position;
      b.setPosition(p.x, 1.9, p.z);
    }
    return b;
  }

  // --- ciclo por frame ---------------------------------------------------

  update(dt, { monsters, player, camera, flashlight }) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;

    // El listener primero: la oclusión y el paneo de todo lo que suene en
    // este frame se miden desde aquí.
    e.setListener(camera);
    this.stingCd = Math.max(0, this.stingCd - dt);
    this.stepNoise = 0;

    let nearest = null;
    let nearestD = Infinity;
    let anyHunt = false;
    let threat = 0; // miedo "percibido": lo cerca que está algo, y cómo

    monsters.forEach((mon, i) => {
      const d = mon.distanceToPlayer;
      const p = mon.group.position;
      if (d < nearestD) { nearestD = d; nearest = mon; }
      const hunting = mon.state === 'HUNT';
      if (hunting) anyHunt = true;
      this.screamCd[i] = Math.max(0, (this.screamCd[i] || 0) - dt);

      // --- pasos
      if (this.stepTs[i] === undefined) this.stepTs[i] = 0;
      this.stepTs[i] -= dt;
      if (d < this.cfg.maxDistance && mon.isMoving && this.stepTs[i] <= 0) {
        this.stepTs[i] = hunting ? 0.3 : mon.state === 'IDLE' ? 0.64 : 0.48;
        // Alterna pie bueno / pie arrastrado, como hace la animación
        this.dragStep[i] = !this.dragStep[i];
        const wet = this.surfaceAt(p.x, p.z) === 'agua';
        this.footstep(p.x, p.z, hunting, this.dragStep[i], wet);
      }

      // --- voz: el gemido sigue al monstruo mientras suena
      const bus = d < this.cfg.maxDistance * 1.3 ? this.busFor(mon, i) : null;
      if (this.moanT[i] === undefined) this.moanT[i] = rnd(1, 5);
      this.moanT[i] -= dt;
      if (bus && this.moanT[i] <= 0) {
        const near = clamp01(1 - d / this.cfg.maxDistance);
        // Cuanto más cerca, más seguido: a quemarropa es casi continuo
        let interval = hunting ? rnd(1.6, 2.8) : mon.state === 'IDLE' ? rnd(5, 10) : rnd(3, 6);
        interval *= 0.45 + 0.55 * (1 - near);
        this.moanT[i] = interval;
        // El volumen sube con la cercanía más de lo que daría la distancia
        // sola: el gemido de algo que ya está encima tiene que imponerse.
        const vol = (hunting ? 0.5 : 0.36) * (0.55 + 0.9 * near * near);
        const f0 = rnd(84, 104) * (hunting ? 1.18 : 1);
        const dur = hunting ? rnd(1.1, 1.7) : rnd(1.9, 3.2);
        monsterVoice(e, bus.input, 'moan', { f0, dur, vol, budget: B.monstruo });
      }

      // Gritó al perderte a oscuras: se oye su frustración
      if (mon.lostInDark && mon.state === 'SEARCH' && !mon._growled) {
        mon._growled = true;
        this.lostYou(mon, i);
      }
      if (mon.state === 'HUNT') mon._growled = false;

      // --- miedo percibido: lo que oyes, no lo que el juego sabe. Detrás de
      // un muro pesa menos; cazándote, pesa mucho más.
      const audible = clamp01(1 - d / 18);
      if (audible > 0) {
        const occ = e.occlusion(p.x, p.z);
        let th = Math.pow(audible, 1.3) * (1 - 0.45 * occ);
        if (hunting) th = Math.min(1, th * 1.6 + 0.3);
        else if (mon.state !== 'IDLE') th *= 1.25;
        threat = Math.max(threat, th);
      }
    });

    // Presencia: el zumbido sale del monstruo más cercano y se ocluye con él.
    if (this.drone) {
      const dd = this.cfg.droneMaxDistance;
      let vol = 0;
      if (nearest && nearestD < dd) {
        const x = 1 - nearestD / dd;
        vol = x * x * 0.22 * (anyHunt ? 1.7 : 1);
        const p = nearest.group.position;
        this.drone.setPosition(p.x, 1.2, p.z);
      }
      this.drone.setVolume(vol);
    }

    // Respiración: a la altura de su cara, no de sus pies.
    if (nearest && nearestD < this.cfg.breathDistance) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = rnd(1.9, 2.8);
        const closeness = 1 - nearestD / this.cfg.breathDistance;
        const p = nearest.group.position;
        e.noiseAt(p.x, 1.75, p.z, {
          freq: 420, q: 1.6, vol: 0.06 + closeness * 0.12,
          attack: 0.12, decay: 0.5, reverbSend: 0.9,
        });
      }
    }

    // ---------------- tu cuerpo ----------------
    // Entrar en un charco suena al instante, aunque la zancada caiga justo
    // al otro lado: antes podías cruzar uno pequeño sin mojarte el pie.
    const px = player.position.x;
    const pz = player.position.z;
    const wasInWater = this.inWater;
    this.inWater = this.surfaceAt(px, pz) === 'agua';
    if (this.inWater && !wasInWater && player.moving) {
      this.waterStep(player.isRunning ? 'enter' : 'walk', this.cfg.waterStepVolume * (player.isRunning ? 1.2 : 1));
      this.splashAt = e.time;
      this.stepNoise = 1;
    }
    if (!this.inWater && wasInWater) this.wetSteps = 4;

    // Pasos sincronizados con el vaivén de cámara (misma fase de zancada)
    if (player.stepped) {
      this.lastSurface = this.surfaceAt(px, pz);
      this.playerStep(this.lastSurface, player.isRunning, player.stepIndex % 2);
    }

    // Respiración: se acelera con el esfuerzo y con lo cerca que esté algo.
    // Y si te quedas quieto con una de esas cosas encima, la contienes —
    // el silencio propio es lo que más tensa.
    // El miedo no crece linealmente con la cercanía: se dispara cuando algo
    // ya está encima. La curva hace que los últimos metros pesen mucho más.
    const fear = nearest
      ? Math.pow(Math.max(0, 1 - nearestD / this.cfg.breathFearDistance), 0.6)
      : 0;
    const wantsHold = nearest && nearestD < this.cfg.holdBreathDistance && !player.moving;

    if (wantsHold && this.holdT < this.cfg.holdBreathMax) {
      this.holding = true;
      this.holdT += dt;
    } else if (this.holding) {
      // Se acabó: o se ha alejado, o ya no aguantas más
      this.holding = false;
      this.holdT = 0;
      this.gasping = 3.5;
      this.gasp();
      this.myBreathT = 0.5;
    } else {
      this.holdT = Math.max(0, this.holdT - dt * 0.5);
    }

    if (!this.holding) {
      this.gasping = Math.max(0, this.gasping - dt);
      this.myBreathT -= dt;
      if (this.myBreathT <= 0) {
        const c = this.cfg;
        let interval = player.isRunning ? c.breathRun
          : player.moving ? c.breathWalk : c.breathRest;
        interval *= 1 - 0.65 * fear;                 // el miedo acelera
        if (this.gasping > 0) interval = Math.min(interval, 0.75);
        this.myBreathT = interval * rnd(0.85, 1.15);

        const vol = 0.045
          + (player.isRunning ? 0.075 : 0)
          + fear * 0.07
          + (this.gasping > 0 ? 0.06 : 0);
        this.inhaling = !this.inhaling;
        this.playerBreath(vol, !this.inhaling);
      }
    }

    // La linterna zumba mientras está encendida, y el zumbido se desafina
    // conforme se agota la pila: el estado de la batería se oye sin mirar
    // el HUD, y ese zumbido es literalmente el sonido de ser localizable.
    if (this.lampHum && flashlight) {
      this.lampHum.setVolume(flashlight.lightLevel * this.cfg.flashlightHum);
      this.lampHum.setDetune(-190 * (1 - flashlight.battery));
      // con la pila en las últimas, cada fallo del contacto chisporrotea
      if (flashlight.on && flashlight.flickOn !== this.prevFlick) this.crackle(2, 0.03);
      this.prevFlick = flashlight.flickOn;
    }

    // ---------------- suspenso ----------------
    // El peligro sube rápido y baja despacio: el cuerpo tarda en calmarse.
    const target = clamp01(threat);
    const rate = target > this.danger ? 1.8 : 0.22;
    this.danger += (target - this.danger) * Math.min(1, rate * dt);
    this.pulse = Math.max(0, this.pulse - dt * 5);

    // Latido: de 60 a 150 pulsaciones, en tu pecho (sin situar).
    const beatVol = Math.pow(clamp01((this.danger - 0.12) / 0.8), 1.2) * 0.36;
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatT = 60 / (60 + this.danger * 90);
      if (beatVol > 0.01) this.heartbeat(beatVol);
    }

    if (this.tension) {
      const t = e.time;
      this.tension.gain.setTargetAtTime(Math.pow(this.danger, 1.6) * 0.1, t, 0.4);
      this.tensionLp.frequency.setTargetAtTime(500 + this.danger * 1400, t, 0.4);
      this.ring.gain.setTargetAtTime(Math.pow(clamp01((this.danger - 0.55) / 0.45), 2) * 0.012, t, 0.3);
    }

    // Zumbido de los focos cercanos y el chasquido de sus apagones
    this.updateLamps(px, pz);

    // Goteo en los charcos: cada uno a su ritmo, solo los que se oirían
    if (this.cfg.ambient && this.puddles?.length) {
      this.puddles.forEach((pd, i) => {
        this.dripT[i] -= dt;
        if (this.dripT[i] > 0) return;
        this.dripT[i] = this.dripRate[i] * rnd(0.6, 1.4);
        const d = Math.hypot(pd.x - px, pd.z - pz);
        if (d < 17) this.drip(pd.x + rnd(-0.25, 0.25), pd.z + rnd(-0.25, 0.25), rnd(0.18, 0.3));
      });
    }

    // Ambiente: goteras en seco y crujidos desde casillas reales. Al tener
    // posición, se ocluyen igual que todo lo demás: un goteo detrás de un
    // muro suena sordo y lejano, y eso es información, no decorado.
    if (this.cfg.ambient && this.floors?.length) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = rnd(8, 18);
        const spot = this.ambientSpot(player.position, 5);
        if (spot) {
          if (Math.random() < 0.5) {
            e.noiseAt(spot[0], 2.4, spot[1], {
              freq: rnd(2600, 4100), q: 8, vol: 0.12, decay: 0.09, reverbSend: 1.6, budget: B.ambiente,
            });
          } else {
            e.toneAt(spot[0], 1.0, spot[1], {
              f0: rnd(48, 70), f1: 30, vol: 0.22, dur: 0.35, reverbSend: 1.6, budget: B.ambiente,
            });
          }
        }
      }

      // De vez en cuando, el edificio hace algo más grande, lejos
      this.eventT -= dt;
      if (this.eventT <= 0) {
        this.eventT = rnd(24, 55);
        const spot = this.ambientSpot(player.position, 11);
        if (spot) this.buildingEvent(spot[0], spot[1]);
      }
    }

    // Susurros: quieto, a oscuras y sin nada cerca que tapar
    const dark = !flashlight || flashlight.lightLevel < 0.05;
    this.stillT = dark && !player.moving ? this.stillT + dt : 0;
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = rnd(9, 20);
      if (this.stillT > 5 && nearestD > 8) this.whisper();
    }
  }

  // Latido: "lub-dub", grave y apagado, como se oye desde dentro
  heartbeat(vol) {
    const e = this.engine;
    e.toneFlat({ f0: 58, f1: 38, vol, dur: 0.14, reverbSend: 0, budget: B.respiracion });
    e.noiseFlat({ type: 'lowpass', freq: 110, q: 1, vol: vol * 0.9, attack: 0.004, decay: 0.08, reverbSend: 0, budget: B.respiracion });
    // un poco de medios, para que el golpe exista también en altavoces pequeños
    e.noiseFlat({ freq: 190, q: 1.4, vol: vol * 0.5, attack: 0.004, decay: 0.06, reverbSend: 0, budget: B.respiracion });
    e.toneFlat({ f0: 66, f1: 42, vol: vol * 0.7, dur: 0.12, delay: 0.17, reverbSend: 0, budget: B.respiracion });
    this.pulse = 1;
  }

  updateLamps(px, pz) {
    if (!this.lamps?.length || !this.buzz) return;
    const e = this.engine;
    // dos focos más cercanos
    let a = null, b = null, da = Infinity, db = Infinity;
    for (const l of this.lamps) {
      const d = Math.hypot(l.x - px, l.z - pz);
      if (d < da) { b = a; db = da; a = l; da = d; } else if (d < db) { b = l; db = d; }
    }
    [[a, da], [b, db]].forEach(([l, d], k) => {
      const z = this.buzz[k];
      if (!l || d > 13) { z.g.gain.setTargetAtTime(0, e.time, 0.2); return; }
      if (z.lamp !== l) { z.lamp = l; z.bus.setPosition(l.x, l.y, l.z); }
      else if (Math.random() < 0.1) z.bus.setPosition(l.x, l.y, l.z); // refresca la oclusión
      z.g.gain.setTargetAtTime(0.05 * l.flicker * l.flicker, e.time, 0.03);
    });

    // Apagón de un foco cercano: chasquido eléctrico en el propio foco
    this.lamps.forEach((l, i) => {
      const prev = this.lampWatch[i] ?? 1;
      this.lampWatch[i] = l.flicker;
      if (prev > 0.4 && l.flicker < 0.1 && Math.hypot(l.x - px, l.z - pz) < 15) {
        for (let k = 0; k < 4; k++) {
          e.noiseAt(l.x, l.y, l.z, {
            type: 'highpass', freq: rnd(2000, 4500), q: 0.8, vol: rnd(0.08, 0.2),
            attack: 0.001, decay: rnd(0.004, 0.015), delay: rnd(0, 0.12), reverbSend: 1, budget: B.ambiente,
          });
        }
      }
    });
  }

  // Una casilla de suelo a media distancia: ni encima del jugador ni tan
  // lejos que no se oiga.
  ambientSpot(playerPos, minD = 5) {
    for (let i = 0; i < 14; i++) {
      const [tx, ty] = this.floors[(Math.random() * this.floors.length) | 0];
      const [wx, wz] = this.maze.tileToWorld(tx, ty);
      const d = Math.hypot(wx - playerPos.x, wz - playerPos.z);
      if (d > minD && d < this.cfg.maxDistance * 0.9) return [wx, wz];
    }
    return null;
  }
}

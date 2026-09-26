// Motor de audio espacial — Fase 2, paso 1.
//
// Hasta ahora todo el sonido se paneaba en estéreo con un producto punto
// contra el vector derecha del jugador. Eso tiene dos agujeros que anulan
// media atmósfera del juego:
//
//   · Delante y detrás sonaban IGUAL (ambos dan paneo 0). En un juego cuya
//     única defensa es escuchar, eso es grave.
//   · Un monstruo al otro lado de un muro sonaba idéntico a uno en el mismo
//     pasillo. La información que te salva la vida no llegaba.
//
// Aquí se monta el grafo de verdad: listener orientado con la cámara,
// PannerNode con HRTF por fuente (que sí resuelve delante/detrás), oclusión
// por muros reutilizando el mismo losClear() que usa la IA para ver, y una
// reverb de pasillo con impulso generado. Nada de esto necesita assets.
//
// El motor no decide QUÉ suena ni CUÁNDO: solo cómo llega al oído. Las
// fuentes se crean con fábricas de voz (`tone`, `noise`, `emitter`), que es
// el punto donde luego se enchufarán samples grabados sin tocar el grafo.

import * as THREE from 'three';
import { losClear } from '../maze/nav.js';

// Impulso de pasillo largo de ladrillo: unas pocas reflexiones tempranas de
// las dos paredes paralelas (el "flutter" característico) y una cola que se
// oscurece al apagarse.
function makeCorridorIR(ctx, seconds = 1.5, decay = 2.8) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const s = (Math.random() * 2 - 1) * env;
      // Paso-bajo de un polo que se va cerrando: la cola pierde agudos
      lp += (0.4 - 0.3 * t) * (s - lp);
      d[i] = lp;
    }
    // Reflexiones tempranas, ligeramente descorrelacionadas entre canales
    [0.011, 0.019, 0.031, 0.047, 0.068].forEach((tap, k) => {
      const idx = Math.floor((tap + (ch ? 0.0013 : 0)) * rate);
      if (idx < len) d[idx] += (0.5 - k * 0.085) * (ch ? -1 : 1);
    });
  }
  return buf;
}

// La API de posición del listener y del panner cambió: los navegadores
// modernos exponen AudioParams, los viejos solo setPosition/setOrientation.
function setPos(target, x, y, z, time) {
  if (target.positionX) {
    target.positionX.setValueAtTime(x, time);
    target.positionY.setValueAtTime(y, time);
    target.positionZ.setValueAtTime(z, time);
  } else if (target.setPosition) {
    target.setPosition(x, y, z);
  }
}

function setOrientation(listener, f, u, time) {
  if (listener.forwardX) {
    listener.forwardX.setValueAtTime(f.x, time);
    listener.forwardY.setValueAtTime(f.y, time);
    listener.forwardZ.setValueAtTime(f.z, time);
    listener.upX.setValueAtTime(u.x, time);
    listener.upY.setValueAtTime(u.y, time);
    listener.upZ.setValueAtTime(u.z, time);
  } else if (listener.setOrientation) {
    listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
  }
}

export class AudioEngine {
  constructor(cfg, quality) {
    this.cfg = cfg;
    this.q = quality;
    this.ctx = null;
    this.maze = null;
    this.dead = false;
    this.voices = 0;

    this._pos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this.listenerPos = new THREE.Vector3();
  }

  // `external` permite renderizar el mismo grafo en un OfflineAudioContext
  // para poder medirlo en las pruebas.
  init(external = null) {
    if (this.ctx || !this.cfg.enabled) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!external && !AC) return null;
    const ctx = external || new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.cfg.masterVolume;
    this.master.connect(ctx.destination);

    // Filtro general: en pausa todo se oye como a través de una pared.
    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 20000;
    this.masterFilter.Q.value = 0.5;
    this.masterFilter.connect(this.master);

    // Bus seco y bus de reverb. Las fuentes mandan a los dos; cuánto va a
    // cada uno depende de la distancia y de si hay un muro de por medio.
    this.dry = ctx.createGain();
    this.dry.connect(this.masterFilter);

    if (this.q.reverb !== false) {
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = makeCorridorIR(ctx, 2.2, 2.4);
      this.wet = ctx.createGain();
      this.wet.gain.value = this.cfg.reverbLevel;
      this.wet.connect(this.convolver);
      this.convolver.connect(this.masterFilter);
    }

    // Ruido blanco compartido: base de pasos, respiración, goteos y roces
    const len = Math.floor(ctx.sampleRate);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  resume() { this.ctx?.resume?.(); }

  // Pausa: la mezcla se apaga hacia los graves, sin cortar.
  muffle(on) {
    if (!this.ctx) return;
    this.masterFilter.frequency.setTargetAtTime(on ? 380 : 20000, this.time, on ? 0.12 : 0.3);
    this.master.gain.setTargetAtTime(this.cfg.masterVolume * (on ? 0.55 : 1), this.time, 0.2);
  }

  // Curva de saturación (tanh) para dar aspereza a las voces. Se cachea por k.
  shaperCurve(k) {
    this._curves ??= new Map();
    if (!this._curves.has(k)) {
      const n = 1024;
      const curve = new Float32Array(n);
      const norm = Math.tanh(k);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / norm;
      }
      this._curves.set(k, curve);
    }
    return this._curves.get(k);
  }

  get time() { return this.ctx ? this.ctx.currentTime : 0; }

  // Muerte y victoria: silencio (GDD)
  silence() {
    this.dead = true;
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.time);
      this.master.gain.setTargetAtTime(0, this.time, 0.05);
    }
  }

  setWorld(mazeInfo) { this.maze = mazeInfo; }

  // El listener va en la cámara, con su orientación real: es lo que hace que
  // delante y detrás dejen de sonar igual.
  setListener(camera) {
    if (!this.ctx) return;
    camera.getWorldPosition(this._pos);
    camera.getWorldDirection(this._fwd);
    this._up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    this.listenerPos.copy(this._pos);
    setPos(this.ctx.listener, this._pos.x, this._pos.y, this._pos.z, this.time);
    setOrientation(this.ctx.listener, this._fwd, this._up, this.time);
  }

  // Para pruebas: fija listener sin cámara
  setListenerRaw(pos, fwd, up = { x: 0, y: 1, z: 0 }) {
    if (!this.ctx) return;
    this.listenerPos.set(pos.x, pos.y, pos.z);
    setPos(this.ctx.listener, pos.x, pos.y, pos.z, this.time);
    setOrientation(this.ctx.listener, fwd, up, this.time);
  }

  // Fracción de la línea oído→fuente que atraviesa muro: 0 despejado,
  // 1 completamente tapado. Se lanzan tres rayos (el directo y dos abiertos
  // en perpendicular) para que la transición al doblar una esquina sea
  // gradual en vez de un salto seco.
  occlusion(x, z) {
    if (!this.maze) return 0;
    const [lx, ly] = this.maze.worldToTileF(this.listenerPos.x, this.listenerPos.z);
    const [sx, sy] = this.maze.worldToTileF(x, z);
    let dx = sx - lx;
    let dy = sy - ly;
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular normalizada, para separar los rayos laterales
    const px = (-dy / len) * 0.45;
    const py = (dx / len) * 0.45;
    let blocked = 0;
    if (!losClear(this.maze.grid, lx, ly, sx, sy)) blocked++;
    if (!losClear(this.maze.grid, lx, ly, sx + px, sy + py)) blocked++;
    if (!losClear(this.maze.grid, lx, ly, sx - px, sy - py)) blocked++;
    return blocked / 3;
  }

  // Cadena espacial de una fuente: filtro (oclusión + absorción por
  // distancia) → panner → seco + envío a reverb. Devuelve el nodo de entrada.
  spatialChain(x, y, z, { occ = null, reverbSend = 1 } = {}) {
    const ctx = this.ctx;
    const t = this.time;
    const o = occ === null ? this.occlusion(x, z) : occ;
    const d = Math.hypot(x - this.listenerPos.x, z - this.listenerPos.z);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Un muro se come los agudos; la distancia también, pero mucho menos.
    const byWall = 20000 * Math.pow(0.035, o);
    const byAir = 20000 * Math.pow(0.35, Math.min(1, d / this.cfg.maxDistance));
    filter.frequency.setValueAtTime(Math.max(220, Math.min(byWall, byAir)), t);
    filter.Q.value = 0.7;

    const occGain = ctx.createGain();
    occGain.gain.setValueAtTime(1 - 0.62 * o, t);

    const panner = ctx.createPanner();
    panner.panningModel = this.q.hrtf === false ? 'equalpower' : 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.cfg.refDistance;
    panner.maxDistance = this.cfg.maxDistance;
    panner.rolloffFactor = this.cfg.rolloff;
    setPos(panner, x, y, z, t);

    filter.connect(occGain).connect(panner);
    panner.connect(this.dry);
    if (this.wet) {
      const send = ctx.createGain();
      // Tapado o lejos, lo que te llega es sobre todo el rebote del pasillo
      send.gain.setValueAtTime(reverbSend * (0.4 + 0.6 * o), t);
      panner.connect(send).connect(this.wet);
    }
    return { input: filter, panner };
  }

  // Cadena espacial PERSISTENTE: la de una fuente que se mueve mientras suena
  // (la voz del monstruo, el zumbido de un foco). Las voces se conectan a
  // `input` y la posición se actualiza cada frame; la oclusión se suaviza para
  // que doblar una esquina no suene a interruptor.
  spatialBus({ reverbSend = 1, rolloff = 1 } = {}) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const input = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.7;
    const occGain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = this.q.hrtf === false ? 'equalpower' : 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.cfg.refDistance;
    panner.maxDistance = this.cfg.maxDistance;
    panner.rolloffFactor = this.cfg.rolloff * rolloff;
    input.connect(filter).connect(occGain).connect(panner);
    panner.connect(this.dry);
    let send = null;
    if (this.wet) {
      send = ctx.createGain();
      send.gain.value = reverbSend * 0.4;
      panner.connect(send).connect(this.wet);
    }
    const self = this;
    return {
      input,
      x: 0, y: 0, z: 0,
      setPosition(x, y, z) {
        this.x = x; this.y = y; this.z = z;
        const t = self.time;
        setPos(panner, x, y, z, t);
        const o = self.occlusion(x, z);
        const d = Math.hypot(x - self.listenerPos.x, z - self.listenerPos.z);
        const byWall = 20000 * Math.pow(0.035, o);
        const byAir = 20000 * Math.pow(0.35, Math.min(1, d / self.cfg.maxDistance));
        filter.frequency.setTargetAtTime(Math.max(220, Math.min(byWall, byAir)), t, 0.15);
        occGain.gain.setTargetAtTime(1 - 0.62 * o, t, 0.15);
        if (send) send.gain.setTargetAtTime(reverbSend * (0.4 + 0.6 * o), t, 0.15);
      },
    };
  }

  // Presupuesto de voces por prioridad. Los sonidos que dan INFORMACIÓN (los
  // pasos del monstruo, su respiración) pueden usar todo el presupuesto; los
  // tuyos y el ambiente se cortan antes, dejando hueco reservado.
  //
  // Sin esto, correr sobre vidrios podía saturar el grafo en móvil y tragarse
  // el paso del monstruo que venía detrás — justo lo que el GDD prohíbe.
  canPlay(budget = 1) {
    return this.ctx && !this.dead && this.voices < this.q.audioVoices * budget;
  }

  // Contabilidad de voces: evita que una ráfaga de eventos sature el grafo
  // (y con HRTF cada voz cuesta lo suyo en móvil).
  track(node, seconds) {
    this.voices++;
    const release = () => { this.voices = Math.max(0, this.voices - 1); };
    node.onended = release;
    // Red de seguridad por si onended no dispara
    setTimeout(release, (seconds + 0.5) * 1000);
  }

  // --- fábricas de voz -------------------------------------------------
  // Aquí es donde luego entran los samples: misma firma, otra fuente.

  // Golpe/roce de ruido filtrado, situado en el mundo
  noiseAt(x, y, z, {
    freq, q = 1, vol, attack = 0.005, decay = 0.2, reverbSend = 1, budget = 1,
    type = 'bandpass', delay = 0, rate = 1, sweep = 0, dest = null,
  }) {
    if (!this.canPlay(budget)) return;
    const ctx = this.ctx;
    const t = this.time + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = rate;

    const band = ctx.createBiquadFilter();
    band.type = type;
    band.frequency.setValueAtTime(freq, t);
    // barrido del filtro: roces que suben o bajan de tono
    if (sweep) band.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
    band.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);

    const input = dest || this.spatialChain(x, y, z, { reverbSend }).input;
    src.connect(band).connect(g).connect(input);
    src.start(t, Math.random() * 0.9);
    src.stop(t + attack + decay + 0.05);
    this.track(src, delay + attack + decay);
  }

  // Tono con caída de frecuencia, situado en el mundo
  toneAt(x, y, z, {
    type = 'sine', f0, f1, vol, dur = 0.3, reverbSend = 1, budget = 1, delay = 0, attack = 0, dest = null,
  }) {
    if (!this.canPlay(budget)) return;
    const ctx = this.ctx;
    const t = this.time + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);

    const g = ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0002, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    } else {
      g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    }
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + dur);

    const input = dest || this.spatialChain(x, y, z, { reverbSend }).input;
    o.connect(g).connect(input);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    this.track(o, delay + attack + dur);
  }

  // Sonido "en la cabeza": el clic de la linterna, tus propios pasos, tu
  // respiración. No se sitúa en el mundo — está pegado a ti — pero sí pasa
  // por la reverb, que es justo como se oye en la realidad: el sonido
  // directo en tus pies y el eco devuelto por el pasillo.
  flat({ node, gain, dur, reverbSend = 0.35 }) {
    gain.connect(this.dry);
    if (this.wet && reverbSend > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverbSend;
      gain.connect(send).connect(this.wet);
    }
    if (node) this.track(node, dur);
  }

  // Ruido filtrado pegado a ti
  noiseFlat({
    freq, q = 1, vol, attack = 0.004, decay = 0.15, reverbSend = 0.8, budget = 1,
    type = 'bandpass', delay = 0, sweep = 0,
  }) {
    if (!this.canPlay(budget)) return;
    const ctx = this.ctx;
    const t = this.time + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3; // nunca dos idénticos

    const band = ctx.createBiquadFilter();
    band.type = type;
    band.frequency.setValueAtTime(freq, t);
    if (sweep) band.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
    band.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);

    src.connect(band).connect(g);
    this.flat({ node: src, gain: g, dur: delay + attack + decay, reverbSend });
    src.start(t, Math.random() * 0.9);
    src.stop(t + attack + decay + 0.05);
  }

  // Tono pegado a ti
  toneFlat({ type = 'sine', f0, f1, vol, dur = 0.2, reverbSend = 0.8, budget = 1, delay = 0 }) {
    if (!this.canPlay(budget)) return;
    const ctx = this.ctx;
    const t = this.time + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    this.flat({ node: o, gain: g, dur: delay + dur, reverbSend });
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Reproduce un buffer ya renderizado (hoy, las pisadas en agua; mañana,
  // cualquier sample grabado). Con `at` se sitúa en el mundo; sin él va
  // pegado a ti, como tus propios pasos. Una sola voz, sea cual sea la
  // complejidad del sonido.
  playBuffer(buffer, { vol = 1, rate = 1, reverbSend = 0.8, budget = 1, delay = 0, at = null } = {}) {
    if (!buffer || !this.canPlay(budget)) return;
    const ctx = this.ctx;
    const t = this.time + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    const dur = delay + buffer.duration / rate;
    if (at) {
      g.connect(this.spatialChain(at[0], at[1], at[2], { reverbSend }).input);
      this.track(src, dur);
    } else {
      this.flat({ node: src, gain: g, dur, reverbSend });
    }
    src.start(t);
  }

  // Fuente continua pegada a ti (el zumbido de la linterna). No se sitúa:
  // la llevas en la mano, va contigo vayas donde vayas.
  hum({ freqs, noiseLevel = 0, filterHz = 3000, vol = 0 }) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(this.dry);
    if (this.wet) {
      const send = ctx.createGain();
      send.gain.value = 0.25;
      gain.connect(send).connect(this.wet);
    }

    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.35 : 0.65;
      o.connect(og).connect(gain);
      o.start();
      return o;
    });

    // Siseo del filamento
    let noiseGain = null;
    if (noiseLevel > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = filterHz;
      hp.Q.value = 0.8;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = noiseLevel;
      src.connect(hp).connect(noiseGain).connect(gain);
      src.start();
    }

    const self = this;
    return {
      gain, oscs, noiseGain,
      setVolume(v, smoothing = 0.08) {
        gain.gain.setTargetAtTime(Math.max(0, v), self.time, smoothing);
      },
      setDetune(cents) {
        for (const o of oscs) o.detune.setTargetAtTime(cents, self.time, 0.05);
      },
    };
  }

  // Fuente continua que sigue a algo por el mundo (el zumbido de presencia).
  // Devuelve un manejador con posición y volumen.
  emitter({ freqs, vol = 0 }) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = vol;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;

    const panner = ctx.createPanner();
    panner.panningModel = this.q.hrtf === false ? 'equalpower' : 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.cfg.refDistance;
    panner.maxDistance = this.cfg.maxDistance;
    panner.rolloffFactor = this.cfg.rolloff * 0.6; // el drone viaja más lejos

    gain.connect(filter).connect(panner);
    panner.connect(this.dry);
    if (this.wet) {
      const send = ctx.createGain();
      send.gain.value = 0.7;
      panner.connect(send).connect(this.wet);
    }

    const oscs = freqs.map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });

    const self = this;
    return {
      gain, panner, oscs, filter,
      setVolume(v, smoothing = 0.3) {
        gain.gain.setTargetAtTime(v, self.time, smoothing);
      },
      setPosition(x, y, z) {
        setPos(panner, x, y, z, self.time);
        const o = self.occlusion(x, z);
        filter.frequency.setTargetAtTime(
          Math.max(120, 20000 * Math.pow(0.02, o)), self.time, 0.25
        );
      },
    };
  }
}

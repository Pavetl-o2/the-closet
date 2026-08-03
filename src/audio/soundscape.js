// Capa de juego del audio: decide QUÉ suena y CUÁNDO. El cómo llega al oído
// (posición, oclusión por muros, reverb de pasillo) lo resuelve AudioEngine.
//
// Todo sigue sintetizado, sin assets, pero ahora cada sonido tiene un sitio
// real en el laberinto. Eso cambia lo que el jugador puede saber:
//
//   · Los pasos vienen de una dirección concreta, y delante y detrás por fin
//     no suenan igual (HRTF).
//   · Un monstruo al otro lado de un muro suena apagado y sin agudos, con más
//     rebote que sonido directo. Al doblar la esquina, se te viene encima.
//   · El zumbido de presencia ya no es una capa global: sale del monstruo,
//     así que se puede localizar.
//   · Los goteos y golpes lejanos salen de casillas reales del laberinto, no
//     de un paneo al azar, y por tanto también se ocluyen.

const rnd = (a, b) => a + Math.random() * (b - a);

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
    this.breathT = 0;
    this.ambientT = 4;
    this.stingCd = 0;
    this.floors = null;
    this.drone = null;

    // --- tu cuerpo ---
    this.myBreathT = 2;
    this.inhaling = true;
    this.holdT = 0;        // segundos conteniendo la respiración
    this.holding = false;
    this.gasping = 0;      // tras soltarla, jadeas un rato
    this.lastSurface = 'concreto';
  }

  init() {
    if (!this.engine.init()) return;
    // Presencia: dos senos graves desafinados que baten entre sí. Nace en el
    // monstruo, no en la mezcla, para que tenga dirección.
    this.drone = this.engine.emitter({ freqs: [41, 47.3], vol: 0 });
    // La linterna zumba mientras está encendida. Es el sonido de ser
    // localizable: mientras lo oyes, algo puede verte.
    this.lampHum = this.engine.hum({
      freqs: [119, 238], noiseLevel: 0.02, filterHz: 5200, vol: 0,
    });
  }

  resume() { this.engine.resume(); }
  silence() { this.engine.silence(); }

  setWorld(mazeInfo, { floors, puddles = [], glass = [] }) {
    this.engine.setWorld(mazeInfo);
    this.maze = mazeInfo;
    this.floors = floors;
    this.puddles = puddles;
    this.glass = glass;
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

  // --- sonidos puntuales ------------------------------------------------

  // Clic de la linterna: pegado a ti, pero rebota en el pasillo. Ese eco es
  // gratis y recuerda a cada encendido que estás en un sitio grande y vacío.
  click() {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    const t = e.time;
    const o = e.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1500;
    const g = e.ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g);
    e.flat({ node: o, gain: g, dur: 0.06, reverbSend: 0.5 });
    o.start(t);
    o.stop(t + 0.06);
  }

  // Tu propio paso. Va pegado a ti (el sonido directo nace en tus pies) pero
  // con envío generoso a la reverb, que es de donde vuelve el eco: así es
  // como se oye caminar en un pasillo vacío de verdad.
  //
  // Deja en `stepNoise` cuánto te ha delatado ese paso, para que el juego
  // decida si algo lo ha oído. Chapotear y pisar vidrios suena — y cuesta.
  playerStep(surface, running) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;
    const v = this.cfg.stepVolume * (running ? 2 : 1);

    if (surface === 'agua') {
      e.noiseFlat({ freq: rnd(1700, 2500), q: 0.7, vol: v * 1.9, decay: rnd(0.2, 0.3), reverbSend: 1.5, budget: B.propio });
      e.noiseFlat({ freq: rnd(420, 620), q: 1.1, vol: v * 1.1, decay: 0.16, reverbSend: 1.5, budget: B.propio });
      this.stepNoise = 1;
    } else if (surface === 'vidrio') {
      // Crujido: varias esquirlas partiéndose, nunca dos iguales
      for (let i = 0; i < 3; i++) {
        e.noiseFlat({
          freq: rnd(3200, 6500), q: 7, vol: v * rnd(0.5, 1.1),
          attack: 0.002, decay: rnd(0.03, 0.09), reverbSend: 1.2, budget: B.propio,
        });
      }
      e.toneFlat({ f0: 90, f1: 55, vol: v * 0.7, dur: 0.14, reverbSend: 0.9, budget: B.propio });
      this.stepNoise = 0.9;
    } else {
      // Concreto: el peso del cuerpo más el chasquido seco de la suela
      e.toneFlat({ f0: 78, f1: 44, vol: v, dur: 0.16, reverbSend: 0.9, budget: B.propio });
      e.noiseFlat({
        freq: rnd(1900, 2900), q: 1.4, vol: v * 0.5,
        attack: 0.002, decay: 0.05, reverbSend: 1.1, budget: B.propio,
      });
      this.stepNoise = running ? 0.35 : 0;
    }
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

  // Arranca una cacería: dos glissandos disonantes. Va sin situar, como la
  // música: no es algo del mundo, es lo que te pasa a ti.
  huntSting() {
    const e = this.engine;
    if (!e.ctx || e.dead || this.stingCd > 0) return;
    this.stingCd = 2.5;
    const t = e.time;
    for (const [f0, f1] of [[130, 640], [138, 690]]) {
      const o = e.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.7);
      const g = e.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
      o.connect(g);
      e.flat({ node: o, gain: g, dur: 1, reverbSend: 0.6 });
      o.start(t);
      o.stop(t + 1);
    }
  }

  // Atrapado: un golpe sordo antes del silencio total
  deathSting() {
    const e = this.engine;
    if (!e.ctx) return;
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

  // Paso del monstruo: un golpe grave de peso más el roce del pie muerto
  // arrastrándose. Situado en sus pies.
  footstep(x, z, hunting, drag) {
    const e = this.engine;
    e.toneAt(x, 0.12, z, {
      f0: 58, f1: 28, vol: hunting ? 0.5 : 0.3, dur: 0.26, reverbSend: 1,
    });
    if (drag) {
      // el pie que arrastra raspa el suelo entre golpe y golpe
      e.noiseAt(x, 0.08, z, {
        freq: rnd(900, 1500), q: 1.1, vol: hunting ? 0.09 : 0.055,
        attack: 0.04, decay: 0.16, reverbSend: 0.8,
      });
    }
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

    monsters.forEach((mon, i) => {
      const d = mon.distanceToPlayer;
      if (d < nearestD) { nearestD = d; nearest = mon; }
      if (mon.state === 'HUNT') anyHunt = true;

      if (this.stepTs[i] === undefined) this.stepTs[i] = 0;
      this.stepTs[i] -= dt;
      if (d > this.cfg.maxDistance || !mon.isMoving || this.stepTs[i] > 0) return;
      const hunting = mon.state === 'HUNT';
      this.stepTs[i] = hunting ? 0.3 : mon.state === 'IDLE' ? 0.64 : 0.48;
      // Alterna pie bueno / pie arrastrado, como hace la animación
      this.dragStep[i] = !this.dragStep[i];
      const p = mon.group.position;
      this.footstep(p.x, p.z, hunting, this.dragStep[i]);
    });

    // Presencia: el zumbido sale del monstruo más cercano y se ocluye con él.
    if (this.drone) {
      const dd = this.cfg.droneMaxDistance;
      let vol = 0;
      if (nearest && nearestD < dd) {
        const x = 1 - nearestD / dd;
        vol = x * x * 0.3 * (anyHunt ? 1.7 : 1);
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
    // El jugador ya no es mudo. Sus pasos suenan sincronizados con el vaivén
    // de cámara (misma fase de zancada) y cambian según lo que pisa.
    if (player.stepped) {
      this.lastSurface = this.surfaceAt(player.position.x, player.position.z);
      this.playerStep(this.lastSurface, player.isRunning);
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
    }

    // Ambiente: goteras y crujidos desde casillas reales del laberinto. Al
    // tener posición, se ocluyen igual que todo lo demás: un goteo detrás de
    // un muro suena sordo y lejano, y eso es información, no decorado.
    if (this.cfg.ambient && this.floors?.length) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = rnd(6, 16);
        const spot = this.ambientSpot(player.position);
        if (spot) {
          if (Math.random() < 0.55) {
            e.noiseAt(spot[0], 2.4, spot[1], {
              freq: rnd(2600, 4100), q: 8, vol: 0.14, decay: 0.09, reverbSend: 1.6, budget: B.ambiente,
            });
          } else {
            e.toneAt(spot[0], 1.0, spot[1], {
              f0: rnd(48, 70), f1: 30, vol: 0.22, dur: 0.35, reverbSend: 1.6, budget: B.ambiente,
            });
          }
        }
      }
    }
  }

  // Una casilla de suelo a media distancia: ni encima del jugador ni tan
  // lejos que no se oiga.
  ambientSpot(playerPos) {
    for (let i = 0; i < 14; i++) {
      const [tx, ty] = this.floors[(Math.random() * this.floors.length) | 0];
      const [wx, wz] = this.maze.tileToWorld(tx, ty);
      const d = Math.hypot(wx - playerPos.x, wz - playerPos.z);
      if (d > 5 && d < this.cfg.maxDistance * 0.9) return [wx, wz];
    }
    return null;
  }
}

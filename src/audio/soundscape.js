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
  }

  init() {
    if (!this.engine.init()) return;
    // Presencia: dos senos graves desafinados que baten entre sí. Nace en el
    // monstruo, no en la mezcla, para que tenga dirección.
    this.drone = this.engine.emitter({ freqs: [41, 47.3], vol: 0 });
  }

  resume() { this.engine.resume(); }
  silence() { this.engine.silence(); }

  setWorld(mazeInfo, floors) {
    this.engine.setWorld(mazeInfo);
    this.maze = mazeInfo;
    this.floors = floors;
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

  // Pisar un charco. Suena donde estás tú, así que el eco vuelve del pasillo
  // — y es exactamente el ruido que te delata (ver Monster.hearNoise).
  splash(running, pos) {
    const e = this.engine;
    if (!e.ctx || e.dead || !pos) return;
    const v = running ? 1 : 0.62;
    e.noiseAt(pos.x, 0.1, pos.z, {
      freq: rnd(1800, 2400), q: 0.8, vol: 0.3 * v, decay: rnd(0.22, 0.3), reverbSend: 1.4,
    });
    e.noiseAt(pos.x, 0.1, pos.z, {
      freq: 500, q: 1.2, vol: 0.16 * v, decay: 0.14, reverbSend: 1.4,
    });
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

  update(dt, monsters, player, camera) {
    const e = this.engine;
    if (!e.ctx || e.dead) return;

    // El listener primero: la oclusión y el paneo de todo lo que suene en
    // este frame se miden desde aquí.
    e.setListener(camera);
    this.stingCd = Math.max(0, this.stingCd - dt);

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
              freq: rnd(2600, 4100), q: 8, vol: 0.14, decay: 0.09, reverbSend: 1.6,
            });
          } else {
            e.toneAt(spot[0], 1.0, spot[1], {
              f0: rnd(48, 70), f1: 30, vol: 0.22, dur: 0.35, reverbSend: 1.6,
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

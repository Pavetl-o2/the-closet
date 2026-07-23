// El monstruo (Fase 1 = personalidad Tipo A: persigue la luz).
//
// Filosofía (GDD): nunca hace trampa. Jamás conoce tu posición
// automáticamente; toda información entra por su percepción:
//   · tu luz, con línea de visión → señal fuerte
//   · el resplandor de tu luz doblando esquinas → señal débil
//   · presencia a muy corta distancia → te siente
//   · un chapoteo en un charco → rastrea tu posición unos segundos
// FSM: IDLE (patrulla) → INVESTIGATE (señal) → HUNT (confirmado) → SEARCH (perdió el rastro).
//
// El dilema de la luz es asimétrico: con la linterna encendida caza más
// rápido de lo que corres; con la luz apagada es lento y te olvida pronto.

import * as THREE from 'three';
import { bfsPath, losClear } from '../maze/nav.js';

export const STATES = {
  IDLE: 'IDLE',
  INVESTIGATE: 'INVESTIGATE',
  HUNT: 'HUNT',
  SEARCH: 'SEARCH',
};

function shortestAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class Monster {
  constructor(scene, mazeInfo, cfg, rand, spawnTile, debug = false) {
    this.maze = mazeInfo;
    this.cfg = cfg;
    this.rand = rand;
    this.debug = debug;

    this.group = new THREE.Group();
    this.buildMesh();
    const [wx, wz] = mazeInfo.tileToWorld(spawnTile[0], spawnTile[1]);
    this.group.position.set(wx, 0, wz);
    scene.add(this.group);

    this.floorTiles = [];
    for (let y = 0; y < mazeInfo.H; y++) {
      for (let x = 0; x < mazeInfo.W; x++) {
        if (!mazeInfo.isWall(x, y)) this.floorTiles.push([x, y]);
      }
    }

    this.state = STATES.IDLE;
    this.onState = null; // callback (from, to) → estridencias de audio
    this.awareness = 0;
    this.noiseT = 0; // segundos restantes rastreando un ruido (charcos)
    this.lastSignal = new THREE.Vector2();
    this.lastSeen = new THREE.Vector2();
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.chaseT = 0;
    this.lookT = 0;
    this.searchPoints = [];
    this.time = rand() * 10;
    this.isMoving = false;
    this.hasCaught = false;
    this.lungeAmount = 0;
    this.distanceToPlayer = Infinity;
  }

  buildMesh() {
    // Humanoide pálido y esquelético, sin rostro: la piel enfermiza refleja
    // la luz de los focos y de la linterna — verlo a lo lejos, quieto al
    // fondo de un pasillo, es el corazón de la imagen del juego.
    const tone = 0.16 + this.rand() * 0.04;
    const skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tone, tone * 0.92, tone * 0.84),
      roughness: 0.85,
    });
    this.body = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 4, 8), skin);
    torso.position.y = 1.32;
    torso.scale.set(1, 1, 0.72); // pecho hundido
    torso.castShadow = true;

    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), skin);
    pelvis.position.y = 0.98;
    pelvis.scale.set(1, 0.7, 0.8);
    pelvis.castShadow = true;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 6), skin);
    neck.position.y = 1.78;

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skin);
    this.head.position.y = 1.95;
    this.head.scale.set(1, 1.35, 1.05); // cráneo alargado, sin rasgos
    this.head.castShadow = true;

    // Brazos larguísimos, colgando hasta las rodillas; pivote en el hombro
    const armGeo = new THREE.CapsuleGeometry(0.042, 0.82, 4, 6);
    armGeo.translate(0, -0.45, 0);
    this.armL = new THREE.Mesh(armGeo, skin);
    this.armL.position.set(-0.22, 1.62, 0);
    this.armL.rotation.z = 0.1;
    this.armL.castShadow = true;
    this.armR = new THREE.Mesh(armGeo.clone(), skin);
    this.armR.position.set(0.22, 1.62, 0);
    this.armR.rotation.z = -0.1;
    this.armR.castShadow = true;

    // Piernas con pivote en la cadera
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.85, 4, 6);
    legGeo.translate(0, -0.5, 0);
    this.legL = new THREE.Mesh(legGeo, skin);
    this.legL.position.set(-0.1, 0.98, 0);
    this.legL.castShadow = true;
    this.legR = new THREE.Mesh(legGeo.clone(), skin);
    this.legR.position.set(0.1, 0.98, 0);
    this.legR.castShadow = true;

    this.body.add(torso, pelvis, neck, this.head, this.armL, this.armR, this.legL, this.legR);
    this.body.rotation.x = -0.06; // encorvado hacia el frente
    this.group.add(this.body);
  }

  setState(s) {
    if (this.state === s) return;
    if (this.debug) console.log(`[monstruo] ${this.state} → ${s}`);
    const from = this.state;
    this.state = s;
    if (this.onState) this.onState(from, s);
  }

  // Un chapoteo (u otro ruido fuerte): rastrea tu posición unos segundos.
  hearNoise() {
    this.noiseT = this.cfg.noiseTrackSeconds;
  }

  // ---------- movimiento sobre el grafo del laberinto ----------

  nearestFloor(tx, ty) {
    for (let r = 1; r <= 3; r++) {
      for (let yy = ty - r; yy <= ty + r; yy++) {
        for (let xx = tx - r; xx <= tx + r; xx++) {
          if (!this.maze.isWall(xx, yy)) return [xx, yy];
        }
      }
    }
    return this.maze.worldToTile(this.group.position.x, this.group.position.z);
  }

  goTo(wx, wz, cooldown) {
    const [tx, ty] = this.maze.worldToTile(wx, wz);
    const from = this.maze.worldToTile(this.group.position.x, this.group.position.z);
    const goal = this.maze.isWall(tx, ty) ? this.nearestFloor(tx, ty) : [tx, ty];
    const p = bfsPath(this.maze.grid, from, goal);
    if (p) {
      this.path = p.map(([x, y]) => this.maze.tileToWorld(x, y));
      this.pathIdx = p.length > 1 ? 1 : 0;
    }
    this.repathT = cooldown;
  }

  arrived() {
    return !this.path || this.pathIdx >= this.path.length;
  }

  follow(speed, dt) {
    this.isMoving = false;
    if (this.arrived()) return;
    const [wx, wz] = this.path[this.pathIdx];
    const m = this.group.position;
    let dx = wx - m.x;
    let dz = wz - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.28) { this.pathIdx++; return; }
    dx /= d; dz /= d;
    m.x += dx * speed * dt;
    m.z += dz * speed * dt;
    this.isMoving = true;
    const targetYaw = Math.atan2(-dx, -dz);
    this.group.rotation.y += shortestAngle(targetYaw - this.group.rotation.y) * Math.min(1, 8 * dt);
  }

  pickPatrol(pfx, pfy) {
    const c = this.cfg;
    let pick = null;
    // Sesgo de merodeo configurable: NO conoce tu posición; solo mantiene
    // vivos los encuentros. patrolBiasNearPlayer = 0 → patrulla pura.
    if (this.rand() < c.patrolBiasNearPlayer) {
      for (let i = 0; i < 24 && !pick; i++) {
        const t = this.floorTiles[(this.rand() * this.floorTiles.length) | 0];
        const dd = Math.hypot(t[0] - pfx, t[1] - pfy);
        if (dd > 4 && dd < c.patrolBiasRadiusTiles) pick = t;
      }
    }
    if (!pick) pick = this.floorTiles[(this.rand() * this.floorTiles.length) | 0];
    const [wx, wz] = this.maze.tileToWorld(pick[0], pick[1]);
    this.goTo(wx, wz, 0);
  }

  enterSearch(cx, cz) {
    const c = this.cfg;
    this.searchPoints = [];
    const [tx, ty] = this.maze.worldToTile(cx, cz);
    for (let i = 0; i < c.searchWaypoints; i++) {
      for (let tries = 0; tries < 16; tries++) {
        const xx = tx + (((this.rand() * (c.searchRadiusTiles * 2 + 1)) | 0) - c.searchRadiusTiles);
        const yy = ty + (((this.rand() * (c.searchRadiusTiles * 2 + 1)) | 0) - c.searchRadiusTiles);
        if (!this.maze.isWall(xx, yy)) {
          this.searchPoints.push(this.maze.tileToWorld(xx, yy));
          break;
        }
      }
    }
    this.goTo(cx, cz, 0);
    // Evita el ping-pong búsqueda↔cacería sin señal nueva
    this.awareness = Math.min(this.awareness, c.awarenessInvestigate * 0.6);
    this.setState(STATES.SEARCH);
  }

  escalate(direct, senses, playerPos) {
    const c = this.cfg;
    if (direct || senses || this.awareness >= c.awarenessHunt) {
      this.lastSeen.set(playerPos.x, playerPos.z);
      this.chaseT = c.loseSightSeconds;
      this.goTo(playerPos.x, playerPos.z, c.repathInterval);
      this.setState(STATES.HUNT);
      return true;
    }
    if (this.awareness >= c.awarenessInvestigate && this.state !== STATES.INVESTIGATE) {
      this.lookT = 2.5;
      this.goTo(this.lastSignal.x, this.lastSignal.y, 0.6);
      this.setState(STATES.INVESTIGATE);
      return true;
    }
    return false;
  }

  // Durante la secuencia de muerte: cierra la distancia y encara al jugador.
  approachForKill(playerPos, dt) {
    const m = this.group.position;
    const dx = playerPos.x - m.x;
    const dz = playerPos.z - m.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.8) {
      const step = Math.min(d - 0.8, 6 * dt);
      m.x += (dx / d) * step;
      m.z += (dz / d) * step;
    }
    const targetYaw = Math.atan2(-dx, -dz);
    this.group.rotation.y += shortestAngle(targetYaw - this.group.rotation.y) * Math.min(1, 14 * dt);

    // Zarpazo: brazos al frente, cabeza volcada hacia la cámara
    this.lungeAmount = Math.min(1, this.lungeAmount + 5 * dt);
    const a = this.lungeAmount;
    this.armL.rotation.x = 1.5 * a;
    this.armR.rotation.x = 1.5 * a;
    this.armL.rotation.z = 0.1 - 0.25 * a;
    this.armR.rotation.z = -0.1 + 0.25 * a;
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.head.rotation.x = 0.5 * a;
    this.body.rotation.x = -0.06 - 0.3 * a;
    this.body.position.y = 0;
  }

  // ---------- ciclo principal ----------

  update(dt, playerPos, flashlight) {
    const c = this.cfg;
    const m = this.group.position;

    const dx = playerPos.x - m.x;
    const dz = playerPos.z - m.z;
    const d = Math.hypot(dx, dz);
    this.distanceToPlayer = d;

    const [mfx, mfy] = this.maze.worldToTileF(m.x, m.z);
    const [pfx, pfy] = this.maze.worldToTileF(playerPos.x, playerPos.z);
    const los = losClear(this.maze.grid, mfx, mfy, pfx, pfy);
    const light = flashlight.lightLevel > 0.05;

    // --- percepción (luz a distancia + ruidos recientes) ---
    let gain = 0;
    if (light) {
      if (los && d < c.lightVisionRange) {
        gain = 0.25 + 2.4 * (1 - d / c.lightVisionRange);
      } else if (d < c.lightLeakRange) {
        gain = 0.4 * (1 - d / c.lightLeakRange);
      }
    }
    if (gain > 0) {
      this.awareness = Math.min(3, this.awareness + gain * dt);
      // La señal es imprecisa: más lejos → más ruido en la posición estimada
      const noise = d * 0.25;
      this.lastSignal.set(
        playerPos.x + (this.rand() - 0.5) * noise,
        playerPos.z + (this.rand() - 0.5) * noise
      );
    } else {
      // Con la luz apagada te olvida mucho más rápido: apagar ES esconderse
      const decay = light ? c.awarenessDecay : c.awarenessDecayDark;
      this.awareness = Math.max(0, this.awareness - decay * dt);
    }

    // Ruido oído (chapoteo): rastrea tu posición real durante unos segundos
    if (this.noiseT > 0) {
      this.noiseT -= dt;
      this.awareness = Math.max(this.awareness, c.awarenessInvestigate + 0.1);
      this.lastSignal.set(playerPos.x, playerPos.z);
    }

    const senses = d < c.closeSense && los;
    const direct = light && los && d < c.instantHuntDist;
    const signal = (light && (los || d < c.lightLeakRange)) || this.noiseT > 0;

    switch (this.state) {
      case STATES.IDLE: {
        if (this.escalate(direct, senses, playerPos)) break;
        const [ptx, pty] = this.maze.worldToTile(playerPos.x, playerPos.z);
        if (this.arrived()) this.pickPatrol(ptx, pty);
        this.follow(c.patrolSpeed, dt);
        break;
      }

      case STATES.INVESTIGATE: {
        if (this.escalate(direct, senses, playerPos)) break;
        if ((gain > 0 || this.noiseT > 0) && this.repathT <= 0) {
          this.goTo(this.lastSignal.x, this.lastSignal.y, 0.6);
        }
        this.repathT -= dt;
        if (this.arrived()) {
          this.lookT -= dt;
          this.group.rotation.y += dt * 1.6; // mira alrededor
          if (this.lookT <= 0) this.enterSearch(this.lastSignal.x, this.lastSignal.y);
        } else {
          this.follow(c.investigateSpeed, dt);
        }
        break;
      }

      case STATES.HUNT: {
        // A oscuras solo te retiene si estás casi encima; sin señal, el
        // contador de cacería se agota mucho más rápido con la luz apagada.
        if (signal || (los && d < c.closeSense * 1.5)) {
          this.chaseT = c.loseSightSeconds;
          this.lastSeen.set(playerPos.x, playerPos.z);
        } else {
          this.chaseT -= dt * (light ? 1 : c.loseSightSeconds / c.loseSightSecondsDark);
        }
        const huntSpeed = light ? c.huntSpeedLit : c.huntSpeedDark;
        this.repathT -= dt;
        if (this.repathT <= 0) this.goTo(playerPos.x, playerPos.z, c.repathInterval);
        // A quemarropa y con línea de visión va directo al jugador,
        // no al centro del tile (si no, podría "estacionarse" a un metro).
        if (los && d < this.maze.tileSize * 1.2 && d > 1e-4) {
          const ux = dx / d;
          const uz = dz / d;
          m.x += ux * huntSpeed * dt;
          m.z += uz * huntSpeed * dt;
          this.isMoving = true;
          const targetYaw = Math.atan2(-ux, -uz);
          this.group.rotation.y +=
            shortestAngle(targetYaw - this.group.rotation.y) * Math.min(1, 10 * dt);
        } else {
          this.follow(huntSpeed, dt);
        }
        if (this.chaseT <= 0) this.enterSearch(this.lastSeen.x, this.lastSeen.y);
        break;
      }

      case STATES.SEARCH: {
        if (this.escalate(direct, senses, playerPos)) break;
        if (this.arrived()) {
          const next = this.searchPoints.pop();
          if (next) this.goTo(next[0], next[1], 0);
          else this.setState(STATES.IDLE);
        } else {
          this.follow(c.investigateSpeed, dt);
        }
        break;
      }
    }

    if (d < c.catchDistance) this.hasCaught = true;

    // Animación: ciclo de marcha rígido, más frenético en cacería
    this.time += dt;
    const animSpeed = this.state === STATES.HUNT ? 11 : 5.5;
    const swing = Math.sin(this.time * animSpeed);
    const amp = this.isMoving ? (this.state === STATES.HUNT ? 0.75 : 0.4) : 0;
    this.armL.rotation.x += (swing * amp - this.armL.rotation.x) * Math.min(1, 10 * dt);
    this.armR.rotation.x += (-swing * amp - this.armR.rotation.x) * Math.min(1, 10 * dt);
    this.legL.rotation.x += (-swing * amp - this.legL.rotation.x) * Math.min(1, 10 * dt);
    this.legR.rotation.x += (swing * amp - this.legR.rotation.x) * Math.min(1, 10 * dt);
    this.body.position.y = this.isMoving
      ? Math.abs(Math.sin(this.time * animSpeed)) * 0.04
      : Math.sin(this.time * 1.3) * 0.02;
    // La cabeza barre los alrededores cuando busca; se clava al frente cazando
    this.head.rotation.y = this.state === STATES.HUNT
      ? 0
      : Math.sin(this.time * 0.9) * 0.55;
  }
}

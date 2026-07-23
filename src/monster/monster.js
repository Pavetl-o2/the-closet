// El monstruo (Fase 1 = personalidad Tipo A: persigue la luz).
//
// Filosofía (GDD): nunca hace trampa. Jamás conoce tu posición
// automáticamente; toda información entra por su percepción:
//   · tu luz, con línea de visión → señal fuerte
//   · el resplandor de tu luz doblando esquinas → señal débil
//   · presencia a muy corta distancia → te siente
// FSM: IDLE (patrulla) → INVESTIGATE (señal) → HUNT (confirmado) → SEARCH (perdió el rastro).

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
    this.awareness = 0;
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
    this.distanceToPlayer = Infinity;
  }

  buildMesh() {
    // Silueta abstracta: alta, delgada, mate, casi invisible en la oscuridad.
    // Lo aterrador no es verlo; es sentir que está cerca (GDD).
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.96 });
    this.body = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 1.9, 7), mat);
    torso.position.y = 0.95;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
    head.position.y = 2.0;
    head.castShadow = true;

    // Ojos: dos puntos pálidos, apenas visibles. Frente del cuerpo = -Z.
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0x9caf92, transparent: true, opacity: 0.35,
    });
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.055, 2.02, -0.13);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.055, 2.02, -0.13);

    const armGeo = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5);
    const armL = new THREE.Mesh(armGeo, mat);
    armL.position.set(-0.34, 1.25, 0);
    armL.rotation.z = 0.16;
    armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, mat);
    armR.position.set(0.34, 1.25, 0);
    armR.rotation.z = -0.16;
    armR.castShadow = true;

    this.body.add(torso, head, eyeL, eyeR, armL, armR);
    this.group.add(this.body);
  }

  setState(s) {
    if (this.state === s) return;
    if (this.debug) console.log(`[monstruo] ${this.state} → ${s}`);
    this.state = s;
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

    // --- percepción (la luz es su único sentido a distancia) ---
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
      this.awareness = Math.max(0, this.awareness - c.awarenessDecay * dt);
    }

    const senses = d < c.closeSense && los;
    const direct = light && los && d < c.instantHuntDist;
    const signal = light && (los || d < c.lightLeakRange);

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
        if (gain > 0 && this.repathT <= 0) this.goTo(this.lastSignal.x, this.lastSignal.y, 0.6);
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
        if (signal || los) {
          this.chaseT = c.loseSightSeconds;
          this.lastSeen.set(playerPos.x, playerPos.z);
        } else {
          this.chaseT -= dt;
        }
        this.repathT -= dt;
        if (this.repathT <= 0) this.goTo(playerPos.x, playerPos.z, c.repathInterval);
        // A quemarropa y con línea de visión va directo al jugador,
        // no al centro del tile (si no, podría "estacionarse" a un metro).
        if (los && d < this.maze.tileSize * 1.2 && d > 1e-4) {
          const ux = dx / d;
          const uz = dz / d;
          m.x += ux * c.huntSpeed * dt;
          m.z += uz * c.huntSpeed * dt;
          this.isMoving = true;
          const targetYaw = Math.atan2(-ux, -uz);
          this.group.rotation.y +=
            shortestAngle(targetYaw - this.group.rotation.y) * Math.min(1, 10 * dt);
        } else {
          this.follow(c.huntSpeed, dt);
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

    // Animación mínima: vaivén del cuerpo según el estado
    this.time += dt;
    const animSpeed = this.state === STATES.HUNT ? 14 : 7;
    this.body.position.y = this.isMoving
      ? Math.sin(this.time * animSpeed) * 0.05
      : Math.sin(this.time * 1.3) * 0.02;
    this.body.rotation.z = this.isMoving ? Math.sin(this.time * animSpeed * 0.5) * 0.05 : 0;
  }
}

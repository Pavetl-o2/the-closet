// Controlador en primera persona.
// Rig: yaw (este objeto) → pitch → cámara. La colisión es un círculo
// contra los tiles de muro (la grilla ES el mapa de colisiones).

import * as THREE from 'three';

export class Player {
  constructor(camera, mazeInfo, cfg, spawnTile) {
    this.cfg = cfg;
    this.maze = mazeInfo;
    this.camera = camera;
    this.baseFov = camera.fov;

    this.rig = new THREE.Object3D();      // yaw
    this.pitchObj = new THREE.Object3D(); // pitch
    this.rig.add(this.pitchObj);
    this.pitchObj.add(camera);
    camera.position.set(0, 0, 0);

    const [wx, wz] = mazeInfo.tileToWorld(spawnTile[0], spawnTile[1]);
    this.rig.position.set(wx, cfg.eyeHeight, wz);

    // Mirar hacia el pasillo abierto al aparecer
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!mazeInfo.isWall(spawnTile[0] + dx, spawnTile[1] + dy)) {
        this.rig.rotation.y = Math.atan2(-dx, -dy);
        break;
      }
    }

    this.vel = new THREE.Vector3();
    this.keys = Object.create(null);
    this.bobAcc = 0;
    this.bobCur = 0;
    this.moving = false;
    this.isRunning = false;
    this.enabled = false;
    this.touch = null; // TouchControls en móvil; null en escritorio

    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = Object.create(null); });
  }

  // El FOV base cambia si la pantalla es muy panorámica (ver applyAspect);
  // el empuje al correr se suma sobre este valor.
  setBaseFov(fov) {
    this.baseFov = fov;
  }

  // `sens` permite que el dedo use otra sensibilidad que el ratón
  onMouseDelta(mx, my, sens = this.cfg.lookSensitivity) {
    this.rig.rotation.y -= mx * sens;
    this.pitchObj.rotation.x = THREE.MathUtils.clamp(
      this.pitchObj.rotation.x - my * sens, -1.45, 1.45
    );
  }

  get position() { return this.rig.position; }
  get yaw() { return this.rig.rotation.y; }

  update(dt) {
    const c = this.cfg;
    const k = this.keys;

    let iz = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    let ix = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    let wantsRun = !!(k['ShiftLeft'] || k['ShiftRight']) && (iz !== 0 || ix !== 0);

    // El teclado es todo o nada; el joystick táctil es analógico y gradúa la
    // velocidad con el recorrido del pulgar.
    let analog = 1;
    if (this.touch && (this.touch.move.x !== 0 || this.touch.move.z !== 0)) {
      ix = this.touch.move.x;
      iz = this.touch.move.z;
      analog = this.touch.analog;
      wantsRun = this.touch.running;
    }

    // Base de movimiento en el plano (three: yaw 0 mira hacia -Z)
    const yaw = this.rig.rotation.y;
    const fwd = [-Math.sin(yaw), -Math.cos(yaw)];
    const right = [Math.cos(yaw), -Math.sin(yaw)];

    let wx = fwd[0] * iz + right[0] * ix;
    let wz = fwd[1] * iz + right[1] * ix;
    const len = Math.hypot(wx, wz);
    if (len > 1e-4) { wx /= len; wz /= len; }

    const base = wantsRun ? c.runSpeed : c.walkSpeed;
    const speed = this.enabled && len > 1e-4 ? base * analog : 0;
    const blend = 1 - Math.exp(-c.accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * blend;
    this.vel.z += (wz * speed - this.vel.z) * blend;

    let px = this.rig.position.x + this.vel.x * dt;
    let pz = this.rig.position.z + this.vel.z * dt;
    [px, pz] = this.collide(px, pz);
    [px, pz] = this.collide(px, pz); // segunda pasada para esquinas
    this.rig.position.x = px;
    this.rig.position.z = pz;

    // Head-bob suave (se desvanece al detenerse)
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.moving = spd > 0.4;
    if (this.moving) this.bobAcc += spd * dt;
    const targetAmp = this.moving ? c.bobAmp * (wantsRun ? 1.5 : 1) : 0;
    this.bobCur += (targetAmp - this.bobCur) * (1 - Math.exp(-8 * dt));
    this.camera.position.y = Math.sin(this.bobAcc * c.bobFreq) * this.bobCur;
    this.camera.position.x = Math.cos(this.bobAcc * c.bobFreq * 0.5) * this.bobCur * 0.6;

    // Empuje de FOV al correr
    this.isRunning = wantsRun && this.moving;
    const targetFov = this.baseFov + (this.isRunning ? c.runFovKick : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  // Círculo del jugador contra los AABB de los tiles de muro vecinos
  collide(px, pz) {
    const r = this.cfg.radius;
    const t = this.maze.tileSize;
    const [tx, ty] = this.maze.worldToTile(px, pz);
    for (let yy = ty - 1; yy <= ty + 1; yy++) {
      for (let xx = tx - 1; xx <= tx + 1; xx++) {
        if (!this.maze.isWall(xx, yy)) continue;
        const minX = (xx - this.maze.W / 2) * t;
        const maxX = minX + t;
        const minZ = (yy - this.maze.H / 2) * t;
        const maxZ = minZ + t;
        const nx = Math.max(minX, Math.min(px, maxX));
        const nz = Math.max(minZ, Math.min(pz, maxZ));
        const dx = px - nx;
        const dz = pz - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-9 && d2 < r * r) {
          const d = Math.sqrt(d2);
          const push = r - d;
          px += (dx / d) * push;
          pz += (dz / d) * push;
        } else if (d2 <= 1e-9) {
          // Centro dentro del muro (casi imposible): expulsar hacia afuera
          px += (Math.sign(px - (minX + maxX) / 2) || 1) * r;
        }
      }
    }
    return [px, pz];
  }
}

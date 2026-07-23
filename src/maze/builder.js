// Construye la geometría del laberinto a partir de la grilla.
// Muros y props con InstancedMesh para mantener pocos draw calls.

import * as THREE from 'three';
import { WALL, FLOOR } from './generator.js';
import {
  makeWallTexture,
  makeFloorTexture,
  makeCeilingTexture,
  makeRustTexture,
} from '../world/textures.js';

export function buildMazeScene(scene, maze, CFG, rand) {
  const { grid, W, H } = maze;
  const t = CFG.MAZE.tile;
  const wallH = CFG.MAZE.wallHeight;

  // --- transformaciones tile ↔ mundo (laberinto centrado en el origen) ---
  const tileToWorld = (x, y) => [(x - W / 2 + 0.5) * t, (y - H / 2 + 0.5) * t];
  const worldToTile = (wx, wz) => [Math.floor(wx / t + W / 2), Math.floor(wz / t + H / 2)];
  const worldToTileF = (wx, wz) => [wx / t + W / 2, wz / t + H / 2];
  const isWall = (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H ? true : grid[y][x] === WALL;

  const floors = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (grid[y][x] === FLOOR) floors.push([x, y]);
  }

  // --- materiales ---
  const wallTex = makeWallTexture(rand);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.94 });

  const floorTex = makeFloorTexture(rand);
  floorTex.repeat.set(W, H);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });

  const ceilTex = makeCeilingTexture(rand);
  ceilTex.repeat.set(W, H);
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.96 });

  const rustMat = new THREE.MeshStandardMaterial({
    map: makeRustTexture(rand),
    roughness: 0.85,
    metalness: 0.35,
  });

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x23282a,
    roughness: 0.55,
    metalness: 0.6,
  });

  const dummy = new THREE.Object3D();

  // --- muros (solo los que tocan piso; instanciados) ---
  const visible = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== WALL) continue;
      let nearFloor = false;
      for (let dy = -1; dy <= 1 && !nearFloor; dy++) {
        for (let dx = -1; dx <= 1 && !nearFloor; dx++) {
          if (!isWall(x + dx, y + dy)) nearFloor = true;
        }
      }
      if (nearFloor) visible.push([x, y]);
    }
  }

  const wallGeo = new THREE.BoxGeometry(t, wallH, t);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, visible.length);
  const col = new THREE.Color();
  visible.forEach(([x, y], i) => {
    const [wx, wz] = tileToWorld(x, y);
    dummy.position.set(wx, wallH / 2, wz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);
    walls.setColorAt(i, col.setScalar(0.75 + rand() * 0.3)); // variación de vejez
  });
  walls.instanceMatrix.needsUpdate = true;
  if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);

  // --- piso y techo ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * t, H * t), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * t, H * t), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wallH;
  ceiling.receiveShadow = true;
  scene.add(ceiling);

  // --- charcos por goteras (planos especulares) ---
  const P = CFG.PROPS;
  const puddleGeo = new THREE.CircleGeometry(0.55, 18);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0c1116,
    roughness: 0.06,
    metalness: 0.9,
  });
  const puddles = new THREE.InstancedMesh(puddleGeo, puddleMat, P.puddles.count);
  for (let i = 0; i < P.puddles.count; i++) {
    const [x, y] = floors[(rand() * floors.length) | 0];
    const [wx, wz] = tileToWorld(x, y);
    dummy.position.set(wx + (rand() - 0.5), 0.012, wz + (rand() - 0.5));
    dummy.rotation.set(-Math.PI / 2, 0, rand() * Math.PI);
    const s = 0.6 + rand() * 0.8;
    dummy.scale.set(s, s * (0.7 + rand() * 0.5), 1);
    dummy.updateMatrix();
    puddles.setMatrixAt(i, dummy.matrix);
  }
  puddles.instanceMatrix.needsUpdate = true;
  scene.add(puddles);

  // --- tuberías oxidadas a lo largo de tramos rectos ---
  const runs = [];
  for (let y = 1; y < H - 1; y++) {
    let x = 1;
    while (x < W - 1) {
      if (grid[y][x] === FLOOR) {
        let x2 = x;
        while (x2 < W - 1 && grid[y][x2] === FLOOR) x2++;
        const len = x2 - x;
        if (len >= P.pipes.minRun && rand() < P.pipes.chance) {
          runs.push({ axis: 'x', a: x, b: y, len });
        }
        x = x2;
      } else x++;
    }
  }
  for (let x = 1; x < W - 1; x++) {
    let y = 1;
    while (y < H - 1) {
      if (grid[y][x] === FLOOR) {
        let y2 = y;
        while (y2 < H - 1 && grid[y2][x] === FLOOR) y2++;
        const len = y2 - y;
        if (len >= P.pipes.minRun && rand() < P.pipes.chance) {
          runs.push({ axis: 'z', a: y, b: x, len });
        }
        y = y2;
      } else y++;
    }
  }
  runs.length = Math.min(runs.length, P.pipes.max);

  if (runs.length) {
    const pipeGeo = new THREE.CylinderGeometry(P.pipes.radius, P.pipes.radius, 1, 10);
    const pipes = new THREE.InstancedMesh(pipeGeo, rustMat, runs.length);
    runs.forEach((r, i) => {
      const worldLen = r.len * t - 0.4;
      const side = (t / 2 - 0.32) * (rand() < 0.5 ? 1 : -1);
      if (r.axis === 'x') {
        const [wx0] = tileToWorld(r.a, r.b);
        const [wx1] = tileToWorld(r.a + r.len - 1, r.b);
        const [, wz] = tileToWorld(r.a, r.b);
        dummy.position.set((wx0 + wx1) / 2, P.pipes.height, wz + side);
        dummy.rotation.set(0, 0, Math.PI / 2); // eje Y → eje X
      } else {
        const [, wz0] = tileToWorld(r.b, r.a);
        const [, wz1] = tileToWorld(r.b, r.a + r.len - 1);
        const [wx] = tileToWorld(r.b, r.a);
        dummy.position.set(wx + side, P.pipes.height, (wz0 + wz1) / 2);
        dummy.rotation.set(Math.PI / 2, 0, 0); // eje Y → eje Z
      }
      dummy.scale.set(1, worldLen, 1);
      dummy.updateMatrix();
      pipes.setMatrixAt(i, dummy.matrix);
    });
    pipes.instanceMatrix.needsUpdate = true;
    pipes.castShadow = true;
    scene.add(pipes);
  }

  // --- cajas antiguas en callejones sin salida (decorativas, sin colisión aún) ---
  const isSpecial = (x, y) =>
    (x === maze.entry[0] && y === maze.entry[1]) ||
    (x === maze.exit[0] && y === maze.exit[1]);

  const crateSpots = [];
  for (const [x, y] of maze.deadEndList) {
    if (isSpecial(x, y)) continue;
    if (rand() >= P.crates.deadEndChance) continue;
    const n = rand() < 0.35 ? 2 : 1;
    for (let i = 0; i < n; i++) crateSpots.push([x, y]);
  }
  if (crateSpots.length) {
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x453727, roughness: 0.95 });
    const crates = new THREE.InstancedMesh(crateGeo, crateMat, crateSpots.length);
    crateSpots.forEach(([x, y], i) => {
      const [wx, wz] = tileToWorld(x, y);
      const s = 0.45 + rand() * 0.4;
      dummy.position.set(wx + (rand() - 0.5) * 1.2, s / 2, wz + (rand() - 0.5) * 1.2);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      crates.setMatrixAt(i, dummy.matrix);
    });
    crates.instanceMatrix.needsUpdate = true;
    crates.castShadow = true;
    crates.receiveShadow = true;
    scene.add(crates);
  }

  // --- lámparas rotas en cruces (referencias escasas) ---
  const junctions = floors.filter(([x, y]) => {
    let open = 0;
    if (!isWall(x + 1, y)) open++;
    if (!isWall(x - 1, y)) open++;
    if (!isWall(x, y + 1)) open++;
    if (!isWall(x, y - 1)) open++;
    return open >= 3;
  });

  const lamps = [];
  const chosen = [];
  let guard = 0;
  while (lamps.length < P.lamps.count && guard++ < 300 && junctions.length) {
    const [x, y] = junctions[(rand() * junctions.length) | 0];
    if (chosen.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 6)) continue;
    chosen.push([x, y]);
    const [wx, wz] = tileToWorld(x, y);
    const fix = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.22, 8), metalMat);
    fix.position.set(wx, wallH - 0.12, wz);
    const light = new THREE.PointLight(0xff9a5a, 9, 8, 2);
    light.position.set(wx, wallH - 0.4, wz);
    scene.add(fix, light);
    lamps.push({ light, base: 9, seed: rand() * 100 });
  }

  // --- puerta de salida: metal oxidado, entreabierta, con una rendija de luz fría ---
  const [ex, ey] = maze.exit;
  let doorDir = [0, 1];
  for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isWall(ex + ddx, ey + ddy)) { doorDir = [ddx, ddy]; break; }
  }
  const [ewx, ewz] = tileToWorld(ex, ey);

  const door = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.16), metalMat);
  frame.position.y = 1.25;
  frame.castShadow = true;

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.3, 0.07), rustMat);
  panel.position.set(-0.06, 1.22, -0.1);
  panel.rotation.y = 0.32; // entreabierta
  panel.castShadow = true;

  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 2.2),
    new THREE.MeshBasicMaterial({ color: 0xbfe8cd })
  );
  slit.position.set(0.52, 1.22, -0.05);

  const glow = new THREE.PointLight(0xa9d8bd, 4, 6, 2);
  glow.position.set(0.4, 1.3, -0.5);

  door.add(frame, panel, slit, glow);
  door.position.set(ewx + doorDir[0] * (t / 2 - 0.1), 0, ewz + doorDir[1] * (t / 2 - 0.1));
  door.rotation.y = Math.atan2(doorDir[0], doorDir[1]); // el frente (-Z) mira al pasillo
  scene.add(door);

  return {
    mazeInfo: { grid, W, H, tileSize: t, tileToWorld, worldToTile, worldToTileF, isWall },
    lamps,
    exitTrigger: door.position.clone(),
    floors,
  };
}

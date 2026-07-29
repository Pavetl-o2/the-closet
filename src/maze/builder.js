// Construye la geometría del laberinto a partir de la grilla.
// Muros y props con InstancedMesh para mantener pocos draw calls.
// La ambientación es constante (GDD): tuberías, cajas, tarimas, barriles,
// ropa tirada, vidrios rotos, manchas y focos colgantes que parpadean.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL, FLOOR } from './generator.js';
import {
  makeWallTexture,
  makeFloorTexture,
  makeCeilingTexture,
  makeRustTexture,
  makeWoodTexture,
  makePuddleTexture,
  makeStainTexture,
} from '../world/textures.js';

export function buildMazeScene(scene, maze, CFG, rand, quality) {
  const { grid, W, H } = maze;
  const t = CFG.MAZE.tile;
  const wallH = CFG.MAZE.wallHeight;

  // --- transformaciones tile ↔ mundo (laberinto centrado en el origen) ---
  const tileToWorld = (x, y) => [(x - W / 2 + 0.5) * t, (y - H / 2 + 0.5) * t];
  const worldToTile = (wx, wz) => [Math.floor(wx / t + W / 2), Math.floor(wz / t + H / 2)];
  const worldToTileF = (wx, wz) => [wx / t + W / 2, wz / t + H / 2];
  const isWall = (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H ? true : grid[y][x] === WALL;

  const isSpecial = (x, y) =>
    (x === maze.entry[0] && y === maze.entry[1]) ||
    (x === maze.exit[0] && y === maze.exit[1]);

  const floors = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (grid[y][x] === FLOOR) floors.push([x, y]);
  }

  const pickFloor = () => floors[(rand() * floors.length) | 0];

  // Direcciones con muro adyacente (para arrimar props a las paredes)
  const wallDirs = (x, y) => {
    const out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWall(x + dx, y + dy)) out.push([dx, dy]);
    }
    return out;
  };

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

  const woodMat = new THREE.MeshStandardMaterial({
    map: makeWoodTexture(rand),
    roughness: 0.92,
  });

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x23282a,
    roughness: 0.55,
    metalness: 0.6,
  });

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

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

  const P = CFG.PROPS;

  // --- manchas en el piso (sangre seca y mugre; debajo de todo lo demás) ---
  const stainGeo = new THREE.PlaneGeometry(1.1, 1.1);
  const addStains = (count, blood) => {
    if (!count) return;
    const mat = new THREE.MeshStandardMaterial({
      map: makeStainTexture(rand, blood),
      transparent: true,
      depthWrite: false,
      roughness: 0.85,
    });
    const mesh = new THREE.InstancedMesh(stainGeo, mat, count);
    for (let i = 0; i < count; i++) {
      const [x, y] = pickFloor();
      const [wx, wz] = tileToWorld(x, y);
      dummy.position.set(wx + (rand() - 0.5) * 1.6, 0.006, wz + (rand() - 0.5) * 1.6);
      dummy.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
      const s = 0.6 + rand() * 0.9;
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
  };
  addStains(P.clutter.bloodStains, true);
  addStains(P.clutter.grimeStains, false);

  // --- charcos por goteras (mancha irregular; pisarlos hace ruido) ---
  const puddleList = [];
  const puddleGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const puddleMat = new THREE.MeshStandardMaterial({
    map: makePuddleTexture(rand),
    transparent: true,
    depthWrite: false,
    roughness: 0.1,
    metalness: 0.65,
  });
  const puddles = new THREE.InstancedMesh(puddleGeo, puddleMat, P.puddles.count);
  for (let i = 0; i < P.puddles.count; i++) {
    const [x, y] = pickFloor();
    const [wx, wz] = tileToWorld(x, y);
    const px = wx + (rand() - 0.5);
    const pz = wz + (rand() - 0.5);
    dummy.position.set(px, 0.012, pz);
    dummy.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
    const s = 0.8 + rand() * 0.8;
    dummy.scale.set(s, s, 1);
    dummy.updateMatrix();
    puddles.setMatrixAt(i, dummy.matrix);
    puddleList.push({ x: px, z: pz, r: 0.62 * s });
  }
  puddles.instanceMatrix.needsUpdate = true;
  puddles.renderOrder = 2;
  scene.add(puddles);

  // --- tramos rectos de pasillo (para tuberías y cables) ---
  const runs = [];
  for (let y = 1; y < H - 1; y++) {
    let x = 1;
    while (x < W - 1) {
      if (grid[y][x] === FLOOR) {
        let x2 = x;
        while (x2 < W - 1 && grid[y][x2] === FLOOR) x2++;
        runs.push({ axis: 'x', a: x, b: y, len: x2 - x });
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
        runs.push({ axis: 'z', a: y, b: x, len: y2 - y });
        y = y2;
      } else y++;
    }
  }

  // --- tuberías oxidadas: parte constante de la ambientación ---
  const pipeRuns = runs.filter((r) => r.len >= P.pipes.minRun && rand() < P.pipes.chance);
  pipeRuns.length = Math.min(pipeRuns.length, P.pipes.max);

  if (pipeRuns.length) {
    const pipeGeo = new THREE.CylinderGeometry(P.pipes.radius, P.pipes.radius, 1, 10);
    const pipes = new THREE.InstancedMesh(pipeGeo, rustMat, pipeRuns.length);
    pipeRuns.forEach((r, i) => {
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

  // --- cables colgando del techo (algunos cuelgan sueltos, como arrancados) ---
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 });
  const cableRuns = runs.filter((r) => r.len >= 2);
  for (let i = 0; i < P.cables.count && cableRuns.length; i++) {
    const r = cableRuns[(rand() * cableRuns.length) | 0];
    const i0 = (rand() * (r.len - 1)) | 0;
    const span = Math.min(1 + ((rand() * 2) | 0), r.len - 1 - i0) || 1;
    const tw = (off) => (r.axis === 'x' ? tileToWorld(r.a + off, r.b) : tileToWorld(r.b, r.a + off));
    const [x0, z0] = tw(i0);
    const [x1, z1] = tw(i0 + span);
    const off = (rand() - 0.5) * 1.4;
    const p0 = new THREE.Vector3(x0 + (r.axis === 'z' ? off : 0), wallH - 0.04, z0 + (r.axis === 'x' ? off : 0));
    const p1 = new THREE.Vector3(x1 + (r.axis === 'z' ? off : 0), wallH - 0.04, z1 + (r.axis === 'x' ? off : 0));
    const dangling = rand() < 0.4; // cuelga suelto en vez de cruzar
    if (dangling) {
      p1.set(p0.x + (p1.x - p0.x) * 0.35, 1.2 + rand() * 0.8, p0.z + (p1.z - p0.z) * 0.35);
    }
    const mid = p0.clone().lerp(p1, 0.5);
    mid.y -= dangling ? 0.15 : 0.3 + rand() * 0.35; // comba
    const curve = new THREE.CatmullRomCurve3([p0, mid, p1]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.018, 5), cableMat);
    scene.add(cable);
  }

  // --- cajas de madera: callejones sin salida + dispersas por los pasillos ---
  const crateSpots = [];
  for (const [x, y] of maze.deadEndList) {
    if (isSpecial(x, y)) continue;
    if (rand() >= P.crates.deadEndChance) continue;
    const n = rand() < 0.35 ? 2 : 1;
    for (let i = 0; i < n; i++) crateSpots.push([x, y, false]);
  }
  for (let i = 0; i < P.crates.scattered; i++) {
    const [x, y] = pickFloor();
    if (isSpecial(x, y)) continue;
    crateSpots.push([x, y, true]); // arrimadas a la pared
  }
  if (crateSpots.length) {
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    const crates = new THREE.InstancedMesh(crateGeo, woodMat, crateSpots.length);
    crateSpots.forEach(([x, y, nearWall], i) => {
      const [wx, wz] = tileToWorld(x, y);
      const s = 0.45 + rand() * 0.4;
      let ox = (rand() - 0.5) * 1.2;
      let oz = (rand() - 0.5) * 1.2;
      if (nearWall) {
        const dirs = wallDirs(x, y);
        if (dirs.length) {
          const [dx, dy] = dirs[(rand() * dirs.length) | 0];
          ox = dx * (t / 2 - s / 2 - 0.12) + (rand() - 0.5) * 0.4 * (1 - Math.abs(dx));
          oz = dy * (t / 2 - s / 2 - 0.12) + (rand() - 0.5) * 0.4 * (1 - Math.abs(dy));
        }
      }
      dummy.position.set(wx + ox, s / 2, wz + oz);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      crates.setMatrixAt(i, dummy.matrix);
      crates.setColorAt(i, col.setScalar(0.7 + rand() * 0.4));
    });
    crates.instanceMatrix.needsUpdate = true;
    if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
    crates.castShadow = true;
    crates.receiveShadow = true;
    scene.add(crates);
  }

  // --- barriles metálicos arrimados a las paredes ---
  if (P.barrels.count) {
    const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.92, 12);
    const barrels = new THREE.InstancedMesh(barrelGeo, rustMat, P.barrels.count);
    for (let i = 0; i < P.barrels.count; i++) {
      const [x, y] = pickFloor();
      const dirs = wallDirs(x, y);
      const [wx, wz] = tileToWorld(x, y);
      let ox = rand() - 0.5;
      let oz = rand() - 0.5;
      if (dirs.length) {
        const [dx, dy] = dirs[(rand() * dirs.length) | 0];
        ox = dx * (t / 2 - 0.46) + (rand() - 0.5) * 0.4 * (1 - Math.abs(dx));
        oz = dy * (t / 2 - 0.46) + (rand() - 0.5) * 0.4 * (1 - Math.abs(dy));
      }
      dummy.position.set(wx + ox, 0.46, wz + oz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      barrels.setMatrixAt(i, dummy.matrix);
      barrels.setColorAt(i, col.setScalar(0.35 + rand() * 0.35)); // oscurecidos
    }
    barrels.instanceMatrix.needsUpdate = true;
    if (barrels.instanceColor) barrels.instanceColor.needsUpdate = true;
    barrels.castShadow = true;
    barrels.receiveShadow = true;
    scene.add(barrels);
  }

  // --- tarimas (pallets) recargadas contra las paredes ---
  if (P.pallets.count) {
    const parts = [];
    for (let i = 0; i < 5; i++) { // tablones verticales
      const g = new THREE.BoxGeometry(0.19, 1.15, 0.028);
      g.translate(-0.46 + i * 0.23, 0, 0.03);
      parts.push(g);
    }
    for (const yy of [-0.45, 0, 0.45]) { // travesaños
      const g = new THREE.BoxGeometry(1.12, 0.19, 0.028);
      g.translate(0, yy, 0);
      parts.push(g);
    }
    const palletGeo = mergeGeometries(parts);
    const pallets = new THREE.InstancedMesh(palletGeo, woodMat, P.pallets.count);
    let placed = 0;
    let guard = 0;
    while (placed < P.pallets.count && guard++ < 200) {
      const [x, y] = pickFloor();
      if (isSpecial(x, y)) continue;
      const dirs = wallDirs(x, y);
      if (!dirs.length) continue;
      const [dx, dy] = dirs[(rand() * dirs.length) | 0];
      const [wx, wz] = tileToWorld(x, y);
      dummy.position.set(wx + dx * (t / 2 - 0.22), 0.56, wz + dy * (t / 2 - 0.22));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.lookAt(wx, 0.56, wz);      // el frente mira al pasillo
      dummy.rotateX(-0.24);            // recargada: la parte alta toca el muro
      dummy.rotateZ((rand() - 0.5) * 0.12);
      dummy.updateMatrix();
      pallets.setMatrixAt(placed, dummy.matrix);
      pallets.setColorAt(placed, col.setScalar(0.75 + rand() * 0.45));
      placed++;
    }
    pallets.count = placed;
    pallets.instanceMatrix.needsUpdate = true;
    if (pallets.instanceColor) pallets.instanceColor.needsUpdate = true;
    pallets.castShadow = true;
    pallets.receiveShadow = true;
    scene.add(pallets);
  }

  // --- libros y papeles tirados ---
  if (P.clutter.books) {
    const bookGeo = new THREE.BoxGeometry(0.24, 0.04, 0.17);
    const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const books = new THREE.InstancedMesh(bookGeo, bookMat, P.clutter.books);
    const bookTones = [0x6e6754, 0x4a3527, 0x36414a, 0x5a5148, 0x3d3026];
    for (let i = 0; i < P.clutter.books; i++) {
      const [x, y] = pickFloor();
      const [wx, wz] = tileToWorld(x, y);
      dummy.position.set(wx + (rand() - 0.5) * 1.8, 0.02, wz + (rand() - 0.5) * 1.8);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.8 + rand() * 0.7;
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      books.setMatrixAt(i, dummy.matrix);
      books.setColorAt(i, col.setHex(bookTones[(rand() * bookTones.length) | 0]));
    }
    books.instanceMatrix.needsUpdate = true;
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
    books.castShadow = true;
    scene.add(books);
  }

  // --- ropa sucia tirada, hecha bulto ---
  if (P.clutter.cloth) {
    const clothGeo = new THREE.IcosahedronGeometry(0.3, 1);
    const clothMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const cloth = new THREE.InstancedMesh(clothGeo, clothMat, P.clutter.cloth);
    const clothTones = [0x33302e, 0x2c3038, 0x3a2f2a, 0x283130, 0x3b3437];
    for (let i = 0; i < P.clutter.cloth; i++) {
      const [x, y] = pickFloor();
      const [wx, wz] = tileToWorld(x, y);
      dummy.position.set(wx + (rand() - 0.5) * 1.6, 0.07, wz + (rand() - 0.5) * 1.6);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.7 + rand() * 0.8;
      dummy.scale.set(s, s * 0.28, s * (0.7 + rand() * 0.5)); // aplastada
      dummy.updateMatrix();
      cloth.setMatrixAt(i, dummy.matrix);
      cloth.setColorAt(i, col.setHex(clothTones[(rand() * clothTones.length) | 0]));
    }
    cloth.instanceMatrix.needsUpdate = true;
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
    cloth.castShadow = true;
    scene.add(cloth);
  }

  // --- vidrios rotos: cúmulos de esquirlas que brillan bajo la linterna ---
  if (P.clutter.glassClusters) {
    const shardGeo = new THREE.CircleGeometry(0.05, 3); // triángulo
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fa3ad,
      roughness: 0.08,
      metalness: 0.9,
    });
    const perCluster = 6;
    const shards = new THREE.InstancedMesh(shardGeo, glassMat, P.clutter.glassClusters * perCluster);
    let si = 0;
    for (let cIdx = 0; cIdx < P.clutter.glassClusters; cIdx++) {
      const [x, y] = pickFloor();
      const [wx, wz] = tileToWorld(x, y);
      const cx = wx + (rand() - 0.5) * 1.6;
      const cz = wz + (rand() - 0.5) * 1.6;
      for (let j = 0; j < perCluster; j++) {
        dummy.position.set(cx + (rand() - 0.5) * 0.7, 0.011, cz + (rand() - 0.5) * 0.7);
        dummy.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
        const s = 0.5 + rand() * 1.3;
        dummy.scale.set(s, s, 1);
        dummy.updateMatrix();
        shards.setMatrixAt(si++, dummy.matrix);
      }
    }
    shards.instanceMatrix.needsUpdate = true;
    scene.add(shards);
  }

  // --- focos colgantes: islas de luz enferma repartidas por el laberinto ---
  // Permiten avanzar sin linterna y le dan al lugar su cara macabra.
  // El primero cuelga sobre la entrada: el jugador nunca despierta en negro.
  //
  // Las PointLight no se cuelgan de cada foco: van en un pool de tamaño fijo
  // que se reasigna a los focos más cercanos (ver updateLamps). Dos razones:
  // el coste por fragmento de cada luz dinámica es lo que hunde el frame rate
  // en móvil, y cambiar el NÚMERO de luces visibles obliga a three.js a
  // recompilar los shaders — un tirón cada vez. Con un pool fijo, el conteo
  // nunca cambia. Los focos sin luz asignada conservan la bombilla emisiva,
  // así que a lo lejos se siguen viendo brillar.
  const lamps = [];
  const chosen = [maze.entry];
  const addLamp = (x, y) => {
    const [wx, wz] = tileToWorld(x, y);
    lamps.push({
      x: wx, z: wz, y: wallH - 0.78,
      base: 24 + rand() * 10,
      seed: rand() * 100,
      flicker: 1,
    });
  };
  addLamp(maze.entry[0], maze.entry[1]);

  let guard = 0;
  while (lamps.length < P.lamps.count && guard++ < 500) {
    const [x, y] = pickFloor();
    if (isSpecial(x, y)) continue;
    if (chosen.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < P.lamps.minSepTiles)) continue;
    chosen.push([x, y]);
    addLamp(x, y);
  }

  // Cable + pantalla van instanciados, y las bombillas también: un material
  // por foco significaba doce compilaciones de shader con quince luces cada
  // una, y eso se nota como un tirón largo al arrancar. Así son dos mallas y
  // dos programas para todas las lámparas.
  if (lamps.length) {
    const fixtureGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5).translate(0, wallH - 0.3, 0),
      new THREE.CylinderGeometry(0.035, 0.16, 0.12, 10, 1, true).translate(0, wallH - 0.62, 0),
    ]);
    const fixtures = new THREE.InstancedMesh(fixtureGeo, metalMat, lamps.length);

    // La bombilla no necesita iluminarse: emite. Un material básico sin tone
    // mapping es el shader más barato posible y se lee como filamento.
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, toneMapped: false });
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lamps.length);

    lamps.forEach((l, i) => {
      dummy.position.set(l.x, 0, l.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      fixtures.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, wallH - 0.7, l.z);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
      bulbs.setColorAt(i, col.setScalar(1));
    });
    fixtures.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    scene.add(fixtures, bulbs);
    // updateLamps modula el brillo de cada bombilla por color de instancia
    lamps.bulbs = bulbs;
  }

  const lampPool = [];
  const poolSize = Math.min(lamps.length, quality.maxLampLights);
  for (let i = 0; i < poolSize; i++) {
    const light = new THREE.PointLight(0xffb26a, 0, 10, 2);
    scene.add(light);
    lampPool.push(light);
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
    lampPool,
    exitTrigger: door.position.clone(),
    floors,
    puddles: puddleList,
  };
}

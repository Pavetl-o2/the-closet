// Generación procedural del laberinto. Lógica pura, sin Three.js.
//
// Filosofía (GDD): debe parecer diseñado, no aleatorio.
//   1. Backtracker recursivo → pasillos largos y sinuosos.
//   2. Salas pequeñas → espacios de "respiro" y desorientación.
//   3. Braiding → abre parte de los callejones: loops, atajos, caminos falsos.
//   4. Entrada/salida en los extremos del "diámetro" del laberinto (doble BFS).

import { bfsDistances } from './nav.js';

export const WALL = 1;
export const FLOOR = 0;

// Callejones sin salida: piso con exactamente un vecino ortogonal abierto.
export function deadEnds(grid) {
  const H = grid.length, W = grid[0].length;
  const list = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== FLOOR) continue;
      let open = 0;
      if (grid[y][x + 1] === FLOOR) open++;
      if (grid[y][x - 1] === FLOOR) open++;
      if (grid[y + 1][x] === FLOOR) open++;
      if (grid[y - 1][x] === FLOOR) open++;
      if (open === 1) list.push([x, y]);
    }
  }
  return list;
}

export function generateMaze(mazeCfg, rand) {
  const W = mazeCfg.cellCols * 2 + 1;
  const H = mazeCfg.cellRows * 2 + 1;
  const grid = Array.from({ length: H }, () => new Array(W).fill(WALL));

  // --- 1) Backtracker sobre la retícula de celdas (coordenadas impares) ---
  const stack = [[1, 1]];
  grid[1][1] = FLOOR;
  const JUMPS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = [];
    for (const [dx, dy] of JUMPS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === WALL) {
        options.push([nx, ny, dx, dy]);
      }
    }
    if (!options.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = options[(rand() * options.length) | 0];
    grid[cy + dy / 2][cx + dx / 2] = FLOOR; // abre el muro intermedio
    grid[ny][nx] = FLOOR;
    stack.push([nx, ny]);
  }

  // --- 2) Salas pequeñas ---
  const rooms = [];
  const sizes = mazeCfg.rooms.sizes;
  for (let i = 0; i < mazeCfg.rooms.count; i++) {
    const w = sizes[(rand() * sizes.length) | 0];
    const h = sizes[(rand() * sizes.length) | 0];
    const maxKx = Math.floor((W - 1 - w) / 2);
    const maxKy = Math.floor((H - 1 - h) / 2);
    if (maxKx < 1 || maxKy < 1) continue;
    const x = 1 + 2 * Math.floor(rand() * maxKx); // ancla impar → siempre conecta
    const y = 1 + 2 * Math.floor(rand() * maxKy);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) grid[yy][xx] = FLOOR;
    }
    rooms.push({ x, y, w, h });
  }

  // --- 3) Braiding: abrir parte de los callejones sin salida ---
  for (const [x, y] of deadEnds(grid)) {
    if (rand() > mazeCfg.braidChance) continue;
    const options = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const wx = x + dx, wy = y + dy;       // muro candidato a abrirse
      const fx = x + 2 * dx, fy = y + 2 * dy; // debe haber piso del otro lado
      if (
        fx > 0 && fy > 0 && fx < W - 1 && fy < H - 1 &&
        grid[wy][wx] === WALL && grid[fy][fx] === FLOOR
      ) {
        options.push([wx, wy]);
      }
    }
    if (options.length) {
      const [wx, wy] = options[(rand() * options.length) | 0];
      grid[wy][wx] = FLOOR;
    }
  }

  // --- 4) Entrada y salida ≈ extremos del diámetro (doble BFS) ---
  const first = bfsDistances(grid, [1, 1]);
  const entry = [first.far.x, first.far.y];
  const second = bfsDistances(grid, entry);
  const exit = [second.far.x, second.far.y];

  return {
    grid, W, H,
    entry, exit,
    rooms,
    deadEndList: deadEnds(grid),
    pathLength: second.far.d, // largo del camino mínimo entrada→salida (en tiles)
  };
}

// Utilidades de navegación sobre la grilla del laberinto.
// Lógica pura (sin Three.js): también se usa en los tests de Node.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// BFS de distancias desde `start`. Devuelve el mapa de distancias
// y el tile más lejano alcanzable (útil para entrada/salida).
export function bfsDistances(grid, [sx, sy]) {
  const H = grid.length, W = grid[0].length;
  const dist = new Int32Array(W * H).fill(-1);
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  let head = 0, tail = 0;
  qx[tail] = sx; qy[tail] = sy; tail++;
  dist[sy * W + sx] = 0;
  let far = { x: sx, y: sy, d: 0 };

  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    const d = dist[y * W + x];
    if (d > far.d) far = { x, y, d };
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid[ny][nx] !== 0) continue;
      const idx = ny * W + nx;
      if (dist[idx] !== -1) continue;
      dist[idx] = d + 1;
      qx[tail] = nx; qy[tail] = ny; tail++;
    }
  }
  return { dist, far, W, H };
}

// Camino más corto entre dos tiles (lista de [x, y]) o null si no existe.
export function bfsPath(grid, [sx, sy], [gx, gy]) {
  const H = grid.length, W = grid[0].length;
  if (grid[gy]?.[gx] !== 0 || grid[sy]?.[sx] !== 0) return null;
  const prev = new Int32Array(W * H).fill(-2); // -2 no visitado, -1 inicio
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  let head = 0, tail = 0;
  qx[tail] = sx; qy[tail] = sy; tail++;
  prev[sy * W + sx] = -1;

  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    if (x === gx && y === gy) break;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid[ny][nx] !== 0) continue;
      const idx = ny * W + nx;
      if (prev[idx] !== -2) continue;
      prev[idx] = y * W + x;
      qx[tail] = nx; qy[tail] = ny; tail++;
    }
  }
  if (prev[gy * W + gx] === -2) return null;

  const path = [];
  let cur = gy * W + gx;
  while (cur !== -1) {
    path.push([cur % W, (cur / W) | 0]);
    cur = prev[cur];
  }
  return path.reverse();
}

// Línea de visión por muestreo sobre la grilla.
// Coordenadas en tiles FLOTANTES (parte entera = índice del tile).
export function losClear(grid, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len * 5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(ax + dx * t);
    const y = Math.floor(ay + dy * t);
    if (grid[y]?.[x] !== 0) return false;
  }
  return true;
}

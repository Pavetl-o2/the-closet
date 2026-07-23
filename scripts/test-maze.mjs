// Test del generador procedural (lógica pura, corre en Node).
// Valida sobre 200 semillas:
//   · todos los pisos son alcanzables desde la entrada (laberinto conexo)
//   · la salida existe y el camino mínimo es razonablemente largo
// Uso: npm run test:maze

import { CONFIG } from '../src/config.js';
import { mulberry32 } from '../src/core/rng.js';
import { generateMaze } from '../src/maze/generator.js';
import { bfsDistances, bfsPath } from '../src/maze/nav.js';

const N = 200;
let fails = 0;
let minLen = Infinity, maxLen = 0, sumLen = 0;
let minDead = Infinity, maxDead = 0;

for (let s = 1; s <= N; s++) {
  const rand = mulberry32(s);
  const m = generateMaze(CONFIG.MAZE, rand);
  const { grid, W, H, entry, exit } = m;

  let floorCount = 0;
  for (const row of grid) for (const v of row) if (v === 0) floorCount++;

  const bfs = bfsDistances(grid, entry);
  let reached = 0;
  for (const d of bfs.dist) if (d >= 0) reached++;

  const path = bfsPath(grid, entry, exit);
  const ok = reached === floorCount && path && path.length >= (W + H) / 2;

  if (!ok) {
    fails++;
    console.error(
      `semilla ${s}: conectividad ${reached}/${floorCount}, camino ${path ? path.length : 'null'}`
    );
  }
  if (path) {
    minLen = Math.min(minLen, path.length);
    maxLen = Math.max(maxLen, path.length);
    sumLen += path.length;
  }
  minDead = Math.min(minDead, m.deadEndList.length);
  maxDead = Math.max(maxDead, m.deadEndList.length);
}

console.log(`Semillas probadas: ${N}  (laberinto ${CONFIG.MAZE.cellCols * 2 + 1}×${CONFIG.MAZE.cellRows * 2 + 1})`);
console.log(`Camino entrada→salida (tiles): min ${minLen} · prom ${(sumLen / N).toFixed(1)} · max ${maxLen}`);
console.log(`Callejones sin salida por laberinto: min ${minDead} · max ${maxDead}`);
console.log(fails === 0
  ? 'OK — todos los laberintos son conexos y con salida alcanzable.'
  : `FALLOS: ${fails}`);
process.exit(fails === 0 ? 0 : 1);

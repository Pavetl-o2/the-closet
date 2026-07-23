// THE CLOSET — Fase 1 (MVP jugable)
// Punto de entrada: escena, bucle principal, input y estados de partida.

import * as THREE from 'three';
import './style.css';
import { CONFIG } from './config.js';
import { mulberry32, getSeedFromURL } from './core/rng.js';
import { generateMaze } from './maze/generator.js';
import { bfsDistances } from './maze/nav.js';
import { buildMazeScene } from './maze/builder.js';
import { setupAtmosphere, updateLamps } from './world/atmosphere.js';
import { Player } from './player/player.js';
import { Flashlight } from './flashlight/flashlight.js';
import { Monster, STATES } from './monster/monster.js';
import { ProximityAudio } from './audio/proximity.js';
import { HUD } from './ui/hud.js';

const seed = getSeedFromURL();
const rand = mulberry32(seed);

// ---------- render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.RENDER.maxPixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.RENDER.exposure;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.RENDER.fov, innerWidth / innerHeight, 0.05, 90);

setupAtmosphere(scene, CONFIG);

// ---------- mundo ----------
const maze = generateMaze(CONFIG.MAZE, rand);
const built = buildMazeScene(scene, maze, CONFIG, rand);
const M = built.mazeInfo;

const player = new Player(camera, M, CONFIG.PLAYER, maze.entry);
scene.add(player.rig);

const flashlight = new Flashlight(scene, CONFIG.FLASHLIGHT);

const audio = new ProximityAudio(CONFIG.AUDIO);
const hud = new HUD();
hud.setText('seed-label', `semilla ${seed}`);

// Los monstruos aparecen lejos de la entrada y lejos entre sí
// (nunca de forma injusta).
const distFromEntry = bfsDistances(maze.grid, maze.entry).dist;
const monsters = [];
const spawnTiles = [];
for (let i = 0; i < CONFIG.MONSTER.count; i++) {
  let candidates = [];
  for (let y = 0; y < M.H; y++) {
    for (let x = 0; x < M.W; x++) {
      const d = distFromEntry[y * M.W + x];
      if (d < CONFIG.MONSTER.minSpawnDistTiles) continue;
      if (x === maze.exit[0] && y === maze.exit[1]) continue;
      if (spawnTiles.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < CONFIG.MONSTER.minSeparationTiles)) {
        continue;
      }
      candidates.push([x, y]);
    }
  }
  if (!candidates.length) candidates = [maze.exit];
  const tile = candidates[(rand() * candidates.length) | 0];
  spawnTiles.push(tile);
  const mon = new Monster(scene, M, CONFIG.MONSTER, rand, tile, CONFIG.DEBUG);
  mon.onState = (from, to) => {
    if (to === STATES.HUNT) audio.huntSting();
  };
  monsters.push(mon);
}

// Luz de la secuencia de muerte: un fogonazo frío que revela al monstruo
const revealLight = new THREE.PointLight(0xcfd6de, 0, 5, 2);
scene.add(revealLight);

// ---------- estados de partida ----------
let state = 'start'; // start | playing | caught | paused | dead | win
let elapsed = 0;
let lockGraceT = 0; // ignora el clic que capturó el mouse
let deathT = 0;
let killer = null;
let splashCd = 0;
const exitT = built.exitTrigger;

function reloadWithSeed(s) {
  const u = new URL(location.href);
  u.searchParams.set('seed', String(s >>> 0));
  location.href = u.toString();
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function shortestAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function endRun(kind) {
  state = kind;
  player.enabled = false;
  audio.silence();
  revealLight.intensity = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.show(kind); // negro inmediato; el texto llega después (GDD: negro y silencio)
  hud.setText(kind === 'dead' ? 'dead-info' : 'win-info', `semilla ${seed} · ${fmtTime(elapsed)}`);
  setTimeout(
    () => hud.reveal(kind === 'dead' ? 'dead-text' : 'win-text'),
    kind === 'dead' ? 1600 : 900
  );
}

// Captura: antes del negro hay un instante en el que SÍ lo ves —
// se gira tu mirada, él cierra la distancia y un fogonazo lo revela.
function beginDeath(mon) {
  state = 'caught';
  killer = mon;
  deathT = 0;
  player.enabled = false;
  audio.deathSting();
}

// ---------- input / pointer lock ----------
const canvas = renderer.domElement;
const requestLock = () => {
  // Chrome impone ~1.5 s de espera para relockear tras ESC; si el clic
  // llega antes, la promesa se rechaza: se ignora y el usuario reintenta.
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
};

document.getElementById('screen-start').addEventListener('click', () => {
  audio.init();
  requestLock();
});
document.getElementById('screen-pause').addEventListener('click', requestLock);

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    if (state === 'start' || state === 'paused') {
      state = 'playing';
      player.enabled = true;
      hud.hideAll();
      lockGraceT = 0.25;
      audio.resume();
    }
  } else if (state === 'playing') {
    state = 'paused';
    player.enabled = false;
    hud.show('pause');
  }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && state === 'playing') {
    player.onMouseDelta(e.movementX, e.movementY);
  }
});

document.addEventListener('mousedown', (e) => {
  if (
    state === 'playing' &&
    document.pointerLockElement === canvas &&
    lockGraceT <= 0 &&
    e.button === 0
  ) {
    if (flashlight.toggle()) audio.click();
  }
});

document.addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code === 'KeyF') {
    if (flashlight.toggle()) audio.click();
  }
  if (state === 'dead' || state === 'win') {
    if (e.code === 'Enter') reloadWithSeed(seed);
    if (e.code === 'KeyR') reloadWithSeed((Math.random() * 2 ** 32) >>> 0);
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- bucle principal ----------
const clock = new THREE.Clock();
const _camPos = new THREE.Vector3();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    elapsed += dt;
    if (lockGraceT > 0) lockGraceT -= dt;

    player.update(dt);
    flashlight.update(dt, camera);
    for (const mon of monsters) mon.update(dt, player.position, flashlight);
    updateLamps(built.lamps, elapsed);
    audio.update(dt, monsters, player);
    hud.setBattery(flashlight.battery, flashlight.lightLevel);

    // Pisar un charco delata tu posición: los monstruos que lo oyen
    // rastrean tu ubicación unos segundos (ver Monster.hearNoise)
    splashCd -= dt;
    if (player.moving && splashCd <= 0) {
      for (const p of built.puddles) {
        const dx = player.position.x - p.x;
        const dz = player.position.z - p.z;
        if (dx * dx + dz * dz < p.r * p.r) {
          splashCd = CONFIG.PROPS.puddles.splashCooldown;
          audio.splash(player.isRunning);
          for (const mon of monsters) {
            if (mon.distanceToPlayer < CONFIG.MONSTER.hearingRange) mon.hearNoise();
          }
          break;
        }
      }
    }

    const caughtBy = monsters.find((m) => m.hasCaught);
    if (caughtBy) {
      beginDeath(caughtBy);
    } else {
      const dx = player.position.x - exitT.x;
      const dz = player.position.z - exitT.z;
      if (dx * dx + dz * dz < 1.4 * 1.4) endRun('win');
    }
  } else if (state === 'caught') {
    deathT += dt;

    // Girar la mirada hacia él (y levantarla: es más alto que tú)
    const dx = killer.group.position.x - player.position.x;
    const dz = killer.group.position.z - player.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    player.rig.rotation.y += shortestAngle(targetYaw - player.rig.rotation.y) * Math.min(1, 14 * dt);
    player.pitchObj.rotation.x += (0.16 - player.pitchObj.rotation.x) * Math.min(1, 10 * dt);

    killer.approachForKill(player.position, dt);
    flashlight.update(dt, camera);

    // Fogonazo tembloroso que lo revela aunque tu linterna esté apagada
    camera.getWorldPosition(_camPos);
    revealLight.position.copy(_camPos);
    revealLight.intensity = Math.min(1, deathT / 0.12) * 30 * (Math.random() < 0.14 ? 0.35 : 1);

    // Sacudida de cámara mientras lo tienes encima
    camera.position.x = (Math.random() - 0.5) * 0.02;
    camera.position.y = (Math.random() - 0.5) * 0.02;

    if (deathT >= 0.9) endRun('dead'); // corte a negro y silencio (GDD)
  }

  renderer.render(scene, camera);
}

loop();

// Acceso de depuración (?debug en la URL): inspección desde consola
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { scene, camera, player, flashlight, monsters, built, maze, CONFIG };
}

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
import { Monster } from './monster/monster.js';
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

// El monstruo aparece lejos de la entrada (nunca de forma injusta)
const distFromEntry = bfsDistances(maze.grid, maze.entry).dist;
const spawnCandidates = [];
for (let y = 0; y < M.H; y++) {
  for (let x = 0; x < M.W; x++) {
    const d = distFromEntry[y * M.W + x];
    if (d >= CONFIG.MONSTER.minSpawnDistTiles && !(x === maze.exit[0] && y === maze.exit[1])) {
      spawnCandidates.push([x, y]);
    }
  }
}
const mSpawn = spawnCandidates.length
  ? spawnCandidates[(rand() * spawnCandidates.length) | 0]
  : maze.exit;
const monster = new Monster(scene, M, CONFIG.MONSTER, rand, mSpawn, CONFIG.DEBUG);

const audio = new ProximityAudio(CONFIG.AUDIO);
const hud = new HUD();
hud.setText('seed-label', `semilla ${seed}`);

// ---------- estados de partida ----------
let state = 'start'; // start | playing | paused | dead | win
let elapsed = 0;
let lockGraceT = 0; // ignora el clic que capturó el mouse
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

function endRun(kind) {
  state = kind;
  player.enabled = false;
  audio.silence();
  if (document.pointerLockElement) document.exitPointerLock();
  hud.show(kind); // negro inmediato; el texto llega después (GDD: negro y silencio)
  hud.setText(kind === 'dead' ? 'dead-info' : 'win-info', `semilla ${seed} · ${fmtTime(elapsed)}`);
  setTimeout(
    () => hud.reveal(kind === 'dead' ? 'dead-text' : 'win-text'),
    kind === 'dead' ? 1600 : 900
  );
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

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    elapsed += dt;
    if (lockGraceT > 0) lockGraceT -= dt;

    player.update(dt);
    flashlight.update(dt, camera);
    monster.update(dt, player.position, flashlight);
    updateLamps(built.lamps, elapsed);
    audio.update(dt, monster, player);
    hud.setBattery(flashlight.battery, flashlight.lightLevel);

    if (monster.hasCaught) {
      endRun('dead');
    } else {
      const dx = player.position.x - exitT.x;
      const dz = player.position.z - exitT.z;
      if (dx * dx + dz * dz < 1.4 * 1.4) endRun('win');
    }
  }

  renderer.render(scene, camera);
}

loop();

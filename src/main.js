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
import { loadMonsterModel } from './monster/model.js';
import { AudioEngine } from './audio/engine.js';
import { Soundscape } from './audio/soundscape.js';
import { HUD } from './ui/hud.js';
import { detectDevice, AdaptiveResolution } from './core/device.js';
import { TouchControls } from './input/touch.js';
import { installVertexSnap, PSXPipeline } from './render/psx.js';
import { Ripples } from './world/ripples.js';

const seed = getSeedFromURL();
const rand = mulberry32(seed);

// Escritorio y táctil comparten todo el juego; solo cambian el perfil de
// calidad y la capa de entrada (ver core/device.js).
const { touch: isTouch, profile } = detectDevice();
document.body.classList.toggle('touch', isTouch);

// Estética PS1 (render/psx.js). El anclaje de vértices se instala antes de
// que se compile ningún material. ?psx=0 en la URL vuelve al render limpio.
const PSX = CONFIG.RENDER.psx.enabled && new URLSearchParams(location.search).get('psx') !== '0';
if (PSX) installVertexSnap();
document.body.classList.toggle('psx', PSX); // la viñeta la pone la pasada PS1

// ---------- render ----------
const renderer = new THREE.WebGLRenderer({
  antialias: PSX ? false : profile.antialias, // la PS1 no tenía antialias
  powerPreference: 'high-performance',
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, profile.maxPixelRatio));
renderer.shadowMap.enabled = profile.shadows;
renderer.shadowMap.type = profile.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.RENDER.exposure;
document.getElementById('app').appendChild(renderer.domElement);

// A 240 líneas el coste de píxel es irrisorio: la resolución adaptativa
// sobra (y pelearía con la escala entera de la pasada PS1).
const psx = PSX ? new PSXPipeline(renderer, CONFIG.RENDER.psx, CONFIG.RENDER.exposure) : null;
const adaptive = new AdaptiveResolution(renderer, PSX ? { adaptiveResolution: false } : profile);
if (psx) psx.resize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  CONFIG.RENDER.fov, innerWidth / innerHeight, 0.05, profile.drawDistance
);

// El FOV de three.js es el vertical. En una pantalla muy panorámica (un
// teléfono en horizontal ronda 2.2:1) eso dispara el horizontal hasta el ojo
// de pez, así que en táctil se acota el horizontal y el vertical se deduce.
// En escritorio `maxHorizontalFov` es 0 y el FOV queda tal cual estaba.
function applyAspect() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  let fov = CONFIG.RENDER.fov;
  if (profile.maxHorizontalFov) {
    const hMax = THREE.MathUtils.degToRad(profile.maxHorizontalFov);
    const vFromH = 2 * Math.atan(Math.tan(hMax / 2) / aspect);
    fov = Math.min(fov, THREE.MathUtils.radToDeg(vFromH));
  }
  camera.fov = fov;
  player?.setBaseFov(fov);
  camera.updateProjectionMatrix();
}

setupAtmosphere(scene, CONFIG);

// ---------- mundo ----------
const maze = generateMaze(CONFIG.MAZE, rand);
const built = buildMazeScene(scene, maze, CONFIG, rand, profile);
const M = built.mazeInfo;

const player = new Player(camera, M, CONFIG.PLAYER, maze.entry);
scene.add(player.rig);
applyAspect();

const flashlight = new Flashlight(scene, CONFIG.FLASHLIGHT, profile);

const audio = new Soundscape(new AudioEngine(CONFIG.AUDIO, profile), CONFIG.AUDIO);
audio.setWorld(M, built);
// Cada gota que suena en un charco deja su onda en el agua
const ripples = new Ripples(scene);
audio.onDrip = (x, z) => ripples.spawn(x, z);
const hud = new HUD();
hud.setText('seed-label', `semilla ${seed}`);

// Los monstruos aparecen lejos de la entrada y lejos entre sí
// (nunca de forma injusta). El modelo se carga aparte; hasta que llegue no
// se deja empezar la partida, para que nadie camine por un laberinto vacío.
const distFromEntry = bfsDistances(maze.grid, maze.entry).dist;
const monsters = [];
let monstersReady = false;

function spawnMonsters(proto) {
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
    const mon = new Monster(scene, M, CONFIG.MONSTER, rand, tile, CONFIG.DEBUG, proto);
    const index = monsters.length;
    mon.onState = (from, to) => {
      if (to === STATES.HUNT) audio.huntSting(mon, index); // alarido + estridencia
    };
    monsters.push(mon);
  }
  monstersReady = true;
  hud.setText('start-hint', isTouch ? 'TOCA PARA ENTRAR' : 'PULSA PARA ENTRAR');
  document.getElementById('start-hint').classList.add('blink');
}

loadMonsterModel(profile).then(spawnMonsters).catch((err) => {
  console.error('no se pudo cargar el modelo del monstruo', err);
  spawnMonsters(null); // sin cuerpo visible, pero el laberinto sigue jugable
});

// Luz de la secuencia de muerte: un fogonazo frío que revela al monstruo
const revealLight = new THREE.PointLight(0xcfd6de, 0, 5, 2);
scene.add(revealLight);

// Primer reparto de luces, para que el mundo ya esté iluminado en el frame
// inicial (el pool arranca a intensidad 0).
updateLamps(built.lamps, built.lampPool, 0, player.position);

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
  touchControls?.setVisible(false);
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
  touchControls?.setVisible(false); // que nada tape el último plano
  audio.deathSting(mon, monsters.indexOf(mon));
}

// ---------- transiciones de estado (comunes a ratón y dedo) ----------
let firstStart = true;

function startPlaying() {
  if (state !== 'start' && state !== 'paused') return;
  state = 'playing';
  player.enabled = true;
  hud.hideAll();
  lockGraceT = 0.25;
  audio.resume();
  audio.muffle(false);
  touchControls?.setVisible(true);
  if (firstStart) {
    // "La puerta se cerró detrás de ti": se oye, a tu espalda, al empezar
    firstStart = false;
    const yaw = player.rig.rotation.y;
    audio.doorSlam(
      player.position.x + Math.sin(yaw) * 1.2,
      player.position.z + Math.cos(yaw) * 1.2,
      0.7
    );
  }
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  player.enabled = false;
  touchControls?.setVisible(false);
  audio.muffle(true); // el laberinto sigue ahí, tras una pared
  hud.show('pause');
}

function toggleLight() {
  if (state === 'playing' && flashlight.toggle()) audio.click(flashlight.on, flashlight.battery);
}

// ---------- input ----------
const canvas = renderer.domElement;
let touchControls = null;

if (isTouch) {
  // ---- móvil: joystick + arrastre, sin pointer lock ----
  touchControls = new TouchControls(CONFIG.PLAYER, {
    onLight: toggleLight,
    onPause: pauseGame,
  });
  player.touch = touchControls;

  // Pantalla completa y horizontal: el gesto de entrada es la única
  // oportunidad de pedirlas, y sin ellas la barra del navegador se come
  // media pantalla en horizontal.
  const goImmersive = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      await screen.orientation?.lock?.('landscape');
    } catch { /* el navegador puede negarse; el juego funciona igual */ }
  };

  const isPortrait = () => innerHeight > innerWidth;
  const rotateScreen = document.getElementById('screen-rotate');

  const checkOrientation = () => {
    const portrait = isPortrait();
    rotateScreen.classList.toggle('hidden', !portrait);
    if (portrait) pauseGame();
  };

  const tapToPlay = () => {
    if (!monstersReady || isPortrait()) return;
    audio.init();
    goImmersive();
    startPlaying();
  };
  document.getElementById('screen-start').addEventListener('click', tapToPlay);
  document.getElementById('screen-pause').addEventListener('click', tapToPlay);

  addEventListener('orientationchange', () => setTimeout(checkOrientation, 120));
  checkOrientation();

  // Al pasar la app a segundo plano, pausa: nadie quiere volver muerto.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  // En las pantallas de final no hay teclado: un toque genera otro laberinto.
  // Solo se acepta una vez revelado el texto, para que el dedo que venía
  // arrastrando en el momento de morir no reinicie la partida sin querer.
  for (const [screen, text] of [['screen-dead', 'dead-text'], ['screen-win', 'win-text']]) {
    document.getElementById(screen).addEventListener('click', () => {
      const revealed = !document.getElementById(text).classList.contains('hidden');
      if (revealed && (state === 'dead' || state === 'win')) {
        reloadWithSeed((Math.random() * 2 ** 32) >>> 0);
      }
    });
  }
  for (const id of ['dead-again', 'win-again']) {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopPropagation();
      reloadWithSeed(seed);
    });
  }
} else {
  // ---- escritorio: pointer lock, exactamente como antes ----
  const requestLock = () => {
    // Chrome impone ~1.5 s de espera para relockear tras ESC; si el clic
    // llega antes, la promesa se rechaza: se ignora y el usuario reintenta.
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  document.getElementById('screen-start').addEventListener('click', () => {
    if (!monstersReady) return; // el laberinto no se abre vacío
    audio.init();
    requestLock();
  });
  document.getElementById('screen-pause').addEventListener('click', requestLock);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) startPlaying();
    else pauseGame();
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
      toggleLight();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code === 'KeyF') toggleLight();
  if (state === 'dead' || state === 'win') {
    if (e.code === 'Enter') reloadWithSeed(seed);
    if (e.code === 'KeyR') reloadWithSeed((Math.random() * 2 ** 32) >>> 0);
  }
});

addEventListener('resize', () => {
  applyAspect();
  if (psx) psx.resize(innerWidth, innerHeight);
  else renderer.setSize(innerWidth, innerHeight);
});

// ---------- bucle principal ----------
const clock = new THREE.Clock();
const _camPos = new THREE.Vector3();
let clockTotal = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  adaptive.update(dt);

  if (state === 'playing') {
    elapsed += dt;
    if (lockGraceT > 0) lockGraceT -= dt;

    if (touchControls) {
      const [lx, ly] = touchControls.consumeLook();
      if (lx || ly) player.onMouseDelta(lx, ly, CONFIG.PLAYER.touchLookSensitivity);
    }

    player.update(dt);
    flashlight.update(dt, camera);
    for (const mon of monsters) mon.update(dt, player.position, flashlight, player);
    updateLamps(built.lamps, built.lampPool, elapsed, player.position);
    audio.update(dt, { monsters, player, camera, flashlight });
    ripples.update(dt);
    hud.setBattery(flashlight.battery, flashlight.lightLevel);

    // El miedo también se ve: la imagen se ensucia, los bordes se cierran y
    // late en rojo con tu corazón. Y con algo encima, la mano tiembla.
    if (psx) {
      psx.uniforms.uDanger.value = audio.danger;
      psx.uniforms.uPulse.value = audio.pulse;
    }
    const shake = Math.max(0, audio.danger - 0.55) * 0.012;
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }

    // Lo que suena y lo que te delata son ahora la misma cosa: el sistema de
    // pasos decide cuánto ruido has hecho según lo que pisas (chapotear y
    // partir vidrios cuestan), y los monstruos que estén a rango lo oyen.
    splashCd -= dt;
    if (audio.stepNoise > 0.5 && splashCd <= 0) {
      splashCd = CONFIG.PROPS.puddles.splashCooldown;
      for (const mon of monsters) {
        if (mon.distanceToPlayer < CONFIG.MONSTER.hearingRange) mon.hearNoise();
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
    if (psx) {
      psx.uniforms.uDanger.value = 1;
      psx.uniforms.uPulse.value = Math.random();
    }

    // Fogonazo tembloroso que lo revela aunque tu linterna esté apagada
    camera.getWorldPosition(_camPos);
    revealLight.position.copy(_camPos);
    revealLight.intensity = Math.min(1, deathT / 0.12) * 16 * (Math.random() < 0.14 ? 0.35 : 1);

    // Sacudida de cámara mientras lo tienes encima
    camera.position.x = (Math.random() - 0.5) * 0.02;
    camera.position.y = (Math.random() - 0.5) * 0.02;

    if (deathT >= 0.9) endRun('dead'); // corte a negro y silencio (GDD)
  }

  clockTotal += dt;
  if (psx) psx.render(scene, camera, clockTotal);
  else renderer.render(scene, camera);
}

loop();

// Acceso de depuración (?debug en la URL): inspección desde consola
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    scene, camera, renderer, player, flashlight, monsters, built, maze,
    CONFIG, profile, adaptive, isTouch, audio, psx, ripples,
  };
  import('./audio/voice.js').then((m) => { window.__voice = m; });
}

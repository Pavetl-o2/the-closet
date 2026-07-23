// ============================================================
// THE CLOSET — Configuración global (Fase 1)
// Todos los valores ajustables del juego viven aquí.
// ============================================================

export const CONFIG = {
  DEBUG: false, // true → logs de los cambios de estado de la IA en consola

  MAZE: {
    cellCols: 10,      // celdas lógicas; la grilla de tiles queda de cellCols*2+1
    cellRows: 10,      // 10x10 celdas → laberinto de 21x21 tiles (63 m por lado)
    tile: 3,           // metros por tile (ancho de pasillo)
    wallHeight: 3.2,
    braidChance: 0.45, // prob. de abrir un callejón sin salida → loops y atajos
    rooms: { count: 4, sizes: [3, 5] }, // salas pequeñas (lado en tiles, impar)
  },

  RENDER: {
    fov: 70,
    exposure: 1.25,    // súbelo si tu pantalla es muy oscura
    fogColor: 0x04050a,
    fogDensity: 0.052, // más alto = menos visibilidad
    maxPixelRatio: 1.75,
  },

  PLAYER: {
    eyeHeight: 1.65,
    radius: 0.35,
    walkSpeed: 3.1,
    runSpeed: 5.4,
    accel: 11,             // respuesta del movimiento (más alto = más seco)
    lookSensitivity: 0.0023,
    bobAmp: 0.035,         // vaivén de cámara al caminar
    bobFreq: 6.0,
    runFovKick: 5,         // grados extra de FOV al correr
  },

  FLASHLIGHT: {
    color: 0xffe9c4,
    intensity: 300,
    distance: 26,
    angle: 0.48,
    penumbra: 0.65,
    decay: 1.7,
    swayResponse: 7,       // qué tan rápido sigue la mirada (menos = más lag de mano)
    batterySeconds: 420,   // segundos totales de luz encendida (7 min)
    // Estados de batería (GDD): umbral inferior → multiplicadores
    tiers: [
      { min: 0.75, intensity: 1.0,  range: 1.0,  angle: 1.0 },
      { min: 0.5,  intensity: 0.85, range: 0.9,  angle: 1.0 },
      { min: 0.25, intensity: 0.6,  range: 0.75, angle: 0.92 },
      { min: 0.1,  intensity: 0.4,  range: 0.55, angle: 0.85 },
      { min: 0.0,  intensity: 0.26, range: 0.45, angle: 0.8, flicker: true },
    ],
  },

  MONSTER: {
    patrolSpeed: 1.7,
    investigateSpeed: 2.7,
    huntSpeed: 5.9,          // algo más rápido que correr: escapar = romper línea de visión
    catchDistance: 1.15,
    closeSense: 3.2,         // te "siente" a corta distancia aunque no haya luz
    instantHuntDist: 8,      // luz directa + línea de visión a esta distancia → cacería
    lightVisionRange: 24,    // distancia máx. a la que ve tu luz con línea de visión
    lightLeakRange: 14,      // resplandor que "dobla esquinas" (sin línea de visión)
    awarenessInvestigate: 1.0,
    awarenessHunt: 2.2,
    awarenessDecay: 0.28,    // qué tan rápido se le olvida la señal con la luz apagada
    repathInterval: 0.4,
    loseSightSeconds: 3.5,   // cacería sin señal antes de pasar a búsqueda
    searchWaypoints: 3,
    searchRadiusTiles: 4,
    patrolBiasNearPlayer: 0.5, // prob. de que una patrulla caiga "cerca" del jugador.
                               // 0 = patrulla 100% aleatoria (nunca conoce tu posición;
                               // el sesgo solo mantiene vivos los encuentros).
    patrolBiasRadiusTiles: 12,
    minSpawnDistTiles: 14,   // distancia mínima de aparición respecto a la entrada
  },

  AUDIO: {
    enabled: true,      // adelanto mínimo de Fase 2: pasos del monstruo, por fairness
    maxDistance: 18,    // metros a partir de los cuales ya no se escucha nada
    masterVolume: 0.5,
  },

  PROPS: {
    pipes:   { chance: 0.5, minRun: 4, max: 36, height: 2.55, radius: 0.075 },
    puddles: { count: 14 },
    crates:  { deadEndChance: 0.45 },
    lamps:   { count: 3 },
  },
};

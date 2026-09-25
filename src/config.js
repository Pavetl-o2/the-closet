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
    coveRadius: 0.55,  // unión curva muro-techo: el aspecto de túnel de la referencia
  },

  RENDER: {
    fov: 70,
    exposure: 1.2,     // súbelo si tu pantalla es muy oscura
    fogColor: 0x040404,
    fogDensity: 0.05,  // más alto = menos visibilidad
    // Luz base: siluetas navegables, nunca claridad. El número es grande
    // porque la luz hemisférica de three.js se divide entre π en el BRDF y el
    // cemento apenas refleja; con 0.85 la vista sin linterna era negro puro.
    ambientIntensity: 30,
    hemiSky: 0x3a3a37,      // luz base neutra, como la referencia (antes azulada)
    hemiGround: 0x0e0d0b,

    // Estética PlayStation 1 (ver render/psx.js). enabled: false vuelve al
    // render a resolución completa de antes.
    psx: {
      enabled: true,
      height: 240,        // líneas de resolución interna (la PS1 usaba 240)
      colorBits: 5,       // bits por canal: 5 = color de 15 bits
      grain: 0.045,       // grano de película
      saturation: 0.62,   // la referencia es casi monocroma
      tint: 0xf2eee0,     // ligero tono sucio, cálido
      snap: 1.0,          // rejilla de vértices; < 1 = más temblor
    },
  },

  // Perfiles de calidad. El de escritorio es el original: nada cambia ahí.
  // El táctil recorta lo que de verdad cuesta en un GPU de móvil — número de
  // luces dinámicas, resolución del mapa de sombras, tamaño de texturas — y
  // deja que la resolución se ajuste sola según el frame time.
  QUALITY: {
    desktop: {
      antialias: true,
      maxPixelRatio: 1.75,
      minPixelRatio: 1.75,    // fijo: sin resolución adaptativa
      adaptiveResolution: false,
      shadows: true,
      shadowMapSize: 1024,
      softShadows: true,
      maxLampLights: 999,     // todas las lámparas iluminan
      drawDistance: 90,
      monsterTextureSize: 0,  // 0 = se deja como viene en el GLB
      maxHorizontalFov: 0,    // 0 = sin corrección (el FOV vertical manda)
      audioVoices: 24,        // voces espaciales simultáneas
      hrtf: true,             // HRTF es lo que distingue delante de detrás
      reverb: true,
    },
    touch: {
      antialias: false,       // la resolución adaptativa da mejor rendimiento
      maxPixelRatio: 1.3,
      minPixelRatio: 0.6,
      adaptiveResolution: true,
      shadows: true,          // la sombra del haz es media atmósfera del juego
      shadowMapSize: 512,
      softShadows: false,
      maxLampLights: 4,       // las lejanas conservan el foco encendido, sin luz
      drawDistance: 55,
      monsterTextureSize: 1024, // el GLB trae 4096² = 67 MB de VRAM
      // Un teléfono en horizontal es tan panorámico (~2.2:1) que con 70° de
      // FOV vertical el horizontal se va a 113° y el pasillo se ve en ojo de
      // pez. Se acota el horizontal y el vertical se deduce.
      maxHorizontalFov: 100,
      // El HRTF se mantiene en móvil: es justo lo que da la información que
      // salva la vida. Lo que se recorta es cuántas voces suenan a la vez.
      audioVoices: 12,
      hrtf: true,
      reverb: true,
    },
  },

  PLAYER: {
    eyeHeight: 1.65,
    radius: 0.35,
    walkSpeed: 3.1,
    runSpeed: 5.4,
    accel: 11,             // respuesta del movimiento (más alto = más seco)
    lookSensitivity: 0.0023,
    touchLookSensitivity: 0.0042, // el dedo recorre menos que el ratón
    touchStickRadius: 66,  // px hasta el tope del joystick virtual
    touchRunAt: 0.88,      // fracción del recorrido a partir de la cual corre
    bobAmp: 0.035,         // vaivén de cámara al caminar
    // Metros por paso. Fija a la vez la cadencia del vaivén de cámara y la de
    // los pasos que se oyen, porque salen de la misma fase. 1.05 reproduce el
    // ritmo de vaivén que tenía el juego antes de que los pasos sonaran.
    strideWalk: 1.05,
    strideRun: 1.5,
    runFovKick: 5,         // grados extra de FOV al correr
  },

  FLASHLIGHT: {
    color: 0xffe9c4,
    intensity: 210,
    distance: 26,
    angle: 0.62,           // cono amplio: ilumina el pasillo, no un túnel
    penumbra: 0.85,        // borde muy suave → el halo se funde con la oscuridad
    decay: 2.0,            // caída física: no quema lo que tienes al lado
    spill: { intensity: 16, distance: 8 }, // rebote suave alrededor del jugador
    swayResponse: 7,       // qué tan rápido sigue la mirada (menos = más lag de mano)
    // Dónde la llevas: agarre en coordenadas de cámara (m; x derecha, y arriba,
    // z hacia atrás) y distancia del punto al que apunta, sobre tu mirada.
    hold: { x: 0.16, y: -0.15, z: -0.27 },
    aimDistance: 12,
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
    count: 2,                // más de uno: los encuentros dejan de ser raros
    height: 2.05,            // metros: más alto que el jugador (1.65 de ojos)
    patrolSpeed: 1.7,
    investigateSpeed: 2.7,
    // El dilema central: con la luz encendida la cacería es imposible de
    // correr; con la luz apagada es más lento que tú y pierde interés.
    huntSpeedLit: 6.1,       // > runSpeed → con luz, correr no basta
    huntSpeedDark: 3.4,      // < runSpeed → a oscuras puedes escapar
    catchDistance: 1.15,     // cazando: alcance de sus brazos
    bumpDistance: 0.75,      // sin saber que estás: solo si choca contigo
    closeSense: 3.2,         // con tu luz encendida te "siente" a esta distancia
    instantHuntDist: 8,      // luz directa + línea de visión a esta distancia → cacería
    lightVisionRange: 24,    // distancia máx. a la que ve tu luz con línea de visión
    lightLeakRange: 14,      // resplandor que "dobla esquinas" (sin línea de visión)
    awarenessInvestigate: 1.0,
    awarenessHunt: 2.2,
    awarenessDecay: 0.28,    // olvido de la señal con la luz encendida pero sin verla
    awarenessDecayDark: 0.8, // con la luz apagada te olvida mucho más rápido
    repathInterval: 0.4,
    loseSightSeconds: 3.5,   // cacería sin señal antes de pasar a búsqueda (luz on)
    loseSightSecondsDark: 1.6, // apagar la luz corta la cacería mucho antes
    // Apagar la luz te esconde: tras darkDropSeconds a oscuras deja de
    // perseguirte, salvo que te perciba por lo cerca que estás o el ruido.
    darkDropSeconds: 0.4,
    darkListenSeconds: 1.8,  // al perderte se queda quieto escuchando
    darkSenseStill: 1.0,     // a oscuras y quieto: casi tiene que tocarte
    darkSenseMove: 2.4,      // andando a oscuras (con línea de visión)
    darkSenseRun: 5,         // corriendo te oye, aunque haya una esquina
    searchWaypoints: 3,
    searchRadiusTiles: 4,
    hearingRange: 15,        // metros a los que oye un chapoteo en un charco
    noiseTrackSeconds: 4.5,  // tiempo que rastrea tu posición tras oírte
    patrolBiasNearPlayer: 0.5, // prob. de que una patrulla caiga "cerca" del jugador.
                               // 0 = patrulla 100% aleatoria (nunca conoce tu posición;
                               // el sesgo solo mantiene vivos los encuentros).
    patrolBiasRadiusTiles: 12,
    minSpawnDistTiles: 14,   // distancia mínima de aparición respecto a la entrada
    minSeparationTiles: 10,  // distancia mínima entre monstruos al aparecer
  },

  AUDIO: {
    enabled: true,
    maxDistance: 22,      // metros a partir de los cuales ya no se escucha nada
    masterVolume: 0.5,
    refDistance: 1.6,     // distancia a la que el sonido suena a volumen pleno
    rolloff: 1.15,        // cuán rápido cae con la distancia (modelo inverso)
    reverbLevel: 0.5,     // cuánto pasillo se oye rebotar
    droneMaxDistance: 14, // presencia: zumbido grave cuando un monstruo se acerca
    breathDistance: 6,    // respiración del monstruo audible a esta distancia
    ambient: true,        // goteras y crujidos desde casillas reales

    // --- tu propio cuerpo ---
    stepVolume: 0.16,     // tus pasos; correr multiplica
    breathRest: 4.6,      // segundos entre respiraciones, quieto y a salvo
    breathWalk: 3.2,
    breathRun: 1.15,      // corriendo jadeas
    breathFearDistance: 9, // a partir de aquí el miedo te acelera la respiración
    holdBreathDistance: 3.6, // si algo está más cerca y no te mueves, la contienes
    holdBreathMax: 7,     // segundos que aguantas antes de soltarla de golpe
    flashlightHum: 0.05,  // zumbido de la linterna encendida
  },

  PROPS: {
    // Pegada al muro, bajo la moldura curva, como la de la referencia
    pipes:   { chance: 0.85, minRun: 3, max: 70, height: 2.48, radius: 0.09, wallGap: 0.2 },
    puddles: { count: 16, splashCooldown: 1.4 },
    crates:  { deadEndChance: 0.6, scattered: 10 },
    // Focos colgantes: islas de luz. Luz pálida, más cerca del blanco sucio
    // de la referencia que del naranja de antes.
    lamps:   {
      count: 12, minSepTiles: 4,
      color: 0xe8dcc0, bulbColor: 0xfff2d8, range: 10,
    },
    barrels: { count: 10 },
    pallets: { count: 8 },
    cables:  { count: 10 },
    // Cable grueso sujeto al muro, colgando en bucles entre anclajes
    wallCables: { chance: 0.6, height: 2.35, spacing: 2.2, sagMin: 0.22, sagMax: 0.5, radius: 0.03 },
    clutter: { books: 20, cloth: 12, glassClusters: 8, bloodStains: 8, grimeStains: 8 },
  },
};

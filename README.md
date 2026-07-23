# THE CLOSET — Fase 1 (MVP jugable)

Horror psicológico procedural en Three.js. Estás atrapado en un laberinto de corredores viejos y tuberías oxidadas. Solo tienes una linterna. La luz te guía — y también te delata: el monstruo la ve.

Esta carpeta implementa la **Fase 1 del roadmap del GDD**: movimiento, linterna, laberinto procedural, IA básica y salida.

## Arranque rápido

Requisitos: Node 18+.

```bash
npm install
npm run dev        # abre la URL que imprime Vite (desktop, con mouse)
```

Otros comandos:

```bash
npm run build      # genera dist/ (deploy estático: Vercel, Netlify, etc.)
npm run preview    # sirve el build localmente
npm run test:maze  # valida el generador sobre 200 semillas
```

Para desplegar en Vercel basta con importar el repo: detecta Vite automáticamente (`npm run build` → `dist/`).

## Controles

WASD o flechas para moverse, SHIFT para correr, F o clic izquierdo para la linterna, ESC pausa. Al morir o salir: ENTER repite el mismo laberinto, R genera uno nuevo. El juego está pensado para desktop con audífonos; los controles táctiles llegarán en una iteración posterior.

## Semillas

Cada partida es un laberinto distinto. La semilla aparece en la pantalla de inicio y en las de final, y se puede fijar por URL: `http://localhost:5173/?seed=123456`. Misma semilla → mismo laberinto, mismas lámparas, mismo punto de aparición del monstruo. Útil para depurar y para compartir laberintos.

## Arquitectura

| Ruta | Qué hace |
| --- | --- |
| `src/config.js` | **Todos** los valores ajustables del juego, agrupados y comentados. |
| `src/core/rng.js` | RNG determinista (mulberry32) + semilla por URL. |
| `src/maze/generator.js` | Lógica pura: backtracker, salas, braiding, entrada/salida por doble BFS. |
| `src/maze/nav.js` | BFS de distancias y caminos, línea de visión sobre la grilla. |
| `src/maze/builder.js` | Geometría: muros instanciados, piso/techo, tuberías, charcos, cajas, lámparas, puerta de salida. |
| `src/world/textures.js` | Texturas procedurales en canvas (yeso, concreto, plafón, óxido). Sin assets externos. |
| `src/world/atmosphere.js` | Niebla, luz ambiental mínima, parpadeo de lámparas rotas. |
| `src/player/player.js` | FPS: pointer lock, colisión circular contra la grilla, head-bob, FOV al correr. |
| `src/flashlight/flashlight.js` | Spotlight con sway de mano, estados de batería del GDD, parpadeo al 10%. |
| `src/monster/monster.js` | Tipo A: percepción por luz + FSM (IDLE → INVESTIGATE → HUNT → SEARCH). |
| `src/audio/proximity.js` | Adelanto mínimo de Fase 2: pasos del monstruo y clic de linterna (Web Audio sintetizado). |
| `src/ui/hud.js` | Batería + punto de intensidad de luz, y las pantallas de inicio/pausa/final. |
| `scripts/test-maze.mjs` | Test de conectividad y estadísticas del generador. |

## Dónde ajustar qué (`src/config.js`)

Las seis perillas que más cambian la experiencia:

1. `MAZE.cellCols/cellRows` — tamaño del laberinto (10×10 celdas ≈ partidas de 5–10 min).
2. `RENDER.exposure` y `RENDER.fogDensity` — cuánto se ve. Si tu pantalla es muy oscura, sube exposure a 1.4–1.6.
3. `FLASHLIGHT.batterySeconds` — presión de recursos (420 s por defecto; aún no hay pickups).
4. `MONSTER.huntSpeed` vs `PLAYER.runSpeed` — la sensación de las persecuciones.
5. `MONSTER.patrolBiasNearPlayer` — frecuencia de encuentros (0 = patrulla 100% aleatoria).
6. `MONSTER.awarenessInvestigate/awarenessHunt` — cuánta luz "aguanta" antes de reaccionar.

`DEBUG: true` imprime en consola cada cambio de estado de la IA.

## Decisiones de diseño de esta fase

**Interior cerrado, con techo.** La ambientación elegida es de corredores viejos con tuberías; el techo a 3.2 m encierra la luz de la linterna y elimina cualquier referencia de cielo, reforzando la desorientación que pide el GDD.

**La cacería es un poco más rápida que correr** (5.9 vs 5.4 m/s). Si correr bastara para escapar, la linterna dejaría de ser un dilema. Escapar es posible, pero exige apagar la luz, romper línea de visión y girar en las esquinas: el jugador que muere corriendo en línea recta "cometió un error", que es exactamente la sensación que el GDD exige.

**La percepción del monstruo nunca hace trampa.** No conoce tu posición: acumula una señal solo cuando la luz está encendida, más fuerte con línea de visión y más débil como "resplandor" que dobla esquinas. La posición que estima lleva ruido proporcional a la distancia. Existe un sesgo de merodeo (`patrolBiasNearPlayer`) que solo decide *hacia qué zona* patrulla para mantener vivos los encuentros; está documentado y se puede poner en 0.

**La batería ya drena, aunque los pickups lleguen en Fase 2.** Los estados de batería (100/75/50/25/10/0) son la identidad de la linterna según el GDD, así que se implementaron completos: menos intensidad, menos alcance, cono más cerrado, y parpadeo con interferencia por debajo del 10%. Con 7 minutos de luz total, la partida se puede completar sin pickups si la administras.

**Audio mínimo adelantado, por justicia.** El GDD deja el sonido para la Fase 2, pero sin ninguna pista sonora el monstruo podría alcanzarte sin aviso posible, y eso rompe la regla "nunca aparecer de forma injusta". Se adelantó lo mínimo: sus pasos, sintetizados, con volumen por distancia y paneo por dirección. Se apaga con `AUDIO.enabled = false`.

**Muerte y victoria sin espectáculo.** Captura → corte a negro y silencio inmediatos; el texto aparece después. La imaginación hace el resto (GDD).

## Limitaciones conocidas de la Fase 1

Las cajas y tuberías son decorativas y aún no tienen colisión. No hay audio ambiental ni música. No hay pickups de batería ni eventos ambientales (Fase 2). Solo desktop.

## Estado del roadmap

- [x] **Fase 1** — Movimiento · Linterna · Laberinto procedural · IA básica · Salida
- [ ] **Fase 2** — Sonido espacial · Baterías · Eventos ambientales · Mejor IA (estado de Sospecha con evidencia sonora)
- [ ] **Fase 3** — Laberinto dinámico · Linterna consciente · Variantes del monstruo (Tipos A/B/C)
- [ ] **Fase 4** — Optimización · Demo

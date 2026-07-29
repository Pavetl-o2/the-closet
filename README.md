# THE CLOSET — Fase 1 (MVP jugable)

Horror psicológico procedural en Three.js. Estás atrapado en un laberinto de ladrillo viejo, tuberías oxidadas y focos colgantes que parpadean. Solo tienes una linterna. La luz te guía — y también te delata: con ella encendida, lo que te caza es más rápido que tú; apágala y perderá el interés… si logras avanzar entre las islas de luz enferma.

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

Cada partida es un laberinto distinto. La semilla aparece en la pantalla de inicio y en las de final, y se puede fijar por URL: `http://localhost:5173/?seed=123456`. Misma semilla → mismo laberinto, mismos focos, mismos puntos de aparición de los monstruos. Útil para depurar y para compartir laberintos.

## Arquitectura

| Ruta | Qué hace |
| --- | --- |
| `src/config.js` | **Todos** los valores ajustables del juego, agrupados y comentados. |
| `src/core/rng.js` | RNG determinista (mulberry32) + semilla por URL. |
| `src/maze/generator.js` | Lógica pura: backtracker, salas, braiding, entrada/salida por doble BFS. |
| `src/maze/nav.js` | BFS de distancias y caminos, línea de visión sobre la grilla. |
| `src/maze/builder.js` | Geometría: muros instanciados, piso/techo, tuberías, cables, charcos, cajas, tarimas, barriles, libros, ropa, vidrios, manchas, focos colgantes, puerta de salida. |
| `src/world/textures.js` | Texturas procedurales en canvas (ladrillo, concreto, plafón, óxido, madera, charco, manchas). Sin assets externos. |
| `src/world/atmosphere.js` | Niebla, luz ambiental base, parpadeo de los focos colgantes. |
| `src/player/player.js` | FPS: pointer lock, colisión circular contra la grilla, head-bob, FOV al correr. |
| `src/flashlight/flashlight.js` | Spotlight amplio con sway de mano + luz de rebote, estados de batería del GDD, parpadeo al 10%. |
| `src/monster/monster.js` | Tipo A: percepción por luz + oído + FSM (IDLE → INVESTIGATE → HUNT → SEARCH). Velocidad de cacería según tu linterna. |
| `src/monster/model.js` | Carga del GLB, reparación del rig y repesado de la piel. |
| `src/monster/animation.js` | Ciclo de marcha de zombi: cojera, pie arrastrado y piernas por cinemática inversa. |
| `src/assets/monster.glb` | Modelo del monstruo (malla + esqueleto). Único asset externo del proyecto. |
| `src/audio/proximity.js` | Adelanto mínimo de Fase 2: pasos por monstruo, zumbido de presencia, respiración, estridencia de cacería, chapoteos, ambiente lejano (Web Audio sintetizado). |
| `src/ui/hud.js` | Batería + punto de intensidad de luz, y las pantallas de inicio/pausa/final. |
| `scripts/test-maze.mjs` | Test de conectividad y estadísticas del generador. |

## Dónde ajustar qué (`src/config.js`)

Las perillas que más cambian la experiencia:

1. `MAZE.cellCols/cellRows` — tamaño del laberinto (10×10 celdas ≈ partidas de 5–10 min).
2. `RENDER.exposure`, `RENDER.ambientIntensity` y `RENDER.fogDensity` — cuánto se ve. Si tu pantalla es muy oscura, sube exposure a 1.4–1.6.
3. `PROPS.lamps.count` — cuántas islas de luz hay para avanzar sin linterna.
4. `FLASHLIGHT.batterySeconds` — presión de recursos (420 s por defecto; aún no hay pickups).
5. `MONSTER.count` y `MONSTER.height` — cuántas cosas patrullan el laberinto (2) y cuánto miden (2.05 m).
6. `MONSTER.huntSpeedLit/huntSpeedDark` vs `PLAYER.runSpeed` — la sensación de las persecuciones con y sin luz.
7. `MONSTER.patrolBiasNearPlayer` — frecuencia de encuentros (0 = patrulla 100% aleatoria).
8. `MONSTER.awarenessInvestigate/awarenessHunt` — cuánta luz "aguanta" antes de reaccionar.

`?debug` en la URL expone `window.__game` en consola para inspección.

`DEBUG: true` imprime en consola cada cambio de estado de la IA.

## Decisiones de diseño de esta fase

**Interior cerrado, con techo.** La ambientación elegida es de corredores viejos de ladrillo con tuberías; el techo a 3.2 m encierra la luz de la linterna y elimina cualquier referencia de cielo, reforzando la desorientación que pide el GDD.

**Focos colgantes: la oscuridad tiene islas.** Repartidos por el laberinto hay focos que parpadean y a veces se apagan. Cumplen dos funciones: le dan al lugar su cara macabra (nunca es negro total: siempre hay algo a medio ver) y hacen viable avanzar con la linterna apagada, que es la mitad del dilema central. Sin ellos, apagar la luz no sería una opción sino un suicidio.

**El dilema de la luz es asimétrico.** Con la linterna encendida, la cacería es más rápida que correr (6.1 vs 5.4 m/s): huir en línea recta con la luz prendida es morir. Con la linterna apagada el monstruo es más lento que tú (3.4 m/s), pierde el rastro pronto y su atención se apaga en un par de segundos. La decisión de apagar es siempre correcta para escapar — pero te deja medio ciego entre foco y foco. El jugador que muere "cometió un error", exactamente la sensación que el GDD exige.

**Hay dos monstruos.** Aparecen lejos de la entrada y lejos entre sí. Con uno solo, la mayor parte de la partida transcurría sin encuentros; con dos, los pasos lejanos y las siluetas al fondo de un pasillo son parte constante del recorrido sin volverse injustos.

**El rig del modelo venía roto y hubo que repararlo en carga** (`src/monster/model.js`). El GLB traía dos defectos que lo hacían inanimable, y los dos se corrigen al vuelo, sin tocar el archivo:

1. *Esqueleto aplanado.* Todos los nodos tenían transform identidad y la pose de reposo solo existía dentro de las *inverse bind matrices*. Cargado tal cual, cada hueso deformaba desde el origen y la malla se despedazaba. Se reconstruye la pose repartiendo `IBM⁻¹` por la jerarquía como transforms locales.
2. *Esqueleto girado 90° respecto a la malla.* Verificado comparando cada hueso con el centroide ponderado de los vértices que controla: la rotación `−90°` en Y da un error medio de 0.075 frente a 0.19+ de cualquier otra, y deja el tobillo justo detrás del pie, como corresponde. Sin corregirlo, las articulaciones pivotaban fuera del cuerpo.

Además el auto-rigging traía los pesos inservibles: el **78 % de los vértices estaba soldado 100 % a `Root`** y el 98 % tenía un solo hueso de influencia, sin mezcla — mover cualquier articulación abría púas en la malla. Los pesos se recalculan por distancia a los segmentos óseos, con los cuatro huesos más cercanos y caída a la cuarta potencia.

El rig reconstruido queda **alineado a los ejes del modelo** (sin rotaciones locales en reposo), de modo que rotar un hueso en X es cabecear, en Y girar y en Z inclinar. Eso hace legible el código de animación.

**La marcha de zombi se resuelve por cinemática inversa, no por ángulos.** El GLB no trae clips, así que el ciclo es procedural. Las piernas no se animan rotando articulaciones a ojo: se define la trayectoria del pie sobre el suelo y se resuelven cadera y rodilla hacia atrás. Es la única forma de garantizar las tres cosas que hacen creíble una persecución:

- **El paso corresponde al desplazamiento.** La fase del ciclo avanza con la distancia recorrida, no con el tiempo, y el pie apoyado retrocede exactamente lo que el cuerpo avanza. Medido: 0.60 m de recorrido del pie frente a los 0.62 m que dicta la zancada caminando, 0.92 frente a 0.96 corriendo. No patina a ninguna velocidad, y la frecuencia del paso sale sola de la velocidad real.
- **El bamboleo no despega los pies.** Como el objetivo del pie está anclado al suelo, el desplome de la cadera lo absorben las piernas: se convierte en un traspaso de peso real en vez de flotar.
- **El pie muerto arrastra de verdad.** La pierna derecha va rezagada, con la rodilla agarrotada y la punta clavada hacia abajo, pegada al suelo todo el ciclo (altura medida: 0.008–0.018 m corriendo). La izquierda es la que marca el paso exacto; la derecha raspa hacia adelante en la recuperación, que es justo lo que se quiere ver.

Una pasada final mide dónde acabó cada punta y reajusta el tobillo: el cabeceo del pie, el balanceo de la pelvis y el giro del pie muerto se acumulan de formas difíciles de predecir, y medir sale más barato que compensarlo analíticamente.

**La percepción del monstruo nunca hace trampa.** No conoce tu posición: acumula una señal solo cuando la luz está encendida, más fuerte con línea de visión y más débil como "resplandor" que dobla esquinas. La posición que estima lleva ruido proporcional a la distancia. Pisar un charco lo delata a la inversa: los monstruos a menos de 15 m oyen el chapoteo y rastrean tu ubicación unos segundos. Existe un sesgo de merodeo (`patrolBiasNearPlayer`) que solo decide *hacia qué zona* patrulla para mantener vivos los encuentros; está documentado y se puede poner en 0.

**La batería ya drena, aunque los pickups lleguen en Fase 2.** Los estados de batería (100/75/50/25/10/0) son la identidad de la linterna según el GDD, así que se implementaron completos: menos intensidad, menos alcance, cono más cerrado, y parpadeo con interferencia por debajo del 10%. Con 7 minutos de luz total, la partida se puede completar sin pickups si la administras.

**Audio mínimo adelantado, por justicia.** El GDD deja el sonido para la Fase 2, pero sin ninguna pista sonora el monstruo podría alcanzarte sin aviso posible, y eso rompe la regla "nunca aparecer de forma injusta". Todo es Web Audio sintetizado, sin assets: pasos de cada monstruo (volumen por distancia, paneo por dirección), un zumbido grave de presencia que crece con la cercanía, respiración cuando lo tienes casi encima, una estridencia inconfundible cuando una cacería comienza, chapoteos al pisar charcos y goteos/golpes lejanos ocasionales. Se apaga con `AUDIO.enabled = false`.

**La muerte te lo muestra un instante.** Captura → tu mirada se gira hacia él, se echa encima con los brazos estirados y la cara volcada sobre la cámara, y un fogonazo tembloroso lo revela durante nueve décimas de segundo; después, corte a negro y silencio (GDD). Verlo de cerca solo al morir mantiene el resto del misterio intacto.

## Limitaciones conocidas de la Fase 1

Los props (cajas, barriles, tarimas, tuberías…) son decorativos y no tienen colisión. No hay música. No hay pickups de batería (Fase 2). Solo desktop.

El ciclo de marcha del monstruo es único: no hay transiciones entre animaciones (arranque, frenada, giro), solo una mezcla suave de amplitud según la velocidad. La pierna arrastrada sí desliza al recuperarse — es intencional, así se lee el arrastre —, pero la pierna buena es la que sostiene la ilusión de que el paso corresponde al avance.

## Estado del roadmap

- [x] **Fase 1** — Movimiento · Linterna · Laberinto procedural · IA básica · Salida
- [ ] **Fase 2** — Sonido espacial · Baterías · Eventos ambientales · Mejor IA (estado de Sospecha con evidencia sonora)
- [ ] **Fase 3** — Laberinto dinámico · Linterna consciente · Variantes del monstruo (Tipos A/B/C)
- [ ] **Fase 4** — Optimización · Demo

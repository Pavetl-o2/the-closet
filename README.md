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

**Escritorio:** WASD o flechas para moverse, SHIFT para correr, F o clic izquierdo para la linterna, ESC pausa. Al morir o salir: ENTER repite el mismo laberinto, R genera uno nuevo.

**Móvil (horizontal):** pulgar izquierdo en cualquier punto de la mitad izquierda para el joystick — es analógico, el recorrido gradúa la velocidad y al llegar al tope se corre. Arrastrar en la mitad derecha para mirar. Botón **LUZ** abajo a la derecha para la linterna, **II** arriba a la derecha para pausar. En las pantallas de final, un toque genera otro laberinto y el botón *repetir este* rehace el mismo.

En ambos casos, con audífonos.

## Móvil

El juego detecta el dispositivo y escoge uno de dos perfiles (`src/core/device.js`). Se puede forzar por URL para probar sin cambiar de máquina: `?mode=touch` o `?mode=desktop`.

Al entrar en móvil se piden pantalla completa y orientación horizontal (el gesto del toque es la única oportunidad de pedirlas; si el navegador se niega, el juego funciona igual). En vertical aparece un aviso de girar el dispositivo y la partida se pausa, igual que al mandar la app a segundo plano.

Qué recorta el perfil táctil, y por qué:

| Ajuste | Escritorio | Táctil | Motivo |
| --- | --- | --- | --- |
| Luces dinámicas de lámpara | 12 (todas) | 4 más cercanas | El coste por fragmento de cada luz es lo que hunde el frame rate en un GPU de móvil. |
| Resolución | fija (DPR hasta 1.75) | adaptativa, 0.6–1.3 | Se ajusta sola según el frame time: la palanca más eficaz y la que no hay que adivinar. |
| Antialias | sí | no | Con resolución adaptativa rinde mejor gastar los píxeles en resolución. |
| Mapa de sombras | 1024², PCF suave | 512², PCF | La sombra del haz es media atmósfera del juego, así que se conserva; solo baja de resolución. |
| Textura del monstruo | 4096² (la del GLB) | 1024² | 4096² son ~67 MB de VRAM para algo que casi siempre se ve a oscuras y de lejos. |
| Distancia de dibujado | 90 m | 55 m | La niebla ya no deja ver más allá. |
| FOV | 70° vertical | horizontal acotado a 100° | Un teléfono en horizontal ronda 2.2:1: con 70° verticales el horizontal se va a 113° y el pasillo se ve en ojo de pez. |

Las lámparas fuera del pool de luces **conservan la bombilla encendida**: a lo lejos se siguen viendo brillar, solo dejan de iluminar el entorno. Y el pool tiene tamaño fijo a propósito — cambiar el *número* de luces visibles obliga a three.js a recompilar los shaders, y eso es un tirón cada vez.

Nada de esto toca la ruta de escritorio: los dos perfiles viven en `CONFIG.QUALITY` y la única bifurcación de código es la capa de entrada (pointer lock frente a joystick táctil). Verificado comparando la escena renderizada con la misma semilla antes y después.

## Semillas

Cada partida es un laberinto distinto. La semilla aparece en la pantalla de inicio y en las de final, y se puede fijar por URL: `http://localhost:5173/?seed=123456`. Misma semilla → mismo laberinto, mismos focos, mismos puntos de aparición de los monstruos. Útil para depurar y para compartir laberintos.

## Arquitectura

| Ruta | Qué hace |
| --- | --- |
| `src/config.js` | **Todos** los valores ajustables del juego, agrupados y comentados. |
| `src/core/rng.js` | RNG determinista (mulberry32) + semilla por URL. |
| `src/core/device.js` | Detección de dispositivo, perfil de calidad y resolución adaptativa. |
| `src/input/touch.js` | Joystick analógico, arrastre de mirada y botones (solo móvil). |
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
| `src/audio/engine.js` | Motor espacial: listener orientado, HRTF por fuente, oclusión por muros, reverb de pasillo, fábricas de voz. |
| `src/audio/soundscape.js` | Qué suena y cuándo: pasos, presencia, respiración, chapoteos, ambiente, estridencias. |
| `src/ui/hud.js` | Batería + punto de intensidad de luz, y las pantallas de inicio/pausa/final. |
| `scripts/test-maze.mjs` | Test de conectividad y estadísticas del generador. |

## Dónde ajustar qué (`src/config.js`)

Las perillas que más cambian la experiencia:

1. `MAZE.cellCols/cellRows` — tamaño del laberinto (10×10 celdas ≈ partidas de 5–10 min).
2. `RENDER.exposure`, `RENDER.ambientIntensity` y `RENDER.fogDensity` — cuánto se ve. Si tu pantalla es muy oscura, sube exposure a 1.4–1.6.
2b. `QUALITY.desktop` / `QUALITY.touch` — rendimiento y alcance visual por plataforma (ver la sección *Móvil*).
3. `PROPS.lamps.count` — cuántas islas de luz hay para avanzar sin linterna.
4. `FLASHLIGHT.batterySeconds` — presión de recursos (420 s por defecto; aún no hay pickups).
5. `MONSTER.count` y `MONSTER.height` — cuántas cosas patrullan el laberinto (2) y cuánto miden (2.05 m).
6. `MONSTER.huntSpeedLit/huntSpeedDark` vs `PLAYER.runSpeed` — la sensación de las persecuciones con y sin luz.
7. `MONSTER.patrolBiasNearPlayer` — frecuencia de encuentros (0 = patrulla 100% aleatoria).
8. `MONSTER.awarenessInvestigate/awarenessHunt` — cuánta luz "aguanta" antes de reaccionar.
9. `AUDIO.reverbLevel`, `AUDIO.rolloff` y `AUDIO.refDistance` — cuánto pasillo se oye rebotar y a qué ritmo cae el sonido con la distancia.

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

**El audio es espacial de verdad (Fase 2, paso 1).** Antes todo se paneaba en estéreo con un producto punto contra tu vector derecha. Eso tenía dos agujeros que anulaban media atmósfera:

- **Delante y detrás sonaban idénticos.** Ambas posiciones dan paneo 0. En un juego cuya única defensa es escuchar, eso es grave.
- **No había oclusión.** Un monstruo al otro lado de un muro sonaba igual que uno en tu mismo pasillo, aunque la herramienta ya estaba escrita: `losClear()`, que la IA usa para ver.

Ahora hay un grafo real: listener orientado con la cámara, un `PannerNode` con HRTF por fuente, oclusión que reutiliza `losClear()` con tres rayos, y una reverb de pasillo con impulso generado (reflexiones tempranas de las dos paredes paralelas más cola que se oscurece). Medido renderizando el grafo real en un `OfflineAudioContext`:

| Medición | Resultado |
| --- | --- |
| Fuente a la izquierda / derecha | 2.7× más fuerte en el canal correspondiente, simétrico |
| Delante vs detrás, **con HRTF** | difieren un 59 % de su propio RMS; detrás suena un 22 % más flojo y un 37 % más apagado |
| Delante vs detrás, **paneo plano** | diferencia **exactamente 0**: señales idénticas |
| Distancia 2 m → 16 m | 8.5× más flojo, y los agudos caen 8.7× (absorción del aire) |
| Oclusión en laberinto real (2 524 muestras) | 21 % despejado · 71 % tapado · 8.6 % parcial en esquinas y huecos |

La fila del paneo plano es la que importa: con el sistema anterior, delante y detrás eran **matemáticamente la misma señal**. Ahora no. Y como la oclusión sale de la misma función que usa la IA, lo que oyes y lo que el monstruo puede percibir están construidos sobre la misma geometría.

El motor no decide qué suena: solo cómo llega al oído. Las fuentes se crean con fábricas de voz (`noiseAt`, `toneAt`, `emitter`), que es el punto donde entrarán los samples grabados sin tocar el grafo.

**Todo sigue sintetizado, sin assets.** Pasos de cada monstruo (con el roce del pie muerto alternando), un zumbido grave de presencia que ahora **sale del monstruo** en vez de la mezcla, así que se puede localizar; respiración a la altura de su cara cuando lo tienes encima; una estridencia inconfundible al arrancar una cacería; chapoteos al pisar charcos, que rebotan por el pasillo y son justo el ruido que te delata; y goteras y crujidos desde **casillas reales del laberinto**, no paneos al azar — así que también se ocluyen: un goteo detrás de un muro suena sordo, y eso es información, no decorado. Se apaga con `AUDIO.enabled = false`.

**La muerte te lo muestra un instante.** Captura → tu mirada se gira hacia él, se echa encima con los brazos estirados y la cara volcada sobre la cámara, y un fogonazo tembloroso lo revela durante nueve décimas de segundo; después, corte a negro y silencio (GDD). Verlo de cerca solo al morir mantiene el resto del misterio intacto.

## Limitaciones conocidas de la Fase 1

Los props (cajas, barriles, tarimas, tuberías…) son decorativos y no tienen colisión. No hay música. No hay pickups de batería (Fase 2).

Del audio queda por hacer: el jugador todavía no se oye a sí mismo (ni pasos ni respiración), no hay capa de tensión ligada a la percepción del monstruo, y toda la síntesis está pendiente de sustituirse por foley grabado — las fábricas de voz del motor están hechas justamente para ese cambio.

En móvil no hay un tercer perfil para gama baja: si un teléfono no llega, la resolución adaptativa baja hasta 0.6 y ahí se queda (apagar sombras sería el siguiente escalón, ya cableado en `QUALITY.touch.shadows`). Tampoco se han medido teléfonos reales — los perfiles están razonados sobre lo que cuesta cada cosa, no calibrados con un dispositivo en mano.

El ciclo de marcha del monstruo es único: no hay transiciones entre animaciones (arranque, frenada, giro), solo una mezcla suave de amplitud según la velocidad. La pierna arrastrada sí desliza al recuperarse — es intencional, así se lee el arrastre —, pero la pierna buena es la que sostiene la ilusión de que el paso corresponde al avance.

## Estado del roadmap

- [x] **Fase 1** — Movimiento · Linterna · Laberinto procedural · IA básica · Salida
- [ ] **Fase 2** — Sonido espacial ✅ · Baterías · Eventos ambientales · Mejor IA (estado de Sospecha con evidencia sonora)
- [ ] **Fase 3** — Laberinto dinámico · Linterna consciente · Variantes del monstruo (Tipos A/B/C)
- [ ] **Fase 4** — Optimización · Demo (móvil en horizontal ya soportado)

# THE CLOSET — Fase 1 (MVP jugable)

Horror psicológico procedural en Three.js, con aspecto de juego de PlayStation 1. Estás atrapado en un laberinto de pasillos de cemento gris, con cables colgando de los muros, tuberías y focos que parpadean. Solo tienes una linterna. La luz te guía — y también te delata: con ella encendida, lo que te caza es más rápido que tú; apágala y te perderá la pista… si logras avanzar entre las islas de luz enferma sin que te oiga.

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

En ambos casos, con audífonos: la mitad de la información del juego es sonido.

`?psx=0` en la URL desactiva la estética PS1 y vuelve al render a resolución completa.

## Móvil

El juego detecta el dispositivo y escoge uno de dos perfiles (`src/core/device.js`). Se puede forzar por URL para probar sin cambiar de máquina: `?mode=touch` o `?mode=desktop`.

Al entrar en móvil se piden pantalla completa y orientación horizontal (el gesto del toque es la única oportunidad de pedirlas; si el navegador se niega, el juego funciona igual). En vertical aparece un aviso de girar el dispositivo y la partida se pausa, igual que al mandar la app a segundo plano.

Qué recorta el perfil táctil, y por qué:

| Ajuste | Escritorio | Táctil | Motivo |
| --- | --- | --- | --- |
| Luces dinámicas de lámpara | 12 (todas) | 4 más cercanas | El coste por fragmento de cada luz es lo que hunde el frame rate en un GPU de móvil. |
| Resolución | ~240 líneas (PS1) | ~240 líneas (PS1) | Con la estética PS1 ambos perfiles dibujan a resolución de consola y escalan por un factor entero: el coste de píxel es irrisorio. Con `?psx=0` vuelve la resolución fija (escritorio) o adaptativa 0.6–1.3 (táctil). |
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
| `src/maze/builder.js` | Geometría: muros instanciados con unión curva al techo, piso/techo subdivididos, tuberías y cables en catenaria pegados al muro, charcos, cajas, tarimas, bidones, libros, ropa, vidrios, manchas, focos colgantes, puerta de salida. |
| `src/world/textures.js` | Texturas procedurales en canvas a resolución de PS1 (yeso y cemento gris, techo, metal, óxido, madera, charco, manchas). Sin assets externos. |
| `src/world/atmosphere.js` | Niebla, luz ambiental base, parpadeo de los focos colgantes. |
| `src/world/ripples.js` | Ondas en los charcos, sincronizadas con cada gota que suena. |
| `src/render/psx.js` | Estética PS1: resolución de 240 líneas con escala entera, color de 15 bits con dithering, grano, vértices anclados a la rejilla y la reacción de la imagen al peligro. |
| `src/player/player.js` | FPS: pointer lock, colisión circular contra la grilla, fase de zancada (vaivén + pasos), FOV al correr. |
| `src/flashlight/flashlight.js` | Spotlight amplio con sway de mano + luz de rebote, estados de batería del GDD, parpadeo al 10%. Decide la pose de la linterna en tu mano y pone el foco en su lente. |
| `src/flashlight/model.js` | La linterna roja que se ve en primera persona, dibujada en una pasada propia encima de la escena. |
| `src/monster/monster.js` | Tipo A: percepción por luz + oído + FSM (IDLE → INVESTIGATE → HUNT → SEARCH). Velocidad de cacería según tu linterna. |
| `src/monster/model.js` | Carga del GLB, reparación del rig y repesado de la piel. |
| `src/monster/animation.js` | Ciclo de marcha de zombi: cojera, pie arrastrado y piernas por cinemática inversa. |
| `src/assets/monster.glb` | Modelo del monstruo (malla + esqueleto). Único asset externo del proyecto. |
| `src/audio/engine.js` | Motor espacial: listener orientado, HRTF por fuente, oclusión por muros, reverb de pasillo, fábricas de voz. |
| `src/audio/voice.js` | La voz del monstruo sintetizada por formantes: gemido, alarido y gruñido. |
| `src/audio/soundscape.js` | Qué suena y cuándo: pasos, voz del monstruo, goteo, focos, latido, tensión, susurros, ruidos del edificio. |
| `src/ui/hud.js` | Batería en celdas + punto de luz, títulos pixelados y las pantallas de inicio/pausa/final. |
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
10. `PLAYER.strideWalk/strideRun` — cadencia de tus pasos y del vaivén de cámara (van juntos).
11. `AUDIO.holdBreathDistance/holdBreathMax` — cuándo contienes la respiración y cuánto aguantas.
12. `RENDER.psx` — la estética PS1: líneas de resolución, bits de color, grano, desaturación, rejilla de vértices.
13. `MONSTER.darkDropSeconds` y `MONSTER.darkSenseStill/Move/Run` — cuánto tarda en perderte al apagar la luz y a qué distancia te sigue sintiendo según lo que haga tu cuerpo.
14. `FLASHLIGHT.hold` y `FLASHLIGHT.aimDistance` — dónde llevas la linterna en el campo de visión y a qué distancia converge su haz con tu mirada.

`?debug` en la URL expone `window.__game` en consola para inspección.

`DEBUG: true` imprime en consola cada cambio de estado de la IA.

## Decisiones de diseño de esta fase

**Interior cerrado, con techo.** Pasillos de servicio de cemento y yeso gris, con la unión del muro y el techo redondeada como un túnel, un cable grueso sujeto al muro que cuelga en bucles entre anclajes, tuberías de metal pegadas bajo la moldura, tarimas recargadas y bidones oscuros. El techo a 3.2 m encierra la luz de la linterna y elimina cualquier referencia de cielo, reforzando la desorientación que pide el GDD.

**Aspecto de PlayStation 1** (`src/render/psx.js`). Lo que hace que algo "se vea de PS1" no es un filtro de color sino las limitaciones del hardware, y son las que se reproducen:

- *240 líneas de resolución* escaladas con vecino más cercano y **factor entero** en píxeles físicos (con factor no entero salen filas de 4 y de 5 px). En un monitor 1080p son 384×216 ×5; en uno de 768 líneas, 342×256 ×3; en un teléfono en horizontal, 507×234 ×5.
- *Color de 15 bits* (32 niveles por canal) con **dithering Bayer 4×4**, como hacía la consola para disimular el banding.
- *Vértices anclados a la rejilla de píxeles*: la geometría "tiembla" al mover la cámara. Se inyecta en todos los materiales, incluido el monstruo, sin tocar su modelo.
- *Texturas de 64–128 px sin filtrar.*
- Encima, grano de película, desaturación casi monocroma y viñeta.

A propósito **no** se reproduce el mapeo afín de texturas: la PS1 lo disimulaba subdividiendo la geometría y aquí deformaría pasillos enteros. Suelo y techo sí se subdividen por casilla, como en la consola, porque con el anclaje de vértices un plano de dos triángulos gigantes inclinaba su profundidad y se tragaba los charcos.

**La linterna se ve en tu mano, y el haz sale de ella.** Una linterna de plástico rojo, sencilla, low-poly como todo lo demás: cuerpo con estrías de agarre, interruptor de goma negra, cabeza ensanchada con aro metálico. Va abajo a la derecha del campo de visión y apunta al punto que miras, con el mismo retraso de mano que ya tenía el haz: al girar rápido se queda atrás un instante. Al andar, el vaivén le llega amortiguado; al pulsar el interruptor, da un respingo.

Lo importante es que **la pose de la linterna es la que define la luz**: el foco nace en su lente y sale por su eje, así que el disco que ves en el suelo o en el muro está siempre donde apunta la linterna que llevas. Pegado a un muro, la lente sobresale de tu radio de colisión; el foco se retrasa lo justo para no quedar dentro de la pared (si no, iluminaría el pasillo de al lado), y el resplandor de rebote se apaga en vez de quemar la pared entera: lo que ves es el disco del haz y la linterna a contraluz.

Se dibuja en una pasada aparte, encima de la escena y con la profundidad borrada, para que nunca atraviese un muro. Como esa pasada no ve las luces del mundo, lleva las suyas copiadas cada frame: la luz base (a la mitad: tu cuerpo le hace sombra), lo que su propio haz devuelve y el foco colgante más cercano. Pasa por el mismo filtro PS1 que el resto, así que también tiembla y se tramea. La lente y el aro brillan con lo que emite la linterna, parpadeos de pila baja incluidos.

**La luz base nunca es negro.** Con la linterna apagada se leen los muros y las siluetas a unos metros, como en la referencia. El número de `ambientIntensity` (30) parece enorme porque la luz hemisférica de three.js se divide entre π y el cemento apenas refleja: con el valor anterior la vista sin linterna medía 2 sobre 255 — negro puro.

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

**Apagar la luz te esconde — pero no te vuelve invisible.** Si el monstruo te está cazando y apagas la linterna, en 0.4 s pierde la pista (un parpadeo de pila baja no cuenta). Se queda quieto casi dos segundos, escuchando, gruñe de frustración y se pone a registrar la zona donde te vio por última vez. A oscuras solo te siente de cerca, y cuánto de cerca depende de tu cuerpo: quieto, a 1 m; andando, a 2.4 m con línea de visión; corriendo, a 5 m aunque haya una esquina de por medio (te oye). Y si no sabe que estás ahí solo te atrapa si choca contigo: **pegado al muro, a oscuras y conteniendo la respiración, puede pasarte al lado sin verte.** Medido en simulación con la misma semilla:

| Situación | Resultado |
| --- | --- |
| Luz encendida, quieto | te atrapa en 1.2 s |
| Luz encendida, huyes corriendo | te atrapa (6.1 m/s contra tus 5.4) |
| Apagas a 5 m y te quedas quieto en mitad del pasillo | deja de cazarte en 0.38 s… y su ronda te pasa por encima |
| Apagas a 5 m y te quedas quieto pegado al muro | deja de cazarte y te pasa al lado |
| Apagas y te alejas andando o corriendo | deja de cazarte y te pierde |

Ruidos fuertes (charcos, vidrios) siguen delatándote aunque estés a oscuras.

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

**Ahora te oyes a ti mismo (Fase 2, paso 2).** Antes el jugador era mudo: solo sonaba el monstruo. Eso dejaba coja la propia mecánica del juego — pisar un charco te delataba, pero tú no te oías hacer ruido.

*Los pasos salen de la misma fase que el vaivén de cámara.* En vez de un temporizador aparte, `Player` lleva una fase de zancada que avanza con los metros recorridos, y de ella se derivan a la vez el bamboleo visual y el golpe audible. Medido: en el frame exacto del paso, el vaivén está al **−0.985 de su recorrido** (−1 sería el punto más bajo). El sonido cae justo cuando el cuerpo se desploma sobre el pie, sin sincronizar nada a mano. Cadencia resultante: 2.83 pasos/s caminando y 3.5 corriendo. La zancada de 1.05 m se eligió para reproducir el ritmo de vaivén que el juego ya tenía.

*Lo que pisas se oye, y cuesta.* Concreto (peso grave + chasquido de suela), agua (chapoteo con eco de pasillo) y vidrio (tres esquirlas partiéndose, nunca iguales). Cada paso deja en `stepNoise` cuánto te ha delatado — 0 caminando en seco, 0.35 corriendo, 0.9 en vidrios, 1 en agua — y el juego decide con eso quién te ha oído. Lo que suena y lo que te delata pasaron a ser la misma cosa, en vez de dos sistemas separados.

*Respiración con miedo, y contenerla.* El ritmo sube con el esfuerzo y con la cercanía de algo: 0.25 respiraciones/s en calma, 0.4 con un monstruo a 5 m, 0.9 corriendo. El miedo no crece lineal con la distancia, sino con una curva que hace pesar mucho más los últimos metros. Y si te quedas **quieto** con una de esas cosas a menos de 3.6 m, el personaje **contiene la respiración** hasta 7 segundos y luego la suelta de golpe. Tu propio silencio es lo que más tensa, y no hizo falta mecánica nueva para conseguirlo.

*La linterna zumba.* Mientras está encendida suena un hum eléctrico proporcional a la intensidad, que se **desafina hacia abajo conforme se agota la pila** (0 cents llena, −175 al 8 %). El estado de la batería se oye sin mirar el HUD — y ese zumbido es, literalmente, el sonido de ser localizable.

*Presupuesto de voces por prioridad.* Los sonidos que dan información sobre el monstruo pueden usar todo el presupuesto; tus pasos y el ambiente se cortan antes. Sin esto, correr sobre vidrios saturaba el grafo en móvil (pico de 12/12) y podía tragarse el paso del monstruo que venía detrás — justo lo que el GDD prohíbe. Con prioridades el pico baja a 10/12 y siempre queda hueco reservado.

**Todo sigue sintetizado, sin assets.** Pasos de cada monstruo (con el roce del pie muerto alternando), un zumbido grave de presencia que ahora **sale del monstruo** en vez de la mezcla, así que se puede localizar; respiración a la altura de su cara cuando lo tienes encima; una estridencia inconfundible al arrancar una cacería; chapoteos al pisar charcos, que rebotan por el pasillo y son justo el ruido que te delata; y goteras y crujidos desde **casillas reales del laberinto**, no paneos al azar — así que también se ocluyen: un goteo detrás de un muro suena sordo, y eso es información, no decorado. Se apaga con `AUDIO.enabled = false`.

**Tiene voz (y es lo más parecido a un ReDead).** `src/audio/voice.js` sintetiza la voz del monstruo por formantes: dos sierras desafinadas y un subarmónico que la vuelve ronca, saturación para la aspereza, aliento, y tres filtros de formante que se mueven de "uuu" a "aaa" y de vuelta, como una boca que se abre mientras se queja, con un temblor de sollozo. Tres registros: el **gemido** de sufrimiento a intervalos; el **alarido** rasgado cuando empieza a cazarte (y en tu cara al atraparte); y un **gruñido** corto cuando te pierde a oscuras. Sale de su cabeza por un bus espacial persistente, así que viaja con él mientras suena, se tapa detrás de los muros y rebota en el pasillo. Cuanto más cerca, más fuerte **y más seguido**: a 16 m es un lamento lejano (−49 dBFS), a 8 m ya se impone (−40), a 3 m es casi continuo y está 13 dB por encima de tus propios pasos.

**Pasos realistas, y los charcos siempre suenan.** Cada paso se construye en capas que varían en cada pisada: el talón (golpe sordo), el peso del cuerpo, la suela que rueda hasta la punta y la arenilla que cruje debajo; corriendo, un derrape corto al despegar. Los dos pies no suenan exactamente igual. En agua: golpe, salpicadura que sube de tono al abrirse, rocío y gotitas que caen después. **Entrar en un charco suena al instante**, aunque la zancada caiga al otro lado — antes se podía cruzar uno pequeño sin mojarse — y al salir, la suela mojada chasquea unos pasos más. El monstruo también chapotea: si pisa un charco lo oyes aunque no lo veas.

**Los charcos gotean.** Cada charco tiene su ritmo (unos pocos, con una gotera activa encima, gotean seguido). La gota es un "plip" de tono que sube muy rápido — la burbuja que se forma al entrar — con mucho eco de pasillo, y deja una onda visible en el agua (`src/world/ripples.js`): si la ves con la linterna, sabes de dónde venía el sonido.

**Capa de suspenso.** Lo que no es del mundo sino tuyo:

- *Latido* de 60 a 150 pulsaciones según el peligro que **percibes** (lo cerca que suena algo, menos si hay un muro de por medio, mucho más si te está cazando). La imagen late con él: se ensucia de grano, los bordes se cierran y pulsan en rojo, y con algo encima la cámara tiembla.
- *Tono de sala* (el "silencio" del sitio nunca es cero) y un *lecho de tensión* de notas que baten y se desafinan despacio, que solo aparece cuando algo se acerca; en el peor momento, un pitido de oído.
- *Focos que zumban* a 100 Hz con su parpadeo real, y *chasquean* cuando se apagan de golpe.
- *El edificio*: cada 25–55 s, lejos, alguien golpea una tubería, algo metálico cae y rebota, una puerta se cierra de golpe, una tubería gime, algo raspa el suelo. **Nunca imitan al monstruo** (GDD: nunca hacer trampa), pero bastan para dudar.
- *Susurros* ininteligibles pegados a un oído, solo si llevas más de cinco segundos quieto a oscuras y nada cerca.
- *La puerta*: al empezar se oye, a tu espalda, cerrarse de golpe la puerta por la que entraste.
- *Clic de linterna* en dos tiempos (resorte y enganche) y chisporroteo del contacto con la pila baja. En pausa, todo se oye como a través de una pared.

**Interfaz de la época.** Títulos rasterizados a baja resolución con el borde de las letras cortado a píxel duro y escalados sin suavizar, con saltos de imagen de vídeo compuesto; "PULSA PARA ENTRAR" parpadeando en seco; tipografía de terminal (VT323); líneas de barrido; la batería en cinco celdas que se oxidan por debajo del 25 % y parpadean en la última.

**La muerte te lo muestra un instante.** Captura → tu mirada se gira hacia él, se echa encima con los brazos estirados y la cara volcada sobre la cámara, y un fogonazo tembloroso lo revela durante nueve décimas de segundo; después, corte a negro y silencio (GDD). Verlo de cerca solo al morir mantiene el resto del misterio intacto.

## Limitaciones conocidas de la Fase 1

Los props (cajas, barriles, tarimas, tuberías…) son decorativos y no tienen colisión. No hay música. No hay pickups de batería (Fase 2).

Del audio queda por hacer: no hay música, y toda la síntesis está pendiente de sustituirse por foley grabado — las fábricas de voz del motor (y `voice.js` para el monstruo) están hechas justamente para ese cambio. El latido baja a los graves: en altavoces de teléfono se oye poco. Correr sobre concreto genera ruido (0.35) pero no llega al umbral que delata (0.5): la perilla está puesta por si se quiere que correr también te cueste.

En móvil no hay un tercer perfil para gama baja: si un teléfono no llega, la resolución adaptativa baja hasta 0.6 y ahí se queda (apagar sombras sería el siguiente escalón, ya cableado en `QUALITY.touch.shadows`). Tampoco se han medido teléfonos reales — los perfiles están razonados sobre lo que cuesta cada cosa, no calibrados con un dispositivo en mano.

El ciclo de marcha del monstruo es único: no hay transiciones entre animaciones (arranque, frenada, giro), solo una mezcla suave de amplitud según la velocidad. La pierna arrastrada sí desliza al recuperarse — es intencional, así se lee el arrastre —, pero la pierna buena es la que sostiene la ilusión de que el paso corresponde al avance.

## Estado del roadmap

- [x] **Fase 1** — Movimiento · Linterna · Laberinto procedural · IA básica · Salida
- [ ] **Fase 2** — Sonido espacial ✅ · Voz del monstruo y capa de suspenso ✅ · Estética PS1 ✅ · Baterías · Eventos ambientales · Mejor IA (estado de Sospecha con evidencia sonora)
- [ ] **Fase 3** — Laberinto dinámico · Linterna consciente · Variantes del monstruo (Tipos A/B/C)
- [ ] **Fase 4** — Optimización · Demo (móvil en horizontal ya soportado)

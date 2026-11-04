# Acta electrónica: tablets de árbitros y entrenadores (vista en pista + formación inicial enviada por el entrenador)

> **Para la sesión de Claude que haga esto.** Este documento es el encargo completo. Lo ha escrito otra sesión de Claude
> (4-nov-2026) después de un día entero trabajando el acta con Ferran. Léelo entero antes de tocar nada, y lee también las
> secciones del `CLAUDE.md` del repo que se citan. Ferran ya ha dado el visto bueno al planteamiento ("Me parece bien");
> lo marcado como **DECIDIDO** no se vuelve a discutir; lo marcado como **PREGUNTAR** se le pregunta antes de hacerlo.

---

## 0. Resumen en 6 líneas

1. El anotador lleva el acta en su móvil/tablet/portátil (`docs/acta/`, todo local y sin conexión).
2. Queremos que hasta 4 dispositivos más (1er árbitro, 2º árbitro y los 2 entrenadores) vean en directo lo que hay en pista.
3. Los **entrenadores** además **envían su formación inicial** de cada set desde su tablet; al anotador le llega y la usa con un toque.
4. Los entrenadores **NO** piden sustituciones ni tiempos por la tablet (**DECIDIDO**: en la FCVB/RFEVB se piden con la señal de mano).
5. Todo de **solo lectura** salvo la formación del entrenador. Sin nombres de jugadores (solo dorsales): puede haber menores.
6. Se apoya en lo que ya existe: el "Directo" (`acta_directo`, migración 036, página `docs/acta/directo/`).

---

## 1. Contexto que necesitas (y dónde está)

### 1.1 El proyecto
- Repo `fsarmesto/enxarxa`, web en GitHub Pages desde `main` → `/docs` (https://fsarmesto.github.io/enxarxa/).
- Backend Supabase, proyecto `vevsurxxvjivjizuuqad` (plan gratuito). Migraciones en `supabase/migrations/NNN_*.sql`,
  se aplican con `db push` (ver `CLAUDE.md` → "Desplegar"). La última es la **038**: la tuya será la **039**.
- `CLAUDE.md` es largo; lee al menos: "Piezas", "Desplegar", y la sección **"Acta electrónica (prototipo para la FCVB,
  3-nov-2026)"** entera (modelo de sucesos, reglas, Directo, i18n del acta, acta FCVB impresa).

### 1.2 El acta electrónica (`docs/acta/`)
- `motor.js` — reglas FIVB sin pantalla (también corre en Node). El acta es una **lista de sucesos** (`A.ev`) y el estado se
  recalcula entero con `ActaMotor.reproducir(cfg, datos, ev)`. `ActaMotor.validar(cfg, datos, ev, nuevo)` devuelve `null` o el
  motivo en castellano. `ActaMotor.setActual(st)` da el set en curso. Sucesos relevantes aquí:
  - `{t:'alineacion', eq:'L'|'V', jugadores:[6 dorsales, posiciones I..VI]}` (case `'alineacion'` en `motor.js`: 6 distintos,
    inscritos, ninguno líbero, ninguno descalificado/fuera del partido; no si el set ya empezó).
  - `{t:'sorteo', saca, izq}`, `{t:'inicioSet'}`, `{t:'punto', eq}`, `{t:'tiempo', eq}`, `{t:'sust', eq, sale, entra, tipo?}`,
    `{t:'liberoEntra'...}`, `{t:'sancion'...}`, etc. Cada suceso lleva `h` (ISO).
  - En el estado: `st.fase` ('preparacion' | 'juego' | 'entreSets' | 'fin'), `st.sets[]`, `s.rot[eq]` (6 dorsales en pista,
    índice 0 = posición I = el que saca si su equipo saca), `s.alineacion[eq]`, `s.saque`, `s.izq`, `s.puntos`,
    `s.tiempos[eq]` (lista con marcador), `s.sust[eq]`, `s.libero[eq]` (`{num, por, pos}` o null), `st.sanciones`,
    `st.equipos[eq].jugadores` (`{num, nombre, cap, lib, cat}`), `st.descalificados[eq]`/`st.fueraPartido[eq]` (Set),
    `st.ganados`, `st.cfg` (tiempos, sustituciones por set, etc.), `M.necesitaCapitanJuego(st, eq)`.
- `acta.js` — pantallas. Globales: `A` (acta: `{id, cfg, datos, ev, paso, directo?, ...}`), `ST` (estado). Funciones clave:
  - `hacer(ev)` — valida, añade a `A.ev`, `guardar()`, `pintar()`, **`publicarDirecto()`**. Todo cambio pasa por aquí
    (salvo `empezarSet`, que hace "todo o nada" y también llama a `publicarDirecto()`; y `deshacer()`).
  - `pSorteo()` — pantalla "Sorteo y formación inicial" del set 1 (y `empezarSet(true)`).
  - `pEntre()` — pantalla entre sets (formaciones del siguiente set; en el decisivo, también sorteo) → `empezarSet(s.decisivo)`.
  - `selectorAlineacion(eq, previa)` + `enlazarAlineacion()` + `leerAlineacion(eq)` — los 6 desplegables I..VI.
    `previa` = array de 6 dorsales con que se rellenan (ya se usa para proponer la formación del set anterior).
  - **Directo** (`resumenDirecto()`, `publicarDirecto(ahora)`, `hojaDirecto()`, `enlaceDirecto()`): botón "Directo" en la
    pantalla de juego; hace falta sesión de la app (Supabase Auth). Crea `A.directo` = id aleatorio de 16-40 [a-z0-9] y
    hace `upsert` en `acta_directo` tras cada suceso (con 800 ms de espera, agrupando).
- `docs/acta/directo/index.html` — página pública del marcador (negra, para TV/móvil): `select` a `acta_directo` cada 4 s.
  **Tómala como plantilla** de las páginas nuevas (CSP, `cargando.js`, `config.js`, `vendor/supabase-2.45.4.js`,
  `acta-ca.js`, aviso "Actualizado hace X s", "Sin conexión: se reintenta…").
- `acta-ca.js` — el acta se escribe en castellano y este fichero traduce al catalán lo que sale en pantalla (diccionario
  `exact` + `rules` + `frags`). **Todo texto nuevo de pantalla necesita su entrada en catalán** (mira cómo están los del Directo).
- `docs/sw.js` — service worker: `CACHE = 'enxarxa-app-vNN'` (súbelo en 1) y añade las páginas nuevas a `PRECACHE`.

### 1.3 La tabla que ya existe (`supabase/migrations/036_acta_directo.sql`)
`acta_directo(id text pk, user_id uuid default auth.uid(), estado jsonb <20 kB, updated_at)`; lectura pública por id
(el id es el secreto), escritura solo su anotador; `limpiar_directos()` borra los de más de 2 días (se llama al abrir uno nuevo).
`resumenDirecto()` publica: equipos, competición, fase, set, marcador, sets, saque, `izq`, nº de tiempos. **Sin nombres.**

### 1.4 Reglamento que lo respalda (cítalo en comentarios)
- FIVB 7.3.2: "Before the start of each set, the coach has to present the starting line-up of his/her team on a line-up
  sheet **or via the electronic device, if used** … – or electronically sent directly to the e-scorer."
- FIVB 5.2.3.1: "If Tablet apps are used, the electronic transmission of the line-up is automatically deemed to be official."
- FIVB 7.3.4: una vez entregada la formación, no se cambia sin sustitución reglamentaria → **la enviada queda bloqueada**.
- La formación de un equipo no la ve el rival antes de empezar el set (práctica habitual: el 2º árbitro y el anotador sí).
- Textos del reglamento en castellano/inglés: no están en el repo; si los necesitas, la FIVB 2025-2028 está en fivb.com.

---

## 2. Qué hay que construir

### 2.1 Enlaces privados (lo genera el anotador)
En la hoja del botón "Directo" (o una hoja nueva "Tablets", accesible desde la pantalla de juego **y desde las pantallas de
sorteo y entre sets**, porque la formación del set 1 se envía antes de empezar), el anotador obtiene **3 enlaces**:
- **Árbitros** (1º y 2º usan el mismo): `docs/acta/tablet/?t=<token>`
- **Entrenador local**: `docs/acta/tablet/?t=<token>`
- **Entrenador visitante**: `docs/acta/tablet/?t=<token>`

Una sola página `docs/acta/tablet/` que pinta una vista u otra según el rol del token (lo devuelve el servidor). Cada enlace
con: "Copiar el enlace", "Abrir" y **código QR** para escanearlo en el pabellón. Para el QR: la CSP solo permite scripts de
`'self'`, así que hay que **copiar una librería pequeña a `docs/vendor/`** con versión fija (p. ej. `qrcode-generator`
de kazuhikoarase, MIT, ~20 kB; poner la licencia en un comentario y la versión en el nombre del fichero, como
`vendor/supabase-2.45.4.js`). Si te parece mejor no meter dependencia, **PREGUNTAR** a Ferran (alternativa: solo enlace).

Tokens: aleatorios, ≥ 24 caracteres [a-z0-9] con `crypto.getRandomValues` (mira cómo se genera `A.directo`). Se guardan en
`A.tablets = { arb, entL, entV }` (dentro del acta, en el dispositivo del anotador). Botón "Revocar y crear enlaces nuevos"
(por si un enlace se filtra) y "Dejar de compartir" (borra en el servidor). Requiere sesión de la app, igual que el Directo.

### 2.2 Lo que publica el anotador (estado privado, más detallado que el Directo)
Tras cada suceso (donde hoy se llama a `publicarDirecto()`; reutiliza el mismo temporizador/agrupación) se publica un
**estado de mesa** (`estadoMesa()`), además del resumen público si el Directo está activo. Contenido (todo con dorsales, **sin
nombres**):
- Cabecera: equipos (nombre del club), competición, categoría, colores de equipo y líbero (`A.datos.colorL`… ver `color()`).
- `fase`, `set`, `decisivo`, `puntos`, `ganados`, `sets` (historial), `saque`, `izq`, `cambioHecho` del decisivo.
- Por equipo: `plantilla` = `[{num, cap, lib}]` (sin nombre), `noPuede` = dorsales descalificados/fuera del partido,
  `rot` (6 dorsales en pista, posición I..VI), `libero` (`{num, por}` o null), `tiempos` (`[{a,b}]` del set),
  `sust` (del set: `[{sale, entra, a, b, tipo}]`), `sustUsadas`/`sustMax` (`st.cfg.sustituciones`), `tiemposMax`
  (`st.cfg.tiempos`), `capitanJuego` (si hay uno marcado), `necesitaCapitan` (`M.necesitaCapitanJuego`).
- `sanciones` del partido (`{eq, quien, tipo, set, a, b}`), `impropias`.
- `ultimoTiempo`: `{eq, h}` del último suceso `tiempo` del set (para que las tablets enseñen la cuenta atrás de 30 s, FIVB 15.4.1).
- `formacionSiguiente`: para cada equipo, si el anotador ya tiene la formación del set que va a empezar (para que el
  entrenador vea "Recibida por el anotador").
- `actualizado` (ISO) y `vivo` (ver latido, 2.6).
Tamaño: debe caber holgado en 20 kB (comprueba con el partido de prueba completo).

### 2.3 Vista árbitro (`rol = 'arbitro'`) — solo lectura
Pensada para tablet en horizontal y también usable en móvil (390 px). Muy legible desde lejos:
- Marcador grande con sets, set en curso, quién saca (como el Directo) y reloj del set si es fácil.
- **Las 2 pistas** vistas desde la mesa (reutiliza la idea de `pistaGrande(s)` de `acta.js`: red en medio, el de la
  izquierda con la I abajo a la izquierda, el de la derecha con la I arriba a la derecha), con dorsales, el que saca
  marcado, el líbero con su color y "por quién" ha entrado.
- Por equipo: tiempos usados `x/2` y sustituciones `x/6` (aviso visible en la 5ª y 6ª), lista de sustituciones del set
  (`sale→entra a:b`), sanciones (A/C/E/D con tarjeta), capitán en juego / aviso "Falta capitán en juego".
- Cuenta atrás de 30 s cuando hay un tiempo en curso (desde `ultimoTiempo.h`; si han pasado >30 s, no se enseña).
- Entre sets: "Descanso · empieza el set N" y si las formaciones del siguiente set ya están recibidas (sin enseñarlas
  hasta que empiece el set: **PREGUNTAR** a Ferran si el 2º árbitro debe verlas antes; en papel el 2º árbitro sí las
  recibe y comprueba en pista → propuesta por defecto: **el árbitro sí las ve**, el entrenador rival no).
- Pie: "Actualizado hace X s" y, si pasan >15 s sin latido, banda roja "Sin datos del anotador desde hace X s: puede
  estar desactualizado".

### 2.4 Vista entrenador (`rol = 'entL'` / `'entV'`)
**A) Antes de cada set (fase 'preparacion' o 'entreSets', set siguiente sin empezar): formación inicial.**
- Pista de su campo con las 6 posiciones en la disposición de `selectorAlineacion` (delanteros IV III II, zagueros
  V VI I; "Red arriba. I = zaguero derecho, el que saca").
- Elegir dorsales tocando: lista de su plantilla (solo dorsales, `(C)` capitán, sin líberos, sin los que no pueden jugar);
  toca posición → toca dorsal (o arrastrar si sale fácil; con toques basta). Un dorsal usado no se puede repetir.
- Propuesta inicial = la formación del set anterior de su equipo (como hace `pEntre`), editable.
- **Validación en la tablet** con las mismas reglas del motor (6 distintos, inscritos, no líbero, no descalificado):
  carga `motor.js` en la página o replica la comprobación (mejor cargar `motor.js`, ya es independiente).
- Botón "Enviar formación del set N" → confirmación "Una vez enviada no se puede cambiar (FIVB 7.3.4). ¿Enviar?" →
  estado "Enviada a las hh:mm" y "Recibida por el anotador" cuando el estado de mesa lo confirme. **Bloqueada**: no se puede
  reenviar para ese set; si hay que cambiarla, "Avisa al anotador" (el anotador siempre puede cambiar lo que quiera en su
  pantalla, como en papel).
- No ve la formación del rival hasta que empieza el set.

**B) Durante el set (solo lectura):** marcador, su pista (rotación actual, quién saca, líbero), sus tiempos y
sustituciones que le quedan (`x/2`, `x/6`), lista de sus sustituciones del set (con quién puede volver por quién:
"el 12 solo puede volver por el 4"), sus sanciones, cuenta atrás de tiempo. La pista del rival: sí (es pública en pista).

**C) Final:** resultado y "Partido acabado".

### 2.5 Lado del anotador: recibir y usar la formación
- En `pSorteo()` y `pEntre()`: mientras haya tablets activas, consultar cada ~3 s si hay formaciones recibidas para el set
  que va a empezar. Si llega una: tarjeta en el bloque de ese equipo: "Formación recibida del entrenador (hh:mm): IV 12 · III 4 …
  [Usar]". **[Usar] solo rellena los desplegables** (vía `previa` / `enlazarAlineacion`), no empieza nada. El anotador
  comprueba con la ficha/pista y pulsa "Empezar el set N" como ahora. **Nunca se empieza un set solo** (DECIDIDO: la mesa manda).
- Si la formación recibida no es válida para el motor (p. ej. el anotador quitó a ese jugador), avisarlo en la tarjeta
  con el mensaje de `validar` y no rellenar.
- Al empezar el set: la formación de ese set queda cerrada en el servidor (el entrenador ya no puede enviar para ese set).
- Opcional pero recomendable: el suceso `alineacion` lleva `origen: 'tablet'` si vino de la tablet y no se tocó (el motor
  ignora campos extra: compruébalo). No sale en el acta impresa.
- Si un entrenador no envía nada, todo funciona como hoy (formación a mano).

### 2.6 Latido y conexión
- El anotador publica también un latido cada ~10 s aunque no pase nada (solo si hay tablets o directo activos), para que las
  tablets distingan "no pasa nada" de "el anotador se ha quedado sin conexión".
- Si una publicación falla, se reintenta en el siguiente suceso/latido (como el Directo) y en la pantalla del anotador un
  indicador discreto "Tablets: sin conexión" (no toasts repetidos cada 10 s).
- **El acta del anotador nunca depende de la red**: si no hay conexión, se anota igual (todo local, como ahora).

---

## 3. Backend (Supabase) — migración `039_acta_tablets.sql`

Diseño propuesto (ajústalo si ves algo mejor, pero mantén estas propiedades):
**(a)** el anotador (con sesión) es el único que escribe el estado; **(b)** las tablets **no tienen cuenta**: se identifican
solo con el token del enlace; **(c)** un token de entrenador solo puede leer su vista y escribir **su** formación;
**(d)** nada legible sin token; **(e)** límites de tamaño y caducidad (2 días, como el Directo).

```sql
-- Mesa de un acta: un registro por acta compartida con tablets.
create table public.acta_mesa (
  id          text primary key check (id ~ '^[a-z0-9]{24,48}$'),          -- id interno (aleatorio, lo genera el anotador)
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  tok_arb     text not null unique check (tok_arb ~ '^[a-z0-9]{24,48}$'),
  tok_entl    text not null unique check (tok_entl ~ '^[a-z0-9]{24,48}$'),
  tok_entv    text not null unique check (tok_entv ~ '^[a-z0-9]{24,48}$'),
  estado      jsonb not null default '{}' check (pg_column_size(estado) < 30000),
  updated_at  timestamptz not null default now()
);
-- Formaciones enviadas por los entrenadores (una por equipo y set; bloqueada al enviarla).
create table public.acta_formacion (
  mesa_id     text not null references public.acta_mesa on delete cascade,
  eq          text not null check (eq in ('L','V')),
  set_n       int  not null check (set_n between 1 and 6),
  jugadores   text[] not null check (array_length(jugadores,1) = 6),
  enviada_at  timestamptz not null default now(),
  cerrada     boolean not null default false,                               -- el set ya empezó
  primary key (mesa_id, eq, set_n)
);
-- RLS: acta_mesa y acta_formacion sin acceso directo para anon; el anotador (authenticated) ve/escribe lo suyo.
-- Las tablets SOLO por funciones security definer:
--   tablet_estado(tok text) returns jsonb       -> { rol: 'arbitro'|'entL'|'entV', estado: <filtrado por rol>, formaciones: <las suyas> }
--   tablet_enviar_formacion(tok text, set_n int, jugadores text[]) returns jsonb  -> ok / error ('ya enviada', 'set empezado', 'no válida')
-- El anotador: upsert de acta_mesa (con sus tokens) y select de acta_formacion de sus mesas; update cerrada=true al empezar el set.
-- limpiar_mesas(): borra las de más de 2 días (llamarla al crear una nueva, como limpiar_directos()).
```
Notas:
- **Filtrado por rol dentro de `tablet_estado`** (no en el cliente): el entrenador no debe recibir la formación del rival
  del set que no ha empezado, ni por la red. Haz el filtrado en SQL/plpgsql sobre el JSON o, más simple, que el anotador
  publique 3 vistas ya preparadas (`estado = {arb:{…}, entL:{…}, entV:{…}}`) y la función devuelva solo la del rol.
  (Esta segunda opción es más sencilla y difícil de equivocar: recomendada.)
- Validación en `tablet_enviar_formacion`: formato de dorsales (`^(00|[0-9]{1,2})$`), 6 distintos, `set_n` = el set que va
  a empezar según el estado publicado, no existe ya una para ese (mesa, eq, set), y el set no ha empezado. La validación
  "de verdad" (inscritos, no líbero, no descalificados) la hace el motor en el anotador al usarla.
- Límite anti-abuso sencillo: si ya hay una formación para ese set, rechazar; tamaño de `jugadores` fijo; tokens largos.
- `grant execute` de las 2 funciones a `anon, authenticated`; `revoke all` del resto a `anon`.
- Lectura con polling: tablets cada **2 s** (`rpc('tablet_estado')`), anotador cada 3 s solo en sorteo/entre sets. Coste: 4
  tablets × 0,5 pet./s × 2 h ≈ 15.000 peticiones por partido: sin problema en el plan gratuito. **No** uses Realtime (habría
  que abrir `wss:` en la CSP y dar select a anon; no compensa).
- Comprueba las políticas con un `anon` de verdad tras el `db push` (curl a `/rest/v1/acta_mesa` debe dar vacío/denegado;
  `rpc/tablet_estado` con token falso → null).

Despliegue: `db push` según `CLAUDE.md` ("Desplegar"). **Antes de `db push` en producción, enseña el SQL a Ferran y espera
su OK** (es la base de datos real de la app). No hacen falta funciones Edge.

---

## 4. Privacidad (DECIDIDO salvo lo marcado)
- Sin nombres de jugadores en el servidor ni en las tablets: solo dorsales, `(C)`, líbero (color). **PREGUNTAR** solo si
  en las pruebas ves que el entrenador necesita nombres para no equivocarse (la propuesta es que no).
- Nombres de árbitros: tampoco hacen falta en las tablets.
- Caducidad 2 días. Botón "Dejar de compartir" borra la mesa.
- Las páginas con `<meta name="robots" content="noindex">` como el Directo.

---

## 5. Diseño visual
- Mismo estilo que el resto del acta (mira `docs/acta/index.html` y `docs/designa.css`; tipografía y colores de la app,
  amarillo `var(--yellow)`). La del árbitro, fondo oscuro como el Directo (se lee mejor en pabellón); la del entrenador,
  como el acta (claro/oscuro según el sistema).
- Botones grandes (≥ 44 px), sin zoom por doble toque (mira cómo se quitó en el acta: `touch-action`), pensado para tablet
  horizontal y móvil vertical (390 px). Accesible: contraste, `aria-live` en el marcador, etiquetas en botones de posición.
- Idiomas: castellano y catalán con `acta-ca.js` (el selector ES/CA ya lo pone ese fichero en la cabecera).

---

## 6. Pruebas (obligatorias antes de dar nada por hecho)

En el repo hay ahora un banco de pruebas de navegador: **`tools/pruebas-navegador/`** (léete su `README.md`). Usa Chrome sin
ventana por CDP, sirve `docs/` con Supabase simulado y da clics reales. Ya incluye:
- `base.mjs` (servidor + Chrome + utilidades `go`, `click`, `type`, `ev`, `check`, `shot`, `cdp`…). El Supabase simulado
  guarda `acta_directo` en `localStorage`: **amplíalo** para `acta_mesa`/`acta_formacion` y las 2 RPC (mismo contrato que
  el SQL), también en `localStorage` (todas las pestañas del mismo Chrome lo comparten → sirve para simular varios dispositivos).
- `demo-completo.mjs` — genera un partido completo y realista (335 sucesos, 5 sets, sustituciones, líbero, sanciones…).
- `importar-demo.mjs` — lo importa por el botón de la app.

Varios dispositivos a la vez: abre más pestañas con `cdp('Target.createTarget', {url})` y conéctate a cada una (o haz las
pruebas de cada rol en secuencia en la misma pestaña, cambiando de URL). Pruebas mínimas (un fichero
`tools/pruebas-navegador/tablets.mjs`):
1. El anotador crea los enlaces; los 3 tokens son distintos; el QR se pinta.
2. Entrenador local abre su enlace antes del set 1: ve su plantilla (sin nombres, sin líberos), coloca 6, intenta repetir
   un dorsal (no puede), envía; reintentar enviar → bloqueado.
3. El anotador, en "Sorteo y formación", ve la tarjeta "Formación recibida", pulsa Usar: los desplegables quedan con esa
   formación; empieza el set; el suceso `alineacion` es igual a lo enviado.
4. Entrenador visitante: antes de empezar el set **no** recibe la formación del local (comprobar también la respuesta de la
   RPC simulada, no solo la pantalla); después de empezar, sí ve las 2 pistas.
5. Vista árbitro: tras varios puntos, una sustitución, una entrada de líbero y un tiempo, enseña rotaciones correctas
   (compara con `ActaMotor.setActual(ST).rot`), contadores, la cuenta atrás de 30 s y la sanción.
6. Entre sets: el entrenador envía la del set 2; el anotador la usa; el set 2 empieza con ella.
7. Sin conexión: corta el mock (que falle) → la tablet enseña la banda "Sin datos del anotador…"; el anotador sigue anotando
   sin errores; al volver, se recupera.
8. Formación recibida no válida (el anotador ha quitado a un jugador de la plantilla): la tarjeta lo dice y no rellena.
9. 390 px y tablet horizontal (1280×800); claro y oscuro; catalán sin textos sin traducir: lanza la prueba con
   `ACTA_CA=1` (el servidor de `base.mjs` fuerza el catalán y apunta en `sessionStorage.sinTr` cada texto que `acta-ca.js`
   no sabe traducir) y comprueba que al final `sinTr` esté vacío para tus páginas.
10. Ningún error de JavaScript en ninguna página (`errores()`).
Además: `node --test tools/prueba-acta-motor.mjs` y `node tools/prueba-acta-azar.mjs 200` siguen pasando (si tocas el
motor). Accesibilidad: pasa axe a las páginas nuevas como hace `tools/prueba-accesibilidad.mjs` con la app (esa prueba
no cubre el acta; puedes copiar su forma de usar axe-core en `tablets.mjs`).
**Haz capturas** (`shot`) de cada vista en móvil y tablet y míralas tú: que se vea bien, no solo que pase el test.

---

## 7. Cómo entregarlo (convenciones del repo)
- Rama propia desde `main`, commits con la identidad que ya usa el repo, PR contra `main`, y Ferran revisa.
- Sube `CACHE` de `docs/sw.js` y añade `acta/tablet/`, `acta/tablet/index.html` (y la librería del QR) al `PRECACHE`.
- Documenta en `CLAUDE.md`, dentro de la sección del acta electrónica, un párrafo "**Tablets (árbitros y entrenadores)**" con
  la tabla, las RPC, el flujo y las pruebas (como están documentados el Directo y el acta FCVB).
- Migración 039 aplicada con `db push` **después** del OK de Ferran; comprueba las políticas como `anon` (punto 3).
- Al acabar, explícale a Ferran en 5-10 líneas qué ha quedado, con los enlaces de prueba y las capturas.

## 8. Lo que NO hay que hacer
- Que el entrenador pida sustituciones o tiempos por la tablet (DECIDIDO que no).
- Que la tablet escriba en el acta: solo deja una formación que el anotador decide usar.
- Empezar un set automáticamente al recibir las 2 formaciones.
- Publicar nombres de jugadores.
- Tocar el acta FCVB impresa (`acta-fcvb.js`): no cambia nada con esto.
- Realtime/websockets (polling basta) o funciones Edge (las RPC bastan).

## 9. Preguntas abiertas para Ferran (hazlas al empezar, todas juntas)
1. ¿El 2º árbitro ve las formaciones del set siguiente en cuanto llegan (propuesta: sí) o solo al empezar el set?
2. ¿QR con una librería pequeña copiada en `docs/vendor/` (propuesta: sí) o solo enlace para pasar por WhatsApp?
3. ¿Un enlace para los 2 árbitros (propuesta) o uno para cada uno?

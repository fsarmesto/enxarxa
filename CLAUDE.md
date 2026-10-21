# Liquidación arbitral FCVB — contexto para seguir el trabajo

Web app no oficial para árbitros de la Federació Catalana de Voleibol: lee sus designaciones de iSquad y calcula
tarifa, dieta, desplazamiento e IRPF de cada partido. Este fichero resume decisiones y trampas aprendidas para
poder seguir desde otra máquina. **El repo es público: aquí no van claves, contraseñas ni datos de árbitros.**

## Piezas

- Web: `docs/index.html` (todo en un fichero: HTML, CSS y JS), publicada con GitHub Pages desde `main` → `/docs`.
  URL: https://fsarmesto.github.io/liquidacion-arbitral-fcvb/
- Backend: Supabase, proyecto `vevsurxxvjivjizuuqad` (región eu-west-3, plan gratuito).
  - Funciones (`supabase/functions`): `auth-isquad` (login con usuario de iSquad; `save:false` = sin guardar), `ranking` (solo admins), `notify` (notificaciones), `equipos` (equipos favoritos), `indexar` (índice de plantillas, cron), `vigilar` (avisos al momento, cron), `sync` (cron y botón
    "Actualizar ahora"), `delete-account`. Código compartido en `_shared/` (`isquad.ts` lector, `sync.ts`
    guardado y km, `crypto.ts` cifrado AES-GCM de la contraseña de iSquad).
  - Migraciones en `supabase/migrations` (001…005). Se aplican con `db push`, en orden.
  - Cron (pg_cron + pg_net, `supabase/cron.sql`): `sync-isquad` `0 7,15 * * *` UTC (9:00 y 17:00 en verano) y
    `recordatorio-domingo` `0 18,19 * * 0` UTC (la función solo envía si en Madrid son las 20) e
    `indexar-plantillas` `*/15 * * * *` (solo trabaja con lo caducado: 14 días) y `vigilar` `*/10 * * * *`.

## Secretos (nombres; los valores están en el gestor de contraseñas)

`CREDS_KEY` (cifra las contraseñas de iSquad; si se pierde, cada usuario solo tiene que volver a entrar),
`CRON_SECRET`, `ORS_KEY` (OpenRouteService), contraseña de la base de datos, `ADMIN_LOGINS` (quién ve el ranking),
`VAPID_PUBLIC`/`VAPID_PRIVATE`/`VAPID_SUBJECT` (notificaciones; la pública también va en `docs/config.js`; si se
cambian, todas las suscripciones dejan de valer y cada árbitro tiene que volver a activarlo), `ROSTER_SALT`
(huellas del índice de plantillas; si cambia, hay que reindexar: `update pub_teams set checked_at=null`). `ALLOWED_LOGINS` está vacío:
puede entrar cualquier árbitro con cuenta de iSquad. Para desplegar hace falta un token personal de Supabase
(`SUPABASE_ACCESS_TOKEN`, se crea en supabase.com/dashboard/account/tokens) y acceso de escritura al repo.

## Desplegar

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...            # no dejarlo en ficheros del repo
SB="npx -y supabase@2.121.0"
$SB link --project-ref vevsurxxvjivjizuuqad -p "$DB_PASSWORD"
$SB db push -p "$DB_PASSWORD"                   # migraciones nuevas
for f in auth-isquad sync delete-account ranking notify equipos indexar vigilar; do
  $SB functions deploy $f --project-ref vevsurxxvjivjizuuqad --no-verify-jwt --use-api
done
git push origin main                            # la web se publica sola (Pages)
```

Comprobar tipos antes de desplegar: `npx -y deno@2.1.4 check supabase/functions/*/index.ts`.
Lanzar el cron a mano: `curl -X POST https://vevsurxxvjivjizuuqad.supabase.co/functions/v1/sync -H "x-cron-secret: $CRON_SECRET" -d '{}'`.
La respuesta incluye un resumen de km por árbitro (`km: [...]`); los registros de Supabase no muestran nada útil.

## iSquad (voleibol.misquad.es): lo que no es obvio

- Login: POST `loginarbitros.php` (login, password, qr_login=0, utr). Designaciones en `arbitros_designaciones.php?rol=1`.
- **Hay que enviar siempre la cookie `TemporadaSelect`** (p. ej. `2627`). Sin ella el desplegable marca la temporada
  en curso pero la tabla llega vacía. Se leen la temporada en curso y la anterior.
- El texto viene con comillas escapadas (`D\'HEBRON`): se quita la barra al leer.
- En concentraciones y campeonatos varios partidos comparten código: a esos se les añade `@fecha T hora` al id.
- Rol y equipo arbitral: `json/arbitros_ver_datos_designacion.php` (POST `id_designacion`). Todos salen como
  "ARBITRO" sin número: el primero de la lista es el 1r, el segundo el 2n (confirmado con un partido). En
  **Superliga** el segundo "ARBITRO" es el **juez de línea**; en Superliga 2 hay 1r, 2n y anotador.
  Los partidos ya jugados se leen una vez; los futuros y de los últimos 3 días, en cada pasada.
- Selecciones territoriales (competición con "SELECCION"): tarifa 0; solo cuentan sus gastos pagados.
- Algunas direcciones son un código de Google Maps sin calle ni CP ("VM47+RH SANTA COLOMA DE FARNERS"): se usa el centro de la población.

## Reglas de pago (en `docs/index.html`)

- Tarifas: objeto `CATS` (anexo 2026/27; también se aplica a 25/26). Categoría automática con `guessCat`
  (Júnior de 2ª se paga como 1ª). Al cambiar de temporada, actualizar `CATS` y `dietaFor` con el anexo nuevo.
- Franja (dieta y desplazamiento): mañana hasta las 14:59, tarde desde las 15:00 (`franjaOf`; lo dijo Ferran y cuadra
  con los recibos: 13:00+14:45 = 1 viaje, 13:00+16:00 = 2).
- Dieta: una por jornada y franja; festivos de Catalunya automáticos (no los
  locales); editable a mano por partido (`matches.dieta_override`).
  Festivo entre semana: 18 € solo en las franjas de festivo (0:00–8:59, 14:01–15:59, 18:31–23:59); fuera de ellas,
  la dieta normal de ese día (confirmado con un recibo de la FCVB: lunes 12-oct a las 17:00 = 10 €).
- Desplazamiento: una ida y vuelta por **pabellón y franja** (mañana y tarde en el mismo pabellón = 2).
- IRPF: porcentaje en `profiles.irpf` (2 % por defecto, lo que retiene la FCVB), solo sobre la tarifa (dieta, km y peajes exentos). Las cifras son netas.

## Importes de la FCVB (mandan sobre el cálculo)

- Login: iSquad alterna entre 2 pantallas. El 20-oct-2026 `loginarbitros.php` redirigía a `loginunico.php?area=arbitros`
  (formulario con `csrf_token`, campos `login`/`password`/`lu_disp`) y el 21-oct volvió al revés. `loginIsquad()` en
  `isquad.ts` pide el único y, si acaba en el clásico, entra por el clásico. Si todos los árbitros salen con
  `last_error='credenciales'` a la vez, es esto: mirar a qué formulario lleva hoy `loginunico.php?area=arbitros`.
- `arbitros_listado_recibos.php` (tabla `tabla_listado_recibos`, por temporada con la cookie): por partido tarifa,
  gastos (desplazamiento + dieta juntos) y estado del pago. Se guarda en `matches.fcvb_tarifa/fcvb_gastos/fcvb_pago`
  y en la web sustituye a la previsión; "PAGADO…" cuenta como cobrado. Se lee con regex (1 MB por página).
- Comparación 20-oct (temporada 26/27, 12 árbitros, 165 partidos): tarifa igual en 165/165. Gastos: la FCVB paga
  una ida y vuelta por pabellón y FRANJA (27 de 30 días claros, 9 árbitros) y la reparte entre los partidos; usa sus
  propios km. Un partido que empieza antes de las 15:00 cuenta como mañana aunque acabe por la tarde.
- `arbitros_listado_facturas.php`: solo el neto de cada recibo.

## Cobros, filtros, modo sin guardar y ranking (21-oct-2026)

- Recibos: además de tarifa/gastos/estado se guardan `fcvb_limite` ("Fin cambios": el pago se pide en iSquad solo
  hasta el DÍA SIGUIENTE al partido; si no, "PLAZO SOLICITUD PAGO TERMINADO" y no se cobra), `fcvb_accion`
  (editar | procesando | factura) y `fcvb_campo` (tarifa cobrada en el pabellón). Migración 010.
  En la web `payState()`: pagado, solicitado, solicitar, perdido, nada, sinrecibo, futuro; avisos arriba y desglose
  de lo pendiente en la cabecera. Pie de la tabla de iSquad: importe no solicitado / solicitado / pagado.
- Filtros (`renderFilters`): designación (rol leído de iSquad), división, categoría de edad y género sacados del
  texto de la competición (`compParts`); cada desplegable cuenta los partidos que cumplen los demás filtros.
  Se recuerdan en el navegador (localStorage `liq-filtros`).
- Entrar sin guardar: `auth-isquad` con `save:false` lee iSquad (con equipo arbitral de todos los partidos) y
  devuelve los partidos sin crear cuenta ni guardar nada. En la web `GUEST`: todas las escrituras pasan por
  `store()`, que en ese modo no hace nada; recargar = salir.
- Ranking: función `ranking`, solo para los usuarios de iSquad del secret `ADMIN_LOGINS` (comprobado en el servidor
  con la sesión). La web muestra el panel solo si la función responde.

## Equipos (web pública de resultados, 21-oct-2026)

- Fuente: `resultadosvoleibol.isquad.es` (la que enlaza fcvolei.cat), sin login. Cada página pesa ~1 MB por el menú.
  - Todos los partidos de la federación desde hoy: POST `json/partidos_equipos_consultas.php`
    (`accion=obtener_partidos`, `id_ambito=17` = FCVB, `fecha_actual`, `consulta=0`, `id_superficie=1`): ~7.000
    filas (13 MB) con local, visitante, ids de club, competición, categoría, fecha y pabellón. Sin resultados.
  - Clubs: `listado_clubs.php`; equipos de un club: `club.php?id=` (id_equipo, nombre, categoría sin género);
    plantilla: `equipo.php?id_equipo=&id_territorial=17` (tabla `tabla-plantilla`: nombre, perfil Jugador/Invitado/Entrenador).
  - Calendario iCal de un equipo (3 KB, sin pabellón ni resultado): `voleibol.isquad.es/json/equipo_google_calendar.php?id_equipo=&v=<firma de la ficha>`.
  - Textos con UTF-8 leído como Windows-1252 ("PAVELLÃ“"): `fixMojibake` ANTES de limpiar espacios (la "à" acaba en 0xA0).
- Función `equipos` (con sesión): buscar, seguir/dejar, buscarme (repasa las plantillas de un club) y mis (favoritos +
  próximos partidos). Caché compartida `pub_cache` (feed 3 h, clubs y equipos de club 7 días). Tabla `fav_teams`
  (migración 013): de la plantilla solo se guarda el rol del propio árbitro, nunca nombres de otros (hay menores).
- Categoría del partido = categoría + género sacado de la competición ("CUARTA DIVISION SENIOR FEMENINO"); la de un
  equipo encontrado en la ficha del club no lleva género: se compara por prefijo (`sameCat`).
- Encontrar al árbitro sin que haga nada: la cabecera de su área de iSquad lleva su foto de afiliado
  (`images/afiliacion/imagen_<id>.jpeg`, se guarda en `profiles.foto` en cada sync) y las plantillas públicas usan la
  misma. La función `indexar` (migraciones 014-015) recorre los ~166 clubs y ~1.500 equipos (120 páginas por pasada,
  ~15 s; el índice completo, en unas 15 pasadas) y guarda por persona la huella HMAC de foto y nombre, el perfil y si
  tenía foto. En `equipos mis` se cruzan: por foto siempre; por nombre solo si esa persona no tiene foto (si tiene
  otra, es un homónimo). Comprobado 21-oct: 11 de 14 árbitros encontrados, todos por foto. Los añade como `auto`; si
  el árbitro los quita quedan `oculto` y no vuelven.
- Web: pestaña "Equipos" y, en "Mis partidos", los partidos de los equipos con aviso de choque con un arbitraje
  (mismo día a menos de 2 h 30 min, o mismo día con la hora por confirmar).
- Calendario completo con resultados: API del buscador público `voleibol.isquad.es/json/api/call.php/resultados/
  busquedaGlobal?token=<token de la página>` (POST q=<nombre del equipo>, categoria=partidos, id_temporada, limit=20,
  page). Devuelve por partido estado (Pendiente, Finalizado, Suspendido...), resultado en sets, fecha, hora,
  `fecha_confirmada` (1 = horario confirmado; si no, hora provisional o 0:00 = sin horario), jornada, grupo e ids de
  equipo. Sin pabellón: se cruza con el listado. Token: `let token = "..."` de cualquier página pública (caché 12 h,
  se renueva si la API da error). `teamMatches` en `_shared/publico.ts`, caché `tm:<id_equipo>` 30 min.
  En la web, etiquetas: Ganado/Perdido con el resultado, Por jugar · hora, hora sin confirmar, sin horario, Suspendido.
  Pendiente: clasificación.

## Mis partidos (agenda, 21-oct-2026)

- `matches.crew` (migración 012): equipo arbitral de la designación `[{f, n, me}]` (f = r1/r2/an/jl o el texto de
  iSquad; solo nombres, ni teléfonos ni correos). Lo rellena `parseStaff`; el sync abre primero las designaciones
  más nuevas y repasa poco a poco las de la temporada en curso que aún no tienen `crew`.
- En la web, pestañas "Cobros" / "Mis partidos" (`VIEW`, recordada en localStorage `liq-vista`); la agenda
  (`renderAgenda`) tiene "Próximos" y "Jugados" de la temporada, respeta los filtros y enlaza a Google Maps.

## Avisos al momento (función vigilar, 21-oct-2026)

- Cada 10 minutos, de 7:00 a 24:00 de Madrid, y solo para quien tiene notificaciones (`push_subs`):
  1. sync rápido de cada árbitro (función sync, modo `quick`: solo designaciones de la temporada en curso, sin recibos
     ni km, sin tocar `last_sync`) y `designChanges` (en `_shared/sync.ts`) compara con lo guardado: nueva, cambio de
     fecha/hora/pabellón, anulada. El sync completo del cron (`mode: "sync"`) también avisa. El primer alta no.
  2. calendario (API pública) de los equipos donde juega o entrena (activos en "Mis partidos") contra la foto anterior
     `pub_cache snap:<id_equipo>`: ya hay horario, cambio de horario o fecha, suspendido/aplazado (`teamChanges`).
     La primera pasada de un equipo solo guarda la foto.
- Envío en `_shared/push.ts` (también lo usa `notify`). La notificación abre la app en `?vista=agenda`.
- Coste: 1 login a iSquad por suscrito cada 10 minutos (17 horas al día) y 1 consulta ligera por equipo vigilado.

## App instalable y recordatorio del domingo (21-oct-2026)

- PWA: `manifest.webmanifest`, iconos PNG (`icon-192/512`, `icon-maskable`, `apple-touch-icon`), `sw.js` (solo
  notificaciones, sin caché a propósito: la app se carga siempre de la red). En iPhone las notificaciones solo
  funcionan con la app añadida a la pantalla de inicio (iOS 16.4+) y abierta desde el icono.
- Web Push: tabla `push_subs` (sin políticas: solo la función `notify` con service role). La web suscribe con
  `notify {action:"subscribe"}`, borra con `unsubscribe` y prueba con `test` (solo los dispositivos de ese árbitro).
  El cron manda: "¡No te olvides de subir los resultados y revisar tus cobros de dietas/kilometraje!". Las
  suscripciones que devuelven 404/410 se borran solas. Forzar un envío a todos: `notify` con cron secret y `{"force":true}`.

## Km que paga la FCVB (aprendidos de los recibos)

- Estudio 21-oct-2026 (12 árbitros, 2 temporadas): la FCVB paga los km **de población a población**, no hasta el
  pabellón. Cada árbitro cobra lo mismo a todos los pabellones de Barcelona (p. ej. Ferran 68, aunque la ruta va de
  51 a 65), y un pabellón que iSquad pone en otra población (Hospitalet Nord, "08906 BARCELONA") se paga como esa
  población. En la población propia se paga el mínimo (4 €). Con esos km, la regla de la app (1 ida y vuelta por
  pabellón y franja, dieta por franja, mínimo) reproduce al céntimo 238 de 320 días comprobables; el resto es lo que
  pide cada árbitro (dietas pedidas o no, viajes entre pabellones).
- `learnFcvbKm()` en `docs/index.html` (al cargar): de los días claros (todo liquidado, una sola población según
  iSquad = texto tras el CP, sin peajes) despeja los km de cada temporada y población (`FKM`). `kmInfo()` decide:
  km del partido a mano > del pabellón a mano > FCVB de esta temporada (un día suelto solo si se parece a la ruta;
  si se aleja, visto 2 veces; el mínimo solo si la ruta es corta) > FCVB de la temporada anterior si se parece a la
  ruta (los que se mudan: Vanessa, Pau) > ruta calculada. Etiquetas "km FCVB" / "mínimo FCVB".
- Validación cronológica (cada día predicho solo con los anteriores): días exactos 108 → 189 de 461, a menos de
  3 € 238 → 274. El banco de pruebas está en la sesión del 21-oct (Chrome sin ventana + supabase simulado).
- Selecciones: tarifa 0, pero la FCVB paga gastos del día (agrupados en un partido). Se muestran y cuentan solo si
  tienen gastos (`isHidden`); no generan previsión de dieta ni de desplazamiento.

## Km por carretera

- Direcciones y poblaciones: **Photon** (photon.komoot.io). **Nominatim no sirve: bloquea las IP de Supabase (403).**
  Se acepta una calle solo si coincide código postal o municipio; si no, centro de la población (`km_source='poblacion'`, "km aprox.").
  iSquad a veces pone mal la población ("08880 BARCELONA" es Cubelles): manda el código postal. Un resultado con
  otro código postal de distinta zona (3 primeros dígitos) se rechaza y se repite sin la población; de reserva, el
  centro del código postal antes que el de la población.
- Distancias: la FCVB paga **la ruta más corta**, pero no la "más corta" pura de ORS (`preference: shortest` da caminos
  de 90 min para ahorrar 2 km; el recibo de Vilanova → Els Arcs pagó 47 km = la normal, la pura daba 45). Se pide la
  ruta con `alternative_routes` (3, weight_factor 1.6) y se toma la de menos km; ORS solo da alternativas hasta ~100 km
  (error 2004), más lejos la ruta normal. Son rutas sueltas: **200 al día** en el plan gratuito. El cupo no se renueva a medianoche: es una ventana de 24 h desde
  el primer uso (si se agota a las 15:30, hasta las 15:30 del día siguiente no hay rutas).
  Reserva sin cupo: **ORS Matrix** (solo la más rápida); esos km quedan `venues.km_rule='rapida'`.
  Cada pasada, con el tiempo y cupo sobrantes, recalcula con la ruta corta los km que no son `km_rule='corta'`
  (los antiguos y los de Matrix); los manuales no se tocan. Caché de rutas con prefijo `c:` (sin prefijo = antiguas, rápidas).
- Caché compartida entre árbitros: `geo_cache` (también "no encontrado", 7 días) y `route_cache`.
  Coordenadas del origen en `profiles.origin_lon/lat` (un trigger las borra si cambia `origin`).
- Un solo cálculo a la vez (fila `km_lock`). Errores del servicio no cuentan como intento; lo no encontrado se
  reintenta a la semana (`venues.km_tried_at`).

## Trampas de Supabase (plan gratuito)

- Con varios árbitros en una sola ejecución da `WORKER_RESOURCE_LIMIT`: el cron reparte una ejecución por árbitro.
- Funciones ~150 s de reloj y pg_net corta a 120 s: todo usa una hora límite contada desde la petición.
- PostgREST devuelve como mucho 1000 filas: paginar con `.range()`.
- En filtros `in(...)` la barra invertida se toma como escape: con claves de pabellón usar `eq` uno a uno.

## Probar sin tocar producción

Vista previa local: copiar `docs/` a una carpeta temporal, sustituir el `<script>` de supabase-js por un
`supabase` simulado que lea un JSON de datos, servir con `python3 -m http.server` y hacer capturas con
`google-chrome --headless=new --screenshot`. Para el ancho de móvil, meter la página en un iframe de 390 px
(Chrome sin ventana no baja de ~500 px).

## Decisiones tomadas (y por qué)

- Acceso abierto: `ALLOWED_LOGINS` vacío, cualquier árbitro con cuenta de iSquad puede entrar. Para cerrarlo,
  poner la lista de usuarios en ese secret (quien no esté, deja de poder entrar).
- La temporada 2025/26 se calcula con las tarifas de 2026/27 (decisión del autor: importes aproximados en esa temporada).
- Se traen la temporada en curso y la anterior; la web tiene selector de temporada (se recuerda en el navegador).
- Logo de la FCVB en la cabecera, siempre con "App no oficial" al lado: no es una herramienta de la federación.
- Selecciones territoriales: solo se muestran y cuentan las que la FCVB ha pagado con gastos (tarifa 0).
- Rol y categoría no son editables: salen de iSquad. Lo editable a mano: dieta por partido, km por pabellón,
  peajes, "cobrado" y el IRPF del árbitro.
- Exportación a Excel (SheetJS 0.18.5 cargado al pulsar): temporada seleccionada, importes como números.

## Pendiente (técnico)

- Recalcular con Photon los km antiguos marcados como aproximados (los calculados antes de pasar a Photon):
  vaciar `km`/`km_tried_at` de esos pabellones (`km_source='poblacion'`, no los `manual`) y lanzar el cron.
- Si algún día no basta el cupo de ORS Matrix: el servidor público de rutas Valhalla de FOSSGIS
  (gratis, sin clave, 1 consulta/s) como segunda reserva. No probado desde Supabase.
- Al empezar la temporada 2027/28: actualizar `CATS` y `dietaFor` con el anexo nuevo.

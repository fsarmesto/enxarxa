# Vòlei EnXarxa (antes "Liquidación arbitral FCVB", "Vòlei FCVB" y "LaXarxa") — contexto para seguir el trabajo

El 21-oct-2026 la app dejó de ser solo para árbitros y pasó a llamarse LaXarxa; ese mismo día se cambió a
**Vòlei EnXarxa** porque "La Xarxa" es la marca de la Xarxa Audiovisual Local (Diputació de Barcelona, La Xarxa+).
"EnXarxa" comprobado en la OEPM (nada en apps, deporte ni software). El dominio enxarxa.cat es de la Fundació en Xarxa
(educación, también tiene app en Play/App Store): no usarlo ni mencionarlo; Ferran lo sabe y sigue adelante.
Nombre completo "Vòlei EnXarxa" (con acento catalán también en castellano: título, cabecera, manifest `name`,
notificaciones, calendario), `short_name` "EnXarxa" (bajo el icono; Android corta a ~12 caracteres).
Repo `fsarmesto/enxarxa`, web https://fsarmesto.github.io/enxarxa/. Las direcciones viejas (`/liquidacion-arbitral-fcvb/`,
`/volei-fcvb/`, `/laxarxa/`) las sirve el repo `fsarmesto.github.io`: redirigen a la nueva y mantienen los avisos viejos
(`sw.js` puente); `initPush` pasa la suscripción del service worker viejo al nuevo y lo da de baja. El paquete Android sigue siendo
`io.github.fsarmesto.liquidacion` (no cambiar: sería otra app). Los UID del iCal siguen con `@liquidacion-arbitral-fcvb`
(no cambiar: duplicaría eventos). Carpeta local en casa: `C:\Users\Puru\FCVBARB\carpetas\EnXarxa\laxarxa`.

## Al empezar una sesión local

- Ejecutar `gh issue list` y decirle a Ferran qué issues hay abiertos (en casa lo hace solo un hook SessionStart).
- Al arreglar un issue: comentar en el issue qué se ha cambiado (`gh issue comment N`, con el hash del commit) y
  cerrarlo con el commit (`Fixes #N` en el mensaje); comprobar después que ha quedado cerrado.

## Trabajo desde GitHub (@claude)

Ferran puede escribir @claude en un issue o en un PR (también desde el móvil) y el trabajo se hace en GitHub Actions
(`.github/workflows/claude.yml`, anthropics/claude-code-action@v1, con el token de su suscripción en el secret
`CLAUDE_CODE_OAUTH_TOKEN`). Solo se activa si quien escribe es el dueño del repo y solo lee sus comentarios.
`main` está protegida (regla del repo: solo un admin puede escribir en ella), así que el trabajo va siempre en una
rama `claude/...` con PR. Reglas para esos trabajos:

- Solo se toca `docs/`, `README.md` y `LICENSE`. Excepciones: `tools/i18n/exact.py` (para las traducciones) y
  `.github/capturas/` (para las capturas del PR). Nada de `supabase/`, migraciones, funciones, secretos ni workflows.
- Si un issue necesita base de datos o funciones de Supabase, no se hace: se comenta en el issue qué haría falta y
  se deja para una sesión local.
- Todo texto nuevo de la interfaz, con su traducción al catalán: añadirlo en `tools/i18n/exact.py` y regenerar con
  `python3 tools/i18n/gen.py tools/i18n docs/i18n-ca.js`. Las páginas legales llevan las 2 versiones dentro.
- Capturas a 390 px de ancho, en claro y en oscuro, adjuntas al PR: copiar `docs/` a una carpeta temporal, cambiar
  `<script src="vendor/supabase-2.45.4.js"></script>` por un `supabase` simulado con datos INVENTADOS (nunca
  reales), servirla con `python3 -m http.server` y meter la página en un iframe de 390 px; `google-chrome
  --headless=new --screenshot` (oscuro: `--blink-settings=preferredColorScheme=0`). Guardar los PNG en
  `.github/capturas/<número del issue>/`, subirlos en la rama y enlazarlos en la descripción del PR.
- El PR lo abre Claude contra `main` (`gh pr create`) con "Fixes #N". Ferran lo revisa y lo fusiona.

## Reglas de interfaz

- Toda lista con varios partidos se agrupa por semanas con el componente común (semana actual destacada, secciones de
  próximas y anteriores, título fijo al hacer scroll). No crear listas de partidos sin agrupar. (Issue #27.)
  - `weeksHtml(items, dateOf, {scope, head, body, openPrev})` para listas grandes (Cobros, Mis partidos): anteriores
    plegadas, `WK_OPEN` con clave scope+lunes; `wkHead(w, n, extra)` da el título. `weekGroups` hace la agrupación.
  - `weeksCompact(items, dateOf, row)` para listas dentro de una tarjeta (calendario de un equipo, partidos desde
    Clasificación): casi siempre 1 partido por semana, así que no se pliega ni se fija; mismo orden y borde amarillo.

## Piezas

- Web: `docs/index.html` (todo en un fichero: HTML, CSS y JS), publicada con GitHub Pages desde `main` → `/docs`.
  URL: https://fsarmesto.github.io/enxarxa/
- Backend: Supabase, proyecto `vevsurxxvjivjizuuqad` (región eu-west-3, plan gratuito).
  - Funciones (`supabase/functions`): `auth-isquad` (login con usuario de iSquad; `save:false` = sin guardar), `notify` (notificaciones), `equipos` (equipos favoritos), `indexar` (índice de plantillas, cron), `vigilar` (avisos al momento, cron), `coche` (compartir coche), `designadas` (panel de designaciones, admin), `calendario` (feed iCal), `sync` (cron y botón
    "Actualizar ahora"), `delete-account`. Código compartido en `_shared/` (`isquad.ts` lector, `sync.ts`
    guardado y km, `crypto.ts` cifrado AES-GCM de la contraseña de iSquad).
  - Migraciones en `supabase/migrations` (001…027). Se aplican con `db push`, en orden.
  - Cron (pg_cron + pg_net, `supabase/cron.sql`): `sync-isquad` `0 7,15 * * *` UTC (9:00 y 17:00 en verano) y
    `recordatorio-domingo` `0 18,19 * * 0` UTC (la función solo envía si en Madrid son las 20) e
    `indexar-plantillas` `*/15 * * * *` (solo trabaja con lo caducado: 14 días) y `vigilar` `*/10 * * * *`.

## Secretos (nombres; los valores están en el gestor de contraseñas)

`CREDS_KEY` (cifra las contraseñas de iSquad; si se pierde, cada usuario solo tiene que volver a entrar),
`CRON_SECRET`, `ORS_KEY` (OpenRouteService), contraseña de la base de datos, `ADMIN_LOGINS` (quién ve los paneles de admin),
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
for f in auth-isquad sync delete-account notify equipos indexar vigilar coche designadas calendario; do
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

## Cobros, filtros y modo sin guardar (21-oct-2026)

- Recibos: además de tarifa/gastos/estado se guardan `fcvb_limite` ("Fin cambios": el pago se pide en iSquad solo
  hasta el DÍA SIGUIENTE al partido; si no, "PLAZO SOLICITUD PAGO TERMINADO" y no se cobra), `fcvb_accion`
  (editar | procesando | factura) y `fcvb_campo` (tarifa cobrada en el pabellón). Migración 010.
  En la web `payState()`: pagado, solicitado, solicitar, perdido, nada, sinrecibo, futuro; avisos arriba y desglose
  de lo pendiente en la cabecera. Pie de la tabla de iSquad: importe no solicitado / solicitado / pagado.
  "PAGADO" en iSquad se puede desmarcar (Pendiente) si el dinero aún no ha llegado: `matches.not_received`
  (migración 026, campo manual de `sync.ts`), estado `porllegar`, suma en pendiente. `payPatch(m,v)` decide qué se guarda.
  Km a mano (`kmInfo` src manual) en un recibo aún sin pedir ni pagar (`fcvbFixed`): mandan los km de la app para dieta y
  desplazamiento (`r.fcvbTarifa`: solo la tarifa es de la FCVB). iSquad pone gastos 0 hasta que se rellena la hoja.
- Semanas (issue #17): "Esta semana" en un bloque con borde amarillo, luego "Próximas semanas" y "Semanas anteriores"
  (plegadas en una fila, `WK_OPEN`; se abren solas si hay un pago por pedir). El título de semana es sticky (en el
  móvil, bajo la cabecera compacta: 59 px). En el móvil (`MOBILE_Q`, ≤720 px) cada partido es una tarjeta `details.mc`
  (`cardHtml`: hora + `shortComp`, equipos, pabellón, neto y estado; al abrir, desglose en dos columnas, [Pendiente |
  Cobrado] y "Editar" que abre km/peajes/dieta, `MC_EDIT`); en escritorio sigue la tabla. `data-l` también se traduce.
- Filtros (`renderFilters`): designación (rol leído de iSquad), división, categoría de edad y género sacados del
  texto de la competición (`compParts`); cada desplegable cuenta los partidos que cumplen los demás filtros.
  Se recuerdan en el navegador (localStorage `liq-filtros`). Van recogidos (issue #15): botón "Filtros · n" que abre
  una hoja modal desde abajo en móvil (bloquea el scroll y el foco) o un panel en escritorio, con Aplicar y Limpiar;
  los activos salen como etiquetas con ×. En Mis partidos, "Ver partidos como" (Todo / Árbitro / Jugador) es un filtro más.
- Entrar sin guardar: `auth-isquad` con `save:false` lee iSquad (con equipo arbitral de todos los partidos) y
  devuelve los partidos sin crear cuenta ni guardar nada. En la web `GUEST`: todas las escrituras pasan por
  `store()`, que en ese modo no hace nada; recargar = salir.
- Sin ranking (quitado el 21-oct-2026, tarea legal): enseñaba los cobros de otros árbitros con nombre, y eso no lo
  aceptó nadie. Paneles de admin (`designadas`, solo `ADMIN_LOGINS`): la web pregunta `{action:"admin"}`; "Salud" enseña
  cada cuenta con un id corto (6 caracteres del user_id), nunca nombres ni emails.

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
- Pestaña Equipos (#18): título con botón (i) que despliega la explicación; tarjeta `.eqc` por equipo: etiqueta + nombre,
  división · club, filas "Último"/"Próximo" (fecha, rival, casa/fuera, estado), acciones con flex-wrap ([Sí | No] en Mis
  partidos, Clasificación, Calendario (n) que despliega `.calbox`, y "⋯" con No soy yo / Dejar de seguir).
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
  Equipo arbitral: `previo.php?id_partido=` (página pública ~800 KB): un bloque `divN` por persona ("ARBITRO",
  "ARBITRO", "ANOTADOR/CRONOMETRADOR", "TV" vacío); el primer ARBITRO es el 1r. Sale en cuanto está designado.
  `matchOfficials`: caché `arb:<id>` 3 h si no se ha jugado, 30 días si sí; en `equipos mis`, partidos de ±21 días de
  los equipos activos, como mucho 16 por petición.
  Pendiente: clasificación.

## Mis partidos (agenda, 21-oct-2026)

- `matches.crew` (migración 012): equipo arbitral de la designación `[{f, n, me}]` (f = r1/r2/an/jl o el texto de
  iSquad; solo nombres, ni teléfonos ni correos). Lo rellena `parseStaff`; el sync abre primero las designaciones
  más nuevas y repasa poco a poco las de la temporada en curso que aún no tienen `crew`.
- En la web, pestañas "Cobros" / "Mis partidos" (`VIEW`, recordada en localStorage `liq-vista`); la agenda
  (`renderAgenda`) tiene "Próximos" y "Jugados" de la temporada, respeta los filtros y enlaza a Google Maps.

## Guía, resumen y compartir coche (21-oct-2026)

- Guía de 3 pasos la primera vez (localStorage `liq-guia-vista`) y "Compartir la app" (navigator.share o enlace + QR
  con qrcodejs 1.0.0 de `docs/vendor`, cargado al pulsar). Ambos también en Ajustes.
- Pestaña "Resumen" (`renderResumen`): temporada (neto por mes, por categoría, por designación, compañeros más
  frecuentes, pabellones) o año natural para la renta (solo lo cobrado, por la fecha de "PAGADO - dd/mm/aaaa").
  Respeta los filtros. PDF con window.print() y estilos @media print (solo #resumen).
  Estrella amarilla (`STAR_SVG`, `topIdx`, issue #20) en el máximo de cada gráfico y lista (todos los empatados; nada si
  hay menos de 2 valores distintos de 0); bajo las barras, "Mejor mes: …", que también va en el aria-label.
- Compartir coche (`profiles.coche`, migración 017, función `coche`): opcional; para cada designación de los próximos
  30 días, otros árbitros con la opción activada que ese día van al mismo pabellón o a la misma población (nombre
  como sale en sus designaciones, hora, pabellón, población de salida). Línea 🚗 en la tarjeta del arbitraje.

## Jugadores y entrenadores sin licencia de árbitro (21-oct-2026)

- Comprobado con la cuenta de Ferran: **una sola cuenta de iSquad por persona**. Las mismas credenciales entran en
  árbitros (`loginarbitros.php`), jugadores (`login.php` → `shortcut_hub_voleibol.php`, cabecera "NOMBRE Jugador")
  y entrenadores (`loginentrenadores.php` → `entrenadores_licencias.php`, "STAFF TÉCNICO"); el id de afiliado es el mismo.
- `auth-isquad`: si no entra como árbitro, prueba `loginDeportista` (jugador, luego entrenador). Crea el perfil con
  `tipo='deportista'` (migración 018), nombre y foto, **sin guardar la contraseña** (no hay nada que leer de su iSquad).
- Sync, aviso de cobro y recordatorio del domingo, solo para árbitros. En la web (`DEP`, clase `body.dep`) se oculta
  todo lo `.arb-only` (cobros, resumen, filtros, ajustes de árbitro); quedan Mis partidos y Equipos.

## Catalán (21-oct-2026)

- Generador en `tools/i18n/`: añadir textos en `exact.py` (o reglas/fragmentos en `gen.py`) y regenerar con
  `python3 tools/i18n/gen.py tools/i18n docs/i18n-ca.js`. No editar `docs/i18n-ca.js` a mano.

- Idioma en `LANG` (localStorage `liq-lang`; por defecto el del móvil), selector en Ajustes y en la pantalla de entrar;
  cambiar recarga la página. Fechas y meses con `LOC()` (es-ES / ca-ES).
- La app se escribe en castellano. Con catalán, `translateNode` (MutationObserver sobre body) traduce cada texto que se
  pinta con `docs/i18n-ca.js`: `exact` (texto entero), `rules` (patrones con números o datos) y `frags` (expresiones
  por palabras completas). Lo marcado `data-noi18n` no se toca; los datos de iSquad no coinciden con las claves.
- **Al cambiar o añadir un texto en index.html, hay que añadir su traducción** en `i18n-ca.js` (las claves son el
  texto castellano exacto). Para encontrar lo que falta: recorrer la app en Chrome sin ventana con la app en catalán,
  recoger los textos visibles y buscar palabras castellanas (así se hizo el 21-oct).
- El Excel se genera en el navegador en el idioma de la app (cabeceras, textos, nombre de la hoja y del fichero pasan
  por `tr()`). Sin traducir: las notificaciones push (se generan en el servidor en castellano).

## Edad mínima y política aceptada (21-oct-2026)

- Mayores de 14 años (por debajo hace falta el consentimiento de los padres). Cuenta nueva: casilla "Tengo 14 años o más"
  (`aAge`) además de la de consentimiento; sin ella no se crea la cuenta (la web lo para y `auth-isquad` también: `age14`).
- `profiles.consent_at` y `profiles.policy_version` (migración 020). Las cuentas nuevas los guardan al crearse; el resto
  ve al entrar un aviso que no se puede cerrar (`openConsent`) y acepta con la función SQL `aceptar_politica(v)` (la fecha
  la pone el servidor). Si no marca la casilla: mensaje para menores y botón de borrar la cuenta.
- Versión vigente en `POLICY_VERSION`, en 2 sitios que tienen que coincidir: `docs/index.html` y
  `supabase/functions/_shared/politica.ts`. Cambiarla vuelve a pedir la aceptación a todos.

## Privacidad, aviso legal y licencia (22-oct-2026, decidido por Ferran)

- Páginas `docs/condiciones.html` (condiciones de uso), `docs/privacidad.html`, `docs/aviso-legal.html` y
  `docs/eliminar-cuenta.html` (cómo borrar la cuenta; Google Play pide un enlace así), con `legal.css` y `legal.js`: castellano y catalán
  en la misma página, se ve el de `liq-lang` o el del móvil; selector ES/CA. Enlazadas desde la pantalla de entrar,
  la guía, Ajustes y el aviso de aceptación. Contacto: fsarmesto@gmail.com. Si cambia su contenido: actualizar la
  fecha de las 2 versiones y subir `POLICY_VERSION` (vigente `2026-10-22.2`, condiciones y política), que vuelve a
  pedir la aceptación a todos.
- Documentación interna en `legal/`: registro de actividades, análisis de riesgos (hace de evaluación de impacto
  simplificada), encargados (Supabase: su DPA va incluido en sus condiciones, no hay que firmar nada) y brechas.
  Revisarla al tratar datos nuevos o cambiar de proveedor.
- La web no carga nada de terceros: tipografías Barlow en `docs/vendor/fonts` y supabase-js, SheetJS y qrcodejs en
  `docs/vendor` (licencias en `docs/vendor/LICENCIAS.md`). En la vista previa, sustituir `vendor/supabase-2.45.4.js`.
- Alta: la casilla de consentimiento es "Lo entiendo y acepto las condiciones de uso y la política de privacidad"
  (con enlaces). Aviso a las cuentas existentes: edad y "He leído y acepto las condiciones de uso y la política de
  privacidad", las 2 obligatorias.
- Cuentas sin usar: `profiles.last_active` (migración 025; la web llama a `marcar_actividad` al abrir). Función
  `inactivas` (cron diario 10:00 UTC): a los 6 meses sin abrir la app borra la cuenta; 30 días antes, un aviso a quien
  tiene notificaciones (una vez, `pub_cache aviso-inactiva:`). El sync automático no cuenta como uso.
- Borrar una cuenta (`borrarCuenta` en `_shared/sync.ts`, la usan `delete-account` e `inactivas`): todo cuelga de
  auth.users en cascada (perfil con cal_token, credenciales y sesión, partidos, pabellones, push_subs, fav_teams,
  push_log) y se borran aparte las claves de `pub_cache` con su user_id (ficha:, aviso-cobro:, aviso-inactiva:).
- En Cobros, bajo las cifras: "Importes orientativos: manda el recibo de la FCVB."
- Licencia: todos los derechos reservados (`LICENSE`): el código se puede consultar, no reutilizar sin permiso escrito
  de Ferran (con permiso, citándole y enlazando el repo). El repo tiene que seguir público para GitHub Pages gratis.
- iPhone: `apple-mobile-web-app-title` era "Liquidación" (por eso los avisos salían con ese nombre); ahora "EnXarxa".
  Quien la tenga añadida a la pantalla de inicio tiene que quitarla y volver a añadirla para que cambie.

## Panel de designaciones publicadas (admin, 21-oct-2026)

- Función `designadas` (solo `ADMIN_LOGINS`): qué categorías tienen partidos designados de hoy al domingo, en toda
  la FCVB. Fuente pública: `partidos_arbitro.php?id_arbitro=` (~0,5 KB, windows-1252) de cada árbitro de
  `listado_arbitros.php` (~454; `partidos_arbitro_territorial.php` da 500), de 10 en 10 (~8 s). Cada designación
  ("LOCAL - VISITANTE", fecha en texto) se cruza con el listado de partidos por fecha y local o visitante; si no,
  por la competición (`compToCat`: "1a DIV. SEN MASC" → PRIMERA DIVISION SENIOR MASCULINO). Caché `desig-global` 1 h.
- En la web, panel "Designaciones publicadas (FCVB)" (dentro de Ajustes, solo admin), se carga al abrirlo.
- Cron `designadas-hora` (`5 * * * *`, la función solo trabaja de 8 a 22 h de Madrid): recalcula, compara con la foto
  `desig-snap:<domingo>` y avisa a los admins de las categorías que pasan de 0 a tener designaciones (sin Alevín ni
  Amateur/Máster). Además `revisarSalud`: si la mitad o más de los árbitros tiene `last_error` o el último sync tiene
  más de 13 h, aviso a los admins (como mucho uno cada 6 h por motivo, `pub_cache salud-aviso:`).
- Panel "Salud de la app" (dentro de Ajustes, solo admin): `designadas {action:"salud"}`: usuarios con su tipo, último sync, error y avisos;
  dispositivos, índice de plantillas y edad de las cachés.

## Móvil: pestañas abajo, cabecera compacta y Cómo llegar (22-oct-2026, issues #2, #3 y #4)

- Por debajo de 720 px las pestañas (`#views`, role="tab" con `aria-selected`) son una barra fija abajo con icono y
  texto; la activa, con una raya roja arriba (Ferran la prefiere roja). `#appView` tiene margen abajo para que no tape nada.
- Cabecera compacta: `#miniBar`, barra fija aparte (nombre y Actualizar) que entra por arriba cuando la fila del
  título de la cabecera grande sale de la pantalla (evento scroll); la grande no cambia de tamaño, así nada salta.
  En Chrome sin ventana, `scrollTo` no lanza el evento scroll: para capturas, lanzarlo a mano.
- Cómo llegar: abre Google Maps (o Apple Maps de reserva) sin fijar el modo; cada uno elige coche, transporte o a pie
  dentro de Maps. El selector de modo del issue #4 se quitó en el #15 (y se borra `liq-ruta`).
- Accesibilidad (#10): `--ink-3` en claro #707070 (4,95:1), foco visible en enlaces, zonas táctiles de 44 px en
  pantallas táctiles.
- Flecha de desplegar (alertas, tarjetas de Mis partidos, calendarios de Equipos): `chevHtml`, botón de 44 px con
  chevron SVG que gira, `aria-expanded` en el summary y texto oculto "Mostrar/Ocultar el detalle".

## Cabecera por pestaña (21-oct-2026)

- Cabecera ligera (issue #15): título, "App no oficial" y "Actualizado: …" (`#updTxt`) debajo, y el botón de icono
  Actualizar (gira mientras trabaja). "Salir" y el enlace a GitHub ("Hecha por fsarmesto") están en Ajustes.
  `#statLine` solo en Cobros: "Pendiente · Cobrado", abre/cierra `#scoreWrap` (cifras y Excel), empieza plegado; su flecha
  es un botón de 44 px como las demás.
- Aviso de versión nueva (`#newVer`): a los 5 s y al volver a la pestaña (máx. 1 vez cada 10 min) pide la página con
  cache:'reload' y compara estilos y scripts en línea; si cambian, "Hay una versión nueva · Actualizar" (recarga).
- Bajo la cabecera, una fila de controles (`#ctrl`): en Cobros y Resumen un solo selector de periodo (`renderPeriod`:
  temporadas y, en Resumen, "Año … · renta"); en Mis partidos [Próximos | Jugados] (`#ctrlSlot`); y el botón Filtros.
- `body[data-vista]` = pestaña activa. Cifras de cobro, IRPF, Excel y avisos de pedir el pago solo en Cobros; el selector
  de temporada en Cobros y Resumen. Si hay avisos y estás en otra pestaña, punto rojo en "Cobros" (`.views .dot`).
- Cabecera con red de vóley (CSS puro: `.board::after` = palos hasta la línea amarilla; `.board .top::before` = cintas
  y malla solo detrás de la fila del título). Icono: red con `</>` (`docs/icon.svg`; PNG renderizados con Chrome
  headless, ImageMagick no pinta los trazos).
- Login: el usuario de iSquad es el email (placeholder y aviso; los 15 usuarios entran con email).

## Calendario y clasificación (21-oct-2026)

- Función `calendario`: `GET ?t=<cal_token>` devuelve un iCal (sin sesión: el token secreto de `profiles.cal_token`,
  migración 019, es la llave) con los arbitrajes desde hace 30 días (pabellón y equipo arbitral) y los partidos de los
  equipos activos y no ocultos de "Mis partidos" (resultado, "hora provisional/por confirmar", sin hora = todo el día).
  `POST {action:"url"|"nuevo"}` con sesión: el enlace (lo crea) o uno nuevo (el viejo deja de valer). En la web,
  Ajustes → Calendario: Google Calendar (`calendar.google.com/calendar/r?cid=webcal://…`), webcal para iPhone/Mac/Outlook,
  copiar y regenerar. Google refresca las suscripciones cuando quiere (horas); el iPhone según REFRESH-INTERVAL.
- Clasificación: `equipos {action:"clasificacion", torneo}` lee `clasificacion.php?id=<id_torneo>` (~900 KB, caché
  `cla:<torneo>` 1 h; columnas Pos, Equipo, racha, PT, PJ, PG, PP, SF, SC, PF, PC). `{action:"historial", torneo,
  id_equipo, team}`: partidos de ese equipo en el grupo (busquedaGlobal filtrado por `id_torneo`). `teamMatches` guarda
  ahora `tor` (id_torneo) y `fase` (caché `tm2:`). En la web, botón "Clasificación" en cada equipo de Equipos: hoja con
  la tabla (tu equipo en amarillo, pestañas si hay varias fases) y al tocar un equipo, sus partidos del grupo.
- Ojo: 32 partidos tienen el pabellón con U+FFFD ("PAVELL�") desde el sync de designaciones: viene roto de iSquad.

## Resultado publicado y acta subida (issue #31, 26-oct-2026)

- Investigado en el issue #31 (comentarios). "Resultado subido" = marcador en la API pública (`busquedaGlobal`): es lo
  mismo que el acta "rellena" de `voleibol_acta_completa.php` (ese PDF se genera siempre, ~106 KB y ~3 s; sale con los
  sets cuando el resultado está metido en iSquad y con ceros si no: comprobado en 81 partidos). "Acta subida" = la foto
  del acta de papel: `resultadosvoleibol.isquad.es/json/competicion/acta_escaneada.php?id_partido=` (sin login, 80
  bytes: URL del PDF o null). Pueden ir por separado (acta sin resultado y al revés).
- `arbitros_listado_actas.php` (área privada) no sirve: lista todos los jugados, sin estado del acta.
- Ids: la tabla de designaciones lleva el `id_partido` público (DOCUMENTOS: `voleibol_acta_completa.php?id_partido=`)
  y el id_equipo de local y visitante (`verAlineacionEquipo(id_partido, id_equipo, ...)`). `parseDesignaciones` los
  guarda en `matches.id_partido/eq_l/eq_v` (migración 027).
- Resultado: la API no busca por id. Temporada en curso: `teamMatches(eq_l, nombre)` y, si no, del visitante (24 de 24
  partidos de Ferran); si no sale, el PDF. Temporadas pasadas: la búsqueda los da a partir de la página 9-15 o no los da,
  así que directamente el PDF (`actaCompleta`: el texto "RESULTADOS (L/V): 23/25; ..." va en un stream deflate;
  DecompressionStream de Deno no acepta bytes de más: se corta con /Length). 111 de 116 de la temporada 25/26 de Ferran;
  los 5 que faltan son de Superliga.
- Competiciones estatales (`ESTATAL` = SUPERLIGA|NACIONAL): su resultado no sale en la web de la FCVB ni en el acta
  completa: resultado "Otro"; el acta sí se mira.
- `checkResultados` (`_shared/resultados.ts`, en cada sync completo, no en el rápido; con "Actualizar ahora", en segundo
  plano): todos los partidos con id empezados hace más de 1 h, sin selecciones ni suspendidos; los de los últimos 30 días
  en cada pasada y los anteriores que falten, una vez por semana (`pub_checked`); como mucho 20 por pasada (~55 s si van
  por PDF). Guarda `res_l/res_v/res_at` y `acta_url/acta_at` (hora del nombre del fichero) y no los vuelve a pedir.
- Web (`pubState`/`pubTags`), en todos los arbitrajes de Mis partidos y Cobros: "Resultado: Pendiente / Subido 3-1 /
  Irregular" y "Acta: Pendiente / Subida / Otro". Irregular = marcador que no es 3-0, 3-1, 3-2, 2-3, 1-3 ni 0-3 (Ferran: al
  mejor de 5), con un aviso debajo. "Otro" (con el motivo) en selecciones, suspendidos/aplazados, sin número de partido,
  modo sin guardar y, solo el resultado, competiciones estatales. Pendiente en color de aviso desde inicio + 2 h 30 min.
  "Ver el acta" en el detalle de Mis partidos. Ojo: alevín se juega a 3 sets y un 2-1 sale irregular.
- La página que da el token de la API (`competicion.php`) llegaba el 26-oct con error 500 y entera: `apiToken` ya no
  mira el código de estado, solo si trae el token.
- Pendiente del #31: aviso del domingo a las 21:00, sección de Avisos y punto en la pestaña, resultados de tus equipos.

## Avisos al momento (función vigilar, 21-oct-2026)

- Cada 10 minutos, de 7:00 a 24:00 de Madrid, y solo para quien tiene notificaciones (`push_subs`):
  1. ficha pública de cada árbitro (sin login; ver "Coste" abajo) y, solo si ha cambiado, su sync rápido (función sync,
     modo `quick`: solo designaciones de la temporada en curso, sin recibos ni km, sin tocar `last_sync`);
     `designChanges` (en `_shared/sync.ts`) compara con lo guardado: nueva, cambio de fecha/hora/pabellón, suspendida,
     quitada. El sync completo del cron (`mode: "sync"`) también avisa. El primer alta no.
  2. calendario (API pública) de los equipos donde juega o entrena (activos en "Mis partidos") contra la foto anterior
     `pub_cache snap:<id_equipo>`: ya hay horario, cambio de horario o fecha, suspendido/aplazado (`teamChanges`).
     La primera pasada de un equipo solo guarda la foto.
  3. el día que arbitra, 2 h después del último partido, "Pide el pago de hoy antes de mañana" con la dieta que le
     corresponde (`_shared/dieta.ts`, mismas reglas que la web: franja, día, festivos, sin dieta en alevín/amateur y
     finales/concentraciones). Una vez al día (`pub_cache aviso-cobro:<user>:<fecha>`); no si ya está solicitado.
- Partido suspendido o anulado ≠ designación quitada (lo decidió Ferran el 21-oct). Suspendido/anulado: iSquad lo deja
  en las designaciones con `estado` SUSPENDIDO (la FCVB lo paga igual): se queda, la web lo etiqueta y se avisa
  "Partido suspendido". Quitada (ya no estás designado): desaparece de la lista y se quita del perfil.
- Designaciones quitadas (issue #1, 21-oct-2026): antes el partido quitado se quedaba en `matches` y vigilar avisaba de
  "Designación anulada" en cada pasada. Ahora la primera lectura en la que falta solo pone `missing_since` (migración 021;
  iSquad a veces no devuelve un partido una vez); si en la siguiente sigue faltando, un aviso "Ya no estás designado" y se
  BORRA la fila (antes de enviar). Solo partidos de hoy en adelante: los jugados que ya no salen se quedan (puede ser una temporada que ya no se lee).
- Código cambiado: iSquad pone o quita `@fecha T hora` al código cuando varios partidos lo comparten (el 21-oct
  `3JFGH041` pasó a `3JFGH041@2026-10-25T12:00` porque ese día había cadete y juvenil con el mismo código). Eso dejaba
  el partido duplicado y daba un falso "anulada". `designChanges` lo reconoce (mismo código base, equipos y competición):
  sin avisos, borra la fila vieja y pasa a la nueva lo puesto a mano (cobrado, km, dieta, peajes, festivo).
- Tope contra bucles: `push_log` (user_id, key): cada aviso de cambio de designación sale una sola vez (claves
  `nueva:id`, `cambio:id:fecha|hora|pabellón`, `estado:id:ESTADO`, `quitada:id:missing_since`).
- En la web, la dieta que corresponde (`dietaOf`, de `compute()` vía `LAST_RES`) sale en el aviso de cobro, junto al
  estado de cada partido por pedir y en la tarjeta de la agenda: "🍽 Te corresponde dieta: … · ponla al pedir el pago".
- Un partido aún no jugado puede tener ya su recibo vacío en iSquad: `payState` lo trata como futuro hasta su día.
- Envío en `_shared/push.ts` (también lo usa `notify`). La notificación abre la app en `?vista=agenda`.
- Coste (tarea 7, 22-oct-2026): antes 1 login a iSquad por suscrito en cada pasada (hasta 102 al día por persona; con 5
  suscritos y 16 árbitros, ~540 logins al día). Ahora vigilar lee primero la ficha pública de cada suscrito
  (`partidos_arbitro.php?id_arbitro=`, ~2 KB, sin login: partidos, fecha, hora, pabellón y equipo arbitral; huella SHA-256
  en `pub_cache ficha:<user>`) y solo lanza su sync rápido si la huella cambia o tiene un partido con `missing_since`.
  El id de la ficha (`profiles.id_arbitro`, migración 023) sale del listado público (`arbitrosPublicos`, caché 7 días)
  por la foto de afiliado o, si no, por las mismas palabras del nombre (único candidato); comprobado: 16 de 16.
  Sesión de iSquad reutilizada: `isquad_credentials.session` (cookies cifradas con CREDS_KEY) durante 6 h desde su login;
  si iSquad ya no la acepta, login nuevo. Logins por día en `pub_cache logins:AAAA-MM-DD` (función `contar_login`).
  Prueba 22-oct: 1ª pasada 5 fichas y 5 syncs; 2ª pasada 5 fichas y 0 syncs; sync con sesión guardada sin login.
  Esperado: los logins del sync completo del cron (2 por árbitro y día) más uno cuando cambia una ficha.

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
- Sin logo de la FCVB (quitado el 21-oct-2026, tarea legal): en la cabecera va el icono de la app y siempre "App no oficial".
  A la FCVB solo se la nombra de forma descriptiva ("para árbitros, jugadores y entrenadores de la FCVB").
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

# Liquidación arbitral FCVB — contexto para seguir el trabajo

Web app no oficial para árbitros de la Federació Catalana de Voleibol: lee sus designaciones de iSquad y calcula
tarifa, dieta, desplazamiento e IRPF de cada partido. Este fichero resume decisiones y trampas aprendidas para
poder seguir desde otra máquina. **El repo es público: aquí no van claves, contraseñas ni datos de árbitros.**

## Piezas

- Web: `docs/index.html` (todo en un fichero: HTML, CSS y JS), publicada con GitHub Pages desde `main` → `/docs`.
  URL: https://fsarmesto.github.io/liquidacion-arbitral-fcvb/
- Backend: Supabase, proyecto `vevsurxxvjivjizuuqad` (región eu-west-3, plan gratuito).
  - Funciones (`supabase/functions`): `auth-isquad` (login con usuario de iSquad), `sync` (cron y botón
    "Actualizar ahora"), `delete-account`. Código compartido en `_shared/` (`isquad.ts` lector, `sync.ts`
    guardado y km, `crypto.ts` cifrado AES-GCM de la contraseña de iSquad).
  - Migraciones en `supabase/migrations` (001…005). Se aplican con `db push`, en orden.
  - Cron (pg_cron + pg_net, `supabase/cron.sql`): `0 7,15 * * *` UTC (9:00 y 17:00 en verano).

## Secretos (nombres; los valores están en el gestor de contraseñas)

`CREDS_KEY` (cifra las contraseñas de iSquad; si se pierde, cada usuario solo tiene que volver a entrar),
`CRON_SECRET`, `ORS_KEY` (OpenRouteService), contraseña de la base de datos. `ALLOWED_LOGINS` está vacío:
puede entrar cualquier árbitro con cuenta de iSquad. Para desplegar hace falta un token personal de Supabase
(`SUPABASE_ACCESS_TOKEN`, se crea en supabase.com/dashboard/account/tokens) y acceso de escritura al repo.

## Desplegar

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...            # no dejarlo en ficheros del repo
SB="npx -y supabase@2.121.0"
$SB link --project-ref vevsurxxvjivjizuuqad -p "$DB_PASSWORD"
$SB db push -p "$DB_PASSWORD"                   # migraciones nuevas
for f in auth-isquad sync delete-account; do
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
- Selecciones territoriales (competición con "SELECCION"): no se cuentan.

## Reglas de pago (en `docs/index.html`)

- Tarifas: objeto `CATS` (anexo 2026/27; también se aplica a 25/26). Categoría automática con `guessCat`
  (Júnior de 2ª se paga como 1ª). Al cambiar de temporada, actualizar `CATS` y `dietaFor` con el anexo nuevo.
- Dieta: una por jornada y franja (mañana = antes de las 14:00); festivos de Catalunya automáticos (no los
  locales); editable a mano por partido (`matches.dieta_override`).
  Festivo entre semana: 18 € solo en las franjas de festivo (0:00–8:59, 14:01–15:59, 18:31–23:59); fuera de ellas,
  la dieta normal de ese día (confirmado con un recibo de la FCVB: lunes 12-oct a las 17:00 = 10 €).
- Desplazamiento: una ida y vuelta por **pabellón y franja** (mañana y tarde en el mismo pabellón = 2).
- IRPF: porcentaje en `profiles.irpf`, solo sobre la tarifa (dieta, km y peajes exentos). Las cifras son netas.

## Km por carretera

- Direcciones y poblaciones: **Photon** (photon.komoot.io). **Nominatim no sirve: bloquea las IP de Supabase (403).**
  Se acepta una calle solo si coincide código postal o municipio; si no, centro de la población (`km_source='poblacion'`, "km aprox.").
  iSquad a veces pone mal la población ("08880 BARCELONA" es Cubelles): manda el código postal. Un resultado con
  otro código postal de distinta zona (3 primeros dígitos) se rechaza y se repite sin la población; de reserva, el
  centro del código postal antes que el de la población.
- Distancias: **ORS Matrix** (una petición por árbitro, hasta 49 destinos; cupo propio). Reserva: rutas sueltas
  de ORS (200 al día en el plan gratuito).
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
- Selecciones territoriales: no se muestran ni se cuentan (no se liquidan con el anexo).
- Rol y categoría no son editables: salen de iSquad. Lo editable a mano: dieta por partido, km por pabellón,
  peajes, "cobrado" y el IRPF del árbitro.
- Exportación a Excel (SheetJS 0.18.5 cargado al pulsar): temporada seleccionada, importes como números.

## Pendiente (técnico)

- Recalcular con Photon los km antiguos marcados como aproximados (los calculados antes de pasar a Photon):
  vaciar `km`/`km_tried_at` de esos pabellones (`km_source='poblacion'`, no los `manual`) y lanzar el cron.
- Si algún día no basta el cupo de ORS Matrix: el servidor público de rutas Valhalla de FOSSGIS
  (gratis, sin clave, 1 consulta/s) como segunda reserva. No probado desde Supabase.
- Al empezar la temporada 2027/28: actualizar `CATS` y `dietaFor` con el anexo nuevo.

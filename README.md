# Vòlei EnXarxa

App web (no oficial) para árbitros, jugadores y entrenadores de la FCVB: https://fsarmesto.github.io/enxarxa/

- Jugadores y entrenadores: los partidos de sus equipos, horarios, resultados, clasificación y avisos de cambios.
- Árbitros, además: trae las designaciones de iSquad automáticamente y calcula tarifa, dieta y desplazamiento de cada partido según el anexo de la temporada 2026/27, con totales por semana, pendiente de cobro y acumulado.

- **Frontend:** `docs/` (HTML estático, GitHub Pages).
- **Backend:** Supabase (base de datos, sesiones y funciones). Plan gratuito.
- Cada árbitro entra con su usuario y contraseña de iSquad. La contraseña se guarda cifrada (AES-GCM) y la base de datos nunca la ve en claro: la clave solo existe en los secrets de las funciones.
- Las designaciones se actualizan solas dos veces al día, y con el botón "Actualizar ahora".

## Puesta en marcha (una sola vez, ~20 minutos)

Necesitas Node.js instalado y una cuenta en [supabase.com](https://supabase.com) y GitHub.

### 1. Crear el proyecto de Supabase
1. En Supabase, **New project** (región: Europe). Guarda la contraseña de la base de datos.
2. **SQL Editor** → pega el contenido de `supabase/migrations/001_init.sql` → **Run**.
3. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**. Las cuentas solo las crea la función de login tras comprobar las credenciales en iSquad.

### 2. Generar los secretos
```bash
openssl rand -base64 32   # → CREDS_KEY  (clave de cifrado de contraseñas)
openssl rand -hex 24      # → CRON_SECRET (para la tarea programada)
```
Guárdalos en tu gestor de contraseñas. **Si pierdes CREDS_KEY**, cada usuario solo tiene que volver a entrar con su contraseña.

Opcional:
- `ORS_KEY`: clave gratuita de [openrouteservice.org](https://openrouteservice.org/dev/#/signup) para calcular los km de cada pabellón automáticamente. Sin ella, los km se rellenan a mano.
- `ALLOWED_LOGINS`: lista de usuarios de iSquad con acceso, separados por comas (`ferran@...,companero@...`). Si lo dejas vacío, cualquier árbitro con cuenta de iSquad puede entrar.

### 3. Desplegar las funciones
Desde la carpeta del repo:
```bash
npx supabase login
npx supabase link --project-ref TU_PROYECTO
npx supabase secrets set CREDS_KEY=... CRON_SECRET=... ORS_KEY=... ALLOWED_LOGINS=...
npx supabase functions deploy auth-isquad --no-verify-jwt
npx supabase functions deploy sync --no-verify-jwt
npx supabase functions deploy delete-account --no-verify-jwt
```
`TU_PROYECTO` es el identificador de la URL del proyecto (`https://TU_PROYECTO.supabase.co`).

### 4. Programar la actualización automática
En **SQL Editor**, pega `supabase/cron.sql`, sustituye `TU_PROYECTO` y `TU_CRON_SECRET` y ejecútalo.

### 5. Publicar la web
1. En `docs/config.js` pon la URL del proyecto y la **anon / publishable key** (Project Settings → API). Esa clave es pública por diseño.
2. Sube el repo a GitHub.
3. **Settings → Pages** → Source: *Deploy from a branch*, rama `main`, carpeta `/docs`.
4. La app queda en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`. Esa es la URL que compartes.

En el móvil se puede instalar como app: menú del navegador → **Añadir a pantalla de inicio**.

## Cómo funciona

| Pieza | Qué hace |
|---|---|
| `auth-isquad` | Comprueba usuario y contraseña contra iSquad. La primera vez pide población y consentimiento, crea la cuenta, guarda la contraseña cifrada y trae los partidos. |
| `sync` | Con `x-cron-secret`: actualiza a todos los usuarios. Con sesión: solo al usuario. |
| `delete-account` | Borra la cuenta con todos sus datos (contraseña y sesión guardadas, partidos, pabellones, avisos, equipos, calendario). |
| `matches` | Partidos. La sincronización solo actualiza los datos de iSquad; rol, equipo arbitral, peajes, cobrado, etc. nunca se pisan. |
| `venues` | Km de ida por pabellón, por usuario. |

Las tarifas y dietas están en `docs/index.html` (objeto `CATS` y función `dietaFor`). Al cambiar de temporada, actualízalas desde el nuevo anexo.

## No oficial
Vòlei EnXarxa es un proyecto personal, gratuito y sin ánimo de lucro de Ferran Sanchís. No es una app oficial de la Federació Catalana de Voleibol ni de iSquad/Toools, ni tiene relación con ellas. Los nombres de la FCVB, de iSquad y de los clubes se usan solo para describir de dónde salen los datos. Los importes son orientativos: manda el recibo de la FCVB. Si iSquad cambia su web, el lector de designaciones (`supabase/functions/_shared/isquad.ts`) puede necesitar ajustes.

Política de privacidad: https://fsarmesto.github.io/enxarxa/privacidad.html · Aviso legal: https://fsarmesto.github.io/enxarxa/aviso-legal.html

## Licencia
Todos los derechos reservados (ver [LICENSE](LICENSE)): el código se puede consultar, pero no copiar, modificar ni reutilizar sin permiso del autor. Para pedirlo: fsarmesto@gmail.com.

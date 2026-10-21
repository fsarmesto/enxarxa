# Registro de actividades de tratamiento (art. 30 RGPD)

Vòlei EnXarxa · última revisión: 22 de octubre de 2026. Revisarlo cada vez que la app trate datos nuevos o cambie de
proveedor, y al menos una vez al año.

## Responsable

Ferran Sanchís, a título personal (proyecto gratuito, sin ánimo de lucro). Contacto: fsarmesto@gmail.com.
No hay delegado de protección de datos: no es obligatorio (no hay tratamiento a gran escala ni actividad principal
de tratamiento).

## Interesados

- Usuarios: árbitros, jugadores y entrenadores de la FCVB, mayores de 14 años, con cuenta de iSquad.
- Terceros que aparecen en los datos de un usuario: compañeros de su equipo arbitral (nombre) y personas de las
  plantillas públicas de los equipos (solo huellas seudonimizadas; puede haber menores).

## Tratamientos

1. **Cuenta y lectura de iSquad.** Identificar al usuario y leer sus designaciones y recibos.
   Datos: email de iSquad, nombre, foto de afiliado (URL), tipo (árbitro o deportista); contraseña y sesión de iSquad
   cifradas (solo árbitros); partidos (fecha, hora, pabellón, competición, equipos, rol, equipo arbitral con nombres),
   recibos e importes; población de origen y sus coordenadas, km, peajes, IRPF, marcas de cobrado.
   Base: consentimiento (art. 6.1.a) al crear la cuenta; para los nombres del equipo arbitral, interés legítimo
   (art. 6.1.f): son los que el propio usuario ya ve en iSquad.
2. **Avisos.** Notificaciones de designaciones, horarios de sus equipos, cobros y recordatorios.
   Datos: suscripción push del dispositivo (endpoint y claves), registro de avisos enviados (claves sin contenido).
   Base: consentimiento (los activa el usuario).
3. **Equipos del usuario.** Encontrar los equipos donde juega o entrena y seguir sus partidos.
   Datos: equipos seguidos y rol del usuario; índice de plantillas públicas con huellas HMAC (clave secreta) de foto y
   nombre de cada persona, su perfil (jugador, entrenador, invitado) y si tenía foto. Nunca se guardan nombres de
   otras personas.
   Base: consentimiento del usuario para lo suyo; interés legítimo para el índice (datos públicos, seudonimizados, solo
   para reconocer al propio usuario).
4. **Compartir coche (opcional).** Enseñar a otros árbitros con la opción activada quién va al mismo pabellón o
   población. Datos: nombre, población, partidos próximos. Base: consentimiento (opción que activa el usuario).
5. **Calendario (opcional).** Enlace iCal secreto con sus partidos. Datos: token del enlace. Base: consentimiento.
6. **Consentimiento y actividad.** Probar la aceptación y borrar cuentas sin uso. Datos: fecha y versión aceptada,
   última vez que abrió la app. Base: obligación legal (art. 7.1, demostrar el consentimiento) y art. 5.1.e
   (limitación del plazo).
7. **Modo sin guardar.** Lectura puntual de iSquad sin guardar nada: los datos solo pasan por el servidor y se
   devuelven al navegador.

## Destinatarios y encargados

Ver `encargados.md`. No se ceden datos a terceros. Lo único visible para otros usuarios es lo de compartir coche
(si lo activan los dos).

## Transferencias internacionales

Datos alojados en la UE (Supabase, región eu-west-3, París). Supabase Inc. y GitHub Inc. son de EE. UU.: cubiertas por
las cláusulas contractuales tipo incluidas en sus contratos de encargado.

## Plazos

- Mientras exista la cuenta. Borrado inmediato y completo al borrarla (Ajustes o por email, máximo 30 días).
- 6 meses sin abrir la app: borrado automático, con aviso 30 días antes (función `inactivas`).
- Suscripciones push que el servicio da por caducadas: se borran solas.
- Caché pública (calendarios, clasificaciones, listados): de 30 minutos a 30 días según el dato.

## Medidas de seguridad

Ver `analisis-riesgos.md`. Resumen: contraseñas y sesiones de iSquad cifradas con AES-GCM (clave solo en los secretos
del servidor); acceso a la base de datos por filas (cada usuario solo lo suyo); tablas sensibles sin acceso desde
el navegador; HTTPS; secretos fuera del repositorio; panel de administración sin nombres ni emails; la web no carga
recursos de terceros.

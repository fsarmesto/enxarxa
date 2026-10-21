# Análisis de riesgos y evaluación de impacto simplificada (arts. 32 y 35 RGPD)

Vòlei EnXarxa · 22 de octubre de 2026. Hecho por el responsable, sin revisión de un profesional.

## ¿Hace falta una evaluación de impacto?

La lista de la AEPD pide evaluación de impacto cuando se cumplen 2 o más criterios. Aquí se cumplen 2:

- Datos de personas vulnerables: puede haber usuarios de 14 a 17 años (jugadores) y menores en las plantillas
  públicas que se indexan.
- Cruce de conjuntos de datos: las huellas de las plantillas públicas se cruzan con la foto y el nombre del usuario
  para encontrar sus equipos.

No se cumplen: categorías especiales de datos, gran escala (decenas de usuarios), evaluación o puntuación de
personas, vigilancia sistemática, decisiones automatizadas con efectos jurídicos.

Por eso este documento hace de evaluación de impacto simplificada. Repetirla si la app pasa de unos pocos cientos de
usuarios, si se añaden datos nuevos o si cambia la forma de leer iSquad.

## Riesgos y medidas

1. **Robo de las contraseñas o sesiones de iSquad.** Impacto alto: con ellas se entra en el área privada de iSquad
   de cada árbitro. Probabilidad baja.
   Medidas: cifrado AES-GCM con una clave que solo está en los secretos del servidor (nunca en la base de datos ni en
   el repositorio); la tabla de credenciales no tiene acceso desde el navegador; sesión reutilizada como mucho 6 h;
   modo "sin guardar" para quien no quiera dejarla; jugadores y entrenadores no la guardan; al borrar la cuenta se
   borra al momento. Si hay sospecha: cambiar `CREDS_KEY` (todas las credenciales dejan de valer) y seguir
   `brechas.md`.
2. **Acceso a datos de otros usuarios.** Medidas: seguridad por filas en todas las tablas de usuario; las funciones
   comprueban la sesión; el panel de administración solo muestra cifras e ids cortos.
3. **Menores.** Medidas: edad mínima 14 años con casilla obligatoria (en España, consentimiento propio desde los 14,
   art. 7 LOPDGDD); de jugadores y entrenadores solo nombre y foto, sin contraseña; de las plantillas solo huellas,
   nunca nombres.
4. **Reidentificación de las huellas de las plantillas.** Medidas: HMAC con clave secreta (`ROSTER_SALT`) fuera de la
   base de datos; sin nombres ni fotos guardados; solo se usan para reconocer al propio usuario.
5. **Exposición por compartir coche o por el enlace del calendario.** Medidas: los 2 son opcionales; compartir coche
   solo entre árbitros que lo activan; el enlace del calendario es secreto y se puede regenerar.
6. **Acceso del propio responsable.** Técnicamente puede consultar la base de datos. Compromiso: solo para resolver
   problemas o peticiones de los usuarios, nunca para otros fines; las consultas se hacen sin sacar datos personales
   del entorno de trabajo.
7. **Terceros que reciben datos al usar la web.** Medidas: tipografías y librerías servidas desde la propia web; sin
   analítica ni publicidad; a los servicios de rutas solo llegan coordenadas de poblaciones y direcciones de
   pabellones, sin identificar al usuario.
8. **Conservación excesiva.** Medidas: borrado automático a los 6 meses sin uso; cachés con caducidad; el sync no
   guarda nada fuera de lo que la app muestra.
9. **Que iSquad o la FCVB no autoricen la lectura de sus datos.** No es un riesgo de privacidad para los usuarios, pero
   sí legal para el proyecto. Medidas: lectura mínima (ficha pública primero, login solo si hay cambios, sesión
   reutilizada); compromiso de dejar de leer si lo piden; pedirles autorización antes de abrir la app a más gente.

## Conclusión

Con estas medidas el riesgo residual es bajo para un proyecto de este tamaño. El punto más delicado es el 1
(credenciales); el pendiente más importante para crecer es el 9 (autorización de iSquad/Toools).

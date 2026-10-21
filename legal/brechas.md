# Qué hacer ante una brecha de seguridad (arts. 33 y 34 RGPD)

Vòlei EnXarxa · 22 de octubre de 2026.

Brecha es cualquier pérdida, acceso no autorizado o filtración de datos personales: por ejemplo, que alguien consiga
la clave de servicio de Supabase o `CREDS_KEY`, que se publique un secreto en el repositorio, que un usuario vea datos
de otro o que se pierdan datos.

## 1. Contener (en cuanto se sepa)

- Secreto publicado o robado: cambiarlo en Supabase (`supabase secrets set`) y donde se use. Si es `CREDS_KEY`, todas
  las contraseñas y sesiones guardadas dejan de valer: borrar `isquad_credentials.secret` y `session` y cada árbitro
  tendrá que volver a entrar.
- Clave de servicio o contraseña de la base de datos: regenerarlas en el panel de Supabase y volver a desplegar las
  funciones.
- Fallo en el código: retirar el cambio (`git revert`) y desplegar.

## 2. Evaluar

Qué datos, de cuántos usuarios, desde cuándo y si hay riesgo para ellos (por ejemplo, acceso a su cuenta de iSquad).

## 3. Notificar

- A la AEPD, en un máximo de 72 horas desde que se sabe, salvo que sea improbable que haya riesgo para los usuarios.
  Formulario en la sede electrónica de la AEPD (sedeagpd.gob.es, "Notificación de brechas de seguridad").
- A los usuarios afectados, sin demora, si el riesgo es alto (por ejemplo, contraseñas de iSquad expuestas): aviso en
  la app y por email (su usuario de iSquad es su email), diciendo qué ha pasado y qué deben hacer (cambiar la
  contraseña de iSquad).

## 4. Registrar

Apuntar todas las brechas, también las que no se notifican: fecha, qué pasó, datos y usuarios afectados, medidas y si
se notificó. El registro se guarda en el paquete privado (`laxarxa-privado/contexto/`), no en este repositorio público.

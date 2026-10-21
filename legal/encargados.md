# Encargados del tratamiento y servicios que reciben datos (art. 28 RGPD)

Vòlei EnXarxa · 22 de octubre de 2026.

## Encargados (tratan datos por cuenta del responsable)

- **Supabase Inc.** (EE. UU.). Base de datos, funciones del servidor y autenticación. Datos en la región eu-west-3
  (París). Contrato: su Data Processing Addendum (supabase.com/legal/dpa) forma parte de sus condiciones de servicio
  ("The Parties agree to comply with the Data Processing Addendum, which is incorporated into this Agreement",
  apartado 7.b) y se acepta al aceptar las condiciones, en cualquier plan, también el gratuito. Incluye las cláusulas
  contractuales tipo de la UE (módulo 2, de responsable a encargado), ley irlandesa. Comprobado el 22-oct-2026; no hace
  falta firmar nada aparte. Conviene guardar una copia en PDF con la fecha.
- **GitHub Inc.** (EE. UU., Microsoft). Aloja la web (GitHub Pages) y el código. Recibe la IP de quien visita la web.
  Contrato: GitHub Data Protection Agreement, incluido en sus condiciones.
- **Servicios de notificaciones** (Google FCM, Apple APNs, Mozilla, Microsoft WNS, según el dispositivo). Reciben el
  aviso cifrado de extremo a extremo (Web Push con claves VAPID) y la dirección de la suscripción. Funcionan con las
  condiciones de cada plataforma, que el usuario acepta en su dispositivo.

## Servicios que reciben datos sin identificar al usuario

- **OpenRouteService** (HeiGIT gGmbH, Heidelberg, Alemania). Cálculo de km por carretera: recibe coordenadas de
  poblaciones de origen y de pabellones, sin nombre ni cuenta.
- **Photon** (komoot GmbH, Alemania). Coordenadas a partir de direcciones de pabellones y nombres de poblaciones.

## Fuente de datos (no es encargado)

- **iSquad / Toools**: la app lee el área privada de cada árbitro en su nombre y la web pública de resultados. No hay
  ningún acuerdo con ellos; ver el riesgo 9 de `analisis-riesgos.md`.

## Al cambiar de proveedor

Antes de usar un servicio nuevo que reciba datos personales: comprobar que tiene contrato de encargado con cláusulas
tipo si está fuera de la UE, añadirlo aquí y en la política de privacidad (y subir `POLICY_VERSION`).

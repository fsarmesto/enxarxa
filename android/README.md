# App Android (Trusted Web Activity)

La app Android abre la web (https://fsarmesto.github.io/laxarxa/) a pantalla completa, con su
icono y las notificaciones como app. Se genera con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
a partir de `twa-manifest.json`; el proyecto Gradle generado no se guarda en el repo.

- Paquete: `io.github.fsarmesto.liquidacion`. Android 7.0 o superior (minSdk 24, lo pide androidbrowserhelper).
- Firma: keystore fuera del repo (`~/.config/fcvb/android.keystore`, alias `liquidacion`, contraseña en
  `~/.config/fcvb/secrets.env`). **Guardar una copia: sin esa clave no se puede publicar una actualización que se
  instale encima; cada usuario tendría que desinstalar y volver a instalar.**
- Verificación del dominio: `https://fsarmesto.github.io/.well-known/assetlinks.json` (repo
  `fsarmesto/fsarmesto.github.io`) con la huella SHA-256 de la clave. Sin ella la app muestra la barra del navegador.
- Se distribuye gratis desde la web: `docs/app/laxarxa.apk` (botón "Descargar la app Android",
  solo en Android y fuera de la app). Google Play costaría 25 € (pago único) y usaría el `.aab`.

## Generar una versión nueva

Solo hace falta si cambian el icono, el nombre o los colores: el contenido es la web, que se actualiza sola.

```bash
cd android
# subir appVersionCode y appVersionName en twa-manifest.json
npx -y @bubblewrap/cli@1.24.1 update --skipVersionUpgrade --manifest=./twa-manifest.json
BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=... npx -y @bubblewrap/cli@1.24.1 build --skipPwaValidation
cp app-release-signed.apk ../docs/app/laxarxa.apk
```

Requisitos en la máquina: JDK 17 con compilador y SDK de Android (`~/.bubblewrap/config.json` con `jdkPath` y
`androidSdkPath`; Bubblewrap busca `sdk/tools`: enlace a `cmdline-tools/latest`).

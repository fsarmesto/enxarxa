# App Android (Trusted Web Activity)

La app Android abre la web (https://fsarmesto.github.io/enxarxa/) a pantalla completa, con su
icono y las notificaciones como app. Se genera con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
a partir de `twa-manifest.json`; el proyecto Gradle generado no se guarda en el repo.

- Paquete: `io.github.fsarmesto.liquidacion`. Android 7.0 o superior (minSdk 24, lo pide androidbrowserhelper).
- Firma: keystore fuera del repo (`~/.config/fcvb/android.keystore`, alias `liquidacion`, contraseña en
  `~/.config/fcvb/secrets.env`). **Guardar una copia: sin esa clave no se puede publicar una actualización que se
  instale encima; cada usuario tendría que desinstalar y volver a instalar.**
- Verificación del dominio: `https://fsarmesto.github.io/.well-known/assetlinks.json` (repo
  `fsarmesto/fsarmesto.github.io`) con la huella SHA-256 de la clave. Sin ella la app muestra la barra del navegador.
- Se distribuye gratis desde la web: `docs/app/enxarxa.apk` (botón "Descargar la app Android",
  solo en Android y fuera de la app). Google Play costaría 25 € (pago único) y usaría el `.aab`.

## Generar una versión nueva

Solo hace falta si cambian el icono, el nombre o los colores: el contenido es la web, que se actualiza sola.

```bash
cd android
# subir appVersionCode y appVersionName en twa-manifest.json
npx -y @bubblewrap/cli@1.24.1 update --skipVersionUpgrade --manifest=./twa-manifest.json
BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=... npx -y @bubblewrap/cli@1.24.1 build --skipPwaValidation
cp app-release-signed.apk ../docs/app/enxarxa.apk
```

En Windows (PC de casa, 29-oct-2026) `bubblewrap build` falla al llamar a `gradlew.bat`. Tras `update`, en una
copia del manifest con `signingKey.path` apuntando a la keystore local:

```bash
echo "sdk.dir=<ruta del SDK>" > local.properties && sh ./gradlew assembleRelease
zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
java -jar <build-tools>/lib/apksigner.jar sign --ks <keystore> --ks-key-alias liquidacion \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD --out app-release-signed.apk aligned.apk
```

Comprobar con `apksigner verify --print-certs` que la huella SHA-256 es la de `assetlinks.json` (EB:7E:23:…).

Requisitos en la máquina: JDK 17 con compilador y SDK de Android (`~/.bubblewrap/config.json` con `jdkPath` y
`androidSdkPath`; Bubblewrap busca `sdk/tools`: enlace a `cmdline-tools/latest`).

# Banco de pruebas de navegador (acta electrónica)

Pruebas "de verdad": Chrome sin ventana controlado por CDP, clics reales con el ratón, y la web (`docs/`) servida en
`http://localhost:8127` con un **Supabase simulado** (datos inventados, en `localStorage`; no toca la base de datos real).

## Requisitos
- Node 22 o más nuevo (usa `WebSocket` y `fetch` globales).
- Google Chrome instalado. Ruta por defecto según el sistema (Windows `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  macOS y Linux las habituales); si es otra, `CHROME=<ruta>`.
- Puertos libres: 8127 (web) y 9339 (CDP). Si una prueba anterior se quedó colgada, espera a que acabe o ciérrala.

## Uso (desde la raíz del repo)
```bash
node tools/pruebas-navegador/demo-completo.mjs     # partido completo inventado → OUT/acta-demo.json y OUT/acta-demo.pdf
node tools/pruebas-navegador/importar-demo.mjs     # lo importa con el botón "Importar un acta (JSON)"
```
- `OUT` = carpeta para capturas/PDF/JSON (por defecto la carpeta temporal del sistema). En PowerShell: `$env:OUT="C:\temp\pruebas"`.
- `REPO` = raíz del repo (por defecto, la de esta carpeta).
- `ACTA_CA=1` fuerza el catalán y apunta en `sessionStorage.sinTr` los textos que `acta-ca.js` no traduce.
- `ANCHO=390` (en las pruebas que lo lean) para probar en móvil.
- Cada prueba escribe `OK`/`FALLA` por comprobación y acaba con `Todo OK` o `N fallos` (código de salida 1 si falla algo).

## Utilidades de `base.mjs`
`go(url)`, `click(selector)` (clic real en el centro del elemento), `type(selector, texto)`, `ev(expresión JS)` (evalúa en
la página y devuelve el valor), `size(ancho, alto, oscuro)`, `shot(nombre)` (PNG en OUT), `cdp(método, params)` (CDP
directo: p. ej. `Page.printToPDF`, `DOM.setFileInputFiles`, `Target.createTarget`), `check(condición, texto)`, `resumen()`,
`errores()` (excepciones de JS de la página), `fin()`.

El Supabase simulado sale de `tools/prueba-accesibilidad.mjs` (se adapta al vuelo) más una tabla `acta_directo` en
`localStorage`. Para funciones nuevas, añade su simulación en `base.mjs` con el mismo contrato que el SQL real.

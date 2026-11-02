#!/usr/bin/env python3
"""Capturas del issue #75 con datos INVENTADOS (mock.js). Uso: python3 .github/capturas/75/captura.py [prev]
Sin argumentos: capturas del PR en .github/capturas/75/. Con `prev`: docs/preview-*.png (vista previa de la pantalla de entrar)."""
import http.server, os, shutil, struct, subprocess, sys, tempfile, threading, zlib

RAIZ = os.getcwd()
DOCS = os.path.join(RAIZ, 'docs')
OUT = os.path.join(RAIZ, '.github/capturas/75')
SITE = tempfile.mkdtemp(prefix='enx-site-')
shutil.copytree(DOCS, SITE, dirs_exist_ok=True)
shutil.copy(os.path.join(OUT, 'mock.js'), os.path.join(SITE, 'vendor/supabase-2.45.4.js'))
PORT = 8125


def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=SITE, **k)
        def log_message(s, *a): pass
        def end_headers(s): s.send_header('Cache-Control', 'no-cache'); super().end_headers()
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()


threading.Thread(target=serve, daemon=True).start()


def recorta_png(ruta, ancho_px, alto_px=None):
    """Recorta un PNG de 8 bits (sin entrelazar) a la esquina superior izquierda."""
    d = open(ruta, 'rb').read(); i = 8; idat = b''
    while i < len(d):
        n, t = struct.unpack('>I4s', d[i:i + 8]); c = d[i + 8:i + 8 + n]; i += 12 + n
        if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', c[:10])
        elif t == b'IDAT': idat += c
    bpp = {2: 3, 6: 4}[ct]; raw = zlib.decompress(idat); fila = w * bpp; prev = bytearray(fila); filas = []; p = 0
    for _ in range(h):
        f = raw[p]; cur = bytearray(raw[p + 1:p + 1 + fila]); p += 1 + fila
        for x in range(fila):
            a = cur[x - bpp] if x >= bpp else 0; b = prev[x]; c2 = prev[x - bpp] if x >= bpp else 0
            if f == 1: cur[x] = (cur[x] + a) & 255
            elif f == 2: cur[x] = (cur[x] + b) & 255
            elif f == 3: cur[x] = (cur[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c2), abs(a - c2), abs(a + b - 2 * c2 )
                pa = abs(b - c2); pb = abs(a - c2); pc = abs(a + b - 2 * c2)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c2)
                cur[x] = (cur[x] + pr) & 255
        filas.append(cur); prev = cur
    ancho_px = min(ancho_px, w); alto_px = min(alto_px or h, h)
    out = b''.join(b'\x00' + bytes(f[:ancho_px * bpp]) for f in filas[:alto_px])
    def ch(t, c): return struct.pack('>I', len(c)) + t + c + struct.pack('>I', zlib.crc32(t + c) & 0xffffffff)
    open(ruta, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', ancho_px, alto_px, 8, ct, 0, 0, 0)) + ch(b'IDAT', zlib.compress(out, 9)) + ch(b'IEND', b''))


def foto(nombre, hash_, ancho, alto, oscuro=False, escala=2, destino=OUT):
    """ancho <= 500: la página va en un iframe de ese ancho (Chrome sin ventana no baja de ~500 px)."""
    ruta = os.path.join(destino, nombre)
    if ancho <= 500:
        wrap = os.path.join(SITE, 'wrap.html')
        open(wrap, 'w').write(f'<!doctype html><body style="margin:0;background:#888"><iframe src="index.html#{hash_}" width="{ancho}" height="{alto}" style="border:0;display:block"></iframe>')
        url = f'http://127.0.0.1:{PORT}/wrap.html?{os.urandom(3).hex()}'; ventana = (520, alto)
    else:
        url = f'http://127.0.0.1:{PORT}/index.html?{os.urandom(3).hex()}#{hash_}'; ventana = (ancho, alto)
    args = ['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', f'--window-size={ventana[0]},{ventana[1]}',
            f'--force-device-scale-factor={escala}', '--virtual-time-budget=9000', f'--user-data-dir={tempfile.mkdtemp(prefix="enx-chrome-")}', f'--screenshot={ruta}']
    if oscuro: args.append('--blink-settings=preferredColorScheme=0')
    args.append(url)
    subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    if ancho <= 500: recorta_png(ruta, ancho * escala, alto * escala)
    print('ok', nombre)


if len(sys.argv) > 1 and sys.argv[1] == 'prev':
    for n, v in [('cobros', 'cobros'), ('agenda', 'agenda'), ('equipos', 'equipos')]:
        foto(f'preview-{n}.png', f'vista={v}&limpio', 390, 560, escala=1, destino=DOCS)
else:
    for oscuro in (False, True):
        t = 'oscuro' if oscuro else 'claro'
        foto(f'cobros-390-{t}.png', 'vista=cobros&stat', 390, 844, oscuro)
        foto(f'cobros-minibar-390-{t}.png', 'vista=cobros&scroll&limpio', 390, 844, oscuro)
        foto(f'agenda-390-{t}.png', 'vista=agenda', 390, 844, oscuro)
        foto(f'ajustes-390-{t}.png', 'vista=cobros&ajustes', 390, 844, oscuro)
        foto(f'entrada-390-{t}.png', 'salir', 390, 1250, oscuro)
        foto(f'entrada-1280-{t}.png', 'salir', 1280, 1000, oscuro)

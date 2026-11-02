// Hora de salida hacia el pabellón (issue #73). La misma regla está copiada en docs/index.html (salidasDe): si cambia
// aquí, cambiarla también allí.
//   salida = inicio − 60 min (llegar 1 h antes, lo que pide Ferran) − trayecto (venues.min redondeado hacia arriba a 5 min)
//   aviso  = salida − 15 min
// Por día: el primer partido siempre; los siguientes, solo si empiezan más de 3 h después del anterior (un partido dura
// unas 2 h: con más margen, el árbitro puede volver a casa). Si son seguidos, aunque sea en otro pabellón, no hay aviso
// (no tenemos tiempos entre pabellones). Sin tiempo de trayecto (pabellón sin ruta o sin población de origen), nada.
// Suspendidos, aplazados, anulados y designaciones que faltaron en la última lectura (missing_since), fuera.
export const ANTELACION = 60, AVISO_ANTES = 15, HUECO = 180;

export type PartidoSalida = { id: string; date: string; time: string; venue_key: string | null; estado?: string | null; missing_since?: string | null };
export type Salida = { id: string; date: string; time: string; venue_key: string; trayecto: number; salida: number; aviso: number };

export const minDe = (t: string) => { const [h, m] = (t || "").split(":").map(Number); return h * 60 + m; };
export const hhmm = (n: number) => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((n % 60) + 60) % 60).padStart(2, "0")}`;

// trayecto(venue_key) = minutos de ida sin tráfico (venues.min) o null.
export function salidas(ms: PartidoSalida[], trayecto: (venueKey: string) => number | null | undefined): Salida[] {
  const vale = ms.filter((m) => /^\d{1,2}:\d{2}$/.test(m.time || "") && m.time !== "00:00" && !m.missing_since && !/SUSPEND|APLAZ|ANULA/i.test(m.estado || ""))
    .sort((a, b) => (a.date + a.time.padStart(5, "0")).localeCompare(b.date + b.time.padStart(5, "0")));
  const out: Salida[] = [];
  let prev: PartidoSalida | null = null;
  for (const m of vale) {
    const nuevo = !prev || prev.date !== m.date || minDe(m.time) - minDe(prev.time) > HUECO;
    prev = m;
    if (!nuevo || !m.venue_key) continue;
    const t = trayecto(m.venue_key);
    if (t == null || !(t > 0)) continue;
    const tr = Math.ceil(t / 5) * 5, salida = minDe(m.time) - ANTELACION - tr;
    out.push({ id: m.id, date: m.date, time: m.time, venue_key: m.venue_key, trayecto: tr, salida, aviso: salida - AVISO_ANTES });
  }
  return out;
}

// Clave de deduplicación: si cambia la hora o el pabellón, es otra clave y sale un aviso nuevo con la hora buena.
// Sin ":" detrás del id (la web saca el id con split(":")[1]).
export const claveSalida = (s: Pick<Salida, "id" | "date" | "time" | "venue_key">) => `salida:${s.id}:${s.date}T${s.time.replace(":", "")}|${s.venue_key}`;

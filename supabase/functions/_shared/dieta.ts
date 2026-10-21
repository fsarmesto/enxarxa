// Dieta que corresponde a un partido (mismas reglas que docs/index.html: dietaFor, isHoliday, noDietaOf).
const norm = (s: string | null | undefined) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mo - 1, da);
}
const FIXED = ["01-01", "01-06", "05-01", "06-24", "08-15", "09-11", "10-12", "11-01", "12-06", "12-08", "12-25", "12-26"];
export function isHoliday(ds: string) {
  if (FIXED.includes(ds.slice(5))) return true;
  const e = easter(+ds.slice(0, 4)), day = (n: number) => new Date(e + n * 864e5).toISOString().slice(0, 10);
  return ds === day(-2) || ds === day(1);
}
export function dietaFor(ds: string, mins: number, holiday: boolean) {
  const wd = new Date(ds + "T12:00:00Z").getUTCDay(), m = mins;
  const festivo = m <= 539 || (m >= 841 && m <= 959) || m >= 1111;
  if (wd === 0) return festivo ? 18 : 0;
  if (holiday && festivo) return 18;
  if (wd === 6) return m <= 539 || (m >= 841 && m <= 959) || m >= 1261 ? 13.5 : 0;
  if (wd === 5) return m <= 959 || m >= 1261 ? 13.5 : 0;
  return (m >= 540 && m <= 780) || (m >= 960 && m <= 1229) ? 10 : 13.5;
}
type M = { date: string; time: string; comp: string; phase?: string | null; cat?: string | null; holiday?: boolean | null; no_dieta?: boolean | null; dieta_override?: number | null };
const noDieta = (m: M) => m.no_dieta ?? (/FINAL|CONCENTRACI/.test(norm(m.phase)) || m.cat === "alv" || (!m.cat && /ALEVI|AMATEUR|BENJAMI/.test(norm(m.comp))));
const mins = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
// Una dieta por jornada y franja (mañana hasta las 14:59, tarde desde las 15:00): la mayor de sus partidos.
export function dietasDelDia(ms: M[]) {
  const out: { franja: "mañana" | "tarde"; importe: number }[] = [];
  for (const franja of ["mañana", "tarde"] as const) {
    const list = ms.filter((m) => (mins(m.time) < 900) === (franja === "mañana"));
    if (!list.length) continue;
    const importe = Math.max(...list.map((m) => m.dieta_override != null ? +m.dieta_override : noDieta(m) ? 0 : dietaFor(m.date, mins(m.time), !!m.holiday || isHoliday(m.date))));
    if (importe > 0) out.push({ franja, importe });
  }
  return out;
}

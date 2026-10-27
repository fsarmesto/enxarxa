// Textos de los avisos push en castellano y catalán (issue #36). Todo aviso nuevo va aquí, con las 2 versiones, y se
// elige con el idioma de la interfaz de cada usuario (profiles.lang; sin dato, LANG_DEFECTO).
export type Lang = "es" | "ca";
export const LANG_DEFECTO: Lang = "ca";
export const lang = (v: unknown): Lang => (v === "es" || v === "ca" ? v : LANG_DEFECTO);

export type Aviso = { title: string; body: string };
export const cap = (s: string) => (s || "").toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());
const LOC = { es: "es-ES", ca: "ca-ES" };
// "2026-10-24" → "sáb 24 oct" / "ds. 24 d’oct."
const fecha = (l: Lang, ds: string) => {
  const s = new Intl.DateTimeFormat(LOC[l], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ds + "T12:00:00Z"));
  return l === "es" ? s.replace(/[.,]/g, "") : s.replace(",", "");
};
const eur = (l: Lang, v: number) => v.toLocaleString(LOC[l], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
// Estado de iSquad ("SUSPENDIDO", "Aplazado"...) en minúsculas y en el idioma.
const estado = (l: Lang, est: string) => {
  const e = (est || "").toLowerCase();
  if (l === "es") return e;
  return /suspend/.test(e) ? "suspès" : /aplaz/.test(e) ? "ajornat" : /anula/.test(e) ? "anul·lat" : e;
};
const ROL: Record<Lang, Record<string, string>> = {
  es: { r1: "R1", r2: "R2", an: "Anotador", jl: "Juez de línea" },
  ca: { r1: "R1", r2: "R2", an: "Anotador", jl: "Jutge de línia" },
};
const lista = (l: Lang, xs: string[]) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${l === "es" ? "y" : "i"} ${xs.at(-1)}`;

type Partido = { date: string; time: string; teams: string; venue: string };
const vs = (t: string) => cap(t).replace(/ vs /i, " – ");

export function textos(l: Lang) {
  const es = l === "es", f = (ds: string) => fecha(l, ds), line = (m: Partido) => `${f(m.date)} · ${m.time}`;
  const aLas = es ? "a las" : "a les", antes = es ? "antes" : "abans";
  return {
    lang: l,
    fecha: f,
    // Designaciones (sync: designChanges)
    nueva: (m: Partido, rol?: string): Aviso => ({
      title: `${es ? "Nueva designación" : "Nova designació"} · ${line(m)}`,
      body: `${vs(m.teams)}${rol ? ` · ${ROL[l][rol] || ""}` : ""} · ${cap(m.venue)}`,
    }),
    cambio: (m: Partido, p: Partido): Aviso => {
      const what = p.date !== m.date ? `${antes} ${f(p.date)} ${p.time}`
        : p.time !== m.time ? `${antes} ${aLas} ${p.time}` : `${es ? "antes en" : "abans a"} ${cap(p.venue)}`;
      return { title: `${es ? "Cambio en tu designación" : "Canvi a la teva designació"} · ${line(m)}`, body: `${vs(m.teams)} · ${cap(m.venue)} (${what})` };
    },
    estadoDesig: (m: Partido, est: string): Aviso => ({
      title: `${es ? "Partido" : "Partit"} ${estado(l, est)} · ${line(m)}`,
      body: es ? `${vs(m.teams)}: iSquad lo marca como ${estado(l, est)}. Sigue en tu lista.`
        : `${vs(m.teams)}: iSquad el marca com a ${estado(l, est)}. Continua a la teva llista.`,
    }),
    quitada: (m: Partido): Aviso => ({
      title: `${es ? "Ya no estás designado" : "Ja no estàs designat"} · ${line(m)}`,
      body: es ? `${vs(m.teams)}: ya no sale en tus designaciones de iSquad. Lo he quitado de tus partidos.`
        : `${vs(m.teams)}: ja no surt a les teves designacions d'iSquad. L'he tret dels teus partits.`,
    }),
    // Partidos de tus equipos (vigilar: teamChanges). eq = "Local – Visitante".
    eqEstado: (eq: string, d: string, est: string): Aviso => ({ title: `${es ? "Partido" : "Partit"} ${estado(l, est)} · ${f(d)}`, body: eq }),
    eqHorario: (eq: string, d: string, t: string): Aviso => ({ title: `${es ? "Ya hay horario" : "Ja hi ha horari"} · ${f(d)} ${aLas} ${t}`, body: eq }),
    eqCambioHorario: (eq: string, d: string, t: string, pd: string, pt: string): Aviso => ({
      title: `${es ? "Cambio de horario" : "Canvi d'horari"} · ${f(d)} ${aLas} ${t}`,
      body: `${eq} (${antes} ${f(pd)}${pt ? ` ${aLas} ${pt}` : ""})`,
    }),
    eqCambioFecha: (eq: string, d: string, pd: string): Aviso => ({
      title: `${es ? "Cambio de fecha" : "Canvi de data"} · ${f(d)}`,
      body: `${eq} (${antes} ${f(pd)}), ${es ? "hora por confirmar" : "hora per confirmar"}`,
    }),
    // Pedir el pago el día que arbitra (vigilar: avisoCobro). franjas: "mañana" | "tarde".
    cobro: (total: number, franjas: string[], n: number): Aviso => ({
      title: es ? "Pide el pago de hoy antes de mañana" : "Demana el pagament d'avui abans de demà",
      body: total > 0
        ? es ? `Te corresponde dieta: ${eur(l, total)} (${lista(l, franjas)}). Ponla en la hoja de gastos de iSquad junto con el desplazamiento.`
          : `Et correspon dieta: ${eur(l, total)} (${lista(l, franjas.map((x) => (x === "mañana" ? "matí" : "tarda")))}). Posa-la al full de despeses d'iSquad juntament amb el desplaçament.`
        : es ? `Pide la tarifa y el desplazamiento de ${n === 1 ? "tu partido" : `tus ${n} partidos`} de hoy en la hoja de gastos de iSquad.`
          : `Demana la tarifa i el desplaçament ${n === 1 ? "del teu partit" : `dels teus ${n} partits`} d'avui al full de despeses d'iSquad.`,
    }),
    // Recordatorio del domingo (notify, 20:00): solo cobros; el resultado sin subir tiene su propio aviso (#31).
    domingo: (): Aviso => ({
      title: "Vòlei EnXarxa",
      body: es ? "¡No te olvides de revisar tus cobros de dietas y kilometraje de la semana!"
        : "No t'oblidis de revisar els cobraments de dietes i quilometratge de la setmana!",
    }),
    prueba: (): Aviso => ({ title: es ? "Prueba · Vòlei EnXarxa" : "Prova · Vòlei EnXarxa", body: es ? "Así te llegarán los avisos." : "Així t'arribaran els avisos." }),
    // Cuenta sin usar (inactivas)
    inactiva: (fin: string): Aviso => ({
      title: es ? "Tu cuenta de EnXarxa se borrará pronto" : "El teu compte d'EnXarxa s'esborrarà aviat",
      body: es ? `Hace casi 6 meses que no abres la app. Si no entras antes del ${f(fin)}, se borrará con todos tus datos.`
        : `Fa gairebé 6 mesos que no obres l'app. Si no hi entres abans del ${f(fin)}, s'esborrarà amb totes les teves dades.`,
    }),
    // Admin (designadas)
    designaciones: (nuevas: string[]): Aviso => ({
      title: `${es ? "Han salido designaciones de" : "Han sortit designacions de"} ${nuevas.length === 1 ? nuevas[0] : `${nuevas.length} ${es ? "categorías" : "categories"}`}`,
      body: nuevas.join(" · "),
    }),
    salud: (p: { fallan: number; total: number } | { horas: number }): Aviso => ({
      title: es ? "⚠ La app tiene un problema" : "⚠ L'app té un problema",
      body: "fallan" in p
        ? es ? `${p.fallan} de ${p.total} árbitros fallan al actualizar desde iSquad (¿ha cambiado el login?)`
          : `${p.fallan} de ${p.total} àrbitres fallen en actualitzar des d'iSquad (ha canviat l'inici de sessió?)`
        : es ? `La actualización automática no funciona desde hace ${p.horas} h` : `L'actualització automàtica no funciona des de fa ${p.horas} h`,
    }),
  };
}
export type Textos = ReturnType<typeof textos>;

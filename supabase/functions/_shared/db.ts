// PostgREST devuelve como mucho 1000 filas por consulta y sin avisar: las consultas que leen de todos los usuarios
// (crons, avisos del domingo, salud) leen por tandas con estas ayudas.

// deno-lint-ignore no-explicit-any
type Query = any;
const TANDA = 1000;

// Todas las filas de una consulta, de 1000 en 1000. q() tiene que devolver la consulta entera y con un orden estable
// (si no, entre una tanda y otra se pueden repetir o saltar filas).
export async function todas<T = Record<string, unknown>>(q: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += TANDA) {
    const { data, error } = await q().range(from, from + TANDA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < TANDA) return out;
  }
}

// Para filtros in(...) con muchos ids (la dirección de la petición tiene un límite): de 100 en 100, y cada grupo con todas().
export async function porIds<T = Record<string, unknown>>(ids: string[], q: (grupo: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...await todas<T>(() => q(ids.slice(i, i + 100))));
  return out;
}

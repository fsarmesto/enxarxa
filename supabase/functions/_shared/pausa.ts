// Pausa de iSquad (4-nov-2026): ese día iSquad empezó a dar 403 a cualquier programa, en el área privada y en la web
// pública. Decidido por Ferran: no saltárselo (ni otra IP ni disfrazarse de navegador). Con el secret ISQUAD_PAUSA=1
// ninguna función llama a iSquad: cada lectura falla al momento y `cached()` devuelve lo último guardado. La RFEVB
// (esvoley.es) no es iSquad y sigue igual. Para volver: `supabase secrets unset ISQUAD_PAUSA` y reactivar los crons
// (ver CLAUDE.md, "Pausa de iSquad").
export const ISQUAD_PAUSA = Deno.env.get("ISQUAD_PAUSA") === "1";

export class IsquadPausa extends Error {
  constructor() { super("iSquad en pausa"); this.name = "IsquadPausa"; }
}

// Llamar antes de cada fetch a un dominio de iSquad.
export function sinIsquad(url: string) {
  if (ISQUAD_PAUSA && /(^|\.)m?isquad\.es$/i.test(new URL(url).hostname)) throw new IsquadPausa();
}

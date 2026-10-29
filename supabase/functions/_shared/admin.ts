// Administradores de la app: lista fija, a mano, en el secret ADMIN_LOGINS (logins de iSquad separados por comas, tal como
// quedan en profiles.login_key). No hay ninguna pantalla para cambiarla: se mete o se saca a alguien con
// `supabase secrets set ADMIN_LOGINS=...` (no va en el repo, que es público). Es lo único de la app que funciona así.
// deno-lint-ignore no-explicit-any
type Db = any;

export const adminLogins = () => (Deno.env.get("ADMIN_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function esAdmin(db: Db, userId: string): Promise<boolean> {
  const admins = adminLogins();
  if (!admins.length) return false;
  const { data } = await db.from("profiles").select("login_key").eq("user_id", userId).maybeSingle();
  return !!data?.login_key && admins.includes(data.login_key);
}

export async function adminIds(db: Db): Promise<string[]> {
  const admins = adminLogins();
  if (!admins.length) return [];
  const { data } = await db.from("profiles").select("user_id").in("login_key", admins);
  return (data || []).map((x: { user_id: string }) => x.user_id);
}

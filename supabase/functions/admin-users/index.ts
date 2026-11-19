// Edge Function admin-users: gestión de usuarios para perfil oficina.
// La service_role SOLO existe aquí (variable del servidor de Supabase).
// Contrato: POST {action, ...} → {ok: true, data} | {ok: false, error}.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = ["tecnico", "oficina"];
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const BAN_FOREVER = "876000h";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function tempPassword(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `Ptar-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function validName(v: unknown): string {
  const name = String(v ?? "").trim();
  if (name.length < 1 || name.length > 80) throw new HttpError(400, "El nombre debe tener entre 1 y 80 caracteres.");
  return name;
}

function validRole(v: unknown): string {
  if (!ROLES.includes(String(v))) throw new HttpError(400, "El perfil debe ser técnico u oficina.");
  return String(v);
}

function validEmail(v: unknown): string {
  const email = normalizeEmail(v);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "El correo no es válido.");
  return email;
}

async function caller(req: Request, admin: SupabaseClient): Promise<string> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Tu sesión expiró. Entrá de nuevo.");
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Tu sesión expiró. Entrá de nuevo.");
  const { data: prof } = await admin
    .from("profiles").select("role, active").eq("user_id", data.user.id).maybeSingle();
  if (!prof || prof.role !== "oficina" || !prof.active) {
    throw new HttpError(403, "Tu usuario no tiene perfil oficina.");
  }
  return data.user.id;
}

async function profileOf(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("profiles").select("user_id, full_name, role, active")
    .eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "No encontré ese usuario.");
  return data;
}

async function assertNotLastOficina(admin: SupabaseClient, userId: string) {
  const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true })
    .eq("role", "oficina").eq("active", true).neq("user_id", userId);
  if (!count) throw new HttpError(409, "No se puede: quedaría la planta sin ningún usuario oficina activo.");
}

async function log(admin: SupabaseClient, actor: string, target: string | null, action: string, detail = {}) {
  await admin.from("user_admin_log").insert({ actor_id: actor, target_id: target, action, detail });
}

async function listUsers(admin: SupabaseClient) {
  const users: { id: string; email?: string; last_sign_in_at?: string; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, "No pude leer los usuarios.");
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const { data: profs } = await admin.from("profiles").select("user_id, full_name, role, active");
  const byId = new Map((profs ?? []).map((p) => [p.user_id, p]));
  return users
    .filter((u) => byId.has(u.id))
    .map((u) => {
      const p = byId.get(u.id)!;
      return {
        user_id: u.id, email: u.email ?? "", full_name: p.full_name, role: p.role, active: p.active,
        last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
}

async function handle(action: string, body: Record<string, unknown>, actor: string, admin: SupabaseClient) {
  switch (action) {
    case "list":
      return await listUsers(admin);

    case "create": {
      const email = validEmail(body.email);
      const full_name = validName(body.full_name);
      const role = validRole(body.role);
      const password = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) {
        const dup = /already|registered|exists/i.test(error?.message ?? "");
        throw new HttpError(dup ? 409 : 500, dup ? "Ya existe un usuario con ese correo." : "No pude crear el usuario.");
      }
      const { error: pErr } = await admin.from("profiles").insert({ user_id: data.user.id, full_name, role });
      if (pErr) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw new HttpError(500, "No pude crear el perfil del usuario.");
      }
      await log(admin, actor, data.user.id, "create", { email, full_name, role });
      return { user_id: data.user.id, temp_password: password };
    }

    case "set_role": {
      const userId = String(body.user_id ?? "");
      const role = validRole(body.role);
      const prof = await profileOf(admin, userId);
      if (prof.role === "oficina" && role !== "oficina" && prof.active) await assertNotLastOficina(admin, userId);
      await admin.from("profiles").update({ role }).eq("user_id", userId);
      await log(admin, actor, userId, "set_role", { from: prof.role, to: role });
      return {};
    }

    case "reset_password": {
      const userId = String(body.user_id ?? "");
      await profileOf(admin, userId);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(500, "No pude restablecer la contraseña.");
      await log(admin, actor, userId, "reset_password");
      return { temp_password: password };
    }

    case "deactivate": {
      const userId = String(body.user_id ?? "");
      if (userId === actor) throw new HttpError(409, "No podés desactivar tu propio usuario.");
      const prof = await profileOf(admin, userId);
      if (prof.role === "oficina" && prof.active) await assertNotLastOficina(admin, userId);
      await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
      await admin.from("profiles").update({ active: false }).eq("user_id", userId);
      await log(admin, actor, userId, "deactivate");
      return {};
    }

    case "reactivate": {
      const userId = String(body.user_id ?? "");
      await profileOf(admin, userId);
      await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      await admin.from("profiles").update({ active: true }).eq("user_id", userId);
      await log(admin, actor, userId, "reactivate");
      return {};
    }

    default:
      throw new HttpError(400, "Acción desconocida.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Método no permitido." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  try {
    const body = await req.json().catch(() => ({}));
    const actor = await caller(req, admin);
    const data = await handle(String(body.action ?? ""), body, actor, admin);
    return reply(200, { ok: true, data });
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { ok: false, error: e.message });
    console.error(e);
    return reply(500, { ok: false, error: "Algo falló. Intentá de nuevo." });
  }
});

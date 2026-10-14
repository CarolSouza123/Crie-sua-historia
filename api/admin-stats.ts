import type { ApiReq, ApiRes } from "../server/http";
import { methodNotAllowed } from "../server/http";
import { adminConfigured, authorized } from "../server/adminAuth";
import { readRange } from "../server/trackStore";

// GET /api/admin-stats?days=1|7|all
// Devolve os contadores agregados do funil interno (server/trackStore.ts).
// Autenticacao: ADMIN_USER+ADMIN_PASSWORD (headers x-admin-user /
// x-admin-password) ou ADMIN_KEY (header x-admin-key). Sem nenhuma
// variavel de admin configurada -> 503 (painel fechado).
export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "GET") return methodNotAllowed(res);
  if (!adminConfigured()) { res.status(503).json({ error: "autenticacao do painel nao configurada (defina ADMIN_USER/ADMIN_PASSWORD ou ADMIN_KEY)" }); return; }
  if (!authorized(req)) { res.status(401).json({ error: "credenciais invalidas" }); return; }

  const raw = String(req.query?.days ?? "7").toLowerCase();
  const days = raw === "all" || raw === "tudo" ? 36500 : Math.max(1, Math.min(36500, parseInt(raw, 10) || 7));
  const data = await readRange(days);
  res.status(200).json({ ok: true, ...data });
}

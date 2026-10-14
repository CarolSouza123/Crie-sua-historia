import type { ApiReq, ApiRes } from "../server/http";
import { methodNotAllowed } from "../server/http";
import { adminConfigured, authorizedFlexible } from "../server/adminAuth";
import { getPhoto } from "../server/trackStore";

// GET /api/admin-photo?payment_id=<id>
// Devolve a FOTO ORIGINAL da crianca (binario) guardada no pedido.
// A foto nunca e publica: exige as credenciais da administradora —
// via headers (x-admin-user/x-admin-password ou x-admin-key) ou via
// query (?u=&p= ou ?admin_key=), para funcionar em <img src="...">.
export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "GET") return methodNotAllowed(res);
  if (!adminConfigured()) { res.status(503).json({ error: "painel nao configurado (defina ADMIN_USER/ADMIN_PASSWORD ou ADMIN_KEY)" }); return; }
  if (!authorizedFlexible(req)) { res.status(401).json({ error: "credenciais invalidas" }); return; }

  const q = req.query?.payment_id;
  let paymentId = Array.isArray(q) ? String(q[0] || "") : String(q || "");
  if (!paymentId && req.url) {
    try { paymentId = new URL(String(req.url), "http://localhost").searchParams.get("payment_id") || ""; } catch { /* ok */ }
  }
  if (!paymentId) { res.status(400).json({ error: "payment_id obrigatorio" }); return; }

  const dataUrl = await getPhoto(paymentId);
  if (!dataUrl) { res.status(404).json({ error: "foto nao encontrada para este pedido" }); return; }

  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!m) { res.status(500).json({ error: "foto em formato inesperado" }); return; }
  const buf = Buffer.from(m[2], "base64");
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200);
  (res as any).end(buf);
}

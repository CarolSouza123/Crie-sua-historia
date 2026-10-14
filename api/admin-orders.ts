import type { ApiReq, ApiRes } from "../server/http";
import { parseBody } from "../server/http";
import { adminConfigured, authorized } from "../server/adminAuth";
import { listOrders, updateOrderStatus } from "../server/trackStore";

// GET  /api/admin-orders?status=pago|pendente -> { orders: [...] }
//      'pago' (padrao) = fila de despacho; 'pendente' = quem gerou o PIX
//      e NAO pagou (lista de recuperacao, com os dados do checkout).
//      A foto NAO vai embutida: cada pedido leva has_photo e photo_url
//      (o binario vem de /api/admin-photo, com a mesma autenticacao).
// POST /api/admin-orders { payment_id, status_operacional } -> alterna o
//      status operacional Pendente <-> Enviado (despacho da fase 1).
// Autenticacao: ADMIN_USER+ADMIN_PASSWORD (headers x-admin-user /
// x-admin-password) ou ADMIN_KEY (header x-admin-key). Sem nenhuma
// variavel de admin configurada -> 503.
export default async function handler(req: ApiReq, res: ApiRes) {
  if (!adminConfigured()) { res.status(503).json({ error: "painel nao configurado (defina ADMIN_USER/ADMIN_PASSWORD ou ADMIN_KEY)" }); return; }
  if (!authorized(req)) { res.status(401).json({ error: "credenciais invalidas" }); return; }

  if (req.method === "GET") {
    const rawStatus = (() => {
      const q = req.query?.status;
      if (Array.isArray(q)) return String(q[0] || "");
      if (typeof q === "string") return q;
      try { return new URL(String(req.url || ""), "http://localhost").searchParams.get("status") || ""; } catch { return ""; }
    })();
    const status = rawStatus === "pendente" ? "pendente" : "pago";
    const orders = await listOrders(status);
    const out = orders.map((o) => ({
      payment_id: o.payment_id,
      session_id: o.session_id,
      amount: o.amount,
      status_pagamento: o.status_pagamento,
      status_operacional: o.status_operacional,
      created_at: o.created_at,
      paid_at: o.paid_at ?? null,
      buyer: o.buyer ?? { email: o.email },
      quiz: o.quiz ?? null,
      synopsis: o.synopsis ?? null,
      bumps: o.bumps ?? [],
      tracking: o.tracking ?? {},
      origin: o.origin ?? "outro",
      campaign: o.campaign ?? o.tracking?.utm_campaign ?? undefined,
      has_photo: Boolean(o.has_photo),
      photo_url: o.has_photo ? `/api/admin-photo?payment_id=${encodeURIComponent(o.payment_id)}` : null,
    }));
    res.status(200).json({ ok: true, orders: out });
    return;
  }

  if (req.method === "POST") {
    const b = parseBody(req);
    const paymentId = String(b.payment_id || "");
    const status = b.status_operacional === "enviado" ? "enviado" : b.status_operacional === "pendente" ? "pendente" : null;
    if (!paymentId || !status) { res.status(400).json({ error: "payment_id e status_operacional ('pendente'|'enviado') obrigatorios" }); return; }
    const updated = await updateOrderStatus(paymentId, status);
    if (!updated) { res.status(404).json({ error: "pedido nao encontrado" }); return; }
    res.status(200).json({ ok: true, payment_id: updated.payment_id, status_operacional: updated.status_operacional });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

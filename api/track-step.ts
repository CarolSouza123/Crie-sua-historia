import type { ApiReq, ApiRes } from "../server/http";
import { parseBody, methodNotAllowed } from "../server/http";
import { recordStep, recordPurchase } from "../server/trackStore";
import { sanitizeTracking, classifyOrigin } from "../server/tracking";

// POST /api/track-step — rastreamento de abandono (funnel analytics)
// Body: { session_id, step_current, ..., tracking?: { utm_*, fbclid, gclid, fbc, fbp } }
// A origem e RECALCULADA no servidor a partir das UTMs (o campo `origin`
// do cliente nao e confiavel sozinho). No armazenamento do funil
// (server/trackStore.ts) entram somente CONTADORES agregados por dia,
// e apenas das origens que o painel acompanha: anuncio pago da Meta
// ('meta-ads') e link da bio ('bio'). O resto fica so no log.
export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const b = parseBody(req);
  if (!b.session_id) { res.status(400).json({ error: "session_id obrigatorio" }); return; }
  const allowed = ["session_id","step_current","child_name","age","gender","theme","moral","style","photo_url","status_pagamento","bumps","total","buyer_name","buyer_email","buyer_phone","buyer_cpf","mp_payment_id","dedication","tracking","origin"];
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (b[k] !== undefined) payload[k] = b[k];

  const tracking = sanitizeTracking(b.tracking);
  const origin = classifyOrigin(tracking);
  const campaign = tracking.utm_campaign;
  console.log("[track-step]", JSON.stringify({ ...payload, origin }));

  let stored = false;
  const step = Number(payload.step_current);
  if (Number.isFinite(step)) stored = (await recordStep(step, origin, campaign)) || stored;
  if (payload.status_pagamento === "pago") {
    const totalRaw = payload.total ?? (b.extra && typeof b.extra === "object" ? b.extra.total : undefined);
    const total = Number(totalRaw);
    stored = (await recordPurchase(Number.isFinite(total) ? total : 0, origin, campaign)) || stored;
  }
  res.status(200).json({ ok: true, stored, origin });
}

// ============================================================
// Meta Conversions API (CAPI) — evento Purchase server-side.
// Disparado pelo webhook do Mercado Pago quando o pagamento e
// aprovado, usando o MESMO event_id do Pixel (o payment_id), para
// a Meta deduplicar o Purchase do navegador com o do servidor.
// Usa fbc/fbp e o e-mail (hash SHA-256) guardados no pedido.
// Sem META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN: nao envia (so loga).
// Nunca lanca erro: o webhook precisa responder 200 de qualquer jeito.
// ============================================================

import crypto from "node:crypto";
import type { LeadTracking } from "./tracking";
import { deriveFbc } from "./tracking";

export interface MetaPurchaseInput {
  paymentId: string;
  amount: number;
  email?: string;
  tracking?: LeadTracking;
}

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

export async function sendMetaPurchase(input: MetaPurchaseInput): Promise<{ sent: boolean; reason?: string }> {
  const pixelId = process.env.META_PIXEL_ID || "";
  const token = process.env.META_CAPI_ACCESS_TOKEN || "";
  if (!pixelId || !token) {
    console.log("[meta-capi] META_PIXEL_ID/META_CAPI_ACCESS_TOKEN nao configurados — Purchase server-side nao enviado.");
    return { sent: false, reason: "missing-env" };
  }
  try {
    const t = input.tracking ?? {};
    const userData: Record<string, unknown> = {};
    const email = (input.email || "").trim().toLowerCase();
    if (email) userData.em = [sha256(email)];
    const fbc = t.fbc || (t.fbclid ? deriveFbc(t.fbclid) : undefined);
    if (fbc) userData.fbc = fbc;
    if (t.fbp) userData.fbp = t.fbp;

    const body = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_id: String(input.paymentId),
        user_data: userData,
        custom_data: { value: Number(input.amount) || 0, currency: "BRL" },
      }],
      access_token: token,
    };
    const resp = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("[meta-capi] Meta recusou o evento:", resp.status, detail.slice(0, 300));
      return { sent: false, reason: `http-${resp.status}` };
    }
    console.log("[meta-capi] Purchase enviado para a Meta (payment_id:", input.paymentId, ")");
    return { sent: true };
  } catch (e) {
    console.error("[meta-capi] falha ao enviar (ignorado):", e);
    return { sent: false, reason: "exception" };
  }
}

import crypto from "node:crypto";
import type { ApiReq, ApiRes } from "../../server/http";
import { parseBody } from "../../server/http";
import { recordPurchase, getOrder, saveOrder } from "../../server/trackStore";
import { notifyDelivery } from "../../server/notify";
import { sendMetaPurchase } from "../../server/metaCapi";

// POST /api/webhook/mercadopago
// Recebe a notificacao do Mercado Pago. Em pagamento aprovado:
//  1) recupera o pedido guardado (getOrder) para achar as UTMs da compra
//  2) marca o pedido como PAGO (status_pagamento + paid_at) — ele entra
//     na fila "Pedidos Pagos" do painel /dashboardfunil
//  3) registra a compra nos contadores do funil interno, com origem/campanha
//  4) dispara a notificacao de entrega (Telegram ou DELIVERY_WEBHOOK_URL),
//     com resumo do pedido (comprador + livro) e o bloco de tracking
//  5) envia o Purchase da Meta Conversions API com fbc/fbp e event_id
//     igual ao payment_id (deduplica com o Pixel do navegador)
// Compativel tambem com o formato antigo (?topic=payment&id=...).
function verifySignature(req: ApiReq, paymentId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado, nao bloqueia (apenas loga)
  const sig = String(req.headers["x-signature"] || "");
  const reqId = String(req.headers["x-request-id"] || "");
  const ts = sig.match(/ts=(\d+)/)?.[1]; const v1 = sig.match(/v1=([a-f0-9]+)/)?.[1];
  if (!ts || !v1) { console.warn("[webhook-mp] assinatura ausente"); return false; }
  const manifest = `id:${paymentId};request-id:${reqId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); }
  catch { return false; }
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "POST") { res.status(200).json({ ok: true, note: "webhook ativo (use POST)" }); return; }
  const b = parseBody(req);
  const paymentId = String(b?.data?.id || b?.id || (req.query?.id as string) || "");
  const type = b?.type || (req.query?.topic as string) || "payment";
  if (!paymentId || (type !== "payment" && type !== undefined)) {
    console.log("[webhook-mp] notificacao ignorada:", JSON.stringify(b));
    res.status(200).json({ ok: true, ignored: true }); return;
  }
  if (!verifySignature(req, paymentId)) { res.status(401).json({ error: "assinatura invalida" }); return; }

  // Confirma o status real no Mercado Pago quando ha token.
  let status = String(b?.status || ""), externalRef = String(b?.external_reference || ""), payerEmail = "", amount = Number(b?.transaction_amount ?? b?.amount) || 0;
  const token = process.env.MP_ACCESS_TOKEN;
  if (token) {
    try {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const p: any = await r.json(); status = p.status; externalRef = p.external_reference || ""; payerEmail = p.payer?.email || ""; amount = Number(p.transaction_amount) || amount; }
    } catch (e) { console.error("[webhook-mp] consulta MP falhou:", e); }
  } else {
    console.log("[webhook-mp] MOCK/sem token — confiando no payload recebido. status =", status || "(desconhecido)");
  }

  if (status === "approved") {
    // Recupera o pedido completo guardado quando o PIX foi criado.
    const order = await getOrder(paymentId).catch(() => null);
    const tracking = order?.tracking;
    const origin = order?.origin;
    const campaign = order?.campaign ?? tracking?.utm_campaign;
    if (!payerEmail && order?.email) payerEmail = order.email;
    const finalAmount = amount || order?.amount || 0;

    // Marca o pedido como PAGO (merge por payment_id): ele sai da lista
    // de recuperacao (pendentes) e entra na fila de Pedidos Pagos.
    // Sem pedido previo, cria um registro minimo com o que foi recuperado.
    await saveOrder(paymentId, {
      session_id: externalRef || order?.session_id,
      amount: finalAmount || undefined,
      status_pagamento: "pago",
      paid_at: new Date().toISOString(),
      buyer: { name: order?.buyer?.name, email: payerEmail || order?.buyer?.email, phone: order?.buyer?.phone },
      email: payerEmail || undefined,
      tracking: tracking ?? undefined,
      origin,
      campaign,
    });

    const fresh = await getOrder(paymentId).catch(() => null);
    const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const photoLine = fresh?.has_photo
      ? (baseUrl
          ? `${baseUrl}/api/admin-photo?payment_id=${encodeURIComponent(paymentId)} (abrir logada no painel)`
          : "disponível no painel /dashboardfunil")
      : "não enviada na compra (cliente escolheu enviar depois ou não há foto)";

    await recordPurchase(finalAmount, origin, campaign);
    const channel = await notifyDelivery({
      mp_payment_id: paymentId, session_id: externalRef, buyer_email: payerEmail, total: finalAmount || undefined,
      buyer_name: fresh?.buyer?.name, buyer_phone: fresh?.buyer?.phone,
      child_name: fresh?.quiz?.childName, age: fresh?.quiz?.age,
      theme: fresh?.quiz?.adventure, moral: fresh?.quiz?.moral, style: fresh?.quiz?.style,
      synopsis_title: fresh?.synopsis?.title,
      bumps: fresh?.bumps ?? [],
      photo_url: photoLine,
      origem: origin ?? "desconhecida",
      utm_source: tracking?.utm_source, utm_medium: tracking?.utm_medium, utm_campaign: tracking?.utm_campaign,
      utm_content: tracking?.utm_content, utm_term: tracking?.utm_term,
      fbclid: tracking?.fbclid, gclid: tracking?.gclid,
      note: "Compra registrada nos contadores do funil interno do site (painel /dashboardfunil).",
    });
    // Conversions API: mesmo event_id do Pixel (payment_id) para deduplicar.
    const capi = await sendMetaPurchase({ paymentId, amount: finalAmount, email: payerEmail || undefined, tracking });
    console.log("[webhook-mp] aprovado:", paymentId, "entrega via", channel.channel, "| CAPI:", capi.sent ? "enviado" : `nao enviado (${capi.reason})`);
  } else {
    console.log("[webhook-mp] status nao-aprovado:", paymentId, status);
  }
  res.status(200).json({ ok: true });
}

// Fase 1 (semi-automatica): avisa a producao sobre o pedido pago.
export async function notifyDelivery(order: Record<string, unknown>): Promise<{ channel: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    const text = [
      "Novo pedido PAGO — Crie Sua Historia", "",
      `Crianca: ${order.child_name ?? "-"} (${order.age ?? "-"} anos)`,
      `Aventura: ${order.theme ?? "-"} | Moral: ${order.moral ?? "-"} | Estilo: ${order.style ?? "-"}`,
      `Sinopse aprovada: ${order.synopsis_title ?? "-"}`,
      `Foto: ${order.photo_url ?? "(enviar depois por e-mail)"}`,
      `Comprador: ${order.buyer_name ?? "-"} <${order.buyer_email ?? "-"}> WhatsApp: ${order.buyer_phone ?? "-"}`,
      `Extras: ${JSON.stringify(order.bumps ?? [])} | Total: R$ ${order.total ?? "-"}`,
      `Pagamento MP: ${order.mp_payment_id ?? "-"}`,
      "",
      "Origem da venda (UTMs):",
      `Origem: ${order.origem ?? "-"}`,
      `utm_source: ${order.utm_source ?? "-"} | utm_medium: ${order.utm_medium ?? "-"} | utm_campaign: ${order.utm_campaign ?? "-"}`,
      `utm_content: ${order.utm_content ?? "-"} | utm_term: ${order.utm_term ?? "-"}`,
      `fbclid: ${order.fbclid ?? "-"} | gclid: ${order.gclid ?? "-"}`,
    ].join("\n");
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
      });
      return { channel: "telegram" };
    } catch (e) { console.error("[notify] telegram falhou:", e); }
  }
  const hook = process.env.DELIVERY_WEBHOOK_URL;
  if (hook) {
    try { await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) }); return { channel: "webhook" }; }
    catch (e) { console.error("[notify] webhook falhou:", e); }
  }
  console.log("[notify:noop] Pedido pago sem canal configurado:", JSON.stringify(order));
  return { channel: "log" };
}

// Meta Pixel — wrapper seguro: sem VITE_META_PIXEL_ID, tudo vira no-op.
declare global { interface Window { fbq?: (...args: any[]) => void; _fbq?: unknown } }
let initialized = false;
export function initPixel() {
  if (initialized || typeof window === "undefined") return;
  const id = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
  if (!id) { console.info("[pixel:noop] VITE_META_PIXEL_ID nao definido"); initialized = true; return; }
  /* eslint-disable */
  const f = window as any; if (f.fbq) return;
  const n: any = (f.fbq = function (...args: any[]) { n.callMethod ? n.callMethod(...args) : n.queue.push(args); });
  n.queue = []; n.loaded = true; n.version = "2.0"; f._fbq = n;
  const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  n("init", id); n("track", "PageView"); initialized = true;
}
export function trackPixel(event: string, params?: Record<string, unknown>, options?: { eventID?: string }) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (options?.eventID) window.fbq("track", event, params, { eventID: options.eventID });
    else window.fbq("track", event, params);
  } else console.info(`[pixel:noop] ${event}`, params ?? "", options ?? "");
}
// Eventos do funil: ViewContent (etapa 1) / Lead (etapa 4) / InitiateCheckout (etapa 5)
// Purchase: disparado no estado de sucesso no front como sinal imediato, com
// eventID = id do pagamento — o webhook dispara o MESMO Purchase pela
// Conversions API com o mesmo event_id, e a Meta deduplica os dois.
// A fonte oficial do Purchase e o webhook do Mercado Pago (server-side).
export const pixelViewContent = () => trackPixel("ViewContent", { content_name: "Crie Sua História — Quiz" });
export const pixelLead = () => trackPixel("Lead", { content_name: "Sinopse gerada" });
export const pixelInitiateCheckout = (v: number) => trackPixel("InitiateCheckout", { value: v, currency: "BRL" });
export const pixelPurchase = (v: number, id: string) => trackPixel("Purchase", { value: v, currency: "BRL" }, { eventID: id });

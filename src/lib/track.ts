import type { QuizState } from "../types";
import { getTracking, classifyOrigin, type LeadTracking, type Origin } from "./tracking";

// Evento local (so neste navegador/sessao) — alimenta o painel /dashboardfunil
// quando a API nao esta disponivel (preview/demonstracao).
// Cada evento carrega o tracking (UTMs) e a origem classificada, para o
// painel local aplicar o mesmo escopo do servidor: so 'meta-ads' e 'bio'.
export interface LocalTrackEvent {
  t: number;
  type: "step" | "purchase" | "pix_generated";
  step?: number;
  total?: number;
  origin?: Origin;
  tracking?: LeadTracking;
}
const LOCAL_KEY = "csh_local_events";
export function appendLocalEvent(ev: LocalTrackEvent) {
  try {
    const raw = sessionStorage.getItem(LOCAL_KEY);
    const list: LocalTrackEvent[] = raw ? JSON.parse(raw) : [];
    list.push(ev);
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-200)));
  } catch { /* nunca bloqueia o funil */ }
}
export function readLocalEvents(): LocalTrackEvent[] {
  try {
    const raw = sessionStorage.getItem(LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// ------------------------------------------------------------
// Pedidos locais (so neste navegador/sessao): espelho do registro
// do servidor, para o painel funcionar no preview/demonstracao.
// A MESMA lista guarda pendentes (gerou o PIX) e pagos — a
// confirmacao ATUALIZA o mesmo item (merge por payment_id).
// ------------------------------------------------------------
export interface LocalOrder {
  payment_id: string;
  session_id?: string;
  amount: number;
  status_pagamento: "pendente" | "pago";
  status_operacional: "pendente" | "enviado";
  created_at: string;
  paid_at?: string;
  buyer?: { name?: string; email?: string; phone?: string };
  quiz?: { childName?: string; age?: number | string; gender?: string; style?: string; adventure?: string; moral?: string; dedication?: string };
  synopsis?: { title?: string; summary?: string; chapters?: string[] } | null;
  bumps?: string[];
  tracking?: LeadTracking;
  origin?: Origin;
  campaign?: string;
  photo?: string | null;
  has_photo?: boolean;
}
const LOCAL_ORDERS_KEY = "csh_local_orders";
export function readLocalOrders(): LocalOrder[] {
  try {
    const raw = sessionStorage.getItem(LOCAL_ORDERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
export function upsertLocalOrder(order: LocalOrder) {
  try {
    const list = readLocalOrders();
    const i = list.findIndex((o) => o.payment_id === order.payment_id);
    if (i >= 0) {
      const prev = list[i];
      const merged: LocalOrder = { ...prev, ...order };
      if (prev.status_pagamento === "pago") { merged.status_pagamento = "pago"; merged.paid_at = prev.paid_at || order.paid_at; }
      if (prev.status_operacional === "enviado") merged.status_operacional = "enviado";
      if (!order.photo) merged.photo = prev.photo;
      merged.has_photo = Boolean(merged.photo);
      list[i] = merged;
    } else {
      list.unshift({ ...order, has_photo: Boolean(order.photo) });
    }
    sessionStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list.slice(0, 200)));
  } catch { /* nunca bloqueia o checkout */ }
}
export function setLocalOrderOperacional(paymentId: string, status: "pendente" | "enviado") {
  try {
    const list = readLocalOrders();
    const o = list.find((x) => x.payment_id === paymentId);
    if (!o) return;
    o.status_operacional = status;
    sessionStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list));
  } catch { /* ok */ }
}

// Funnel analytics / abandono: fire-and-forget a cada avanco de etapa.
// Toda requisicao leva o tracking (lead_tracking) + a origem classificada.
export function trackStep(sessionId: string, step: number, quiz: QuizState, extra: Record<string, unknown> = {}) {
  const tracking = getTracking();
  const origin = classifyOrigin(tracking);
  const payload = {
    session_id: sessionId, step_current: step,
    child_name: quiz.childName || undefined, age: quiz.age === "" ? undefined : quiz.age,
    gender: quiz.gender || undefined, theme: quiz.adventure || undefined, moral: quiz.moral || undefined,
    style: quiz.style, dedication: quiz.dedication || undefined,
    photo_url: quiz.sendPhotoLater ? "(enviar depois)" : quiz.photoDataUrl ? "(foto enviada — base64 local, nao persistida)" : undefined,
    status_pagamento: "pendente", tracking, origin, ...extra,
  };
  appendLocalEvent({ t: Date.now(), type: "step", step, origin, tracking });
  if (payload.status_pagamento === "pago") {
    const total = Number((extra as any)?.total);
    appendLocalEvent({ t: Date.now(), type: "purchase", total: Number.isFinite(total) ? total : 0, origin, tracking });
  }
  console.info("[track-step]", payload);
  try {
    fetch("/api/track-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true })
      .catch(() => console.info("[track-step:fallback] API indisponivel (dev sem functions) — evento apenas no console"));
  } catch { /* nunca bloqueia o funil */ }
}

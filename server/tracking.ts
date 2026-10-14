// Espelho server-side de src/lib/tracking.ts: o servidor NAO confia no
// campo `origin` que o cliente manda — ele recalcula a origem a partir
// dos campos de UTM/fbclid recebidos no payload.
export interface LeadTracking {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  fbc?: string;
  fbp?: string;
  captured_at?: string;
  landing?: string;
}
export type Origin = "meta-ads" | "bio" | "outro";

const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "fbc", "fbp", "captured_at", "landing"] as const;
const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram"]);
const PAID_MEDIUMS = new Set(["cpc", "paid", "pago", "ads", "anuncio", "anúncio"]);

/** Extrai so os campos conhecidos de tracking de um objeto qualquer. */
export function sanitizeTracking(raw: unknown): LeadTracking {
  const out: LeadTracking = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const f of FIELDS) {
    const v = src[f];
    if (typeof v === "string" && v.trim()) out[f] = v.slice(0, 300);
  }
  return out;
}

export function classifyOrigin(t: LeadTracking | null | undefined): Origin {
  if (!t) return "outro";
  if (t.fbclid) return "meta-ads";
  const source = (t.utm_source || "").trim().toLowerCase();
  const medium = (t.utm_medium || "").trim().toLowerCase();
  if (META_SOURCES.has(source) && PAID_MEDIUMS.has(medium)) return "meta-ads";
  if (medium === "bio" || source === "bio") return "bio";
  return "outro";
}

export function deriveFbc(fbclid: string, now = Date.now()): string {
  return `fb.1.${now}.${fbclid}`;
}

/** Origens que o painel /dashboardfunil acompanha (pedido da Caroline). */
export function isTrackedOrigin(o: Origin | null | undefined): o is "meta-ads" | "bio" {
  return o === "meta-ads" || o === "bio";
}

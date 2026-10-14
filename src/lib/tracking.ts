// ============================================================
// Captura e persistencia de UTMs / identificadores de clique.
// Na abertura do site, le utm_* + fbclid + gclid da URL e guarda
// em localStorage na chave 'lead_tracking' (first-touch), para
// acompanhar a visitante pelas 5 etapas do quiz.
// O painel /dashboardfunil so enxerga DUAS origens:
//   'meta-ads' (anuncio pago da Meta) e 'bio' (link da bio).
// Todo o resto vira 'outro' e NAO entra nos numeros do painel.
// ============================================================

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

const STORAGE_KEY = "lead_tracking";
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;

const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram"]);
const PAID_MEDIUMS = new Set(["cpc", "paid", "pago", "ads", "anuncio", "anúncio"]);

/** Classifica a origem a partir dos dados de tracking. */
export function classifyOrigin(t: LeadTracking | null | undefined): Origin {
  if (!t) return "outro";
  if (t.fbclid) return "meta-ads";
  const source = (t.utm_source || "").trim().toLowerCase();
  const medium = (t.utm_medium || "").trim().toLowerCase();
  if (META_SOURCES.has(source) && PAID_MEDIUMS.has(medium)) return "meta-ads";
  if (medium === "bio" || source === "bio") return "bio";
  return "outro";
}

/** Monta o fbc no formato que a Meta espera a partir do fbclid. */
export function deriveFbc(fbclid: string, now = Date.now()): string {
  return `fb.1.${now}.${fbclid}`;
}

// ---------- armazenamento seguro (localStorage -> sessionStorage -> memoria) ----------
let memValue: string | null = null;
function storageRead(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { /* tenta o proximo */ }
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { /* tenta o proximo */ }
  return memValue;
}
function storageWrite(v: string) {
  try { localStorage.setItem(STORAGE_KEY, v); return; } catch { /* tenta o proximo */ }
  try { sessionStorage.setItem(STORAGE_KEY, v); return; } catch { /* ultimo recurso */ }
  memValue = v;
}

function readCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const part of document.cookie.split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  } catch { /* sem cookies acessiveis */ }
  return out;
}

function parseStored(): LeadTracking | null {
  try {
    const raw = storageRead();
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as LeadTracking) : null;
  } catch { return null; }
}

/**
 * Captura os parametros da URL atual. Deve ser chamado na abertura do app.
 * First-touch: so sobrescreve o que ja estava guardado se a URL nova
 * trouxer fbclid ou gclid (clique novo de anuncio tem prioridade).
 */
export function captureTracking(): LeadTracking {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: LeadTracking = {};
  let any = false;
  for (const f of UTM_FIELDS) {
    const v = params.get(f);
    if (v) { fromUrl[f] = v; any = true; }
  }
  const cookies = readCookies();
  const stored = parseStored();

  let result: LeadTracking;
  if (any && (!stored || fromUrl.fbclid || fromUrl.gclid)) {
    result = { ...fromUrl, captured_at: new Date().toISOString(), landing: window.location.pathname || "/" };
  } else if (stored) {
    result = { ...stored };
  } else {
    result = {};
  }

  // Cookies do Pixel (_fbp/_fbc) completam o que faltar; fbc pode ser derivado do fbclid.
  if (!result.fbp && cookies._fbp) result.fbp = cookies._fbp;
  if (!result.fbc && cookies._fbc) result.fbc = cookies._fbc;
  if (!result.fbc && result.fbclid) result.fbc = deriveFbc(result.fbclid);

  if (Object.keys(result).length) {
    try { storageWrite(JSON.stringify(result)); } catch { /* nunca bloqueia */ }
  }
  return result;
}

/** Devolve o tracking guardado (ou {} se a visita nao trouxe nada). */
export function getTracking(): LeadTracking {
  return parseStored() ?? {};
}

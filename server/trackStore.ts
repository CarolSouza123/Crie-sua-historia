// ============================================================
// Funil interno do site (nenhum banco externo no rastreamento).
// Guarda CONTADORES agregados por dia no fuso America/Sao_Paulo,
// chave `day:YYYY-MM-DD`, neste formato:
//   {
//     steps: {1..5}, purchases, revenue, pixGenerated,
//     origins:   { "meta-ads": Agg, "bio": Agg },  // recorte por origem
//     campaigns: { "<utm_campaign>": Agg, ... }   // recorte por campanha
//   }
//   onde Agg = { steps: {1..5}, purchases, revenue, pixGenerated }
//
// ESCOPO DO PAINEL (pedido da Caroline): o painel /dashboardfunil so
// acompanha anuncio pago da Meta ('meta-ads') e link da bio ('bio').
// Visitas de qualquer outra origem NAO entram nesses contadores.
//
// Tambem guarda PEDIDOS individuais completos (saveOrder/getOrder),
// chave `order:<payment_id>` + indice `orders:index` (lista de ids):
// comprador, dados do livro (quiz), sinopse aprovada, bumps, UTMs e
// os dois status (pagamento e operacional). E a foto da crianca em
// `photo:<payment_id>` (KV) ou .data/uploads/<id>.img (arquivo local,
// pasta persistente e privada). E assim que o webhook do Mercado
// Pago recupera as UTMs da compra e o painel monta a fila de pedidos.
//
// Backends, nesta ordem:
//   1) Cloudflare KV (binding TRACK_KV) — camada gratuita, em producao
//   2) Arquivo local .data/track.json + .data/orders.json + .data/uploads/
//   3) Memoria do processo (ultimo recurso; some ao reiniciar)
//
// Tudo com try/catch: o rastreamento NUNCA quebra o funil nem o webhook.
// ============================================================

import type { LeadTracking, Origin } from "./tracking";
import { isTrackedOrigin } from "./tracking";

export interface Agg {
  steps: Record<string, number>;
  purchases: number;
  revenue: number;
  pixGenerated: number;
}
export interface DayStats extends Agg {
  origins: { "meta-ads": Agg; bio: Agg };
  campaigns: Record<string, Agg>;
}
export interface RangeResult {
  backend: "kv" | "file" | "memory";
  days: Array<{ date: string } & DayStats>;
  totals: Agg;
  origins: { "meta-ads": Agg; bio: Agg };
  campaigns: Record<string, Agg>;
}
export interface OrderQuiz {
  childName?: string;
  age?: number | string;
  gender?: string;
  style?: string;
  adventure?: string;
  moral?: string;
  dedication?: string;
}
export interface OrderSynopsis {
  title?: string;
  summary?: string;
  chapters?: string[];
}
export interface OrderBuyer {
  name?: string;
  email?: string;
  phone?: string;
}
export interface OrderRecord {
  payment_id: string;
  session_id?: string;
  amount: number;
  status_pagamento: "pendente" | "pago";
  status_operacional: "pendente" | "enviado";
  created_at: string;
  paid_at?: string;
  buyer?: OrderBuyer;
  /** legado: e-mail solto (pedidos antigos) — buyer.email e a fonte atual */
  email?: string;
  quiz?: OrderQuiz;
  synopsis?: OrderSynopsis | null;
  bumps?: string[];
  tracking?: LeadTracking;
  origin?: Origin;
  campaign?: string;
  has_photo?: boolean;
}

type StoreData = Record<string, DayStats>;
type OrderData = Record<string, OrderRecord>;

const emptyAgg = (): Agg => ({ steps: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, purchases: 0, revenue: 0, pixGenerated: 0 });
const emptyDay = (): DayStats => ({
  ...emptyAgg(),
  origins: { "meta-ads": emptyAgg(), bio: emptyAgg() },
  campaigns: {},
});

function round2(v: number): number { return Math.round((Number(v) || 0) * 100) / 100; }

function normalizeAgg(raw: any): Agg {
  const a = emptyAgg();
  if (raw && typeof raw === "object") {
    for (const k of ["1", "2", "3", "4", "5"]) a.steps[k] = Number(raw.steps?.[k]) || 0;
    a.purchases = Number(raw.purchases) || 0;
    a.revenue = round2(raw.revenue);
    a.pixGenerated = Number(raw.pixGenerated) || 0;
  }
  return a;
}
function normalizeDay(raw: any): DayStats {
  const d = emptyDay();
  if (raw && typeof raw === "object") {
    const totals = normalizeAgg(raw);
    d.steps = totals.steps; d.purchases = totals.purchases; d.revenue = totals.revenue; d.pixGenerated = totals.pixGenerated;
    d.origins["meta-ads"] = normalizeAgg(raw.origins?.["meta-ads"]);
    d.origins.bio = normalizeAgg(raw.origins?.bio);
    if (raw.campaigns && typeof raw.campaigns === "object") {
      for (const [name, agg] of Object.entries(raw.campaigns)) d.campaigns[name] = normalizeAgg(agg);
    }
  }
  return d;
}
function addAgg(target: Agg, src: Agg) {
  for (const k of Object.keys(target.steps)) target.steps[k] += src.steps[k] || 0;
  target.purchases += src.purchases;
  target.revenue = round2(target.revenue + src.revenue);
  target.pixGenerated += src.pixGenerated || 0;
}

function normalizeOrder(raw: any, fallbackId = ""): OrderRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.payment_id || raw.id || fallbackId || "").trim();
  if (!id) return null;
  const buyer: OrderBuyer = (raw.buyer && typeof raw.buyer === "object")
    ? { name: raw.buyer.name, email: raw.buyer.email || raw.email, phone: raw.buyer.phone }
    : { email: raw.email };
  return {
    payment_id: id,
    session_id: raw.session_id ? String(raw.session_id) : undefined,
    amount: round2(raw.amount),
    status_pagamento: raw.status_pagamento === "pago" ? "pago" : "pendente",
    status_operacional: raw.status_operacional === "enviado" ? "enviado" : "pendente",
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    paid_at: typeof raw.paid_at === "string" ? raw.paid_at : undefined,
    buyer,
    email: buyer.email,
    quiz: raw.quiz && typeof raw.quiz === "object" ? raw.quiz : undefined,
    synopsis: raw.synopsis && typeof raw.synopsis === "object" ? raw.synopsis : null,
    bumps: Array.isArray(raw.bumps) ? raw.bumps.filter((b: unknown) => typeof b === "string") : [],
    tracking: raw.tracking && typeof raw.tracking === "object" ? raw.tracking : undefined,
    origin: raw.origin,
    campaign: raw.campaign,
    has_photo: Boolean(raw.has_photo),
  };
}

/** Data de hoje (ou deslocada) no fuso America/Sao_Paulo, formato YYYY-MM-DD. */
export function dayKey(offsetDays = 0): string {
  const now = new Date(Date.now() - offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ---------------- Backend 1: Cloudflare KV ----------------
interface KVLike {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  list?: (opts: { prefix: string }) => Promise<{ keys: Array<{ name: string }> }>;
}
function kvBinding(): KVLike | null {
  try {
    const g = globalThis as any;
    const cand = g.TRACK_KV ?? (typeof process !== "undefined" ? (process as any).env?.TRACK_KV : undefined);
    if (cand && typeof cand.get === "function" && typeof cand.put === "function") return cand as KVLike;
  } catch { /* ignore */ }
  return null;
}

// ---------------- Backend 2: arquivos locais ----------------
let fsMod: any = null; let pathMod: any = null; let fsTried = false;
async function loadFs(): Promise<boolean> {
  if (fsTried) return Boolean(fsMod);
  fsTried = true;
  try {
    if (typeof process === "undefined" || !process.versions?.node) return false;
    fsMod = await import("node:fs/promises");
    pathMod = await import("node:path");
    return true;
  } catch { fsMod = null; return false; }
}
function fileFor(name: string): string {
  return pathMod.join(process.cwd(), ".data", name);
}
function safeFileId(id: string): string { return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "sem-id"; }
async function fileReadJson<T>(name: string): Promise<T | null> {
  if (!(await loadFs())) return null;
  try {
    const raw = await fsMod.readFile(fileFor(name), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
  } catch (e: any) {
    if (e?.code === "ENOENT") return {} as T;
    return null; // erro inesperado: cai para memoria
  }
}
async function fileWriteJson(name: string, data: unknown): Promise<boolean> {
  if (!(await loadFs())) return false;
  try {
    await fsMod.mkdir(pathMod.dirname(fileFor(name)), { recursive: true });
    await fsMod.writeFile(fileFor(name), JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch { return false; }
}

// ---------------- Backend 3: memoria ----------------
const memStore: StoreData = {};
const memOrders: OrderData = {};
const memPhotos: Record<string, string> = {};

// ---------------- Serializacao (read-modify-write) ----------------
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}

// ---------------- Dias (contadores) ----------------
async function readDay(date: string): Promise<{ day: DayStats; backend: RangeResult["backend"] }> {
  const kv = kvBinding();
  if (kv) {
    try {
      const raw = await kv.get(`day:${date}`);
      return { day: normalizeDay(raw ? JSON.parse(raw) : null), backend: "kv" };
    } catch { /* cai para os proximos backends */ }
  }
  const all = await fileReadJson<StoreData>("track.json");
  if (all) return { day: normalizeDay(all[date]), backend: "file" };
  return { day: normalizeDay(memStore[date]), backend: "memory" };
}

async function writeDay(date: string, day: DayStats): Promise<RangeResult["backend"] | null> {
  const kv = kvBinding();
  if (kv) {
    try { await kv.put(`day:${date}`, JSON.stringify(day)); return "kv"; }
    catch { /* tenta arquivo */ }
  }
  const all = await fileReadJson<StoreData>("track.json");
  if (all) {
    all[date] = day;
    if (await fileWriteJson("track.json", all)) return "file";
  }
  memStore[date] = day;
  return "memory";
}

async function mutate(fn: (day: DayStats) => void): Promise<boolean> {
  try {
    return await withLock(async () => {
      const date = dayKey(0);
      const { day } = await readDay(date);
      fn(day);
      return (await writeDay(date, day)) !== null;
    });
  } catch (e) {
    console.error("[trackStore] falha ao gravar (ignorado):", e);
    return false;
  }
}

function scopedTargets(day: DayStats, origin: Origin | undefined, campaign?: string): Agg[] | null {
  if (!isTrackedOrigin(origin)) return null; // fora do escopo do painel: nao grava
  const targets: Agg[] = [day, day.origins[origin]];
  const camp = (campaign || "").trim();
  if (camp) {
    if (!day.campaigns[camp]) day.campaigns[camp] = emptyAgg();
    targets.push(day.campaigns[camp]);
  }
  return targets;
}

/**
 * Registra a chegada de um visitante a uma etapa (1 a 5).
 * So grava se a origem for 'meta-ads' ou 'bio' (escopo do painel).
 */
export async function recordStep(step: number, origin?: Origin, campaign?: string): Promise<boolean> {
  const s = Math.trunc(Number(step));
  if (!Number.isFinite(s) || s < 1 || s > 5) return false;
  if (!isTrackedOrigin(origin)) return false;
  return mutate((day) => {
    const targets = scopedTargets(day, origin, campaign);
    if (!targets) return;
    for (const t of targets) t.steps[String(s)] = (t.steps[String(s)] || 0) + 1;
  });
}

/** Registra uma compra aprovada (valor em R$). Mesmo escopo de recordStep. */
export async function recordPurchase(amount: number, origin?: Origin, campaign?: string): Promise<boolean> {
  if (!isTrackedOrigin(origin)) return false;
  const v = Number(amount);
  return mutate((day) => {
    const targets = scopedTargets(day, origin, campaign);
    if (!targets) return;
    for (const t of targets) {
      t.purchases += 1;
      if (Number.isFinite(v) && v > 0) t.revenue = round2(t.revenue + v);
    }
  });
}

/** Registra um PIX gerado (create-pix com sucesso, real ou mock). Mesmo escopo. */
export async function recordPixGenerated(origin?: Origin, campaign?: string): Promise<boolean> {
  if (!isTrackedOrigin(origin)) return false;
  return mutate((day) => {
    const targets = scopedTargets(day, origin, campaign);
    if (!targets) return;
    for (const t of targets) t.pixGenerated += 1;
  });
}

// ---------------- Pedidos (orders) ----------------
async function kvGetOrder(id: string, kv: KVLike): Promise<OrderRecord | null> {
  try {
    const raw = await kv.get(`order:${id}`);
    return raw ? normalizeOrder(JSON.parse(raw), id) : null;
  } catch { return null; }
}
async function kvPutOrder(record: OrderRecord, kv: KVLike): Promise<boolean> {
  try {
    await kv.put(`order:${record.payment_id}`, JSON.stringify(record));
    // Indice de ids para a fila do painel (listPaidOrders).
    let ids: string[] = [];
    try {
      const raw = await kv.get("orders:index");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((x: unknown) => typeof x === "string");
    } catch { ids = []; }
    if (!ids.includes(record.payment_id)) {
      ids.push(record.payment_id);
      await kv.put("orders:index", JSON.stringify(ids.slice(-1000)));
    }
    return true;
  } catch { return false; }
}

async function writeOrderRecord(record: OrderRecord): Promise<boolean> {
  const kv = kvBinding();
  if (kv && (await kvPutOrder(record, kv))) return true;
  const all = await fileReadJson<OrderData>("orders.json");
  if (all) {
    all[record.payment_id] = record;
    if (await fileWriteJson("orders.json", all)) return true;
  }
  memOrders[record.payment_id] = record;
  return true;
}

async function readAllOrders(): Promise<OrderRecord[]> {
  const out = new Map<string, OrderRecord>();
  const kv = kvBinding();
  if (kv) {
    try {
      let ids: string[] = [];
      const raw = await kv.get("orders:index");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((x: unknown) => typeof x === "string");
      if (!ids.length && kv.list) {
        const listed = await kv.list({ prefix: "order:" });
        ids = listed.keys.map((k) => k.name.replace(/^order:/, "")).filter((x) => x && x !== "index");
      }
      for (const id of ids) {
        const o = await kvGetOrder(id, kv);
        if (o) out.set(o.payment_id, o);
      }
      if (out.size) return [...out.values()];
    } catch { /* cai para arquivo/memoria */ }
  }
  const all = await fileReadJson<OrderData>("orders.json");
  if (all) for (const [id, rec] of Object.entries(all)) { const o = normalizeOrder(rec, id); if (o) out.set(o.payment_id, o); }
  for (const [id, rec] of Object.entries(memOrders)) { if (!out.has(id)) { const o = normalizeOrder(rec, id); if (o) out.set(o.payment_id, o); } }
  return [...out.values()];
}

/**
 * Guarda (ou atualiza, por merge) o pedido completo ligado ao payment_id.
 * O merge preserva status ja avancados: um 'pago' nunca volta a 'pendente'
 * e um 'enviado' nunca volta a 'pendente' por uma gravacao tardia.
 */
export async function saveOrder(
  paymentId: string,
  data: Partial<Omit<OrderRecord, "payment_id" | "created_at">> & { created_at?: string; email?: string },
): Promise<boolean> {
  const id = String(paymentId || "").trim();
  if (!id) return false;
  try {
    return await withLock(async () => {
      const existing = await getOrder(id);
      const base: OrderRecord = existing ?? {
        payment_id: id,
        amount: 0,
        status_pagamento: "pendente",
        status_operacional: "pendente",
        created_at: data.created_at || new Date().toISOString(),
      };
      const merged: OrderRecord = { ...base };
      if (data.session_id !== undefined) merged.session_id = data.session_id;
      if (data.amount !== undefined) merged.amount = round2(data.amount);
      if (data.paid_at !== undefined) merged.paid_at = data.paid_at;
      if (data.buyer !== undefined || data.email !== undefined) {
        merged.buyer = { ...(base.buyer || {}), ...(data.buyer || {}) };
        if (data.email && !merged.buyer.email) merged.buyer.email = data.email;
        merged.email = merged.buyer.email;
      }
      if (data.quiz !== undefined) merged.quiz = data.quiz;
      if (data.synopsis !== undefined) merged.synopsis = data.synopsis;
      if (data.bumps !== undefined) merged.bumps = data.bumps;
      if (data.tracking !== undefined) merged.tracking = data.tracking;
      if (data.origin !== undefined) merged.origin = data.origin;
      if (data.campaign !== undefined) merged.campaign = data.campaign;
      if (data.has_photo !== undefined) merged.has_photo = data.has_photo;
      if (data.status_pagamento === "pago") merged.status_pagamento = "pago";
      else if (data.status_pagamento !== undefined && base.status_pagamento !== "pago") merged.status_pagamento = data.status_pagamento;
      if (data.status_operacional === "enviado") merged.status_operacional = "enviado";
      else if (data.status_operacional !== undefined && base.status_operacional !== "enviado") merged.status_operacional = data.status_operacional;
      return writeOrderRecord(merged);
    });
  } catch (e) {
    console.error("[trackStore] saveOrder falhou (ignorado):", e);
    return false;
  }
}

/** Recupera um pedido guardado (usado pelo webhook do Mercado Pago). */
export async function getOrder(paymentId: string): Promise<OrderRecord | null> {
  const id = String(paymentId || "").trim();
  if (!id) return null;
  try {
    const kv = kvBinding();
    if (kv) {
      const o = await kvGetOrder(id, kv);
      if (o) return o;
    }
    const all = await fileReadJson<OrderData>("orders.json");
    if (all && all[id]) return normalizeOrder(all[id], id);
    return memOrders[id] ? normalizeOrder(memOrders[id], id) : null;
  } catch { return null; }
}

/** Atualiza so o status operacional (toggle Pendente <-> Enviado do painel). */
export async function updateOrderStatus(
  paymentId: string,
  status_operacional: "pendente" | "enviado",
): Promise<OrderRecord | null> {
  const id = String(paymentId || "").trim();
  if (!id) return null;
  try {
    return await withLock(async () => {
      const existing = await getOrder(id);
      if (!existing) return null;
      const updated = { ...existing, status_operacional };
      await writeOrderRecord(updated);
      return updated;
    });
  } catch { return null; }
}

/**
 * Lista pedidos por status de pagamento, mais recentes primeiro (limite 200).
 * 'pago' = fila de despacho; 'pendente' = geraram o PIX e nao pagaram
 * (lista de recuperacao — os dados sao os do formulario do checkout,
 * coletados na geracao do PIX).
 */
export async function listOrders(status: "pago" | "pendente"): Promise<OrderRecord[]> {
  try {
    const all = await readAllOrders();
    const filtered = all.filter((o) => o.status_pagamento === status);
    filtered.sort((a, b) => String(b.paid_at || b.created_at).localeCompare(String(a.paid_at || a.created_at)));
    const out = filtered.slice(0, 200);
    for (const o of out) {
      if (!o.has_photo) { try { o.has_photo = Boolean(await getPhoto(o.payment_id)); } catch { /* ok */ } }
    }
    return out;
  } catch { return []; }
}

/** Fila do painel: pedidos PAGOS, mais recentes primeiro (limite 200). */
export async function listPaidOrders(): Promise<OrderRecord[]> {
  return listOrders("pago");
}

// ---------------- Fotos das criancas ----------------
/**
 * Guarda a foto (data URL ja reduzida no navegador). Persistente:
 * KV (`photo:<id>`) em producao ou .data/uploads/<id>.img em dev —
 * nunca servida publicamente; o painel le via /api/admin-photo.
 */
export async function savePhoto(paymentId: string, dataUrl: string): Promise<boolean> {
  const id = String(paymentId || "").trim();
  if (!id || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
  try {
    const kv = kvBinding();
    if (kv) {
      try { await kv.put(`photo:${id}`, dataUrl); return true; }
      catch { /* tenta arquivo */ }
    }
    if (await loadFs()) {
      try {
        const dir = pathMod.join(process.cwd(), ".data", "uploads");
        await fsMod.mkdir(dir, { recursive: true });
        await fsMod.writeFile(pathMod.join(dir, `${safeFileId(id)}.img`), dataUrl, "utf8");
        return true;
      } catch { /* cai para memoria */ }
    }
    memPhotos[id] = dataUrl;
    return true;
  } catch { return false; }
}

/** Recupera a foto guardada (data URL) ou null. */
export async function getPhoto(paymentId: string): Promise<string | null> {
  const id = String(paymentId || "").trim();
  if (!id) return null;
  try {
    const kv = kvBinding();
    if (kv) {
      try {
        const raw = await kv.get(`photo:${id}`);
        if (raw) return raw;
      } catch { /* tenta arquivo */ }
    }
    if (await loadFs()) {
      try {
        return await fsMod.readFile(pathMod.join(process.cwd(), ".data", "uploads", `${safeFileId(id)}.img`), "utf8");
      } catch { /* tenta memoria */ }
    }
    return memPhotos[id] ?? null;
  } catch { return null; }
}

// ---------------- Leitura (painel) ----------------
/**
 * Le os ultimos `days` dias (incluindo hoje). days >= 3650 = "tudo":
 * tenta enumerar todas as chaves conhecidas do backend.
 */
export async function readRange(days: number): Promise<RangeResult> {
  const wantAll = !Number.isFinite(days) || days >= 3650;
  const n = wantAll ? 0 : Math.max(1, Math.min(3650, Math.trunc(days)));
  let backend: RangeResult["backend"] = "memory";
  const byDate = new Map<string, DayStats>();

  const kv = kvBinding();
  if (wantAll && kv?.list) {
    try {
      const listed = await kv.list({ prefix: "day:" });
      const dates = listed.keys.map((k) => k.name.replace(/^day:/, "")).filter(Boolean).sort();
      for (const date of dates) {
        const r = await readDay(date); backend = r.backend; byDate.set(date, r.day);
      }
      return finish(byDate, backend);
    } catch { /* cai para leitura por dias */ }
  }

  if (wantAll) {
    const fileAll = await fileReadJson<StoreData>("track.json");
    const all = fileAll ?? memStore;
    const dates = Object.keys(all).sort();
    if (dates.length) {
      backend = fileAll ? "file" : "memory";
      for (const date of dates) byDate.set(date, normalizeDay(all[date]));
      return finish(byDate, backend);
    }
    const r = await readDay(dayKey(0)); backend = r.backend; byDate.set(dayKey(0), r.day);
    return finish(byDate, backend);
  }

  for (let i = n - 1; i >= 0; i--) {
    const date = dayKey(i);
    const r = await readDay(date); backend = r.backend; byDate.set(date, r.day);
  }
  return finish(byDate, backend);
}

function finish(byDate: Map<string, DayStats>, backend: RangeResult["backend"]): RangeResult {
  const days = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, ...d }));
  const totals = emptyAgg();
  const origins: RangeResult["origins"] = { "meta-ads": emptyAgg(), bio: emptyAgg() };
  const campaigns: Record<string, Agg> = {};
  for (const d of days) {
    addAgg(totals, d);
    addAgg(origins["meta-ads"], d.origins["meta-ads"]);
    addAgg(origins.bio, d.origins.bio);
    for (const [name, agg] of Object.entries(d.campaigns)) {
      if (!campaigns[name]) campaigns[name] = emptyAgg();
      addAgg(campaigns[name], agg);
    }
  }
  return { backend, days, totals, origins, campaigns };
}

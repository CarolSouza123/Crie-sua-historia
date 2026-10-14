// ============================================================
// Adaptador Cloudflare Pages Functions -> handlers de api/*.ts
// ------------------------------------------------------------
// Na Vercel, cada arquivo de api/ vira uma function sozinho.
// Na Cloudflare Pages, quem recebe /api/* e ESTE arquivo
// (functions/api/[[path]].ts): ele monta o req/res no formato
// que os handlers ja conhecem (server/http.ts: ApiReq/ApiRes),
// chama o handler certo pela rota e devolve um Response Fetch.
//
// NENHUMA logica de negocio mora aqui — so a "traducao" entre o
// mundo Fetch (Cloudflare) e o mundo req/res (handlers).
//
// Ponte de ambiente (env bridge): os handlers leem tudo de
// process.env.* e o trackStore procura o KV em
// globalThis.TRACK_KV ?? process.env.TRACK_KV. Antes de chamar
// o handler, copiamos as variaveis/bindings de context.env
// (painel da Cloudflare) para esses dois lugares. Com a flag
// nodejs_compat (wrangler.jsonc), process/Buffer/node:crypto
// existem no runtime da Cloudflare.
// ============================================================

import type { ApiReq, ApiRes } from "../../server/http";
import generateSynopsis from "../../api/generate-synopsis";
import createPix from "../../api/create-pix";
import trackStep from "../../api/track-step";
import adminStats from "../../api/admin-stats";
import adminOrders from "../../api/admin-orders";
import adminPhoto from "../../api/admin-photo";
import mercadopagoWebhook from "../../api/webhook/mercadopago";

// Tipos minimos do contexto de Pages Functions (sem depender de
// @cloudflare/workers-types — o projeto nao ganha dependencias).
interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data: Record<string, unknown>;
}

type Handler = (req: ApiReq, res: ApiRes) => Promise<void> | void;

// Rota (pathname exato) -> handler de api/. Qualquer outro
// /api/* responde 404 JSON.
const ROUTES: Record<string, Handler> = {
  "/api/generate-synopsis": generateSynopsis,
  "/api/create-pix": createPix,
  "/api/track-step": trackStep,
  "/api/admin-stats": adminStats,
  "/api/admin-orders": adminOrders,
  "/api/admin-photo": adminPhoto,
  "/api/webhook/mercadopago": mercadopagoWebhook,
};

// Variaveis de texto que os handlers leem via process.env.
const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "ADMIN_USER",
  "ADMIN_PASSWORD",
  "ADMIN_KEY",
  "META_PIXEL_ID",
  "META_CAPI_ACCESS_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "DELIVERY_WEBHOOK_URL",
  "PUBLIC_BASE_URL",
  "VITE_META_PIXEL_ID",
] as const;

// Copia context.env (painel da Cloudflare) para os lugares onde
// o codigo do servidor procura: process.env.* (todas as chaves) e
// globalThis.TRACK_KV / process.env.TRACK_KV (binding do KV).
function bridgeEnv(env: Record<string, unknown>): void {
  if (!env || typeof env !== "object") return;
  const g = globalThis as Record<string, any>;

  const kv = env.TRACK_KV;
  if (kv && typeof (kv as any).get === "function" && typeof (kv as any).put === "function") {
    g.TRACK_KV = kv;
  }

  // Com nodejs_compat, `process` existe. Se nao existir, criamos um
  // objeto minimo para os handlers nao quebrarem ao ler process.env.
  if (!g.process || typeof g.process !== "object") g.process = { env: {} };
  if (!g.process.env || typeof g.process.env !== "object") g.process.env = {};

  for (const key of ENV_KEYS) {
    const v = env[key];
    if (typeof v === "string" && v !== "") g.process.env[key] = v;
  }
  if (kv) g.process.env.TRACK_KV = kv;
}

// ---------------- ApiRes que coleta a resposta ----------------

class ResCollector implements ApiRes {
  private statusCode = 200;
  private headers = new Map<string, string>();
  private body: string | Uint8Array | null = null;
  private finished = false;

  status(code: number): ApiRes {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), String(value));
  }

  json(data: unknown): void {
    if (!this.headers.has("content-type")) {
      this.setHeader("content-type", "application/json; charset=utf-8");
    }
    this.body = JSON.stringify(data ?? null);
    this.finished = true;
  }

  // Os handlers chamam end() sem nada, com string ou — no caso do
  // admin-photo — com um Buffer (a foto em binario).
  end(data?: unknown): void {
    if (data !== undefined && data !== null) {
      if (typeof data === "string") this.body = data;
      else if (data instanceof Uint8Array) this.body = data; // cobre Buffer
      else if (data instanceof ArrayBuffer) this.body = new Uint8Array(data);
      else this.body = String(data);
    }
    this.finished = true;
  }

  get done(): boolean {
    return this.finished;
  }

  toResponse(): Response {
    const headers: Record<string, string> = {};
    for (const [k, v] of this.headers) headers[k] = v;
    const body = this.body as BodyInit | null;
    return new Response(body, { status: this.statusCode, headers });
  }
}

// ---------------- Monta o ApiReq a partir do Fetch Request ----------------

async function buildReq(request: Request): Promise<ApiReq> {
  const url = new URL(request.url);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  });

  // Corpo: JSON vira objeto (os handlers usam parseBody, que
  // aceita objeto ou string); qualquer outro tipo fica como
  // texto cru — igual ao comportamento dos handlers na Vercel.
  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text().catch(() => "");
    if (text) {
      const contentType = (headers["content-type"] || "").toLowerCase();
      if (contentType.includes("application/json")) {
        try { body = JSON.parse(text); } catch { body = text; }
      } else {
        body = text;
      }
    }
  }

  return { method: request.method, headers, query, body, url: request.url };
}

// ---------------- Entrada da Pages Function ----------------

export async function onRequest(context: PagesContext): Promise<Response> {
  bridgeEnv(context.env);

  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const handler = ROUTES[path];
  if (!handler) {
    return new Response(JSON.stringify({ error: "rota nao encontrada" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const req = await buildReq(context.request);
  const res = new ResCollector();
  try {
    await handler(req, res);
  } catch (err) {
    console.error("[pages-adapter] erro no handler", path, err);
    if (!res.done) {
      return new Response(JSON.stringify({ error: "erro interno" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }
  return res.toResponse();
}

// ============================================================
// Autenticacao do painel /dashboardfunil (endpoints /api/admin-*).
// Duas formas aceitas (a Caroline escolhe qual configurar):
//   1) ADMIN_USER + ADMIN_PASSWORD  -> headers x-admin-user / x-admin-password
//   2) ADMIN_KEY (legado)           -> header x-admin-key
// Para <img>/links (admin-photo), os mesmos valores podem vir como
// query: ?u=&p= ou ?admin_key= (admin-photo aceita via authorizedQuery).
// Se NENHUMA variavel de admin estiver definida, os endpoints
// respondem 503 (painel fechado) — comportamento combinado com a Caroline.
// ============================================================

import crypto from "node:crypto";
import type { ApiReq } from "./http";

function safeEq(provided: string, expected: string): boolean {
  const a = Buffer.from(provided || "");
  const b = Buffer.from(expected || "");
  if (a.length !== b.length || a.length === 0) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

export function adminConfigured(): boolean {
  return Boolean((process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) || process.env.ADMIN_KEY);
}

function userPassOk(user: string, pass: string): boolean {
  const u = process.env.ADMIN_USER || "";
  const p = process.env.ADMIN_PASSWORD || "";
  if (!u || !p) return false;
  return safeEq(user, u) && safeEq(pass, p);
}
function keyOk(key: string): boolean {
  const k = process.env.ADMIN_KEY || "";
  if (!k) return false;
  return safeEq(key, k);
}

function header(req: ApiReq, name: string): string {
  const v = req.headers?.[name];
  return Array.isArray(v) ? String(v[0] || "") : String(v || "");
}
function queryVal(req: ApiReq, name: string): string {
  const v = req.query?.[name];
  if (Array.isArray(v)) return String(v[0] || "");
  if (typeof v === "string") return v;
  // Fallback: extrai da URL (alguns adaptadores nao preenchem req.query).
  try {
    const url = new URL(String(req.url || ""), "http://localhost");
    return url.searchParams.get(name) || "";
  } catch { return ""; }
}

/** Autorizacao via headers (forma principal, usada por fetch). */
export function authorized(req: ApiReq): boolean {
  const user = header(req, "x-admin-user");
  const pass = header(req, "x-admin-password");
  if (user || pass) return userPassOk(user, pass);
  const key = header(req, "x-admin-key");
  if (key) return keyOk(key);
  return false;
}

/** Autorizacao via headers OU query (para <img src> e links de download). */
export function authorizedFlexible(req: ApiReq): boolean {
  if (authorized(req)) return true;
  const key = queryVal(req, "admin_key");
  if (key && keyOk(key)) return true;
  const u = queryVal(req, "u");
  const p = queryVal(req, "p");
  if (u || p) return userPassOk(u, p);
  return false;
}

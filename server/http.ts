// Tipos minimos compativeis com Vercel Serverless Functions (Node req/res),
// sem depender de @vercel/node. Tambem funciona em adaptadores simples.
export interface ApiReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[]>;
  url?: string;
}
export interface ApiRes {
  status: (code: number) => ApiRes;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (data?: string) => void;
}
export function parseBody(req: ApiReq): Record<string, any> {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body as Record<string, any>;
}
export function methodNotAllowed(res: ApiRes) {
  res.status(405).json({ error: "Method not allowed" });
}

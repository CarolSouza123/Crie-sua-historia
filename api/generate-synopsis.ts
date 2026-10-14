import type { ApiReq, ApiRes } from "../server/http";
import { parseBody, methodNotAllowed } from "../server/http";
import { generateSynopsis } from "../server/synopsis";

// POST /api/generate-synopsis
// Body: { name, age, gender, theme, moral, style, adjustment? }
// Retorna: { title, summary, chapters[6], mock }
export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const b = parseBody(req);
  if (!b.name || !b.theme) { res.status(400).json({ error: "name e theme sao obrigatorios" }); return; }
  const synopsis = await generateSynopsis({
    name: String(b.name), age: b.age, gender: b.gender,
    theme: String(b.theme), moral: String(b.moral || "Acreditar em si mesmo"),
    style: b.style, adjustment: b.adjustment ? String(b.adjustment) : undefined,
  });
  res.status(200).json(synopsis);
}

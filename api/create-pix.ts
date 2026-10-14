import type { ApiReq, ApiRes } from "../server/http";
import { parseBody, methodNotAllowed } from "../server/http";
import { recordStep, recordPixGenerated, saveOrder, savePhoto } from "../server/trackStore";
import { sanitizeTracking, classifyOrigin } from "../server/tracking";

// POST /api/create-pix
// Body: { session_id, amount, buyer: { name, email, cpf, phone }, description?, bumps?, total?,
//         tracking?: { utm_*, fbclid, gclid, fbc, fbp },
//         quiz?: { childName, age, gender, style, adventure, moral, dedication },
//         synopsis?: { title, summary, chapters[] },
//         photo_data_url?: string (foto ja reduzida no navegador, opcional) }
// O pedido COMPLETO fica guardado (saveOrder) ligado ao payment_id — e
// assim que o webhook marca 'pago' e o painel /dashboardfunil monta a
// fila de pedidos (aba Pedidos Pagos). A foto vai para savePhoto
// (KV ou .data/uploads/, sempre privada).
// Sem MP_ACCESS_TOKEN -> retorna payload MOCK claramente marcado (mock: true),
// para o checkout ser testado de ponta a ponta (o pedido tambem e salvo).
function mockPix(amount: number, sessionId: string) {
  const id = `mock_${Date.now()}`;
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const copiaECola = `00020101021226850014br.gov.bcb.pix0136MOCK-CRIE-SUA-HISTORIA-${sessionId.slice(0, 8)}520400005303986540${amount.toFixed(2)}5802BR5913CRIE SUA HIST6009SAO PAULO62290525MOCK${id}6304MOCK`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="#fff"/><rect x="20" y="20" width="50" height="50" fill="#111"/><rect x="150" y="20" width="50" height="50" fill="#111"/><rect x="20" y="150" width="50" height="50" fill="#111"/><text x="110" y="115" font-size="16" text-anchor="middle" fill="#b3541e" font-family="sans-serif">PIX MOCK</text></svg>`;
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return { id, status: "pending", mock: true, qr_code: copiaECola, qr_code_base64: null, qr_image_data_url: qrDataUrl, ticket_url: null, expires_at: expires, amount };
}

const str = (v: unknown, max = 500): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};

function sanitizeQuiz(raw: any) {
  if (!raw || typeof raw !== "object") return undefined;
  const age = typeof raw.age === "number" ? raw.age : str(raw.age, 10);
  return {
    childName: str(raw.childName ?? raw.child_name, 120),
    age: age === undefined || age === "" ? undefined : age,
    gender: str(raw.gender, 30),
    style: str(raw.style, 120),
    adventure: str(raw.adventure ?? raw.theme, 120),
    moral: str(raw.moral, 200),
    dedication: str(raw.dedication, 1000),
  };
}
function sanitizeSynopsis(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  const chapters = Array.isArray(raw.chapters)
    ? raw.chapters.filter((c: unknown) => typeof c === "string").slice(0, 12).map((c: string) => c.slice(0, 600))
    : [];
  return { title: str(raw.title, 300), summary: str(raw.summary, 1500), chapters };
}
function sanitizePhoto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("data:image/")) return null;
  if (v.length > 3_000_000) return null; // ~2,2 MB de imagem — protecao basica
  return v;
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const b = parseBody(req);
  const amount = Number(b.amount ?? b.total);
  const email = String(b.buyer?.email || "");
  if (!amount || amount <= 0) { res.status(400).json({ error: "amount invalido" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { res.status(400).json({ error: "e-mail do comprador invalido" }); return; }

  const tracking = sanitizeTracking(b.tracking);
  const origin = classifyOrigin(tracking);
  const campaign = tracking.utm_campaign;
  const quiz = sanitizeQuiz(b.quiz);
  const synopsis = sanitizeSynopsis(b.synopsis);
  const photo = sanitizePhoto(b.photo_data_url);
  const bumps = Array.isArray(b.bumps) ? b.bumps.filter((x: unknown) => typeof x === "string").slice(0, 6) : [];

  // Funil interno: registra a presenca na etapa 5 (pagamento), com origem/campanha.
  if (b.session_id) await recordStep(5, origin, campaign);

  async function persistOrder(paymentId: string) {
    await saveOrder(paymentId, {
      session_id: b.session_id ? String(b.session_id) : undefined,
      amount,
      status_pagamento: "pendente",
      status_operacional: "pendente",
      buyer: { name: str(b.buyer?.name, 200), email, phone: str(b.buyer?.phone, 40) },
      email,
      quiz,
      synopsis,
      bumps,
      tracking,
      origin,
      campaign,
      has_photo: Boolean(photo),
    });
    if (photo) await savePhoto(paymentId, photo);
    // Pix gerado conta no funil (Pix Gerados x Pix Pagos do painel).
    await recordPixGenerated(origin, campaign);
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    const pix = mockPix(amount, String(b.session_id || "sem-sessao"));
    await persistOrder(pix.id);
    res.status(200).json(pix); return;
  }

  try {
    const nameParts = String(b.buyer?.name || "Comprador").split(" ");
    const resp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Idempotency-Key": `${b.session_id || "pix"}-${Date.now()}` },
      body: JSON.stringify({
        transaction_amount: amount,
        description: b.description || "Livro infantil personalizado — Crie Sua Historia",
        payment_method_id: "pix",
        external_reference: b.session_id,
        payer: {
          email, first_name: nameParts[0], last_name: nameParts.slice(1).join(" ") || undefined,
          identification: b.buyer?.cpf ? { type: "CPF", number: String(b.buyer.cpf).replace(/\D/g, "") } : undefined,
        },
      }),
    });
    const data: any = await resp.json();
    if (!resp.ok) { console.error("[create-pix] MP erro:", data); res.status(502).json({ error: "Mercado Pago recusou a criacao do PIX", detail: data?.message }); return; }
    const tx = data.point_of_interaction?.transaction_data || {};
    await persistOrder(String(data.id));
    res.status(200).json({
      id: String(data.id), status: data.status, mock: false,
      qr_code: tx.qr_code || null,
      qr_code_base64: tx.qr_code_base64 || null,
      qr_image_data_url: tx.qr_code_base64 ? `data:image/png;base64,${tx.qr_code_base64}` : null,
      ticket_url: tx.ticket_url || null,
      expires_at: data.date_of_expiration || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      amount,
    });
  } catch (e) {
    console.error("[create-pix] falha:", e);
    res.status(502).json({ error: "Falha ao criar PIX" });
  }
}

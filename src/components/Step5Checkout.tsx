import { useEffect, useMemo, useRef, useState } from "react";
import { BUMP_AUDIO, BUMP_COLORING, PRICE, PRICE_FROM, fmt, type Buyer, type PixResult, type QuizState, type Synopsis } from "../types";
import { mockPix } from "../lib/mockSynopsis";
import { pixelPurchase } from "../lib/pixel";
import { trackStep, appendLocalEvent, upsertLocalOrder, type LocalOrder } from "../lib/track";
import { getTracking, classifyOrigin } from "../lib/tracking";

// Reduz a foto no navegador (max 900px no maior lado, JPEG 0.82) antes
// de anexar ao pedido — a foto original fica so no aparelho da cliente.
// Qualquer falha devolve null e o checkout segue sem a foto.
async function downscalePhoto(dataUrl: string): Promise<string | null> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("imagem invalida"));
      img.src = dataUrl;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return null;
    const scale = Math.min(1, 900 / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch { return null; }
}

export function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (slice: number) => { let s = 0; for (let i = 0; i < slice; i++) s += Number(d[i]) * (slice + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export const maskCPF = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); };
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export default function Step5Checkout({ quiz, synopsis, sessionId, onBack }: { quiz: QuizState; synopsis: Synopsis | null; sessionId: string; onBack: () => void }) {
  const [coloring, setColoring] = useState(false); const [audio, setAudio] = useState(false);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", email: "", phone: "", cpf: "" });
  const [emailConfirm, setEmailConfirm] = useState(""); // so validacao local — nao vai no payload
  const [pix, setPix] = useState<PixResult | null>(null);
  const [generating, setGenerating] = useState(false); const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false); const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const purchaseTrackedRef = useRef(false);

  const bumps = useMemo(() => [...(coloring ? ["livro-colorir"] : []), ...(audio ? ["audio-narracao"] : [])], [coloring, audio]);
  const total = PRICE + (coloring ? BUMP_COLORING : 0) + (audio ? BUMP_AUDIO : 0);
  const emailsMatch = emailConfirm.trim().toLowerCase() === buyer.email.trim().toLowerCase();
  const buyerValid = buyer.name.trim().length >= 5 && emailOk(buyer.email) && emailsMatch && buyer.phone.replace(/\D/g, "").length >= 10 && validateCPF(buyer.cpf);
  const set = (p: Partial<Buyer>) => setBuyer((b) => ({ ...b, ...p }));

  useEffect(() => { if (!pix || paid) return; const end = new Date(pix.expires_at).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick(); const id = window.setInterval(tick, 1000);
    // Polling (stub): em producao, consultar /api de status ou confiar no webhook do MP.
    pollRef.current = window.setInterval(() => console.info("[pix:polling-stub] aguardando confirmacao do webhook para", pix.id), 5000);
    return () => { clearInterval(id); if (pollRef.current) clearInterval(pollRef.current); };
  }, [pix, paid]);
  function buildLocalOrder(p: PixResult, status: "pendente" | "pago"): LocalOrder {
    const tracking = getTracking();
    return {
      payment_id: p.id,
      session_id: sessionId,
      amount: total,
      status_pagamento: status,
      status_operacional: "pendente",
      created_at: new Date().toISOString(),
      ...(status === "pago" ? { paid_at: new Date().toISOString() } : {}),
      buyer: { name: buyer.name, email: buyer.email, phone: buyer.phone },
      quiz: { childName: quiz.childName, age: quiz.age, gender: quiz.gender, style: quiz.style, adventure: quiz.adventure, moral: quiz.moral, dedication: quiz.dedication },
      synopsis: synopsis ? { title: synopsis.title, summary: synopsis.summary, chapters: synopsis.chapters } : null,
      bumps,
      tracking,
      origin: classifyOrigin(tracking),
      campaign: tracking.utm_campaign,
      photo: quiz.sendPhotoLater ? null : (quiz.photoDataUrl ?? null),
    };
  }

  useEffect(() => {
    if (!paid || !pix) return;
    pixelPurchase(total, pix.id);
    // Funil interno do site: registra a compra (contadores agregados, sem dados pessoais).
    if (!purchaseTrackedRef.current) {
      purchaseTrackedRef.current = true;
      trackStep(sessionId, 5, quiz, { status_pagamento: "pago", total, mp_payment_id: pix.id });
      // Pedido local: ATUALIZA o mesmo item gerado no PIX (nao duplica).
      upsertLocalOrder(buildLocalOrder(pix, "pago"));
    }
  }, [paid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generatePix() {
    setGenerating(true);
    // Foto reduzida no navegador para o pedido (nunca bloqueia o checkout).
    let photoDataUrl: string | null = null;
    if (quiz.photoDataUrl && !quiz.sendPhotoLater) {
      photoDataUrl = await downscalePhoto(quiz.photoDataUrl).catch(() => null);
    }
    let result: PixResult;
    try {
      const r = await fetch("/api/create-pix", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId, amount: total, total, bumps, buyer,
          description: `Livro: ${synopsis?.title || quiz.childName}`,
          tracking: getTracking(),
          quiz: { childName: quiz.childName, age: quiz.age, gender: quiz.gender, style: quiz.style, adventure: quiz.adventure, moral: quiz.moral, dedication: quiz.dedication },
          synopsis: synopsis ? { title: synopsis.title, summary: synopsis.summary, chapters: synopsis.chapters } : null,
          photo_data_url: photoDataUrl,
        }) });
      if (!r.ok) throw new Error("api");
      result = await r.json();
    } catch { result = mockPix(total); } // fallback local (dev sem functions)
    setPix(result);
    // Pedido local PENDENTE (lista de recuperacao do painel no preview)
    // + evento local de Pix gerado para o funil local.
    upsertLocalOrder(buildLocalOrder(result, "pendente"));
    const tracking = getTracking();
    appendLocalEvent({ t: Date.now(), type: "pix_generated", origin: classifyOrigin(tracking), tracking });
    setGenerating(false);
  }
  const mmss = secondsLeft === null ? "" : `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (paid) return (
    <section className="card center success">
      <div className="success-icon">✓</div><h2>Pagamento confirmado!</h2>
      <p>O livro de <strong>{quiz.childName}</strong> entrou em produção. Você vai receber tudo no e-mail <strong>{buyer.email}</strong>.</p>
      {audio && <p className="muted">A narração em áudio chega em até 24h, como combinado.</p>}
    </section>
  );
  return (
    <section className="card">
      <h2>Quase lá! Garanta o livro de {quiz.childName}</h2>
      <div className="order-summary">
        <div><strong>{synopsis?.title || "Livro infantil personalizado"}</strong><p className="muted">PDF de alta resolução · {quiz.style} · 6 páginas · Entrega por e-mail</p></div>
        <div className="price"><s>{fmt(PRICE_FROM)}</s><strong>{fmt(PRICE)}</strong></div>
      </div>
      <div className="bumps">
        <label className="bump"><input type="checkbox" checked={coloring} onChange={(e) => setColoring(e.target.checked)} />
          <span><strong>Adicionar Livro de Colorir em PDF</strong><small>As mesmas ilustrações em traço preto e branco, para imprimir e colorir.</small></span><b>+ {fmt(BUMP_COLORING)}</b></label>
        <label className="bump"><input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
          <span><strong>Adicionar Narração da História em Áudio</strong><small>Audiolivro com voz carinhosa e música ambiente — envio em até 24h no e-mail.</small></span><b>+ {fmt(BUMP_AUDIO)}</b></label>
      </div>
      <div className="total-row"><span>Total</span><strong>{fmt(total)}</strong></div>

      <h3>Seus dados (para a entrega)</h3>
      <label className="field"><span>Nome completo *</span><input value={buyer.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" /></label>
      <p className="email-alert"><strong>Importante:</strong> use um e-mail que você tem acesso de verdade: é por ele que você vai receber a historinha do(a) {quiz.childName || "seu filho"} logo após o pagamento.</p>
      <label className="field"><span>E-mail * <small className="muted">(é aqui que o livro chega)</small></span>
        <input type="email" value={buyer.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" placeholder="voce@email.com" />
        {buyer.email && !emailOk(buyer.email) && <small className="error">Confira o e-mail, por favor.</small>}</label>
      <label className="field"><span>Confirmar e-mail *</span>
        <input type="email" value={emailConfirm} onChange={(e) => setEmailConfirm(e.target.value)} autoComplete="email" placeholder="Repita o e-mail, igualzinho" />
        {emailConfirm && !emailsMatch && <small className="error">Os e-mails não conferem — confira, por favor.</small>}</label>
      <div className="row">
        <label className="field"><span>Telefone / WhatsApp *</span><input inputMode="tel" value={buyer.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(11) 99999-9999" /></label>
        <label className="field"><span>CPF *</span><input inputMode="numeric" value={buyer.cpf} onChange={(e) => set({ cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
          {buyer.cpf.replace(/\D/g, "").length === 11 && !validateCPF(buyer.cpf) && <small className="error">CPF inválido.</small>}</label>
      </div>

      {/* Pagamento somente via PIX nesta fase (cartao volta em fase futura). */}
      <h3>Pagamento via PIX</h3>
      <div className="pix-area">
        {!pix ? (
          <button className="btn primary big" disabled={!buyerValid || generating} onClick={generatePix}>{generating ? "Gerando PIX..." : `Gerar PIX de ${fmt(total)}`}</button>
        ) : (
          <div className="pix-result">
            {pix.mock && <p className="mock-banner">PIX DE DEMONSTRAÇÃO (MOCK) — sem MP_ACCESS_TOKEN, nenhum pagamento real é criado.</p>}
            {pix.qr_image_data_url && <img className="qr" src={pix.qr_image_data_url} alt="QR Code do PIX" />}
            <p className="muted">Escaneie o QR Code ou use o copia e cola. {secondsLeft !== null && <>Expira em <strong>{mmss}</strong></>}</p>
            <div className="copy-row"><input readOnly value={pix.qr_code || ""} /><button className="btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(pix.qr_code || ""); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copiado!" : "Copiar"}</button></div>
            <p className="hint">Aguardando confirmação do pagamento... a tela atualiza quando o Mercado Pago aprovar (webhook).</p>
            {pix.mock && <button className="btn ghost" onClick={() => setPaid(true)}>Simular pagamento aprovado (somente MOCK)</button>}
          </div>
        )}
        {!buyerValid && !pix && <p className="hint">Preencha seus dados corretamente para gerar o PIX.</p>}
      </div>
      <button className="btn ghost" onClick={onBack}>← Voltar para a história</button>
      <p className="delivery-alert">Entrega digital garantida diretamente no seu e-mail cadastrado logo após a confirmação do pagamento!</p>
    </section>
  );
}

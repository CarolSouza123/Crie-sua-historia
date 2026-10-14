import { useCallback, useEffect, useState } from "react";
import { fmt } from "../types";
import { readLocalEvents, readLocalOrders, setLocalOrderOperacional, type LocalOrder } from "../lib/track";
import { classifyOrigin } from "../lib/tracking";

// ============================================================
// Painel interno do site (/dashboardfunil) — DUAS ABAS:
//  1) Pedidos Pagos: fila de despacho (pedido completo, sinopse,
//     foto da crianca, bumps, UTMs, toggle Pendente -> Enviado) +
//     sub-filtro "Geraram PIX e nao pagaram" (lista de recuperacao).
//  2) Funil & Gargalo: contadores, gargalo e sugestoes.
// Sem custo: le os dados gravados pelo proprio site
// (GET /api/admin-stats e /api/admin-orders). Autenticacao:
// ADMIN_USER+ADMIN_PASSWORD ou ADMIN_KEY (fallback).
// ESCOPO (pedido da Caroline): o funil so acompanha o anuncio pago
// da Meta ('meta-ads') e o link da bio ('bio').
// Sem API disponivel (preview), usa os dados locais desta sessao
// (pedidos em csh_local_orders, eventos em csh_local_events) ou uma
// amostra ficticia claramente rotulada.
// ============================================================

interface AggStats { steps: Record<string, number>; purchases: number; revenue: number; pixGenerated: number }
interface Dataset {
  totals: AggStats;
  origins: { "meta-ads": AggStats; bio: AggStats };
  campaigns: Record<string, AggStats>;
}
interface PanelOrder {
  payment_id: string;
  amount: number;
  status_pagamento: "pago" | "pendente";
  status_operacional: "pendente" | "enviado";
  created_at: string;
  paid_at?: string | null;
  buyer?: { name?: string; email?: string; phone?: string };
  quiz?: { childName?: string; age?: number | string; gender?: string; style?: string; adventure?: string; moral?: string; dedication?: string } | null;
  synopsis?: { title?: string; summary?: string; chapters?: string[] } | null;
  bumps?: string[];
  tracking?: Record<string, string | undefined>;
  origin?: string;
  campaign?: string;
  has_photo?: boolean;
  photo_url?: string | null;
  photo?: string | null;
  sample?: boolean;
}
type Mode = "api" | "local" | "demo";
type Period = 1 | 7 | "all";
type OriginFilter = "all" | "meta-ads" | "bio";
type Tab = "orders" | "funnel";
type OrderFilter = "pago" | "pendente";
type Auth = { mode: "userpass"; user: string; pass: string } | { mode: "key"; key: string };

const AUTH_STORAGE = "csh_admin_auth";
const LEGACY_KEY_STORAGE = "csh_admin_key";
const STEP_LABELS = ["Foto", "Visual", "Aventura", "Revisão/Sinopse", "Pagamento", "Compra"];
const BUMP_LABELS: Record<string, string> = {
  "livro-colorir": "Livro de Colorir em PDF (+ R$ 9,90)",
  "audio-narracao": "Narração em Áudio (+ R$ 12,90)",
};

const SUGGESTIONS: Record<string, { title: string; items: string[] }> = {
  "1-2": {
    title: "Etapa 1 → 2 · Foto e dados da criança",
    items: [
      "A foto é a maior fricção do começo: deixe o botão “Enviar a foto depois por e-mail” tão visível quanto o envio da foto, para ninguém travar logo na primeira tela.",
      "Reforce ali mesmo, em uma frase curta, que a foto serve só para virar desenho no livro — isso reduz o medo de enviar uma foto do filho.",
      "Encurte a etapa: nome, idade e menino/menina já bastam. Qualquer campo a mais no começo custa visitantes.",
    ],
  },
  "2-3": {
    title: "Etapa 2 → 3 · Estilo visual",
    items: [
      "Os estilos não convenceram: mostre, em pelo menos um card, um exemplo de página pronta do livro (e não só o rostinho), para a pessoa imaginar o resultado final.",
      "Destaque o estilo mais escolhido com um selo “mais popular” — a maioria segue a escolha da maioria.",
      "Confira se as imagens dos estilos carregam rápido no celular; card sem imagem demora a convencer.",
    ],
  },
  "3-4": {
    title: "Etapa 3 → 4 · Aventura e moral",
    items: [
      "Escolhas demais ou abstratas demais cansam: deixe pré-selecionadas a aventura e a moral mais populares, para a pessoa só confirmar e avançar.",
      "Troque descrições genéricas por exemplos curtinhos do que acontece em cada aventura (uma frase já resolve).",
      "Deixe a dedicatória claramente opcional e por último — quem trava nela não deveria perder o embalo.",
    ],
  },
  "4-5": {
    title: "Etapa 4 → 5 · Sinopse (o momento do apego)",
    items: [
      "A sinopse não criou apego suficiente: coloque o título com o nome da criança em destaque grande, como se fosse a capa do livro pronto.",
      "Mostre 1 página de exemplo ilustrada ao lado da sinopse — ver uma página “de verdade” transforma curiosidade em desejo.",
      "Use o nome da criança no botão de avançar (ex.: “Quero o livro do(a) [nome]”), em vez de um botão genérico.",
    ],
  },
  "5-C": {
    title: "Etapa 5 → Compra · Pagamento",
    items: [
      "Mantenha a âncora de valor visível no pagamento (de R$ 79,90 por R$ 37,90) e repita o que ela recebe: livro em PDF, entrega no e-mail, 6 páginas.",
      "Deixe o selo de entrega garantida por e-mail bem visível perto do botão do PIX — a dúvida “será que chega?” é a maior inimiga do pagamento.",
      "Use a lista “Geraram PIX e não pagaram” da aba Pedidos: uma mensagem carinhosa no WhatsApp, com o nome da criança, recupera boa parte dessas vendas.",
    ],
  },
};
const GENERAL_TIPS = [
  "Mude uma coisa por vez e compare a conversão da semana seguinte: assim você descobre o que realmente funcionou.",
  "Olhe o painel toda semana — quando o maior gargalo melhora, outro aparece, e o funil vai subindo degrau por degrau.",
];

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const emptyStats = (): AggStats => ({ steps: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, purchases: 0, revenue: 0, pixGenerated: 0 });
const emptyDataset = (): Dataset => ({ totals: emptyStats(), origins: { "meta-ads": emptyStats(), bio: emptyStats() }, campaigns: {} });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const originLabel = (o?: string) => (o === "meta-ads" ? "Anúncio Meta" : o === "bio" ? "Link da Bio" : "Outra origem");
const waLink = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/55${digits}` : null;
};

function normAgg(raw: any): AggStats {
  const a = emptyStats();
  if (raw && typeof raw === "object") {
    for (const k of ["1", "2", "3", "4", "5"]) a.steps[k] = Number(raw.steps?.[k]) || 0;
    a.purchases = Number(raw.purchases) || 0;
    a.revenue = Math.round((Number(raw.revenue) || 0) * 100) / 100;
    a.pixGenerated = Number(raw.pixGenerated) || 0;
  }
  return a;
}
function sumAgg(a: AggStats, b: AggStats): AggStats {
  const out = emptyStats();
  for (const k of Object.keys(out.steps)) out.steps[k] = (a.steps[k] || 0) + (b.steps[k] || 0);
  out.purchases = a.purchases + b.purchases;
  out.revenue = Math.round((a.revenue + b.revenue) * 100) / 100;
  out.pixGenerated = (a.pixGenerated || 0) + (b.pixGenerated || 0);
  return out;
}

// Amostra ficticia (rotulada) com recorte por origem — totais:
// 1000/720/540/310/150, 62 compras, R$ 2.349,80, 172 Pix gerados.
const SAMPLE_ORIGINS: Dataset["origins"] = {
  "meta-ads": { steps: { "1": 700, "2": 500, "3": 380, "4": 210, "5": 105 }, purchases: 44, revenue: 1667.6, pixGenerated: 120 },
  bio: { steps: { "1": 300, "2": 220, "3": 160, "4": 100, "5": 45 }, purchases: 18, revenue: 682.2, pixGenerated: 52 },
};
function sampleDataset(): Dataset {
  const origins = clone(SAMPLE_ORIGINS);
  return {
    totals: sumAgg(origins["meta-ads"], origins.bio),
    origins,
    campaigns: { "lancamento-outubro": clone(origins["meta-ads"]), bio: clone(origins.bio) },
  };
}

const SAMPLE_SYNOPSIS = {
  title: "Pedro e a Grande Aventura: Aventura Espacial",
  summary: "Pedro parte para um planeta colorido ao lado do robozinho Bip e enfrenta um grande desafio. Uma historinha curta sobre coragem para enfrentar desafios.",
  chapters: [
    "Pedro encontra um mapa de estrelas e recebe um convite especial.",
    "Ele conhece o robozinho Bip e descobre que a Lua perdeu o brilho.",
    "Com o coração batendo forte, Pedro decide tentar ajudar.",
    "No caminho, ele quase desiste, mas lembra da família e continua.",
    "Pedro enfrenta o grande momento com gentileza e esperança.",
    "Tudo se resolve: ele aprende a lição — e volta para casa feliz.",
  ],
};
function sampleOrders(): PanelOrder[] {
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  return [
    {
      payment_id: "exemplo-pago-1", amount: 47.8, status_pagamento: "pago", status_operacional: "pendente",
      created_at: iso(2 * 3600_000), paid_at: iso(2 * 3600_000),
      buyer: { name: "Ana Exemplo", email: "ana@exemplo.com", phone: "(11) 98888-0001" },
      quiz: { childName: "Pedro", age: 5, gender: "Menino", style: "Aquarela Suave", adventure: "Aventura Espacial", moral: "Coragem para enfrentar desafios", dedication: "Para nosso querido Pedro, que ilumina nossos dias com sua coragem..." },
      synopsis: SAMPLE_SYNOPSIS, bumps: ["livro-colorir"],
      tracking: { utm_source: "meta", utm_medium: "cpc", utm_campaign: "lancamento-outubro", utm_content: "video-1" },
      origin: "meta-ads", campaign: "lancamento-outubro",
      has_photo: true, photo: "/images/styles/estilo-aquarela.webp", sample: true,
    },
    {
      payment_id: "exemplo-pago-2", amount: 50.8, status_pagamento: "pago", status_operacional: "enviado",
      created_at: iso(5 * 3600_000), paid_at: iso(5 * 3600_000),
      buyer: { name: "Juliana Exemplo", email: "juliana@exemplo.com", phone: "(21) 97777-0003" },
      quiz: { childName: "Alice", age: 4, gender: "Menina", style: "Disney/Pixar (3D)", adventure: "Reino Encantado", moral: "A importância da amizade" },
      synopsis: { title: "Alice e a Ponte de Arco-Íris", summary: "Alice visita um reino de nuvens com a fadinha Lili e enfrenta um grande desafio. Uma historinha curta sobre a importância da amizade.", chapters: SAMPLE_SYNOPSIS.chapters },
      bumps: ["audio-narracao"],
      tracking: { utm_source: "instagram", utm_medium: "bio", utm_campaign: "bio" },
      origin: "bio", campaign: "bio",
      has_photo: true, photo: "/images/styles/estilo-pixar.webp", sample: true,
    },
    {
      payment_id: "exemplo-pendente-1", amount: 37.9, status_pagamento: "pendente", status_operacional: "pendente",
      created_at: iso(25 * 60_000),
      buyer: { name: "Maria Exemplo", email: "maria@exemplo.com", phone: "(11) 97777-0002" },
      quiz: { childName: "Lucas", age: 6, gender: "Menino", style: "Desenho Realista", adventure: "Dinossauros", moral: "Acreditar em si mesmo" },
      synopsis: { title: "Lucas e o Ovo de Dinossauro", summary: "Lucas conhece o triceratopo Tito em um vale verdinho e enfrenta um grande desafio. Uma historinha curta sobre acreditar em si mesmo.", chapters: SAMPLE_SYNOPSIS.chapters },
      bumps: [],
      tracking: { utm_source: "instagram", utm_medium: "bio", utm_campaign: "bio" },
      origin: "bio", campaign: "bio",
      has_photo: true, photo: "/images/styles/estilo-realista.webp", sample: true,
    },
  ];
}

// Agrega os eventos locais desta sessao com o MESMO escopo do servidor.
function aggregateLocalDataset(): Dataset {
  const ds = emptyDataset();
  for (const ev of readLocalEvents()) {
    const origin = ev.origin ?? classifyOrigin(ev.tracking);
    if (origin !== "meta-ads" && origin !== "bio") continue;
    const targets: AggStats[] = [ds.totals, ds.origins[origin]];
    const camp = (ev.tracking?.utm_campaign || "").trim();
    if (camp) {
      if (!ds.campaigns[camp]) ds.campaigns[camp] = emptyStats();
      targets.push(ds.campaigns[camp]);
    }
    if (ev.type === "step" && ev.step && ev.step >= 1 && ev.step <= 5) {
      for (const t of targets) t.steps[String(ev.step)] += 1;
    }
    if (ev.type === "purchase") {
      for (const t of targets) { t.purchases += 1; t.revenue = Math.round((t.revenue + (ev.total || 0)) * 100) / 100; }
    }
    if (ev.type === "pix_generated") {
      for (const t of targets) t.pixGenerated += 1;
    }
  }
  return ds;
}
function localOrdersAsPanel(): PanelOrder[] {
  return readLocalOrders().map((o: LocalOrder) => ({
    payment_id: o.payment_id, amount: o.amount, status_pagamento: o.status_pagamento,
    status_operacional: o.status_operacional, created_at: o.created_at, paid_at: o.paid_at ?? null,
    buyer: o.buyer, quiz: o.quiz ?? null, synopsis: o.synopsis ?? null, bumps: o.bumps ?? [],
    tracking: (o.tracking ?? {}) as Record<string, string | undefined>,
    origin: o.origin, campaign: o.campaign, has_photo: Boolean(o.photo), photo: o.photo ?? null,
  }));
}

function readStoredAuth(): Auth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.mode === "userpass" && parsed.user) return parsed as Auth;
      if (parsed?.mode === "key" && parsed.key) return parsed as Auth;
    }
    const legacy = sessionStorage.getItem(LEGACY_KEY_STORAGE);
    if (legacy) return { mode: "key", key: legacy };
  } catch { /* ok */ }
  return null;
}
function authHeaders(a: Auth): Record<string, string> {
  return a.mode === "userpass"
    ? { "x-admin-user": a.user, "x-admin-password": a.pass }
    : { "x-admin-key": a.key };
}
function authQuery(a: Auth | null): string {
  if (!a) return "";
  return a.mode === "userpass"
    ? `&u=${encodeURIComponent(a.user)}&p=${encodeURIComponent(a.pass)}`
    : `&admin_key=${encodeURIComponent(a.key)}`;
}

export default function AdminPanel() {
  const [auth, setAuth] = useState<Auth | null>(() => readStoredAuth());
  const [authTab, setAuthTab] = useState<"userpass" | "key">("userpass");
  const [userInput, setUserInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [orders, setOrders] = useState<PanelOrder[]>([]);
  const [mode, setMode] = useState<Mode>("local");
  const [tab, setTab] = useState<Tab>("orders");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("pago");
  const [period, setPeriod] = useState<Period>(7);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const loadLocal = useCallback(() => {
    setDataset(aggregateLocalDataset());
    setOrders(localOrdersAsPanel());
    setMode("local");
    setUnlocked(true);
  }, []);

  const loadApi = useCallback(async (p: Period, a: Auth): Promise<boolean> => {
    const headers = authHeaders(a);
    const statsRes = await fetch(`/api/admin-stats?days=${p === "all" ? "all" : p}`, { headers });
    if (statsRes.status === 401) { setError("Credenciais incorretas. Confira usuário/senha (ou a chave) e tente de novo."); return false; }
    if (!statsRes.ok) throw new Error(`stats http ${statsRes.status}`);
    const data = await statsRes.json();
    const campaigns: Record<string, AggStats> = {};
    for (const [name, agg] of Object.entries(data?.campaigns ?? {})) campaigns[name] = normAgg(agg);
    setDataset({
      totals: normAgg(data?.totals),
      origins: { "meta-ads": normAgg(data?.origins?.["meta-ads"]), bio: normAgg(data?.origins?.bio) },
      campaigns,
    });
    const all: PanelOrder[] = [];
    for (const st of ["pago", "pendente"] as OrderFilter[]) {
      const r = await fetch(`/api/admin-orders?status=${st}`, { headers });
      if (r.ok) {
        const j = await r.json();
        for (const o of (j.orders ?? []) as PanelOrder[]) all.push(o);
      }
    }
    setOrders(all);
    setMode("api");
    return true;
  }, []);

  const load = useCallback(async (p: Period, a: Auth | null) => {
    if (!a) { loadLocal(); return; }
    setLoading(true); setError("");
    try {
      const ok = await loadApi(p, a);
      if (ok) setUnlocked(true);
      else { setDataset(null); setOrders([]); setUnlocked(false); }
    } catch {
      // Sem functions (preview/offline): cai para os dados locais desta sessao.
      loadLocal();
    }
    setLoading(false);
  }, [loadApi, loadLocal]);

  // Na abertura: se ja houver credenciais guardadas, tenta entrar direto.
  // Sem credenciais, fica no portao (nada de dados na tela).
  useEffect(() => {
    const stored = readStoredAuth();
    if (stored) { setAuth(stored); load(period, stored); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function persistAuth(a: Auth | null) {
    setAuth(a);
    try {
      if (a) sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(a));
      else { sessionStorage.removeItem(AUTH_STORAGE); sessionStorage.removeItem(LEGACY_KEY_STORAGE); }
    } catch { /* ok */ }
  }
  function enter() {
    const a: Auth | null = authTab === "userpass"
      ? (userInput.trim() && passInput ? { mode: "userpass", user: userInput.trim(), pass: passInput } : null)
      : (keyInput.trim() ? { mode: "key", key: keyInput.trim() } : null);
    if (!a) return;
    persistAuth(a);
    setUserInput(""); setPassInput(""); setKeyInput("");
    load(period, a);
  }
  function changeCredentials() {
    persistAuth(null);
    setDataset(null); setOrders([]); setError(""); setUnlocked(false);
  }
  function pickPeriod(p: Period) {
    setPeriod(p);
    if (mode === "api" && auth) load(p, auth);
  }
  function showDemo() { setDataset(sampleDataset()); setOrders(sampleOrders()); setMode("demo"); setError(""); setUnlocked(true); }

  async function toggleOrder(o: PanelOrder) {
    const next: "pendente" | "enviado" = o.status_operacional === "enviado" ? "pendente" : "enviado";
    if (mode === "demo") {
      setOrders((list) => list.map((x) => (x.payment_id === o.payment_id ? { ...x, status_operacional: next } : x)));
      return;
    }
    if (mode === "local") {
      setLocalOrderOperacional(o.payment_id, next);
      setOrders(localOrdersAsPanel());
      return;
    }
    if (!auth) return;
    try {
      const r = await fetch("/api/admin-orders", {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(auth) },
        body: JSON.stringify({ payment_id: o.payment_id, status_operacional: next }),
      });
      if (!r.ok) throw new Error(`http ${r.status}`);
      setOrders((list) => list.map((x) => (x.payment_id === o.payment_id ? { ...x, status_operacional: next } : x)));
    } catch { setError("Não consegui atualizar o status agora. Tente de novo."); }
  }

  // ---------- Pedidos (recorte da sub-filtragem atual) ----------
  const paidOrders = orders.filter((o) => o.status_pagamento === "pago");
  const pendingOrders = orders.filter((o) => o.status_pagamento === "pendente");
  const visibleOrders = orderFilter === "pago" ? paidOrders : pendingOrders;

  function orderPhotoSrc(o: PanelOrder): string | null {
    if (!o.has_photo) return null;
    if (mode === "api" && o.photo_url) return `${o.photo_url}${authQuery(auth).replace(/^&/, o.photo_url.includes("?") ? "&" : "?")}`;
    return o.photo ?? o.photo_url ?? null;
  }

  function renderOrder(o: PanelOrder) {
    const photoSrc = orderPhotoSrc(o);
    const wa = waLink(o.buyer?.phone);
    const isPaid = o.status_pagamento === "pago";
    return (
      <article className="card order-card" key={o.payment_id}>
        <div className="order-head">
          <div>
            <strong>{fmt(o.amount)}</strong>
            <span className="muted"> · {isPaid ? `pago em ${fmtDateTime(o.paid_at || o.created_at)}` : `PIX gerado em ${fmtDateTime(o.created_at)}`}</span>
          </div>
          <div className="order-badges">
            <span className="order-badge origin">{originLabel(o.origin)}</span>
            {isPaid
              ? <span className="order-badge paid">{o.status_operacional === "enviado" ? "Enviado ✓" : "Pago"}</span>
              : <span className="order-badge waiting">Aguardando pagamento</span>}
            {o.sample && <span className="order-badge sample">exemplo</span>}
          </div>
        </div>

        <div className="order-grid">
          <div>
            <h3>Comprador(a)</h3>
            <p>{o.buyer?.name || "—"}<br />
              <span className="muted">{o.buyer?.email || "—"}</span><br />
              <span className="muted">{o.buyer?.phone || "—"}</span></p>
            {!isPaid && wa && (
              <a className="btn secondary admin-mini" href={wa} target="_blank" rel="noreferrer">Recuperar no WhatsApp</a>
            )}
            {!isPaid && <p className="hint">PIX: {o.payment_id.slice(0, 12)}…</p>}
          </div>
          <div>
            <h3>O livro</h3>
            <p>
              <strong>{o.quiz?.childName || "—"}</strong>
              {o.quiz?.age !== undefined && o.quiz?.age !== "" ? `, ${o.quiz.age} anos` : ""}{o.quiz?.gender ? ` · ${o.quiz.gender}` : ""}<br />
              <span className="muted">Estilo: {o.quiz?.style || "—"}<br />Aventura: {o.quiz?.adventure || "—"}<br />Moral: {o.quiz?.moral || "—"}</span>
              {o.quiz?.dedication && <><br /><em>“{o.quiz.dedication}”</em></>}
            </p>
            {(o.bumps ?? []).length > 0 && (
              <div className="order-bumps">
                {(o.bumps ?? []).map((b) => <span key={b} className="bump-badge">{BUMP_LABELS[b] || b}</span>)}
              </div>
            )}
          </div>
          <div>
            <h3>Origem</h3>
            <p className="muted">
              utm_source: {o.tracking?.utm_source || "—"}<br />
              utm_campaign: {o.tracking?.utm_campaign || o.campaign || "—"}<br />
              utm_content: {o.tracking?.utm_content || "—"}
            </p>
            {photoSrc && (
              <div className="order-photo">
                <img src={photoSrc} alt={`Foto de ${o.quiz?.childName || "criança"} (pedido)`} />
                <a className="btn ghost admin-mini" href={photoSrc} target="_blank" rel="noreferrer" download>Abrir/Baixar foto</a>
              </div>
            )}
          </div>
        </div>

        {o.synopsis && (o.synopsis.title || o.synopsis.summary || (o.synopsis.chapters ?? []).length > 0) && (
          <details className="order-synopsis">
            <summary>Sinopse aprovada{o.synopsis.title ? `: “${o.synopsis.title}”` : ""}</summary>
            {o.synopsis.summary && <p>{o.synopsis.summary}</p>}
            {(o.synopsis.chapters ?? []).length > 0 && (
              <ol>{(o.synopsis.chapters ?? []).map((c, i) => <li key={i}><strong>Página {i + 1}:</strong> {c}</li>)}</ol>
            )}
          </details>
        )}

        {isPaid && (
          <div className="order-actions">
            <span className="muted">Status do despacho: <strong>{o.status_operacional === "enviado" ? "Enviado" : "Pendente"}</strong></span>
            <button className={o.status_operacional === "enviado" ? "btn ghost" : "btn primary admin-mini-btn"} onClick={() => toggleOrder(o)}>
              {o.status_operacional === "enviado" ? "Voltar para Pendente" : "Marcar como Enviado"}
            </button>
          </div>
        )}
      </article>
    );
  }

  // ---------- numeros do funil (recorte pela origem escolhida) ----------
  const s = dataset ? (originFilter === "all" ? dataset.totals : dataset.origins[originFilter]) : emptyStats();
  const values = [1, 2, 3, 4, 5].map((i) => Number(s.steps[String(i)]) || 0);
  values.push(s.purchases);
  const start = values[0];
  const conversion = start > 0 ? (s.purchases / start) * 100 : 0;
  const ticket = s.purchases > 0 ? s.revenue / s.purchases : 0;
  const pixPaidPct = s.pixGenerated > 0 ? (s.purchases / s.pixGenerated) * 100 : 0;
  const campaignRows = Object.entries(dataset?.campaigns ?? {})
    .sort((a, b) => (Number(b[1].steps["1"]) || 0) - (Number(a[1].steps["1"]) || 0));

  let bottleneck: { from: number; pass: number } | null = null;
  if (start >= 20) {
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] <= 0) continue;
      const pass = (values[i] / values[i - 1]) * 100;
      if (!bottleneck || pass < bottleneck.pass) bottleneck = { from: i - 1, pass };
    }
  }
  const transitionKey = bottleneck ? (bottleneck.from === 4 ? "5-C" : `${bottleneck.from + 1}-${bottleneck.from + 2}`) : null;
  const suggestion = transitionKey ? SUGGESTIONS[transitionKey] : null;

  const showGate = !unlocked;

  return (
    <div className="app admin">
      <header className="hero">
        <div className="logo">Crie Sua História</div>
        <h1>Painel da Caroline</h1>
        <p>Fila de pedidos para despachar, lista de recuperação de quem gerou o PIX e não pagou, e o funil do anúncio pago da Meta e do link da bio — tudo dentro do próprio site, sem custo extra.</p>
      </header>

      {showGate && (
        <section className="card admin-gate">
          <h2>Área restrita</h2>
          <p className="muted">Entre com o <strong>usuário e a senha</strong> definidos na hospedagem (<strong>ADMIN_USER</strong> / <strong>ADMIN_PASSWORD</strong>) — ou, se preferir, com a sua <strong>chave única</strong> (ADMIN_KEY).</p>
          <div className="period-row" role="tablist" aria-label="Forma de entrar">
            <button className={authTab === "userpass" ? "chip active" : "chip"} onClick={() => setAuthTab("userpass")}>Usuário e senha</button>
            <button className={authTab === "key" ? "chip active" : "chip"} onClick={() => setAuthTab("key")}>Chave única</button>
          </div>
          {authTab === "userpass" ? (
            <>
              <label className="field"><span>Usuário</span>
                <input value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="seu usuário" autoComplete="username" />
              </label>
              <label className="field"><span>Senha</span>
                <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter()} placeholder="••••••••••" autoComplete="current-password" />
              </label>
            </>
          ) : (
            <label className="field"><span>Sua chave (ADMIN_KEY)</span>
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter()} placeholder="••••••••••" autoComplete="off" />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn primary big" onClick={enter} disabled={loading || (authTab === "userpass" ? !(userInput.trim() && passInput) : !keyInput.trim())}>{loading ? "Entrando..." : "Entrar"}</button>
          <p className="hint">Sem as credenciais por perto? Você ainda pode explorar o painel com os dados desta sessão ou com a demonstração:</p>
          <div className="nav-row">
            <button className="btn ghost" onClick={loadLocal}>Ver dados desta sessão</button>
            <button className="btn secondary" onClick={showDemo}>Ver demonstração</button>
          </div>
        </section>
      )}

      {!showGate && error && (
        <section className="card">
          <p className="error">{error}</p>
          <button className="btn ghost" onClick={() => setError("")}>Fechar aviso</button>
        </section>
      )}

      {dataset && (
        <>
          {mode === "local" && <p className="admin-banner">Modo demonstração local — dados só desta sessão/navegador. Em produção, o painel lê os pedidos e os contadores de todos os visitantes (anúncio Meta e bio).</p>}
          {mode === "demo" && <p className="admin-banner">Amostra fictícia, só para você ver como o painel funciona. Não são dados reais.</p>}
          {mode === "api" && <p className="admin-banner api">Dados reais do site · pedidos + funil (só anúncio Meta + bio) {auth && <button className="btn ghost admin-mini" onClick={changeCredentials}>Trocar credenciais</button>}</p>}

          <div className="period-row admin-tabs" role="tablist" aria-label="Abas do painel">
            <button className={tab === "orders" ? "chip active" : "chip"} onClick={() => setTab("orders")}>Pedidos Pagos</button>
            <button className={tab === "funnel" ? "chip active" : "chip"} onClick={() => setTab("funnel")}>Funil &amp; Gargalo</button>
          </div>

          {tab === "orders" && (
            <>
              <div className="period-row" role="tablist" aria-label="Pedidos por status">
                <button className={orderFilter === "pago" ? "chip active" : "chip"} onClick={() => setOrderFilter("pago")}>Pagos ({paidOrders.length})</button>
                <button className={orderFilter === "pendente" ? "chip active" : "chip"} onClick={() => setOrderFilter("pendente")}>Geraram PIX e não pagaram ({pendingOrders.length})</button>
              </div>
              {orderFilter === "pendente" && (
                <p className="hint">Quem aparece aqui preencheu o checkout e gerou o PIX, mas não pagou. Os dados são os do próprio formulário — dá para chamar no WhatsApp e recuperar a venda. Quem abandona antes de gerar o PIX não deixou dados: aparece só como contagem no funil.</p>
              )}
              {visibleOrders.length === 0 ? (
                <section className="card">
                  <h2>{orderFilter === "pago" ? "Nenhum pedido pago por aqui (ainda)" : "Ninguém esperando pagamento por aqui"}</h2>
                  <p className="muted">{orderFilter === "pago"
                    ? "Quando um pagamento for aprovado, o pedido completo aparece nesta fila para você produzir e marcar como enviado."
                    : "Quando alguém gerar um PIX e não pagar, o contato aparece nesta lista para recuperação."}</p>
                </section>
              ) : (
                <div className="orders-list">{visibleOrders.map(renderOrder)}</div>
              )}
            </>
          )}

          {tab === "funnel" && (
            <>
              <div className="period-row" role="tablist" aria-label="Período">
                {([["Hoje", 1], ["7 dias", 7], ["Tudo", "all"]] as Array<[string, Period]>).map(([label, p]) => (
                  <button key={label} className={period === p ? "chip active" : "chip"} onClick={() => pickPeriod(p)}>{label}</button>
                ))}
                <span className="hint">{mode === "api" ? "Período aplicado aos dados do site." : mode === "demo" ? "Amostra fictícia (o período é só um rótulo aqui)." : "Dados desta sessão/navegador (o período é só um rótulo aqui)."}</span>
              </div>

              <div className="period-row" role="tablist" aria-label="Origem">
                {([["Tudo (Meta + Bio)", "all"], ["Anúncio Meta", "meta-ads"], ["Link da Bio", "bio"]] as Array<[string, OriginFilter]>).map(([label, o]) => (
                  <button key={label} className={originFilter === o ? "chip active" : "chip"} onClick={() => setOriginFilter(o)}>{label}</button>
                ))}
                <span className="hint">Este painel só acompanha anúncio pago da Meta e o link da bio — os cartões, o funil, o gargalo e as sugestões seguem o recorte escolhido.</span>
              </div>

              <div className="admin-cards">
                <div className="admin-card"><span>Visitantes (etapa 1)</span><strong>{start}</strong></div>
                <div className="admin-card"><span>Compras</span><strong>{s.purchases}</strong></div>
                <div className="admin-card"><span>Conversão geral</span><strong>{pct(conversion)}</strong></div>
                <div className="admin-card"><span>Receita</span><strong>{fmt(s.revenue)}</strong></div>
                <div className="admin-card"><span>Ticket médio</span><strong>{fmt(ticket)}</strong></div>
              </div>

              <section className="card">
                <h2>Pix Gerados vs. Pix Pagos</h2>
                <div className="pix-versus">
                  <div><span>Pix Gerados</span><strong>{s.pixGenerated}</strong></div>
                  <div><span>Pix Pagos</span><strong>{s.purchases}</strong></div>
                  <div><span>Pagaram</span><strong>{s.pixGenerated > 0 ? pct(pixPaidPct) : "—"}</strong></div>
                </div>
                <p className="muted">Gerou o PIX e não pagou? Os contatos dessas pessoas estão na aba <strong>Pedidos Pagos → “Geraram PIX e não pagaram”</strong>, prontos para recuperação no WhatsApp.</p>
              </section>

              <section className="card">
                <h2>O funil, etapa por etapa</h2>
                <div className="funnel">
                  {STEP_LABELS.map((label, i) => {
                    const v = values[i];
                    const passPrev = i === 0 ? 100 : values[i - 1] > 0 ? (v / values[i - 1]) * 100 : 0;
                    const ofStart = start > 0 ? (v / start) * 100 : 0;
                    return (
                      <div className="funnel-row" key={label}>
                        <div className="funnel-head">
                          <strong>{i < 5 ? `${i + 1} · ${label}` : "✓ · Compra"}</strong>
                          <span>{v} pessoas</span>
                          <span className="muted">{i === 0 ? "começaram" : `${pct(passPrev)} de quem estava na etapa anterior`}</span>
                          <span className="muted">{pct(ofStart)} do início</span>
                        </div>
                        <div className="funnel-track"><div className="funnel-bar" style={{ width: `${v > 0 ? Math.max(2, ofStart) : 0}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {campaignRows.length > 0 && (
                <section className="card">
                  <h2>Campanhas</h2>
                  <div className="campaign-wrap">
                    <table className="campaign-table">
                      <thead>
                        <tr><th>Campanha</th><th>Visitantes</th><th>Compras</th><th>Conversão</th></tr>
                      </thead>
                      <tbody>
                        {campaignRows.map(([name, a]) => {
                          const v = Number(a.steps["1"]) || 0;
                          return (
                            <tr key={name}>
                              <td>{name}</td><td>{v}</td><td>{a.purchases}</td>
                              <td>{v > 0 ? pct((a.purchases / v) * 100) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {start < 20 ? (
                <section className="card bottleneck-card">
                  <h2>Gargalo principal</h2>
                  <p>Ainda faltam dados para um diagnóstico confiável neste recorte: por enquanto há <strong>{start} visitante(s)</strong> registrado(s) e o ideal é juntar pelo menos <strong>20</strong> antes de tirar conclusões. Continue divulgando o quiz (anúncio e bio) e volte aqui — com mais visitas, o painel aponta exatamente onde as pessoas desistem e o que fazer.</p>
                </section>
              ) : bottleneck && suggestion ? (
                <>
                  <section className="card bottleneck-card">
                    <h2>Gargalo principal</h2>
                    <p className="bottleneck-big">
                      Da etapa <strong>{STEP_LABELS[bottleneck.from]}</strong> para <strong>{STEP_LABELS[bottleneck.from + 1]}</strong>, só <strong>{pct(bottleneck.pass)}</strong> das pessoas continuam — é a maior perda do funil: <strong>{pct(100 - bottleneck.pass)} desistem bem aí</strong>.
                    </p>
                    <p className="muted">É nessa passagem que vale concentrar o próximo esforço: pequenas melhorias aí rendem mais do que em qualquer outra etapa.</p>
                  </section>
                  <section className="card">
                    <h2>Sugestões para aumentar a conversão</h2>
                    <h3>{suggestion.title}</h3>
                    <ul className="suggestions">
                      {suggestion.items.map((it) => <li key={it}>{it}</li>)}
                    </ul>
                    <h3>Dicas gerais</h3>
                    <ul className="suggestions">
                      {GENERAL_TIPS.map((it) => <li key={it}>{it}</li>)}
                    </ul>
                  </section>
                </>
              ) : null}

              {mode !== "demo" && (
                <div className="nav-row">
                  <button className="btn ghost" onClick={showDemo}>Ver demonstração com números fictícios</button>
                  {mode === "api" && <button className="btn secondary" onClick={() => auth && load(period, auth)} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button>}
                </div>
              )}
            </>
          )}
        </>
      )}

      {!dataset && (
        <div className="nav-row" />
      )}

      <section className="card admin-help">
        <h2>Como o painel enxerga as visitas</h2>
        <p>Só entram neste painel as visitas que chegam com as UTMs certas. Use sempre estes formatos:</p>
        <p><strong>Anúncio pago da Meta:</strong><br /><code>?utm_source=meta&amp;utm_medium=cpc&amp;utm_campaign=NOME-DA-CAMPANHA</code><br /><span className="muted">(o <code>fbclid</code> a Meta acrescenta sozinha no clique — ele também marca a visita como anúncio)</span></p>
        <p><strong>Link da bio:</strong><br /><code>?utm_source=instagram&amp;utm_medium=bio&amp;utm_campaign=bio</code></p>
        <p className="muted">Visitas sem essas UTMs não entram neste painel (nem acesso direto, nem busca orgânica, nem outros links). O Meta Pixel continua enxergando todo mundo — o recorte é só deste painel.</p>
      </section>

      <footer className="footer">
        <a href="#/" onClick={(e) => { e.preventDefault(); window.location.hash = ""; }}>← Voltar ao quiz</a>
      </footer>
    </div>
  );
}

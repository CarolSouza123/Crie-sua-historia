import type { Synopsis } from "../types";
// Fallback client-side da sinopse (mesma logica de server/synopsis.ts).
// Usado quando /api nao esta disponivel (ex.: `npm run dev` sem `vercel dev`).
const DETAILS: Record<string, { place: string; friend: string; challenge: string; object: string }> = {
  "Aventura Espacial": { place: "um planeta colorido onde as estrelas piscam em ritmo de música", friend: "o robozinho Bip", challenge: "a Lua perdeu o seu brilho", object: "um mapa de estrelas" },
  "Reino Encantado": { place: "um reino onde as torres são feitas de nuvens macias", friend: "a fadinha Lili", challenge: "a ponte de arco-íris desapareceu", object: "uma chave dourada" },
  "Dinossauros": { place: "um vale verdinho onde dinossauros gentis tomam chá de folhas", friend: "o pequeno triceratopo Tito", challenge: "um ovo de dinossauro se perdeu da mamãe", object: "uma pegada gigante misteriosa" },
  "Fundo do Mar": { place: "uma cidade de conchas e corais que brilham no escuro", friend: "a tartaruga-marinha Nina", challenge: "a grande pérola da lagoa sumiu", object: "uma bolha mágica" },
  "Super-Herói": { place: "a Cidade dos Sorrisos", friend: "o capitão Coragem", challenge: "o vento bagunçou todos os brinquedos da praça", object: "um escudo de tampinhas coloridas" },
  "Floresta Mágica": { place: "uma floresta onde as árvores contam histórias baixinho", friend: "o esquilo Pipoca", challenge: "o rio de vagalumes parou de brilhar", object: "uma lanterninha de vagalumes" },
  "Craque de Futebol": { place: "um campinho onde a grama parece um tapete verde", friend: "o técnico Coruja Sabe-Tudo", challenge: "chegou o dia da grande final do bairro", object: "uma chuteira da sorte" },
};
const FALLBACK = { place: "um lugar mágico onde tudo pode acontecer", friend: "um novo amigo muito especial", challenge: "um mistério apareceu logo cedo", object: "um objeto mágico e brilhante" };
export function mockSynopsis(name: string, theme: string, moral: string, adjustment = ""): Synopsis {
  const d = DETAILS[theme] ?? FALLBACK; const adj = adjustment.trim();
  return {
    title: `${name} e a Grande Aventura: ${theme}`,
    summary: `${name} parte para ${d.place} ao lado de ${d.friend} e enfrenta um grande desafio. Uma historinha curta sobre ${moral.toLowerCase()}.`,
    chapters: [
      `${name} encontra ${d.object} e parte para ${d.place}.`,
      `Lá, conhece ${d.friend} e descobre um problema: ${d.challenge}.`,
      `${name} decide ajudar, mesmo com o coração batendo forte.`,
      adj ? `Pedido especial: ${adj.replace(/\.$/, "")} — e ${name} dá um jeito criativo.` : `${name} quase desiste, mas lembra da família e continua.`,
      `Com gentileza e um plano esperto, ${name} enfrenta o grande momento.`,
      `Tudo se resolve: ${name} aprende a lição — ${moral.toLowerCase()} — e volta para casa feliz.`,
    ],
    mock: true,
  };
}
export function mockPix(amount: number): import("../types").PixResult {
  const id = `mock_local_${Date.now()}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="#fff"/><rect x="20" y="20" width="50" height="50" fill="#111"/><rect x="150" y="20" width="50" height="50" fill="#111"/><rect x="20" y="150" width="50" height="50" fill="#111"/><text x="110" y="115" font-size="16" text-anchor="middle" fill="#b3541e" font-family="sans-serif">PIX MOCK</text></svg>`;
  return { id, status: "pending", mock: true, qr_code: `000201-MOCK-CRIE-SUA-HISTORIA-${id}-copia-e-cola-de-teste`, qr_code_base64: null, qr_image_data_url: `data:image/svg+xml;base64,${btoa(svg)}`, ticket_url: null, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), amount };
}

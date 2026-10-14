export interface SynopsisInput {
  name: string; age?: number | string; gender?: string;
  theme: string; moral: string; style?: string; adjustment?: string;
}
export interface Synopsis { title: string; summary: string; chapters: string[]; mock?: boolean }

const THEME_DETAILS: Record<string, { place: string; friend: string; challenge: string; object: string }> = {
  "Aventura Espacial": { place: "um planeta colorido onde as estrelas piscam em ritmo de musica", friend: "o robozinho Bip", challenge: "a Lua perdeu o seu brilho", object: "um mapa de estrelas" },
  "Reino Encantado": { place: "um reino onde as torres sao feitas de nuvens macias", friend: "a fadinha Lili", challenge: "a ponte de arco-iris desapareceu", object: "uma chave dourada" },
  "Dinossauros": { place: "um vale verdinho onde dinossauros gentis tomam cha de folhas", friend: "o pequeno triceratope Tito", challenge: "um ovo de dinossauro se perdeu da mamae", object: "uma pegada gigante misteriosa" },
  "Fundo do Mar": { place: "uma cidade de conchas e corais que brilham no escuro", friend: "a tartaruga-marina Nina", challenge: "a grande perola da lagoa sumiu", object: "uma bolha magica que permite respirar debaixo d'agua" },
  "Super-Heroi": { place: "a Cidade dos Sorrisos, onde todo heroi usa capa feita em casa", friend: "o capitao Coragem", challenge: "o vento baguncou todos os brinquedos da praca", object: "um escudo feito de tampinhas coloridas" },
  "Floresta Magica": { place: "uma floresta onde as arvores contam historias baixinho", friend: "o esquilo Pipoca", challenge: "o rio de vagalumes parou de brilhar", object: "uma lanterninha de vagalumes" },
  "Craque de Futebol": { place: "um campinho onde a grama parece um tapete verde", friend: "o tecnico Coruja Sabe-Tudo", challenge: "chegou o dia da grande final do bairro", object: "uma chuteira da sorte" },
  "Ilha dos Piratas do Bem": { place: "uma ilha onde piratas do bem procuram tesouros de amizade", friend: "o papagaio Capitão Eco", challenge: "o mapa do tesouro esta incompleto", object: "uma bussola que aponta para quem precisa de ajuda" },
  "Circo dos Sonhos": { place: "um circo onde as tendas mudam de cor a cada aplauso", friend: "a palhacinha Mel", challenge: "o espetaculo nao pode comecar sem a estrela principal", object: "um chapeu que realiza um desejo gentil" },
};
const FALLBACK = { place: "um lugar magico onde tudo pode acontecer", friend: "um novo amigo muito especial", challenge: "um misterio apareceu logo cedo", object: "um objeto magico e brilhante" };

/** Mock deterministico e de alta qualidade — mesma forma do retorno da IA real. */
export function mockSynopsis(input: SynopsisInput): Synopsis {
  const name = (input.name || "Nosso heroi").trim();
  const theme = input.theme || "Aventura Espacial";
  const moral = input.moral || "Acreditar em si mesmo";
  const d = THEME_DETAILS[theme] ?? FALLBACK;
  const adj = (input.adjustment || "").trim();
  const chapters = [
    `${name} encontra ${d.object} e parte para ${d.place}.`,
    `La, conhece ${d.friend} e descobre um problema: ${d.challenge}.`,
    `${name} decide ajudar, mesmo com o coracao batendo forte.`,
    adj
      ? `Pedido especial: ${adj.replace(/\.$/, "")} — e ${name} da um jeito criativo.`
      : `${name} quase desiste, mas lembra da familia e continua.`,
    `Com gentileza e um plano esperto, ${name} enfrenta o grande momento.`,
    `Tudo se resolve: ${name} aprende a licao — ${moral.toLowerCase()} — e volta para casa feliz.`,
  ];
  return {
    title: `${name} e a Grande Aventura: ${theme}`,
    summary: `${name} parte para ${d.place} ao lado de ${d.friend} e enfrenta um grande desafio. Uma historinha curta sobre ${moral.toLowerCase()}.`,
    chapters,
    mock: true,
  };
}

export async function generateSynopsis(input: SynopsisInput): Promise<Synopsis> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return mockSynopsis(input);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Voce escreve livros infantis em portugues brasileiro. Responda SOMENTE com JSON valido no formato {\"title\": string, \"summary\": string (no maximo 2 frases curtas — e so um resumo de como a historia vai ser), \"chapters\": string[6] (exatamente 6 topicos, um topico bem curto por pagina, no maximo 14 palavras cada)}. Linguagem adequada a idade da crianca, acolhedora, sem conteudo assustador." },
          { role: "user", content: `Nome: ${input.name}. Idade: ${input.age ?? ""}. Genero: ${input.gender ?? ""}. Tema/aventura: ${input.theme}. Moral: ${input.moral}. Estilo visual: ${input.style ?? ""}. ${input.adjustment ? `Ajuste pedido pelo responsavel (incorpore visivelmente): ${input.adjustment}` : ""}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data: any = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    if (!parsed.title || !Array.isArray(parsed.chapters)) throw new Error("JSON invalido");
    return { title: parsed.title, summary: parsed.summary ?? "", chapters: parsed.chapters.slice(0, 6), mock: false };
  } catch (err) {
    console.error("[generate-synopsis] OpenAI falhou, usando mock:", err);
    return mockSynopsis(input);
  }
}

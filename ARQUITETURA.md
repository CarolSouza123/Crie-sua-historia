# Crie Sua História — Arquitetura (explicada simples)

## A ideia em uma frase
Não existe página de vendas: **o quiz É a loja**. A família monta o livro passo a passo, se apega à prévia da história e só então paga — tudo na mesma página, sem sair para outro site.

## Como a pessoa usa (5 passos)
1. **Foto** — nome, idade e gênero da criança + foto (ou "envio depois por e-mail").
2. **Visual** — estilo do desenho (Disney/Pixar 3D, Realista, Aquarela ou Anime). O livro tem 6 páginas, já incluídas.
3. **Aventura** — tema (espaço, dinossauros, fundo do mar...), a **moral da história** e uma dedicatória opcional.
4. **Revisão** — a IA escreve na hora o título, um resumo e o que acontece em cada página. A pessoa pode pedir ajustes em linguagem natural ("quero que ele salve um cachorrinho") e a história muda na tela.
5. **Pagamento** — resumo (de R$ 79,90 por **R$ 37,90**), dois extras opcionais (livro de colorir +R$ 9,90 e narração em áudio +R$ 12,90), dados do comprador e pagamento só por **PIX** (QR Code na tela) nesta fase — cartão foi removido por enquanto e volta depois.

## O que acontece depois do pagamento (Fase 1 — semi-automático)
1. O Mercado Pago avisa nosso sistema sozinho (webhook).
2. O sistema busca o pedido guardado na hora em que o PIX foi criado (ele já tem comprador, dados do livro, sinopse e foto), marca o pedido como **pago** — ele entra na fila **Pedidos Pagos** do painel —, recupera as UTMs daquela compra e registra a venda nos contadores do próprio site, já atribuída à origem e à campanha certas (o funil interno, sem banco externo).
3. Você (ou a produção) recebe um aviso instantâneo no **Telegram** (ou num webhook) com criança, tema, moral, estilo, sinopse, e-mail e WhatsApp do comprador, **o link da foto** (quando `PUBLIC_BASE_URL` está configurada, aponta para a foto guardada — abre logada no painel) **e o bloco de origem da venda (UTMs, fbclid/gclid)**.
4. O sistema avisa a Meta pela **Conversions API** que houve uma compra (evento `Purchase` no servidor, com os identificadores de clique `fbc`/`fbp` e o mesmo código do evento do Pixel, para a Meta não contar duas vezes) — é isso que faz o anúncio otimizar para quem realmente compra.
4. O livro é produzido e enviado manualmente para o e-mail do cliente em poucas horas. A narração em áudio, quando comprada, tem prazo de até 24h.

**Fase 2 (futura):** ligar o robô **N8N** nesse mesmo aviso para gerar o livro e enviar sozinho, sem trabalho manual.

## De onde a visita veio (UTMs) e o funil
Quando alguém chega pelo anúncio ou pela bio, o endereço traz as **UTMs** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) e os códigos de clique (`fbclid` da Meta, `gclid` do Google). Logo na abertura, o site guarda tudo isso no navegador, na chave **`lead_tracking`**, e esse carimbo acompanha a pessoa pelas 5 etapas, entra no pedido quando o PIX é criado e é recuperado no aviso de pagamento aprovado — assim cada venda sabe exatamente de onde veio.

A cada passo, o site soma **contadores por dia** (quantas pessoas chegaram a cada etapa, quantas compraram e quanto vendeu, no total e separados por origem e por campanha) — **sem banco de dados externo**: fica tudo dentro do próprio site, na camada gratuita do KV da Cloudflare. É assim que sabemos **em que etapa as pessoas desistem** e onde melhorar. Também disparamos os eventos do Meta Pixel: `ViewContent` (começou), `Lead` (gerou a sinopse), `InitiateCheckout` (chegou ao pagamento) e `Purchase` (pagou — o oficial vem do webhook, no servidor, pela Conversions API).

## O painel da Caroline (`/dashboardfunil`)
Dentro do próprio site, em `/dashboardfunil` (endereço oculto: nenhum link ou botão na página — só quem sabe o endereço chega ao painel; a página tem `noindex, nofollow` para não aparecer em buscadores). A entrada é por **usuário e senha** (`ADMIN_USER` + `ADMIN_PASSWORD`) ou pela **chave única** antiga (`ADMIN_KEY`, como reserva) — só a Caroline sabe. Sem nenhuma das duas configurações, o painel nem abre (responde 503). O painel tem **duas abas**:

**Aba 1 — Pedidos Pagos (a fila de trabalho):** cada venda aprovada vira um cartão completo: data e hora, nome/e-mail/WhatsApp do comprador, os dados do livro (criança, idade, gênero, estilo, aventura, moral e dedicatória), a **sinopse aprovada** (é só abrir para ler), a **foto da criança** em miniatura com botão de abrir/baixar, selos dos extras comprados (livro de colorir, narração em áudio), o valor total e a origem da venda (UTMs). Produziu e enviou? Um toque no botão **Pendente → Enviado** e fica registrado.

**Recuperação (na mesma aba):** o sub-filtro **“Geraram PIX e não pagaram”** mostra quem preencheu o checkout e gerou o PIX, mas não pagou — com nome, e-mail e botão direto para chamar no **WhatsApp**. Esses dados vêm do **formulário do checkout, coletados na hora em que o PIX foi gerado**. Quem abandona **antes** de gerar o PIX não deixou nenhum dado pessoal — essa pessoa aparece **só** como um número a menos no funil, sem identificação (não há o que recuperar, porque nada foi coletado). Quando a pessoa paga depois, o mesmo registro sai da recuperação e entra na fila de pagos sozinho.

**Aba 2 — Funil & Gargalo:** visitantes, compras, conversão, receita e ticket médio; **Pix Gerados × Pix Pagos**; o funil etapa por etapa com porcentagens; o **gargalo principal** (a passagem onde mais gente desiste) e **sugestões práticas** do que mudar para aumentar a conversão. Sem custo adicional — lê os mesmos contadores do funil interno.

**E as fotos e os pedidos, somem se o servidor reiniciar?** Não — no deploy eles ficam guardados no **KV** (a mesma caixinha gratuita da Cloudflare dos contadores), e no computador de desenvolvimento ficam numa pasta privada (`.data/uploads/` para as fotos). Atenção honesta: se um dia o site for publicado **sem** conectar essa caixinha (o binding `TRACK_KV`), o servidor pode esquecer arquivos ao reiniciar — por isso, em produção, o KV é parte obrigatória da ativação.

**Importante — o painel só acompanha duas origens:** o **anúncio pago da Meta** e o **link da bio**. Visita que chega sem as UTMs certas (acesso direto, busca orgânica, outros links) **não entra** em nenhum número do painel (o Meta Pixel continua enxergando todo mundo; o recorte é só do painel). Dentro do painel dá para alternar entre **Tudo (Meta + Bio)**, **Anúncio Meta** e **Link da Bio**, e há uma tabelinha de **campanhas**. Para isso funcionar, os endereços divulgados precisam usar sempre este formato:
- Anúncio Meta: `?utm_source=meta&utm_medium=cpc&utm_campaign=NOME-DA-CAMPANHA` (o `fbclid` a Meta acrescenta sozinha);
- Bio: `?utm_source=instagram&utm_medium=bio&utm_campaign=bio`.

## O que já funciona de verdade x o que é demonstração
| Parte | Situação inicial |
|---|---|
| Quiz completo, validações, total com extras, timer do PIX | **Real**, pronto |
| Sinopse | **Real com IA** se houver chave da OpenAI; sem chave, usa um texto-modelo inteligente montado com nome/tema/moral (ótimo para testar) |
| PIX | **Real** se houver token do Mercado Pago; sem token, gera um **PIX de demonstração claramente marcado como MOCK** (QR desenhado + código falso), só para testar o fluxo |
| Funil e painel | **Reais** dentro do próprio site: contadores por dia, pedidos completos e fotos no KV gratuito; painel em `/dashboardfunil` com as abas Pedidos Pagos (+ recuperação) e Funil & Gargalo. Não é mais necessário nenhum banco externo (Supabase foi removido do projeto). Sem o KV conectado, o painel mostra os dados desta sessão/navegador avisando que é demonstração local |
| Cartão de crédito | Removido nesta fase (checkout só com PIX por enquanto); volta em fase futura com a leitura segura do cartão (tokenização pelo SDK do Mercado Pago) |
| Aviso no Telegram/webhook | **Real** se configurado; sem configuração, fica registrado no log do servidor |

Ou seja: **dá para abrir, testar e mostrar hoje, sem nenhuma chave.** As chaves (que só a Caroline coloca, no painel da hospedagem) ligam as partes reais uma a uma.

## Quanto custa rodar
Hospedagem do site e das funções: plano gratuito da **Cloudflare Pages** (caminho oficial — repositório `Crie-Sua-Historia` no GitHub conectado à Cloudflare, deploy automático a cada push; as funções de `api/` rodam pelo adaptador `functions/api/[[path]].ts`, e o passo a passo de ativação está no README, seção "Publicação (Cloudflare Pages)"). Funil e painel: KV gratuito da Cloudflare, dentro do próprio site, sem banco externo e sem mensalidade. Custos variáveis só quando vende/usa: taxa do Mercado Pago por pagamento e, se usar IA real, centavos por sinopse gerada.

## Arquivos principais
- `src/` — a tela que a pessoa vê (quiz, passos 1–5).
- `api/` — os bastidores: gerar sinopse, criar PIX, receber o aviso de pagamento e registrar cada passo.
- `functions/api/[[path]].ts` — a "ponte" da Cloudflare Pages: recebe tudo que é `/api/*` e entrega para os arquivos de `api/` no formato que eles já conhecem (inclusive levando as variáveis do painel e a caixinha KV junto).
- `server/` — ajudantes compartilhados (sinopse/IA, funil interno, aviso de entrega).
- `server/trackStore.ts` — onde ficam os contadores do funil (por dia, com recorte por origem e campanha) e os pedidos guardados com suas UTMs.
- `src/lib/tracking.ts` + `server/tracking.ts` — a captura das UTMs (`lead_tracking`) e a regra que classifica a origem (anúncio Meta, bio ou outro).
- `server/metaCapi.ts` — o envio do `Purchase` para a Meta pelo servidor (Conversions API).
- `src/components/AdminPanel.tsx` — a tela do painel `/dashboardfunil` (aba Pedidos Pagos com fila de despacho e lista de recuperação, e aba Funil & Gargalo).
- `api/admin-orders.ts` e `api/admin-photo.ts` — os bastidores do painel: a fila de pedidos (pagos e pendentes), o botão Enviado e a foto da criança (que só abre com o login da Caroline, nunca é pública).
- `server/adminAuth.ts` — a fechadura do painel: usuário + senha (`ADMIN_USER`/`ADMIN_PASSWORD`) ou a chave única (`ADMIN_KEY`).

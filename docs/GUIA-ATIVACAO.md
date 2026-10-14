# Guia de ativação — Crie Sua História (o que só a Caroline faz)

> Preparado em 13/10/2026 a partir do README e do `.env.example` do projeto. Ordem pensada para destravar o deploy sem retrabalho. Nomes de variável copiados exatamente do `.env.example`.

## Decisão antes de tudo: onde hospedar

- Os sites das cifras estão no **Cloudflare Pages**, mas este projeto foi construído no padrão **Vercel** (pastas `api/` + `server/`). No Cloudflare, as funções de bastidor **não funcionam direto**: precisariam de um adaptador (`functions/api/[[path]].ts`) que ainda não foi feito.
- **Correção importante (verificada no código em 13/10/2026):** o funil gratuito que a Caroline pediu só persiste no **KV da Cloudflare** (binding `TRACK_KV`, em `server/trackStore.ts`). Na **Vercel esse binding não existe** — sem ele o armazenamento cai para arquivo/memória do processo, que some ao reiniciar. Seguir a recomendação antiga de "Vercel" esperando o painel funcionar em produção perderia os dados do funil.
- **Conclusão prática:** são dois caminhos, não um: (A) **Cloudflare** — mantém o funil gratuito como pedido, mas o adaptador precisa ser construído e testado ANTES do deploy; ou (B) **Vercel** — as funções sobem sozinhas, mas o painel precisaria de outro armazenamento persistente (ainda não plugado). Não criar o namespace KV nem conectar `TRACK_KV` se o deploy for na Vercel — lá isso não tem efeito.

## Ordem das contas/chaves (só ela pode criar)

1. **Funil interno + painel `/dashboardfunil`** (sem custo, sem banco externo) — o Supabase não é mais necessário. **Só no caminho Cloudflare:** criar um namespace KV na Cloudflare (grátis) e conectar ao projeto com o binding `TRACK_KV`; definir a variável `ADMIN_KEY` (a senha do painel, só da Caroline).
2. **Mercado Pago** (PIX real) — pegar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`. Depois do deploy, apontar o webhook do MP para `https://SEU-DOMINIO/api/webhook/mercadopago`.
3. **OpenAI** (sinopse com IA real) — `OPENAI_API_KEY` (o modelo padrão já está definido: `gpt-4o-mini`).
4. **Meta Pixel** — `VITE_META_PIXEL_ID` (ID da conta de anúncios).
5. **Aviso de venda (fase 1)** — um dos dois: Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) ou `DELIVERY_WEBHOOK_URL`.

## Regras de segurança (do README)

- Chaves de servidor **nunca** levam prefixo `VITE_` (só o Pixel é do front).
- A `ADMIN_KEY` só fica no servidor/painel da hospedagem — é a senha do painel `/dashboardfunil`.
- As chaves são cadastradas no painel da hospedagem pela Caroline; não precisam ser enviadas no chat.

## Sem nenhuma chave

O site continua funcionando em **modo demonstração** (sinopse local, PIX fictício marcado como MOCK, funil apenas com os eventos locais desta sessão no painel `/dashboardfunil`, checkout só com PIX — sem aba de cartão) — dá para testar e mostrar, mas **não** dá para vender de verdade.

## Antes de divulgar/anunciar (junto com as chaves)

- Publicar Política de Privacidade e Termos e ligar o consentimento da Etapa 1 — minutas prontas em `docs/legal/`, faltam os dados da empresa e a decisão do prazo de guarda da foto.
- Ainda não existe repositório GitHub nem deploy deste projeto.

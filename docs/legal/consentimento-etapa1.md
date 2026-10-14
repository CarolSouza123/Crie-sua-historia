# Textos prontos para a interface — consentimento, checkout e rodapé

> Preparado em 13/10/2026. Nada aplicado ao código ainda — depende da aprovação da Caroline e do preenchimento dos dados da empresa na Política/Termos.

## 1. Etapa 1 (Foto) — consentimento específico e em destaque (LGPD, art. 14, §1º)

Checkbox **desmarcada por padrão**, logo abaixo do upload da foto. O botão "Próximo" só libera com ela marcada (somar à validação atual: nome + idade + gênero + foto/enviar depois).

Texto exato:

> ☐ **Sou pai/mãe ou responsável legal desta criança** e autorizo o uso do nome, da idade e da foto dela **somente para criar o livro personalizado** deste pedido, conforme a [Política de Privacidade]. A foto não será usada em anúncios nem publicada.

Microtexto abaixo (cinza, pequeno):

> Você pode pedir a exclusão da foto e dos dados a qualquer momento pelo e-mail [E-MAIL].

## 2. Etapa 5 (Checkout) — aceite de compra

Checkbox desmarcada por padrão, acima do botão de pagar:

> ☐ Li e aceito os [Termos de Uso e Compra] e a [Política de Privacidade]. Sei que o livro é digital (PDF), personalizado e será entregue no meu e-mail após a confirmação do pagamento.

## 3. Rodapé (hoje só tem a frase "Feito com carinho para famílias")

Adicionar links ao lado/abaixo da frase atual, sem mudar o visual:

> Crie Sua História · Livro digital personalizado · Feito com carinho para famílias
> [Política de Privacidade] · [Termos de Uso] · Suporte: [E-MAIL]

## 4. Rotas sugeridas quando for implementar

- `/privacidade` → texto de `politica-de-privacidade.md`
- `/termos` → texto de `termos-de-uso.md`
- Links abrem na mesma página (rotas da SPA), sem sair do funil em nova aba durante o checkout — usar modal ou rota com botão "voltar" para não perder a sessão do quiz. [Decisão de implementação: modal dentro da SPA é o mais seguro para conversão.]

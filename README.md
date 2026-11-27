# Caixa do Som · IMEL Mairiporã

Painel da equipe para controlar a arrecadação que paga os subs e retornos do som da igreja:
vendas de doces, encomendas, gastos com insumos, doações e mantenedores. A meta é repor os
R$ 4.200 pagos no Pix, em parcelas de R$ 450 por mês.

## Stack

- **Next.js 15** (App Router). O "back-end" são *server actions* em `app/actions.ts`.
- **Neon** (Postgres serverless) com o driver `@neondatabase/serverless`. O esquema está em `db/schema.sql`.
- **Vercel** para hospedar. Cada push na `main` gera um deploy novo.
- PDF gerado no navegador com `jspdf` + `jspdf-autotable`.

## Rodar no seu PC

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL, APP_PIN e AUTH_SECRET
npm run dev                  # http://localhost:3000
```

## Variáveis de ambiente

| Nome | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão do Neon (use a URL com `-pooler`) |
| `APP_PIN` | Senha que a equipe digita para entrar. Sem ela, o acesso fica livre. |
| `AUTH_SECRET` | Texto aleatório usado para assinar o cookie de acesso. Se trocar, todo mundo precisa entrar de novo. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Cliente OAuth do Google (tipo "Aplicativo da Web") para salvar comprovantes no Drive. |

## Comprovantes no Google Drive

1. No Google Cloud Console, crie um projeto, ative a **Google Drive API** e configure a tela de consentimento
   (Externo, escopo `drive.file`) e **publique** o app (com `drive.file` não precisa de verificação).
2. Crie um **ID do cliente OAuth** do tipo *Aplicativo da Web* com o URI de redirecionamento
   `https://dash-imel.vercel.app/api/google/callback` (e `http://localhost:3000/api/google/callback` para testar local).
3. Coloque `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel e faça um novo deploy.
4. No app, aba **Pagamentos** → **Conectar Google Drive**. O app cria a pasta "Caixa do Som — Comprovantes"
   e só enxerga os arquivos que ele mesmo criou. Os comprovantes abrem pelo app (só quem tem a senha vê).

## Estrutura

```
app/
  page.tsx        lê o banco e entrega para o Painel
  Painel.tsx      telas: Painel, Encomendas, Lançar, Produtos, Mantenedores
  actions.ts      todas as gravações no banco (com checagem de acesso)
  login/          tela de senha
lib/
  db.ts           conexão e leitura do estado
  relatorio.ts    cálculos, PDF e CSV
  format.ts       moeda, datas e textos
middleware.ts     bloqueia quem não entrou com a senha
db/schema.sql     tabelas do Neon
```

## Regras do negócio

- **Lucro** = vendas + doações − gastos. É o que vai para as parcelas.
- Quando uma encomenda é marcada como **paga**, o app cria as vendas correspondentes;
  se desmarcar ou excluir a encomenda, essas vendas saem juntas.
- "Registrar pagamento" de um mantenedor lança uma doação no mês atual.
- Excluir um doce só o esconde da lista; o histórico de vendas continua.

## Fontes

A identidade segue o guia da FMC (#003A70, #5E8AB4, #FF7F32). Os títulos usam **Kessel 105**
e o texto usa **Freight** quando essas fontes estão instaladas no aparelho; nos demais, entram
Outfit e EB Garamond (servidas pelo próprio app). Para usar Kessel/Freight para todo mundo é
preciso ter a licença *web* delas.

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Cliente OAuth do Google (tipo "Aplicativo da Web"). |
| `GOOGLE_DRIVE_FOLDER_ID` | Pasta do Drive onde ficam os comprovantes. |
| `GOOGLE_SHEET_ID` | Planilha que espelha os dados (abas Resumo, Lançamentos, Encomendas, Mantenedores, Comprovantes). |
| `APP_URL` | Endereço público do app, usado nos links da planilha. |

## Google Drive e Planilha

1. Google Cloud Console → projeto → ative **Google Drive API** e **Google Sheets API**.
2. Tela de consentimento OAuth: Externo, escopos `drive` e `spreadsheets`, e **Publicar app**
   (fica "não verificado": na hora de autorizar, clique em *Avançado → Acessar*; em modo de teste a conexão cai a cada 7 dias).
3. Credenciais → **ID do cliente OAuth** → *Aplicativo da Web*, com o URI de redirecionamento
   `https://imel.vitorsantos.dev.br/api/google/callback` (e o do `dash-imel.vercel.app`, se for usar).
4. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel → novo deploy.
5. No app, aba **Pagamentos** → **Conectar Google**, entrando com a conta dona da pasta e da planilha.

O banco (Neon) é a fonte da verdade: a planilha é reescrita a cada mudança, então editar a planilha à mão não altera o app.

## Fontes

A identidade segue o guia da FMC (#003A70, #5E8AB4, #FF7F32). Os títulos usam **Kessel 105**
e o texto usa **Freight** quando essas fontes estão instaladas no aparelho; nos demais, entram
Outfit e EB Garamond (servidas pelo próprio app). Para usar Kessel/Freight para todo mundo é
preciso ter a licença *web* delas.

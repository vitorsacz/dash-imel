// Integração com Google Drive e Google Sheets usando só fetch (sem SDK).
// Usa a pasta e a planilha que já existem (GOOGLE_DRIVE_FOLDER_ID e GOOGLE_SHEET_ID).
import { sql } from "./db";

export const ESCOPOS = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "openid",
  "email",
];
const NOME_PASTA = "Caixa do Som — Comprovantes";
export const PASTA_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
export const PLANILHA_ID = process.env.GOOGLE_SHEET_ID || null;

export function googleConfigurado() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function urlAutorizacao(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPOS.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function token(body: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Google recusou a autorização: " + (j.error_description || j.error || r.status));
  return j as { access_token: string; refresh_token?: string; id_token?: string };
}

/** Troca o código do login do Google pelos tokens e guarda a conexão. */
export async function concluirConexao(code: string, redirectUri: string) {
  const t = await token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("O Google não devolveu acesso permanente. Remova o app em myaccount.google.com/permissions e conecte de novo.");
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from(t.id_token!.split(".")[1], "base64url").toString()).email ?? null;
  } catch {}
  const pasta = PASTA_ID ?? (await criarPasta(t.access_token));
  await sql`insert into google_conexao (id, refresh_token, pasta_id, email) values (1, ${t.refresh_token}, ${pasta}, ${email})
            on conflict (id) do update set refresh_token = excluded.refresh_token, pasta_id = excluded.pasta_id,
              email = excluded.email, subpastas = '{}', conectado_em = now()`;
  try {
    await prepararSubpastas();
  } catch (e) {
    console.error("Subpastas:", e); // são criadas de novo no primeiro envio
  }
}

async function criarPasta(access: string) {
  const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: NOME_PASTA, mimeType: "application/vnd.google-apps.folder" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Não consegui criar a pasta no Drive: " + (j.error?.message ?? r.status));
  return j.id as string;
}

export async function statusConexao() {
  const [c] = await sql`select email, pasta_id as "pastaId" from google_conexao where id = 1`;
  return c ? { conectado: true, email: (c.email as string) ?? null, pastaId: c.pastaId as string } : { conectado: false, email: null, pastaId: null };
}

export async function acesso() {
  const [c] = await sql`select refresh_token, pasta_id from google_conexao where id = 1`;
  if (!c) throw new Error("Google Drive ainda não conectado");
  const t = await token({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
  return { access: t.access_token, pasta: (PASTA_ID ?? c.pasta_id) as string };
}

export type Categoria = "encomenda" | "doacao" | "compra";
export const SUBPASTAS: Record<Categoria, string> = {
  encomenda: "Pagamentos de encomendas",
  doacao: "Doações",
  compra: "Compras de itens",
};

/** Acha (ou cria) a subpasta da categoria dentro da pasta principal e guarda o id. */
async function subpasta(access: string, pai: string, cat: Categoria) {
  const [c] = await sql`select subpastas from google_conexao where id = 1`;
  const cache = (c?.subpastas ?? {}) as Record<string, string>;
  if (cache[cat]) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${cache[cat]}?fields=id,trashed&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (r.ok && !(await r.json()).trashed) return cache[cat];
  }
  const nome = SUBPASTAS[cat];
  const q = `name = '${nome}' and '${pai}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const busca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  let id = (await busca.json()).files?.[0]?.id as string | undefined;
  if (!id) {
    const r = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [pai] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("Não consegui criar a pasta no Drive: " + (j.error?.message ?? r.status));
    id = j.id as string;
  }
  await sql`update google_conexao set subpastas = subpastas || ${JSON.stringify({ [cat]: id })}::jsonb where id = 1`;
  return id;
}

/** Cria as três subpastas (usado ao conectar e no botão de verificar). */
export async function prepararSubpastas() {
  const { access, pasta } = await acesso();
  for (const cat of Object.keys(SUBPASTAS) as Categoria[]) await subpasta(access, pasta, cat);
}

/** Envia um arquivo para a subpasta da categoria e devolve o id dele no Drive. */
export async function enviarArquivo(nome: string, mime: string, dados: ArrayBuffer, cat: Categoria) {
  const { access, pasta: principal } = await acesso();
  const pasta = await subpasta(access, principal, cat);
  const limite = "imel" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nome, parents: pasta ? [pasta] : undefined });
  const corpo = new Blob([
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`,
    new Uint8Array(dados),
    `\r\n--${limite}--`,
  ]);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": `multipart/related; boundary=${limite}` },
    body: corpo,
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Falha ao enviar para o Drive: " + (j.error?.message ?? r.status));
  return j.id as string;
}

export async function baixarArquivo(driveId: string) {
  const { access } = await acesso();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!r.ok) throw new Error("Arquivo não encontrado no Drive");
  return r;
}

export async function apagarArquivo(driveId: string) {
  const { access } = await acesso();
  // Manda para a lixeira do Drive (dá para recuperar por 30 dias).
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

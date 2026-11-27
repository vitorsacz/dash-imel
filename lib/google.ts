// Integração com o Google Drive usando só fetch (sem SDK).
// Escopo drive.file: o app só enxerga os arquivos e a pasta que ele mesmo criou.
import { sql } from "./db";

export const ESCOPOS = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const NOME_PASTA = "Caixa do Som — Comprovantes";

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
  const pasta = await criarPasta(t.access_token);
  await sql`insert into google_conexao (id, refresh_token, pasta_id, email) values (1, ${t.refresh_token}, ${pasta}, ${email})
            on conflict (id) do update set refresh_token = excluded.refresh_token, pasta_id = excluded.pasta_id,
              email = excluded.email, conectado_em = now()`;
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

async function acesso() {
  const [c] = await sql`select refresh_token, pasta_id from google_conexao where id = 1`;
  if (!c) throw new Error("Google Drive ainda não conectado");
  const t = await token({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
  return { access: t.access_token, pasta: c.pasta_id as string };
}

/** Envia um arquivo para a pasta de comprovantes e devolve o id dele no Drive. */
export async function enviarArquivo(nome: string, mime: string, dados: ArrayBuffer) {
  const { access, pasta } = await acesso();
  const limite = "imel" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nome, parents: pasta ? [pasta] : undefined });
  const corpo = new Blob([
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`,
    new Uint8Array(dados),
    `\r\n--${limite}--`,
  ]);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
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
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!r.ok) throw new Error("Arquivo não encontrado no Drive");
  return r;
}

export async function apagarArquivo(driveId: string) {
  const { access } = await acesso();
  // Manda para a lixeira do Drive (dá para recuperar por 30 dias).
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

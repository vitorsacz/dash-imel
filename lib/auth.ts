// Acesso simples por PIN compartilhado: o cookie guarda um hash do PIN + segredo.
// Funciona tanto no middleware (edge) quanto no servidor (Web Crypto).
export const COOKIE = "imel_sessao"; // trocar o nome obriga todo mundo a entrar de novo
export const DURACAO_SESSAO = 60 * 60 * 12; // 12 horas

export async function tokenEsperado(): Promise<string | null> {
  const pin = process.env.APP_PIN;
  if (!pin) return null; // sem PIN configurado = acesso livre (desenvolvimento)
  const segredo = process.env.AUTH_SECRET ?? "";
  const bytes = new TextEncoder().encode(`${pin}:${segredo}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

import { NextResponse, type NextRequest } from "next/server";
import { concluirConexao } from "@/lib/google";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const volta = (msg: string) => NextResponse.redirect(`${url.origin}/?drive=${encodeURIComponent(msg)}#pagamentos`);
  const state = req.cookies.get("imel_google_state")?.value;
  if (url.searchParams.get("error")) return volta("cancelado");
  if (!state || state !== url.searchParams.get("state")) return volta("erro-seguranca");
  try {
    await concluirConexao(url.searchParams.get("code") ?? "", `${url.origin}/api/google/callback`);
  } catch (e) {
    console.error(e);
    return volta("erro");
  }
  const res = volta("ok");
  res.cookies.delete("imel_google_state");
  return res;
}

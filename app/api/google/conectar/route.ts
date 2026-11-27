import { NextResponse, type NextRequest } from "next/server";
import { googleConfigurado, urlAutorizacao } from "@/lib/google";

export async function GET(req: NextRequest) {
  if (!googleConfigurado()) {
    return new NextResponse("Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis da Vercel.", { status: 500 });
  }
  const state = crypto.randomUUID();
  const redirect = `${req.nextUrl.origin}/api/google/callback`;
  const res = NextResponse.redirect(urlAutorizacao(redirect, state));
  res.cookies.set("imel_google_state", state, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}

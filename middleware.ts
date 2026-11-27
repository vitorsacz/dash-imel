import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenEsperado } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const esperado = await tokenEsperado();
  if (!esperado) return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === esperado) return NextResponse.next();
  if (req.method !== "GET") return new NextResponse("Não autorizado", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|prestacao-de-contas|_next/static|_next/image|icon.png|logo-|icone-|favicon.ico).*)"],
};

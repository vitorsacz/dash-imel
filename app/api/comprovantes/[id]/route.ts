import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { baixarArquivo } from "@/lib/google";

// Mostra o comprovante passando pelo app (só quem entrou com a senha vê).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c] = await sql`select drive_id, nome_arquivo, mime from comprovantes where id = ${id}`;
  if (!c) return new NextResponse("Comprovante não encontrado", { status: 404 });
  try {
    const r = await baixarArquivo(c.drive_id);
    return new NextResponse(r.body, {
      headers: {
        "Content-Type": c.mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(c.nome_arquivo)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Não consegui abrir o arquivo no Drive", { status: 502 });
  }
}

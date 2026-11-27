import { NextResponse, type NextRequest } from "next/server";
import { sql, lerEstado } from "@/lib/db";
import { enviarArquivo } from "@/lib/google";
import { pagarMantenedor, sincronizarPagamento } from "@/lib/regras";

export const maxDuration = 30;
const MAX = 4 * 1024 * 1024; // a Vercel aceita até ~4,5 MB por envio
const TIPOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

const texto = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max);
const data = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

export async function POST(req: NextRequest) {
  try {
    const f = await req.formData();
    const arquivo = f.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size) return NextResponse.json({ erro: "Escolha o arquivo do comprovante" }, { status: 400 });
    if (arquivo.size > MAX) return NextResponse.json({ erro: "Arquivo muito grande (máx. 4 MB). Tire um print ou foto menor." }, { status: 400 });
    if (!TIPOS.test(arquivo.type)) return NextResponse.json({ erro: "Envie uma foto (JPG/PNG) ou PDF" }, { status: 400 });

    const pessoa = texto(f.get("pessoa"), 80);
    if (!pessoa) return NextResponse.json({ erro: "Diga de quem é o comprovante" }, { status: 400 });
    const encomendaId = texto(f.get("encomendaId"), 40) || null;
    const mantenedorId = texto(f.get("mantenedorId"), 40) || null;
    const valorNum = Number(String(f.get("valor") ?? "").replace(",", "."));
    const valor = Number.isFinite(valorNum) && valorNum > 0 ? Math.round(valorNum * 100) / 100 : null;
    const hoje = data(f.get("hoje"));
    const referencia = texto(f.get("referencia"));

    const ext = arquivo.name.includes(".") ? arquivo.name.split(".").pop()!.toLowerCase().slice(0, 5) : arquivo.type.split("/")[1];
    const nome = `${hoje ?? new Date().toISOString().slice(0, 10)} - ${pessoa}${referencia ? " - " + referencia : ""}.${ext}`.replace(/[\\/:*?"<>|]/g, "-");
    const driveId = await enviarArquivo(nome, arquivo.type, await arquivo.arrayBuffer());

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await sql`insert into comprovantes (id, pessoa, referencia, valor, encomenda_id, mantenedor_id, drive_id, nome_arquivo, mime, tamanho, enviado_por)
              values (${id}, ${pessoa}, ${referencia}, ${valor}, ${encomendaId}, ${mantenedorId}, ${driveId}, ${nome}, ${arquivo.type},
                      ${arquivo.size}, ${texto(f.get("quem"), 60)})`;

    if (f.get("marcarPago") === "1") {
      if (encomendaId) {
        const [e] = await sql`update encomendas set pago = true where id = ${encomendaId} and not pago returning id`;
        if (e) await sincronizarPagamento(encomendaId, true, hoje);
      }
      if (mantenedorId) await pagarMantenedor(mantenedorId, hoje, texto(f.get("mes"), 20));
    }
    return NextResponse.json({ estado: await lerEstado() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao enviar" }, { status: 500 });
  }
}

import { after, NextResponse, type NextRequest } from "next/server";
import { sql, lerEstado } from "@/lib/db";
import { enviarArquivo, type Categoria } from "@/lib/google";
import { sincronizarEmSegundoPlano } from "@/lib/planilha";
import { pagarMantenedor, sincronizarPagamento } from "@/lib/regras";

export const maxDuration = 30;
const MAX = 4 * 1024 * 1024; // a Vercel aceita até ~4,5 MB por envio
const TIPOS = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
const CATEGORIAS: Categoria[] = ["encomenda", "doacao", "compra"];

const texto = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max);
const data = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const erro = (msg: string) => NextResponse.json({ erro: msg }, { status: 400 });

export async function POST(req: NextRequest) {
  try {
    const f = await req.formData();
    const arquivo = f.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size) return erro("Escolha o arquivo do comprovante");
    if (arquivo.size > MAX) return erro("Arquivo muito grande (máx. 4 MB). Tire um print ou foto menor.");
    if (!TIPOS.test(arquivo.type)) return erro("Envie uma foto (JPG/PNG) ou PDF");

    const categoria = texto(f.get("categoria"), 20) as Categoria;
    if (!CATEGORIAS.includes(categoria)) return erro("Escolha o tipo do comprovante");
    const pessoa = texto(f.get("pessoa"), 80);
    if (!pessoa) return erro(categoria === "compra" ? "Diga onde foi a compra ou quem comprou" : "Diga de quem é o comprovante");
    const encomendaId = categoria === "encomenda" ? texto(f.get("encomendaId"), 40) || null : null;
    const mantenedorId = categoria === "doacao" ? texto(f.get("mantenedorId"), 40) || null : null;
    if (categoria === "encomenda" && !encomendaId) return erro("Escolha a encomenda");
    const valorNum = Number(String(f.get("valor") ?? "").replace(",", "."));
    const valor = Number.isFinite(valorNum) && valorNum > 0 ? Math.round(valorNum * 100) / 100 : null;
    const hoje = data(f.get("hoje"));
    const referencia = texto(f.get("referencia"));
    const quem = texto(f.get("quem"), 60);
    const lancar = f.get("marcarPago") === "1";
    if (lancar && categoria !== "encomenda" && !mantenedorId && !valor) return erro("Informe o valor para lançar no caixa");
    if (categoria === "compra" && lancar && !referencia) return erro("Descreva o que foi comprado");

    const ext = arquivo.name.includes(".") ? arquivo.name.split(".").pop()!.toLowerCase().slice(0, 5) : arquivo.type.split("/")[1];
    const nome = `${hoje ?? new Date().toISOString().slice(0, 10)} - ${pessoa}${referencia ? " - " + referencia : ""}.${ext}`
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 180);
    const driveId = await enviarArquivo(nome, arquivo.type, await arquivo.arrayBuffer(), categoria);

    // Registra no caixa, se pedido
    let lancamentoId: string | null = null;
    if (lancar) {
      if (encomendaId) {
        const [e] = await sql`update encomendas set pago = true where id = ${encomendaId} and not pago returning id`;
        if (e) await sincronizarPagamento(encomendaId, true, hoje);
      } else if (mantenedorId) {
        await pagarMantenedor(mantenedorId, hoje, texto(f.get("mes"), 20));
      } else if (valor) {
        lancamentoId = novoId();
        const tipo = categoria === "compra" ? "gasto" : "doacao";
        await sql`insert into lancamentos (id, tipo, data, valor, descricao, pessoa, quem)
                  values (${lancamentoId}, ${tipo}, coalesce(${hoje}::date, current_date), ${valor},
                          ${categoria === "compra" ? `${referencia}${pessoa ? " (" + pessoa + ")" : ""}` : referencia},
                          ${categoria === "doacao" ? pessoa : ""}, ${quem})`;
      }
    }

    await sql`insert into comprovantes (id, categoria, pessoa, referencia, valor, encomenda_id, mantenedor_id, lancamento_id,
                                        drive_id, nome_arquivo, mime, tamanho, enviado_por)
              values (${novoId()}, ${categoria}, ${pessoa}, ${referencia}, ${valor}, ${encomendaId}, ${mantenedorId}, ${lancamentoId},
                      ${driveId}, ${nome}, ${arquivo.type}, ${arquivo.size}, ${quem})`;

    after(sincronizarEmSegundoPlano);
    return NextResponse.json({ estado: await lerEstado() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao enviar" }, { status: 500 });
  }
}

// Espelha o banco na planilha do Google Sheets (GOOGLE_SHEET_ID).
// Cada aba é reescrita por inteiro a cada mudança: o banco é a fonte da verdade,
// a planilha é para ver, filtrar e compartilhar.
import { sql, lerEstado } from "./db";
import { acesso, PLANILHA_ID } from "./google";
import type { Estado } from "./types";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const ABAS = ["Resumo", "Lançamentos", "Encomendas", "Mantenedores", "Comprovantes"] as const;
type Celula = string | number | boolean | null;

const br = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "");
// Evita que um texto digitado vire fórmula na planilha
const txt = (v: unknown) => {
  const s = String(v ?? "");
  return /^[=+\-@]/.test(s) ? "'" + s : s;
};
const NOME_TIPO = { venda: "Venda", gasto: "Gasto", doacao: "Doação" } as const;
const NOME_STATUS = { afazer: "A fazer", pronta: "Pronta", entregue: "Entregue" } as const;

async function api(access: string, caminho: string, metodo = "GET", corpo?: unknown) {
  const r = await fetch(`${API}/${PLANILHA_ID}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Google Sheets: " + (j.error?.message ?? r.status));
  return j;
}

function montar(E: Estado, driveIds: Record<string, string>, base: string): Record<(typeof ABAS)[number], Celula[][]> {
  const tot = { venda: 0, doacao: 0, gasto: 0 };
  for (const l of E.lancamentos) tot[l.tipo] += l.valor;
  const lucro = tot.venda + tot.doacao - tot.gasto;
  const meta = E.config.metaTotal;
  const ativos = E.mantenedores.filter((m) => m.ativo);
  const aReceber = E.encomendas.filter((e) => !e.pago).reduce((a, e) => a + e.itens.reduce((s, i) => s + i.qtd * i.preco, 0), 0);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return {
    Resumo: [
      ["Caixa do Som — IMEL Mairiporã", ""],
      ["Atualizado em", agora],
      ["", ""],
      ["Vendas", tot.venda],
      ["Doações", tot.doacao],
      ["Gastos com insumos", tot.gasto],
      ["Lucro (vai para as parcelas)", lucro],
      ["Meta total", meta],
      ["Falta para a meta", Math.max(meta - lucro, 0)],
      ["% da meta", meta ? lucro / meta : 0],
      ["Parcela mensal", E.config.metaMes],
      ["Mantenedores ativos / mês", ativos.reduce((a, m) => a + m.valor, 0)],
      ["Encomendas a receber", aReceber],
    ],
    Lançamentos: [
      ["Data", "Tipo", "Doce", "Qtd", "Preço", "Valor", "Cliente / Pessoa", "Descrição", "Lançado por", "Origem"],
      ...[...E.lancamentos].sort((a, b) => a.data.localeCompare(b.data)).map((l) => [
        br(l.data), NOME_TIPO[l.tipo], txt(l.produtoNome ?? ""), l.qtd ?? "", l.preco ?? "",
        l.tipo === "gasto" ? -l.valor : l.valor, txt(l.cliente || l.pessoa), txt(l.descricao), txt(l.quem),
        l.encomendaId ? "Encomenda" : l.mantenedorId ? "Mantenedor" : "Manual",
      ]),
    ],
    Encomendas: [
      ["Cliente", "Contato", "Pedido", "Valor", "Entrega", "Situação", "Pago?", "Comprovante", "Observação"],
      ...E.encomendas.map((e) => {
        const c = E.comprovantes.find((x) => x.encomendaId === e.id);
        return [
          txt(e.cliente), txt(e.contato), txt(e.itens.map((i) => `${i.qtd}× ${i.nome}`).join(", ")),
          e.itens.reduce((s, i) => s + i.qtd * i.preco, 0), br(e.entrega), NOME_STATUS[e.status], e.pago ? "Sim" : "Não",
          c && driveIds[c.id] ? `https://drive.google.com/file/d/${driveIds[c.id]}/view` : "", txt(e.obs),
        ];
      }),
    ],
    Mantenedores: [
      ["Nome", "Valor por mês", "Dia combinado", "Contato", "Situação"],
      ...E.mantenedores.map((m) => [txt(m.nome), m.valor, m.dia ?? "", txt(m.contato), m.ativo ? "Ativo" : "Pausado"]),
    ],
    Comprovantes: [
      ["Enviado em", "De quem", "Referente a", "Valor", "Enviado por", "Arquivo no Drive", "Abrir pelo app"],
      ...E.comprovantes.map((c) => [
        new Date(c.criado).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), txt(c.pessoa), txt(c.referencia), c.valor ?? "",
        txt(c.enviadoPor), driveIds[c.id] ? `https://drive.google.com/file/d/${driveIds[c.id]}/view` : "", `${base}/api/comprovantes/${c.id}`,
      ]),
    ],
  };
}

export function planilhaAtiva() {
  return !!PLANILHA_ID;
}

/** Reescreve todas as abas. Cria as que faltarem. */
export async function sincronizarPlanilha() {
  if (!PLANILHA_ID) return;
  const [conectado] = await sql`select 1 from google_conexao where id = 1`;
  if (!conectado) return;
  const { access } = await acesso();
  const E = await lerEstado();
  const ids = await sql`select id, drive_id from comprovantes`;
  const driveIds = Object.fromEntries(ids.map((r) => [r.id, r.drive_id]));
  const base = process.env.APP_URL || "https://imel.vitorsantos.dev.br";
  const dados = montar(E, driveIds, base);

  const meta = await api(access, "?fields=sheets.properties(title,sheetId)");
  const existentes = new Map<string, number>(meta.sheets.map((s: { properties: { title: string; sheetId: number } }) => [s.properties.title, s.properties.sheetId]));
  const faltam = ABAS.filter((a) => !existentes.has(a));
  if (faltam.length) {
    const r = await api(access, ":batchUpdate", "POST", { requests: faltam.map((title) => ({ addSheet: { properties: { title } } })) });
    for (const rep of r.replies) existentes.set(rep.addSheet.properties.title, rep.addSheet.properties.sheetId);
  }

  await api(access, "/values:batchClear", "POST", { ranges: ABAS.map((a) => `'${a}'!A:Z`) });
  await api(access, "/values:batchUpdate", "POST", {
    valueInputOption: "USER_ENTERED",
    data: ABAS.map((a) => ({ range: `'${a}'!A1`, values: dados[a] })),
  });

  // Cabeçalho em negrito + linha congelada (só formatação, barato)
  await api(access, ":batchUpdate", "POST", {
    requests: ABAS.flatMap((a) => {
      const sheetId = existentes.get(a)!;
      return [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      ];
    }),
  });
}

/** Sincroniza sem travar a resposta para o usuário; erros vão só para o log. */
export async function sincronizarEmSegundoPlano() {
  try {
    await sincronizarPlanilha();
  } catch (e) {
    console.error("Planilha:", e);
  }
}

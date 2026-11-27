import type { Encomenda, Lancamento } from "./types";

export const brl = (n: number) =>
  (+n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");

export const num = (v: string) => {
  let s = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export const hoje = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesLbl = (k: string) => {
  const [y, m] = k.split("-");
  return MESES[+m - 1] + "/" + y;
};
export const dataBR = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "");

export const NOME_TIPO = { venda: "Venda", gasto: "Gasto", doacao: "Doação" } as const;
export const NOME_STATUS = { afazer: "A fazer", pronta: "Pronta", entregue: "Entregue" } as const;

export const descLanc = (l: Lancamento) =>
  l.tipo === "venda"
    ? `${l.qtd}× ${l.produtoNome} a ${brl(l.preco ?? 0)}${l.cliente ? " — " + l.cliente : ""}`
    : l.tipo === "doacao"
      ? (l.pessoa || "Anônimo") + (l.descricao ? " — " + l.descricao : "")
      : l.descricao || "Gasto";

export const encTotal = (e: Pick<Encomenda, "itens">) => e.itens.reduce((a, i) => a + i.qtd * i.preco, 0);
export const encItens = (e: Pick<Encomenda, "itens">) => e.itens.map((i) => `${i.qtd}× ${i.nome}`).join(", ");

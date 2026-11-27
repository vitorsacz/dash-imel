"use client";

import type { Estado } from "./types";
import { brl, dataBR, descLanc, encItens, encTotal, hoje, mesLbl, NOME_STATUS, NOME_TIPO } from "./format";

export function calcular(E: Estado) {
  const t = { venda: 0, doacao: 0, gasto: 0, qv: 0, qd: 0, qg: 0, receita: 0, lucro: 0, man: 0, manQ: 0 };
  const mes: Record<string, { venda: number; doacao: number; gasto: number }> = {};
  const prod: Record<string, { q: number; v: number }> = {};
  for (const l of E.lancamentos) {
    const k = l.data.slice(0, 7);
    mes[k] ??= { venda: 0, doacao: 0, gasto: 0 };
    mes[k][l.tipo] += l.valor;
    t[l.tipo] += l.valor;
    if (l.tipo === "venda") {
      t.qv++;
      const p = l.produtoNome || "?";
      prod[p] ??= { q: 0, v: 0 };
      prod[p].q += l.qtd || 0;
      prod[p].v += l.valor;
    } else if (l.tipo === "doacao") t.qd++;
    else t.qg++;
  }
  t.receita = t.venda + t.doacao;
  t.lucro = t.receita - t.gasto;
  const meses = Object.keys(mes)
    .sort()
    .map((k) => ({ k, ...mes[k], lucro: mes[k].venda + mes[k].doacao - mes[k].gasto }));
  const ativos = E.mantenedores.filter((m) => m.ativo);
  t.man = ativos.reduce((a, m) => a + m.valor, 0);
  t.manQ = ativos.length;
  return { t, meses, prod };
}

const CAB = ["Data", "Tipo", "Descrição", "Valor", "Lançado por"];
const linhas = (E: Estado) =>
  [...E.lancamentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((l) => [dataBR(l.data), NOME_TIPO[l.tipo], descLanc(l), (l.tipo === "gasto" ? -l.valor : l.valor).toFixed(2).replace(".", ","), l.quem]);

function baixar(nome: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function baixarCSV(E: Estado) {
  const q = (s: string) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const csv = "﻿" + [CAB, ...linhas(E)].map((r) => r.map(q).join(";")).join("\n");
  baixar(`caixa-do-som-${hoje()}.csv`, new Blob([csv], { type: "text/csv" }));
}

export function textoPlanilha(E: Estado) {
  return [CAB, ...linhas(E)].map((r) => r.join("\t")).join("\n");
}

async function imagem(url: string) {
  const b = await (await fetch(url)).blob();
  return new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsDataURL(b);
  });
}

export async function baixarPDF(E: Estado) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { t, meses, prod } = calcular(E);
  const { metaTotal: mt, metaMes: mm } = E.config;
  const d = new jsPDF();
  const C: [number, number, number] = [0, 58, 112];
  try {
    d.addImage(await imagem("/logo-claro.png"), "PNG", 14, 8, 52, 18);
  } catch {}
  d.setFillColor(255, 127, 50);
  d.rect(14, 30, 182, 1.2, "F");
  d.setTextColor(...C);
  d.setFontSize(16);
  d.text("Caixa do Som — relatório de arrecadação", 196, 16, { align: "right" });
  d.setFontSize(9);
  d.setTextColor(90);
  d.text(`Gerado em ${dataBR(hoje())} · Meta: ${brl(mt)} (parcelas de ${brl(mm)}/mês)`, 196, 23, { align: "right" });
  const base = { headStyles: { fillColor: C }, margin: { left: 14, right: 14 } };
  const ult = () => ((d as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40) + 8;

  autoTable(d, {
    ...base, startY: 38,
    head: [["Resumo", "Valor"]],
    body: [
      ["Vendas", brl(t.venda)], ["Doações", brl(t.doacao)], ["Total arrecadado", brl(t.receita)],
      ["Gastos com insumos", brl(t.gasto)], ["Lucro (vai para as parcelas)", brl(t.lucro)],
      ["Falta para a meta", brl(Math.max(mt - t.lucro, 0))], ["Mantenedores ativos / mês", `${brl(t.man)} (${t.manQ})`],
    ],
    columnStyles: { 1: { halign: "right" } },
  });
  if (meses.length)
    autoTable(d, {
      ...base, startY: ult(),
      head: [["Mês", "Vendas", "Doações", "Gastos", "Lucro"]],
      body: meses.map((m) => [mesLbl(m.k), brl(m.venda), brl(m.doacao), brl(m.gasto), brl(m.lucro)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
  const pk = Object.keys(prod);
  if (pk.length)
    autoTable(d, {
      ...base, startY: ult(),
      head: [["Doce", "Qtd vendida", "Receita"]],
      body: pk.map((p) => [p, String(prod[p].q), brl(prod[p].v)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
  const pend = E.encomendas.filter((e) => e.status !== "entregue" || !e.pago);
  if (pend.length)
    autoTable(d, {
      ...base, startY: ult(),
      head: [["Encomenda pendente", "Pedido", "Entrega", "Valor", "Situação"]],
      body: pend.map((e) => [e.cliente, encItens(e), dataBR(e.entrega), brl(encTotal(e)), `${NOME_STATUS[e.status]} · ${e.pago ? "pago" : "não pago"}`]),
      columnStyles: { 3: { halign: "right" } },
    });
  if (E.lancamentos.length)
    autoTable(d, {
      ...base, startY: ult(),
      head: [["Data", "Tipo", "Descrição", "Valor"]],
      body: [...E.lancamentos].sort((a, b) => a.data.localeCompare(b.data)).map((l) => [dataBR(l.data), NOME_TIPO[l.tipo], descLanc(l), (l.tipo === "gasto" ? "− " : "") + brl(l.valor)]),
      columnStyles: { 3: { halign: "right" } },
    });
  if (E.mantenedores.length)
    autoTable(d, {
      ...base, startY: ult(),
      head: [["Mantenedor", "Por mês", "Situação"]],
      body: E.mantenedores.map((m) => [m.nome, brl(m.valor), m.ativo ? "Ativo" : "Pausado"]),
      columnStyles: { 1: { halign: "right" } },
    });
  baixar(`relatorio-caixa-do-som-${hoje()}.pdf`, d.output("blob"));
}

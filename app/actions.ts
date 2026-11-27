"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sincronizarEmSegundoPlano, sincronizarPlanilha } from "@/lib/planilha";
import { sql, lerEstado } from "@/lib/db";
import { sincronizarPagamento, pagarMantenedor } from "@/lib/regras";
import { apagarArquivo, prepararSubpastas } from "@/lib/google";
import { COOKIE, DURACAO_SESSAO, tokenEsperado } from "@/lib/auth";
import type { Estado, Item, Status, Tipo } from "@/lib/types";

/* ---------- acesso ---------- */
async function exigirAcesso() {
  const esperado = await tokenEsperado();
  if (!esperado) return;
  const jar = await cookies();
  if (jar.get(COOKIE)?.value !== esperado) throw new Error("Acesso expirado. Entre de novo.");
}

export async function entrar(_: unknown, form: FormData): Promise<{ erro?: string }> {
  const pin = String(form.get("pin") ?? "").trim();
  if (!process.env.APP_PIN || pin !== process.env.APP_PIN) return { erro: "Senha incorreta" };
  const jar = await cookies();
  jar.set(COOKIE, (await tokenEsperado())!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURACAO_SESSAO,
    path: "/",
  });
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/* ---------- utilidades ---------- */
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dinheiro = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n < 0) throw new Error("Valor inválido");
  return n;
};
const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const dataValida = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

async function feito(): Promise<Estado> {
  return lerEstado();
}

export type Resposta = { estado?: Estado; erro?: string };

async function seguro(fn: () => Promise<Estado>, planilha = true): Promise<Resposta> {
  try {
    const estado = await fn();
    if (planilha) after(sincronizarEmSegundoPlano);
    return { estado };
  } catch (e) {
    console.error(e);
    return { erro: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

async function _atualizar(): Promise<Estado> {
  await exigirAcesso();
  return lerEstado();
}

/* ---------- produtos ---------- */
async function _salvarProduto(p: { id?: string; nome: string; preco: number }) {
  await exigirAcesso();
  const nome = texto(p.nome, 80);
  if (!nome) throw new Error("Informe o nome");
  const preco = dinheiro(p.preco);
  await sql`insert into produtos (id, nome, preco) values (${p.id || id()}, ${nome}, ${preco})
            on conflict (id) do update set nome = excluded.nome, preco = excluded.preco`;
  return feito();
}

async function _excluirProduto(pid: string) {
  await exigirAcesso();
  // Mantém o histórico: só esconde o produto da lista.
  await sql`update produtos set ativo = false where id = ${pid}`;
  return feito();
}

/* ---------- lançamentos ---------- */
async function _novoLancamento(l: {
  tipo: Tipo; data: string; produtoId?: string; qtd?: number; valor?: number;
  descricao?: string; pessoa?: string; cliente?: string; quem?: string;
}) {
  await exigirAcesso();
  if (!["venda", "gasto", "doacao"].includes(l.tipo)) throw new Error("Tipo inválido");
  const data = dataValida(l.data);
  if (l.tipo === "venda") {
    const [p] = await sql`select id, nome, preco::float8 as preco from produtos where id = ${l.produtoId ?? ""}`;
    const qtd = Math.floor(Number(l.qtd));
    if (!p || !(qtd >= 1)) throw new Error("Escolha o doce e a quantidade");
    const valor = Math.round(qtd * p.preco * 100) / 100;
    await sql`insert into lancamentos (id, tipo, data, valor, produto_id, produto_nome, preco, qtd, cliente, quem)
              values (${id()}, 'venda', coalesce(${data}::date, current_date), ${valor}, ${p.id}, ${p.nome}, ${p.preco}, ${qtd},
                      ${texto(l.cliente)}, ${texto(l.quem)})`;
  } else {
    const valor = dinheiro(l.valor);
    if (valor <= 0) throw new Error("Informe o valor");
    const descricao = texto(l.descricao);
    if (l.tipo === "gasto" && !descricao) throw new Error("Descreva o gasto");
    await sql`insert into lancamentos (id, tipo, data, valor, descricao, pessoa, quem)
              values (${id()}, ${l.tipo}, coalesce(${data}::date, current_date), ${valor}, ${descricao},
                      ${l.tipo === "doacao" ? texto(l.pessoa) : ""}, ${texto(l.quem)})`;
  }
  return feito();
}

async function _excluirLancamento(lid: string) {
  await exigirAcesso();
  await sql`delete from lancamentos where id = ${lid}`;
  return feito();
}

/* ---------- encomendas ---------- */
async function _novaEncomenda(e: {
  cliente: string; contato?: string; itens: { produtoId: string; qtd: number }[];
  entrega?: string; obs?: string; pago?: boolean; hoje: string;
}) {
  await exigirAcesso();
  const cliente = texto(e.cliente, 80);
  if (!cliente) throw new Error("Informe o cliente");
  const produtos = await sql`select id, nome, preco::float8 as preco from produtos`;
  const itens: Item[] = (e.itens ?? [])
    .map((i) => {
      const p = produtos.find((x) => x.id === i.produtoId);
      const qtd = Math.floor(Number(i.qtd));
      return p && qtd >= 1 ? { produtoId: p.id, nome: p.nome, preco: p.preco, qtd } : null;
    })
    .filter((i): i is Item => i !== null);
  if (!itens.length) throw new Error("Adicione pelo menos um doce");
  const eid = id();
  await sql`insert into encomendas (id, cliente, contato, itens, entrega, obs, pago)
            values (${eid}, ${cliente}, ${texto(e.contato)}, ${JSON.stringify(itens)}::jsonb,
                    ${dataValida(e.entrega)}::date, ${texto(e.obs)}, ${!!e.pago})`;
  if (e.pago) await sincronizarPagamento(eid, true, dataValida(e.hoje));
  return feito();
}

async function _mudarStatus(eid: string, status: Status) {
  await exigirAcesso();
  if (!["afazer", "pronta", "entregue"].includes(status)) throw new Error("Situação inválida");
  await sql`update encomendas set status = ${status} where id = ${eid}`;
  return feito();
}

async function _marcarPago(eid: string, pago: boolean, hoje: string) {
  await exigirAcesso();
  await sql`update encomendas set pago = ${pago} where id = ${eid}`;
  await sincronizarPagamento(eid, pago, dataValida(hoje));
  return feito();
}

async function _excluirEncomenda(eid: string) {
  await exigirAcesso();
  await sql`delete from encomendas where id = ${eid}`; // lançamentos ligados saem em cascata
  return feito();
}

/* ---------- mantenedores ---------- */
async function _novoMantenedor(m: { nome: string; valor: number; contato?: string; dia?: number | null }) {
  await exigirAcesso();
  const nome = texto(m.nome, 80);
  if (!nome) throw new Error("Informe o nome");
  const dia = m.dia && m.dia >= 1 && m.dia <= 31 ? Math.floor(m.dia) : null;
  await sql`insert into mantenedores (id, nome, valor, contato, dia)
            values (${id()}, ${nome}, ${dinheiro(m.valor)}, ${texto(m.contato)}, ${dia})`;
  return feito();
}

async function _alternarMantenedor(mid: string) {
  await exigirAcesso();
  await sql`update mantenedores set ativo = not ativo where id = ${mid}`;
  return feito();
}

async function _excluirMantenedor(mid: string) {
  await exigirAcesso();
  await sql`delete from mantenedores where id = ${mid}`;
  return feito();
}

async function _registrarPagamentoMantenedor(mid: string, hoje: string, mesLabel: string) {
  await exigirAcesso();
  await pagarMantenedor(mid, dataValida(hoje), texto(mesLabel, 20));
  return feito();
}

/* ---------- comprovantes ---------- */
async function _excluirComprovante(cid: string) {
  await exigirAcesso();
  const [c] = await sql`delete from comprovantes where id = ${cid} returning drive_id`;
  if (c) {
    try {
      await apagarArquivo(c.drive_id);
    } catch (e) {
      console.error("Drive:", e);
    }
  }
  return feito();
}

/* ---------- metas ---------- */
async function _salvarMetas(metaTotal: number, metaMes: number) {
  await exigirAcesso();
  await sql`update config set meta_total = ${dinheiro(metaTotal) || 4200}, meta_mes = ${dinheiro(metaMes) || 450} where id = 1`;
  return feito();
}

/* ---------- ações expostas ao navegador (erros viram mensagens) ---------- */
export async function atualizar(...a: Parameters<typeof _atualizar>): Promise<Resposta> { return seguro(() => _atualizar(...a), false); }
export async function salvarProduto(...a: Parameters<typeof _salvarProduto>): Promise<Resposta> { return seguro(() => _salvarProduto(...a)); }
export async function excluirProduto(...a: Parameters<typeof _excluirProduto>): Promise<Resposta> { return seguro(() => _excluirProduto(...a)); }
export async function novoLancamento(...a: Parameters<typeof _novoLancamento>): Promise<Resposta> { return seguro(() => _novoLancamento(...a)); }
export async function excluirLancamento(...a: Parameters<typeof _excluirLancamento>): Promise<Resposta> { return seguro(() => _excluirLancamento(...a)); }
export async function novaEncomenda(...a: Parameters<typeof _novaEncomenda>): Promise<Resposta> { return seguro(() => _novaEncomenda(...a)); }
export async function mudarStatus(...a: Parameters<typeof _mudarStatus>): Promise<Resposta> { return seguro(() => _mudarStatus(...a)); }
export async function marcarPago(...a: Parameters<typeof _marcarPago>): Promise<Resposta> { return seguro(() => _marcarPago(...a)); }
export async function excluirEncomenda(...a: Parameters<typeof _excluirEncomenda>): Promise<Resposta> { return seguro(() => _excluirEncomenda(...a)); }
export async function novoMantenedor(...a: Parameters<typeof _novoMantenedor>): Promise<Resposta> { return seguro(() => _novoMantenedor(...a)); }
export async function alternarMantenedor(...a: Parameters<typeof _alternarMantenedor>): Promise<Resposta> { return seguro(() => _alternarMantenedor(...a)); }
export async function excluirMantenedor(...a: Parameters<typeof _excluirMantenedor>): Promise<Resposta> { return seguro(() => _excluirMantenedor(...a)); }
export async function registrarPagamentoMantenedor(...a: Parameters<typeof _registrarPagamentoMantenedor>): Promise<Resposta> { return seguro(() => _registrarPagamentoMantenedor(...a)); }
export async function salvarMetas(...a: Parameters<typeof _salvarMetas>): Promise<Resposta> { return seguro(() => _salvarMetas(...a)); }
export async function excluirComprovante(...a: Parameters<typeof _excluirComprovante>): Promise<Resposta> { return seguro(() => _excluirComprovante(...a)); }

async function _sincronizarAgora() {
  await exigirAcesso();
  await prepararSubpastas(); // garante as 3 pastas no Drive
  await sincronizarPlanilha();
  return feito();
}
export async function sincronizarAgora(): Promise<Resposta> { return seguro(() => _sincronizarAgora(), false); }

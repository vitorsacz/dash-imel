"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as A from "./actions";
import type { Resposta } from "./actions";
import type { Encomenda, Estado, Status, Tipo } from "@/lib/types";
import { brl, dataBR, descLanc, encItens, encTotal, hoje, mesLbl, num, NOME_STATUS, NOME_TIPO } from "@/lib/format";
import { baixarCSV, baixarPDF, calcular, textoPlanilha } from "@/lib/relatorio";

const ABAS = [
  ["painel", "Painel"], ["encomendas", "Encomendas"], ["lancar", "Lançar"], ["produtos", "Produtos"], ["mantenedores", "Mantenedores"],
] as const;
type Aba = (typeof ABAS)[number][0];

export default function Painel({ inicial, temLogin }: { inicial: Estado; temLogin: boolean }) {
  const [E, setE] = useState(inicial);
  const [aba, setAba] = useState<Aba>("painel");
  const [aviso, setAviso] = useState("");
  const [sync, setSync] = useState("Sincronizado");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((t: string) => {
    setAviso(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAviso(""), 2400);
  }, []);

  /** Roda uma ação no servidor e atualiza a tela com o estado devolvido. */
  const run = useCallback(
    async (p: Promise<Resposta>, ok?: string) => {
      try {
        const r = await p;
        if (r.erro) {
          toast(r.erro);
          return false;
        }
        if (r.estado) setE(r.estado);
        if (ok) toast(ok);
        return true;
      } catch {
        toast("Sem conexão — tente de novo");
        return false;
      }
    },
    [toast],
  );

  // Abas pelo endereço (#encomendas etc.)
  useEffect(() => {
    const ler = () => {
      const h = location.hash.slice(1) as Aba;
      setAba(ABAS.some(([k]) => k === h) ? h : "painel");
    };
    ler();
    addEventListener("hashchange", ler);
    return () => removeEventListener("hashchange", ler);
  }, []);

  // Atualiza a cada 20 s para ver o que as outras pessoas lançaram
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await A.atualizar();
        if (r.estado) {
          setE(r.estado);
          setSync("Sincronizado");
        } else setSync("Erro ao sincronizar");
      } catch {
        setSync("Sem conexão");
      }
    };
    const id = setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const { t, meses, prod } = useMemo(() => calcular(E), [E]);
  const { metaTotal: mt, metaMes: mm } = E.config;
  const km = hoje().slice(0, 7);
  const cur = meses.find((m) => m.k === km)?.lucro ?? 0;
  const pct = (v: number, m: number) => `${Math.max(0, Math.min(100, (v / m) * 100))}%`;

  return (
    <>
      <header className="band">
        <div className="wrap">
          <div className="top">
            <img className="logo" src="/logo-escuro.png" alt="Igreja Metodista Livre Mairiporã" />
            <div className="acoes">
              <span className="pill">{sync}</span>
              {temLogin && (
                <button className="sair" onClick={() => A.sair()}>
                  Sair
                </button>
              )}
            </div>
          </div>
          <h1 style={{ marginTop: 18, fontSize: "clamp(24px,3.4vw,34px)" }}>Caixa do Som · subs e retornos</h1>
          <div className="hero">
            <div>
              <div className="lbl">Lucro acumulado (vendas + doações − gastos)</div>
              <div className="big">{brl(t.lucro)}</div>
              <div className="lbl">
                {t.lucro >= mt ? "Meta total alcançada — dinheiro reposto!" : `Faltam ${brl(mt - Math.max(t.lucro, 0))} para repor os ${brl(mt)}`}
              </div>
            </div>
            <div>
              <div className="meter">
                <div className="row"><span>Meta total</span><span>{brl(Math.max(t.lucro, 0))} de {brl(mt)}</span></div>
                <div className="bar"><i style={{ width: pct(t.lucro, mt) }} /></div>
              </div>
              <div className="meter">
                <div className="row"><span>Parcela de {mesLbl(km)}</span><span>{brl(cur)} de {brl(mm)}</span></div>
                <div className="bar"><i style={{ width: pct(cur, mm) }} /></div>
              </div>
            </div>
          </div>
          <nav className="tabs">
            {ABAS.map(([k, n]) => (
              <button key={k} className={aba === k ? "on" : ""} onClick={() => { location.hash = k; }}>
                {n}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="band">
        <div className="wrap">
          {aba === "painel" && <VistaPainel E={E} t={t} meses={meses} prod={prod} mm={mm} mt={mt} run={run} toast={toast} />}
          {aba === "encomendas" && <VistaEncomendas E={E} run={run} />}
          {aba === "lancar" && <VistaLancar E={E} run={run} toast={toast} />}
          {aba === "produtos" && <VistaProdutos E={E} run={run} />}
          {aba === "mantenedores" && <VistaMantenedores E={E} run={run} t={t} mm={mm} />}
        </div>
      </main>
      <div className={"toast" + (aviso ? " on" : "")} role="status">{aviso}</div>
    </>
  );
}

type Run = (p: Promise<Resposta>, ok?: string) => Promise<boolean>;
type Calc = ReturnType<typeof calcular>;

function Excluir({ onConfirm }: { onConfirm: () => void }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const id = setTimeout(() => setArmado(false), 3000);
    return () => clearTimeout(id);
  }, [armado]);
  return (
    <button className={"del sm" + (armado ? " arm" : "")} onClick={() => (armado ? onConfirm() : setArmado(true))}>
      {armado ? "Confirmar?" : "Excluir"}
    </button>
  );
}

/* ================= Painel ================= */
function VistaPainel({ E, t, meses, prod, mm, mt, run, toast }: Calc & { E: Estado; mm: number; mt: number; run: Run; toast: (s: string) => void }) {
  const [metaT, setMetaT] = useState(String(mt).replace(".", ","));
  const [metaM, setMetaM] = useState(String(mm).replace(".", ","));
  const pk = Object.keys(prod).sort((a, b) => prod[b].v - prod[a].v);
  return (
    <section>
      <div className="tiles">
        <div className="tile"><small>Vendas</small><b>{brl(t.venda)}</b><small>{t.qv} lançamento(s)</small></div>
        <div className="tile"><small>Doações</small><b>{brl(t.doacao)}</b><small>{t.qd} doação(ões)</small></div>
        <div className="tile"><small>Gastos com insumos</small><b>{brl(t.gasto)}</b><small>{t.qg} compra(s)</small></div>
        <div className="tile"><small>Mantenedores / mês</small><b>{brl(t.man)}</b><small>{t.manQ} pessoa(s) · {Math.round((t.man / mm) * 100)}% da parcela</small></div>
      </div>
      <div className="grid2">
        <div>
          <h3>Mês a mês</h3>
          {meses.length ? (
            <table className="stack">
              <thead><tr><th>Mês</th><th className="n">Vendas</th><th className="n">Doações</th><th className="n">Gastos</th><th className="n">Lucro</th></tr></thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.k}>
                    <td data-l="Mês">{mesLbl(m.k)}</td>
                    <td data-l="Vendas" className="n">{brl(m.venda)}</td>
                    <td data-l="Doações" className="n">{brl(m.doacao)}</td>
                    <td data-l="Gastos" className="n">{brl(m.gasto)}</td>
                    <td data-l="Lucro" className={"n " + (m.lucro >= mm ? "pos" : m.lucro < 0 ? "neg" : "")}>{brl(m.lucro)}{m.lucro >= mm ? " ✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Nenhum lançamento ainda. Comece pela aba Lançar.</div>}
        </div>
        <div>
          <h3>Por doce</h3>
          {pk.length ? (
            <table className="stack">
              <thead><tr><th>Doce</th><th className="n">Qtd</th><th className="n">Receita</th></tr></thead>
              <tbody>
                {pk.map((p) => (
                  <tr key={p}><td data-l="Doce">{p}</td><td data-l="Qtd" className="n">{prod[p].q}</td><td data-l="Receita" className="n">{brl(prod[p].v)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">As vendas aparecem aqui por doce.</div>}
        </div>
      </div>
      <div className="actions">
        <button onClick={() => baixarPDF(E).catch(() => toast("Não foi possível gerar o PDF"))}>Exportar relatório em PDF</button>
        <button className="ghost" onClick={() => baixarCSV(E)}>Baixar CSV (Google Sheets)</button>
        <button className="ghost" onClick={() => navigator.clipboard.writeText(textoPlanilha(E)).then(() => toast("Copiado! Cole na célula A1 da planilha"), () => toast("Não deu para copiar"))}>
          Copiar para colar na planilha
        </button>
      </div>
      <details>
        <summary>Ajustar metas</summary>
        <form className="f" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); run(A.salvarMetas(num(metaT), num(metaM)), "Metas salvas"); }}>
          <div className="two">
            <label>Valor total (R$)<input inputMode="decimal" value={metaT} onChange={(e) => setMetaT(e.target.value)} /></label>
            <label>Parcela mensal (R$)<input inputMode="decimal" value={metaM} onChange={(e) => setMetaM(e.target.value)} /></label>
          </div>
          <button>Salvar metas</button>
        </form>
      </details>
    </section>
  );
}

/* ================= Encomendas ================= */
function VistaEncomendas({ E, run }: { E: Estado; run: Run }) {
  const [filtro, setFiltro] = useState<"aberto" | "entregue" | "pagar" | "">("aberto");
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ cliente: "", contato: "", entrega: "", obs: "", pago: false });
  const [itens, setItens] = useState([{ produtoId: E.produtos[0]?.id ?? "", qtd: "1" }]);
  const [salvando, setSalvando] = useState(false);

  const E2 = E.encomendas;
  const naoPagas = E2.filter((e) => !e.pago);
  const producao: Record<string, number> = {};
  for (const e of E2.filter((e) => e.status === "afazer")) for (const i of e.itens) producao[i.nome] = (producao[i.nome] ?? 0) + i.qtd;
  const lista = E2.filter((e) => (filtro === "aberto" ? e.status !== "entregue" : filtro === "entregue" ? e.status === "entregue" : filtro === "pagar" ? !e.pago : true));
  const prox: Record<Status, [Status, string]> = { afazer: ["pronta", "Marcar pronta"], pronta: ["entregue", "Entregar"], entregue: ["afazer", "Reabrir"] };
  const totalForm = itens.reduce((a, i) => a + (E.produtos.find((p) => p.id === i.produtoId)?.preco ?? 0) * (parseInt(i.qtd) || 0), 0);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setSalvando(true);
    const ok = await run(A.novaEncomenda({ ...f, itens: itens.map((i) => ({ produtoId: i.produtoId, qtd: parseInt(i.qtd) || 0 })), hoje: hoje() }), `Encomenda de ${f.cliente} salva`);
    setSalvando(false);
    if (ok) {
      setF({ cliente: "", contato: "", entrega: "", obs: "", pago: false });
      setItens([{ produtoId: E.produtos[0]?.id ?? "", qtd: "1" }]);
    }
  }

  return (
    <section>
      <div className="tiles">
        <div className="tile"><small>A fazer</small><b>{E2.filter((e) => e.status === "afazer").length}</b><small>pedidos</small></div>
        <div className="tile"><small>Prontas p/ entregar</small><b>{E2.filter((e) => e.status === "pronta").length}</b><small>pedidos</small></div>
        <div className="tile"><small>Entregues</small><b>{E2.filter((e) => e.status === "entregue").length}</b><small>pedidos</small></div>
        <div className="tile"><small>A receber</small><b>{brl(naoPagas.reduce((a, e) => a + encTotal(e), 0))}</b><small>{naoPagas.length} sem pagamento</small></div>
      </div>
      {Object.keys(producao).length > 0 && (
        <p className="note" style={{ margin: "0 0 16px" }}>
          <b style={{ color: "var(--ink)" }}>Para produzir:</b> {Object.entries(producao).map(([n, q]) => `${q}× ${n}`).join(" · ")}
        </p>
      )}
      <details open={aberto} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
        <summary>+ Nova encomenda</summary>
        <form className="f" style={{ marginTop: 10 }} onSubmit={salvar}>
          <div className="two">
            <label>Cliente<input required placeholder="Quem pediu" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></label>
            <label>Contato<input placeholder="WhatsApp" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} /></label>
          </div>
          {itens.map((it, n) => (
            <div className="two" key={n}>
              <label>Doce
                <select value={it.produtoId} onChange={(e) => setItens(itens.map((x, j) => (j === n ? { ...x, produtoId: e.target.value } : x)))}>
                  {E.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {brl(p.preco)}</option>)}
                </select>
              </label>
              <label>Quantidade
                <input type="number" min={1} value={it.qtd} onChange={(e) => setItens(itens.map((x, j) => (j === n ? { ...x, qtd: e.target.value } : x)))} />
              </label>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost sm" onClick={() => setItens([...itens, { produtoId: E.produtos[0]?.id ?? "", qtd: "1" }])}>+ outro doce</button>
            {itens.length > 1 && <button type="button" className="ghost sm" onClick={() => setItens(itens.slice(0, -1))}>− remover último</button>}
          </div>
          <div className="two">
            <label>Entregar em<input type="date" value={f.entrega} onChange={(e) => setF({ ...f, entrega: e.target.value })} /></label>
            <label>Observação<input placeholder="Ex.: entregar no culto de domingo" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></label>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={f.pago} onChange={(e) => setF({ ...f, pago: e.target.checked })} style={{ width: 22, minHeight: 22 }} /> Já pagou
          </label>
          <div className="total">Total: {brl(totalForm)}</div>
          <button disabled={salvando}>{salvando ? "Salvando…" : "Salvar encomenda"}</button>
        </form>
      </details>
      <div className="top" style={{ margin: "18px 0 10px" }}>
        <h2 style={{ margin: 0 }}>Pedidos</h2>
        <div className="seg" style={{ width: "100%" }}>
          {([["aberto", "A entregar"], ["entregue", "Entregues"], ["pagar", "Falta pagar"], ["", "Todas"]] as const).map(([k, n]) => (
            <button type="button" key={k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{n}</button>
          ))}
        </div>
      </div>
      {lista.length ? (
        <table className="stack">
          <thead><tr><th>Cliente</th><th>Pedido</th><th>Entrega</th><th className="n">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {lista.map((e: Encomenda) => (
              <tr key={e.id}>
                <td data-l="Cliente"><b>{e.cliente}</b>{e.contato && <div className="note">{e.contato}</div>}</td>
                <td data-l="Pedido">{encItens(e)}{e.obs && <div className="note">{e.obs}</div>}</td>
                <td data-l="Entrega" style={{ whiteSpace: "nowrap" }}>{dataBR(e.entrega) || "—"}</td>
                <td data-l="Valor" className="n">{brl(encTotal(e))}</td>
                <td data-l="Situação">
                  <span className={"tag " + (e.status === "entregue" ? "t-doacao" : e.status === "pronta" ? "t-venda" : "t-gasto")}>{NOME_STATUS[e.status]}</span>{" "}
                  <span className={"tag " + (e.pago ? "t-doacao" : "t-gasto")}>{e.pago ? "Pago" : "Não pago"}</span>
                </td>
                <td data-l="" className="n" style={{ whiteSpace: "normal" }}>
                  <button className="sm" onClick={() => run(A.mudarStatus(e.id, prox[e.status][0]), prox[e.status][0] === "entregue" ? `Entregue para ${e.cliente}` : "Atualizado")}>{prox[e.status][1]}</button>{" "}
                  <button className="ghost sm" onClick={() => run(A.marcarPago(e.id, !e.pago, hoje()), e.pago ? "Pagamento desfeito" : `Pagamento de ${e.cliente} entrou nas vendas`)}>{e.pago ? "Desfazer pago" : "Recebi"}</button>{" "}
                  <Excluir onConfirm={() => run(A.excluirEncomenda(e.id), "Encomenda excluída")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">Nenhuma encomenda aqui.</div>}
    </section>
  );
}

/* ================= Lançar ================= */
function VistaLancar({ E, run, toast }: { E: Estado; run: Run; toast: (s: string) => void }) {
  const [tipo, setTipo] = useState<Tipo>("venda");
  const vazio = { produtoId: E.produtos[0]?.id ?? "", qtd: "1", valor: "", descricao: "", pessoa: "", cliente: "", data: hoje() };
  const [f, setF] = useState({ ...vazio, quem: "" });
  const [filtro, setFiltro] = useState<Tipo | "">("");
  const p = E.produtos.find((x) => x.id === f.produtoId);
  const lista = E.lancamentos.filter((l) => !filtro || l.tipo === filtro);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (tipo !== "venda" && num(f.valor) <= 0) return toast("Informe o valor");
    const ok = await run(
      A.novoLancamento({ tipo, data: f.data, produtoId: f.produtoId, qtd: parseInt(f.qtd) || 0, valor: num(f.valor), descricao: f.descricao, pessoa: f.pessoa, cliente: f.cliente, quem: f.quem }),
      "Lançado!",
    );
    if (ok) setF({ ...vazio, produtoId: f.produtoId, data: f.data, quem: f.quem });
  }

  return (
    <section>
      <h2>Novo lançamento</h2>
      <form className="f" onSubmit={salvar}>
        <div className="seg">
          {(["venda", "gasto", "doacao"] as Tipo[]).map((k) => (
            <button type="button" key={k} className={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>{NOME_TIPO[k]}</button>
          ))}
        </div>
        {tipo === "venda" ? (
          <>
            <div className="two">
              <label>Doce
                <select value={f.produtoId} onChange={(e) => setF({ ...f, produtoId: e.target.value })}>
                  {E.produtos.length ? E.produtos.map((x) => <option key={x.id} value={x.id}>{x.nome} — {brl(x.preco)}</option>) : <option value="">Cadastre um doce primeiro</option>}
                </select>
              </label>
              <label>Quantidade<input type="number" min={1} value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></label>
            </div>
            <label>Para quem vendemos (opcional)<input placeholder="Nome do cliente" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></label>
          </>
        ) : (
          <>
            {tipo === "doacao" && <label>Quem doou<input placeholder="Nome" value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })} /></label>}
            <label>Descrição<input placeholder={tipo === "gasto" ? "Ex.: leite condensado, forminhas" : "Observação (opcional)"} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
          </>
        )}
        <div className="two">
          {tipo !== "venda" && <label>Valor (R$)<input inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></label>}
          <label>Data<input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
        </div>
        <label>Quem lançou (opcional)<input placeholder="Seu nome" value={f.quem} onChange={(e) => setF({ ...f, quem: e.target.value })} /></label>
        {tipo === "venda" && p && <div className="total">Total: {brl((parseInt(f.qtd) || 0) * p.preco)}</div>}
        <button>Salvar lançamento</button>
      </form>
      <div className="top" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Histórico</h2>
        <select style={{ width: "auto" }} value={filtro} onChange={(e) => setFiltro(e.target.value as Tipo | "")}>
          <option value="">Tudo</option><option value="venda">Vendas</option><option value="gasto">Gastos</option><option value="doacao">Doações</option>
        </select>
      </div>
      {lista.length ? (
        <table className="stack">
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th className="n">Valor</th><th></th></tr></thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.id}>
                <td data-l="Data">{dataBR(l.data)}</td>
                <td data-l="Tipo"><span className={"tag t-" + l.tipo}>{NOME_TIPO[l.tipo]}</span></td>
                <td data-l="Descrição">{descLanc(l)}{l.quem && <div className="note">por {l.quem}</div>}</td>
                <td data-l="Valor" className={"n " + (l.tipo === "gasto" ? "neg" : "pos")}>{l.tipo === "gasto" ? "− " : ""}{brl(l.valor)}</td>
                <td data-l="" className="n">
                  {l.encomendaId ? <span className="note">pela encomenda</span> : <Excluir onConfirm={() => run(A.excluirLancamento(l.id), "Lançamento excluído")} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">Nada lançado por aqui ainda.</div>}
    </section>
  );
}

/* ================= Produtos ================= */
function VistaProdutos({ E, run }: { E: Estado; run: Run }) {
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  return (
    <section>
      <h2>O que estamos vendendo</h2>
      <form className="f" onSubmit={async (e) => { e.preventDefault(); if (await run(A.salvarProduto({ nome, preco: num(preco) }), `${nome} cadastrado`)) { setNome(""); setPreco(""); } }}>
        <div className="two">
          <label>Nome do doce<input required placeholder="Ex.: Maçã do amor" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label>Preço de venda (R$)<input required inputMode="decimal" placeholder="10,00" value={preco} onChange={(e) => setPreco(e.target.value)} /></label>
        </div>
        <button>Adicionar doce</button>
      </form>
      {E.produtos.length ? (
        <table className="stack">
          <thead><tr><th>Doce</th><th className="n">Preço</th><th></th></tr></thead>
          <tbody>
            {E.produtos.map((p) => (
              <tr key={p.id}>
                <td data-l="Doce">{p.nome}</td>
                <td data-l="Preço" className="n">
                  <input key={p.preco} inputMode="decimal" defaultValue={String(p.preco).replace(".", ",")} style={{ maxWidth: 110, textAlign: "right" }}
                    onBlur={(e) => { const v = num(e.target.value); if (v > 0 && v !== p.preco) run(A.salvarProduto({ id: p.id, nome: p.nome, preco: v }), "Preço atualizado"); }} />
                </td>
                <td data-l="" className="n"><Excluir onConfirm={() => run(A.excluirProduto(p.id), "Doce removido")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">Nenhum doce cadastrado.</div>}
    </section>
  );
}

/* ================= Mantenedores ================= */
function VistaMantenedores({ E, run, t, mm }: { E: Estado; run: Run; t: Calc["t"]; mm: number }) {
  const [f, setF] = useState({ nome: "", valor: "", contato: "", dia: "" });
  const km = hoje().slice(0, 7);
  const pagou = (id: string) => E.lancamentos.some((l) => l.mantenedorId === id && l.data.startsWith(km));
  return (
    <section>
      <h2>Mantenedores</h2>
      <p className="note">
        {E.mantenedores.length
          ? `${t.manQ} ativo(s) somando ${brl(t.man)} por mês — ${t.man >= mm ? "cobre a parcela inteira" : `faltam ${brl(mm - t.man)} para cobrir a parcela de ${brl(mm)}`}.`
          : "Quem topar ajudar todo mês entra aqui."}
      </p>
      <form className="f" onSubmit={async (e) => { e.preventDefault(); if (await run(A.novoMantenedor({ nome: f.nome, valor: num(f.valor), contato: f.contato, dia: parseInt(f.dia) || null }), `Obrigado, ${f.nome}!`)) setF({ nome: "", valor: "", contato: "", dia: "" }); }}>
        <div className="two">
          <label>Nome<input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
          <label>Valor por mês (R$)<input required inputMode="decimal" placeholder="50,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></label>
        </div>
        <div className="two">
          <label>Contato<input placeholder="WhatsApp" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} /></label>
          <label>Dia combinado<input type="number" min={1} max={31} placeholder="10" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></label>
        </div>
        <button>Adicionar mantenedor</button>
      </form>
      {E.mantenedores.length > 0 && (
        <table className="stack">
          <thead><tr><th>Nome</th><th className="n">Por mês</th><th>Contato</th><th>{mesLbl(km)}</th><th></th></tr></thead>
          <tbody>
            {E.mantenedores.map((m) => (
              <tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.55 }}>
                <td data-l="Nome">{m.nome}{m.dia && <div className="note">todo dia {m.dia}</div>}</td>
                <td data-l="Por mês" className="n">{brl(m.valor)}</td>
                <td data-l="Contato">{m.contato}</td>
                <td data-l={mesLbl(km)}>
                  {pagou(m.id) ? <span className="tag t-doacao">Pago</span> : (
                    <button className="sm" onClick={() => run(A.registrarPagamentoMantenedor(m.id, hoje(), mesLbl(km)), `Pagamento de ${m.nome} registrado`)}>Registrar pagamento</button>
                  )}
                </td>
                <td data-l="" className="n">
                  <button className="ghost sm" onClick={() => run(A.alternarMantenedor(m.id))}>{m.ativo ? "Pausar" : "Reativar"}</button>{" "}
                  <Excluir onConfirm={() => run(A.excluirMantenedor(m.id), "Mantenedor excluído")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

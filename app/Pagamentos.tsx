"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as A from "./actions";
import type { Resposta } from "./actions";
import type { Comprovante, Encomenda, Estado, Mantenedor } from "@/lib/types";
import { brl, dataBR, encItens, encTotal, hoje, mesLbl, num } from "@/lib/format";

type Run = (p: Promise<Resposta>, ok?: string) => Promise<boolean>;
type Alvo = { tipo: "enc" | "man" | "outro"; id: string };

/** Fotos grandes são reduzidas no próprio celular antes de enviar (limite da Vercel ~4,5 MB). */
async function prepararArquivo(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/heic" || f.type === "image/heif" || f.size < 900_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const esc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * esc);
    c.height = Math.round(bmp.height * esc);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

function Ver({ c }: { c?: Comprovante }) {
  return c ? (
    <a className="tag t-doacao link" href={`/api/comprovantes/${c.id}`} target="_blank" rel="noopener">Ver comprovante</a>
  ) : (
    <span className="tag t-gasto">Sem comprovante</span>
  );
}

export default function VistaPagamentos({ E, run }: { E: Estado; run: Run }) {
  const km = hoje().slice(0, 7);
  const formRef = useRef<HTMLFormElement>(null);
  const [alvo, setAlvo] = useState<Alvo>({ tipo: "outro", id: "" });
  const [pessoa, setPessoa] = useState("");
  const [valor, setValor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [quem, setQuem] = useState("");
  const [marcarPago, setMarcarPago] = useState(true);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const compEnc = (id: string) => E.comprovantes.find((c) => c.encomendaId === id);
  const compMan = (id: string) => E.comprovantes.find((c) => c.mantenedorId === id && new Date(c.criado).toISOString().slice(0, 7) === km);
  const manPagou = (id: string) => E.lancamentos.some((l) => l.mantenedorId === id && l.data.startsWith(km));

  const g = useMemo(() => {
    const naoPagas = E.encomendas.filter((e) => !e.pago);
    const pagasSemEntrega = E.encomendas.filter((e) => e.pago && e.status !== "entregue");
    const concluidas = E.encomendas.filter((e) => e.pago && e.status === "entregue");
    const ativos = E.mantenedores.filter((m) => m.ativo);
    const manPagos = ativos.filter((m) => manPagou(m.id));
    const manFalta = ativos.filter((m) => !manPagou(m.id));
    const pagosSemComp =
      E.encomendas.filter((e) => e.pago && !compEnc(e.id)).length + manPagos.filter((m) => !compMan(m.id)).length;
    return { naoPagas, pagasSemEntrega, concluidas, manPagos, manFalta, pagosSemComp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [E]);

  const aReceber = g.naoPagas.reduce((a, e) => a + encTotal(e), 0) + g.manFalta.reduce((a, m) => a + m.valor, 0);
  const recebido =
    E.encomendas.filter((e) => e.pago).reduce((a, e) => a + encTotal(e), 0) + g.manPagos.reduce((a, m) => a + m.valor, 0);

  function escolher(a: Alvo) {
    setAlvo(a);
    if (a.tipo === "enc") {
      const e = E.encomendas.find((x) => x.id === a.id);
      if (e) { setPessoa(e.cliente); setValor(String(encTotal(e)).replace(".", ",")); setReferencia(`Encomenda: ${encItens(e)}`); }
    } else if (a.tipo === "man") {
      const m = E.mantenedores.find((x) => x.id === a.id);
      if (m) { setPessoa(m.nome); setValor(String(m.valor).replace(".", ",")); setReferencia(`Mantenedor ${mesLbl(km)}`); }
    } else {
      setPessoa(""); setValor(""); setReferencia("");
    }
  }

  function subirPara(a: Alvo) {
    escolher(a);
    setAberto(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!arquivo) return run(Promise.resolve({ erro: "Escolha a foto ou o PDF do comprovante" }));
    setEnviando(true);
    const fd = new FormData();
    fd.set("arquivo", await prepararArquivo(arquivo));
    fd.set("pessoa", pessoa);
    fd.set("valor", String(num(valor) || ""));
    fd.set("referencia", referencia);
    fd.set("quem", quem);
    fd.set("hoje", hoje());
    fd.set("mes", mesLbl(km));
    fd.set("marcarPago", marcarPago ? "1" : "0");
    if (alvo.tipo === "enc") fd.set("encomendaId", alvo.id);
    if (alvo.tipo === "man") fd.set("mantenedorId", alvo.id);
    const p = fetch("/api/comprovantes", { method: "POST", body: fd })
      .then((r) => (r.status === 401 ? { erro: "Sessão expirada, entre de novo" } : r.json()))
      .catch(() => ({ erro: "Sem conexão — tente de novo" })) as Promise<Resposta>;
    const ok = await run(p, `Comprovante de ${pessoa} salvo no Drive`);
    setEnviando(false);
    if (ok) {
      setArquivo(null);
      formRef.current?.reset();
      escolher({ tipo: "outro", id: "" });
    }
  }

  // Mensagem ao voltar da tela de autorização do Google
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("drive");
    if (!p) return;
    const msg: Record<string, string> = {
      ok: "Google Drive conectado!", cancelado: "Conexão com o Drive cancelada",
      erro: "Não deu para conectar o Drive", "erro-seguranca": "Conexão expirou, tente de novo",
    };
    run(Promise.resolve(p === "ok" ? {} : { erro: msg[p] ?? "Erro" }), msg.ok);
    history.replaceState(null, "", "/#pagamentos");
  }, [run]);

  const linhaEnc = (e: Encomenda, acao: React.ReactNode) => (
    <tr key={e.id}>
      <td data-l="Cliente"><b>{e.cliente}</b>{e.contato && <div className="note">{e.contato}</div>}</td>
      <td data-l="Pedido">{encItens(e)}</td>
      <td data-l="Entrega" style={{ whiteSpace: "nowrap" }}>{dataBR(e.entrega) || "—"}</td>
      <td data-l="Valor" className="n">{brl(encTotal(e))}</td>
      <td data-l="" className="n" style={{ whiteSpace: "normal" }}>{acao}</td>
    </tr>
  );
  const tabelaEnc = (lista: Encomenda[], acao: (e: Encomenda) => React.ReactNode, vazio: string) =>
    lista.length ? (
      <table className="stack">
        <thead><tr><th>Cliente</th><th>Pedido</th><th>Entrega</th><th className="n">Valor</th><th></th></tr></thead>
        <tbody>{lista.map((e) => linhaEnc(e, acao(e)))}</tbody>
      </table>
    ) : <div className="empty">{vazio}</div>;

  const podeSubir = E.drive.conectado;
  const botaoSubir = (a: Alvo) => podeSubir && <button className="sm" onClick={() => subirPara(a)}>Subir comprovante</button>;

  return (
    <section>
      <div className="tiles">
        <div className="tile"><small>Já recebido</small><b>{brl(recebido)}</b><small>encomendas + mantenedores de {mesLbl(km)}</small></div>
        <div className="tile"><small>Falta receber</small><b>{brl(aReceber)}</b><small>{g.naoPagas.length} encomenda(s) · {g.manFalta.length} mantenedor(es)</small></div>
        <div className="tile"><small>Pago, falta entregar</small><b>{g.pagasSemEntrega.length}</b><small>encomenda(s)</small></div>
        <div className="tile"><small>Pago sem comprovante</small><b>{g.pagosSemComp}</b><small>tudo bem, é só controle</small></div>
      </div>

      <div className="vidro drive">
        {!E.drive.configurado ? (
          <p><b>Google ainda não configurado.</b> Falta cadastrar as chaves do Google na Vercel. Até lá, o painel abaixo funciona, só não dá para subir arquivos.</p>
        ) : !E.drive.conectado ? (
          <>
            <p><b>Conecte sua conta Google</b> para salvar os comprovantes na pasta do Drive e manter a planilha atualizada.</p>
            <a className="botao" href="/api/google/conectar">Conectar Google</a>
          </>
        ) : (
          <>
            <p>Conectado{E.drive.email ? ` como ${E.drive.email}` : ""}. Comprovantes vão para a pasta do Drive e a planilha se atualiza a cada mudança.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {E.drive.pastaUrl && <a className="tag t-venda link" href={E.drive.pastaUrl} target="_blank" rel="noopener">Abrir pasta</a>}
              {E.drive.planilhaUrl && <a className="tag t-venda link" href={E.drive.planilhaUrl} target="_blank" rel="noopener">Abrir planilha</a>}
              {E.drive.planilhaUrl && <button className="ghost sm" onClick={() => run(A.sincronizarAgora(), "Planilha atualizada")}>Atualizar planilha agora</button>}
            </div>
          </>
        )}
      </div>

      {podeSubir && (
        <details open={aberto} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
          <summary>+ Subir comprovante</summary>
          <form ref={formRef} className="f" style={{ marginTop: 10 }} onSubmit={enviar}>
            <label>De que é o pagamento?
              <select value={`${alvo.tipo}:${alvo.id}`} onChange={(e) => { const [tipo, id] = e.target.value.split(":"); escolher({ tipo: tipo as Alvo["tipo"], id }); }}>
                <option value="outro:">Outro (doação, pagamento avulso)</option>
                {g.naoPagas.length > 0 && (
                  <optgroup label="Encomendas sem pagamento">
                    {g.naoPagas.map((e) => <option key={e.id} value={`enc:${e.id}`}>{e.cliente} — {encItens(e)} — {brl(encTotal(e))}</option>)}
                  </optgroup>
                )}
                {E.encomendas.some((e) => e.pago && !compEnc(e.id)) && (
                  <optgroup label="Encomendas pagas sem comprovante">
                    {E.encomendas.filter((e) => e.pago && !compEnc(e.id)).map((e) => <option key={e.id} value={`enc:${e.id}`}>{e.cliente} — {brl(encTotal(e))}</option>)}
                  </optgroup>
                )}
                {E.mantenedores.some((m) => m.ativo) && (
                  <optgroup label={`Mantenedores — ${mesLbl(km)}`}>
                    {E.mantenedores.filter((m) => m.ativo).map((m) => <option key={m.id} value={`man:${m.id}`}>{m.nome} — {brl(m.valor)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="two">
              <label>De quem<input required value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="Nome de quem pagou" /></label>
              <label>Valor (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
            </div>
            <label>Foto ou PDF do comprovante
              <input type="file" accept="image/*,application/pdf" required onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <div className="two">
              <label>Referente a<input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: Pix da encomenda" /></label>
              <label>Quem está enviando<input value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="Seu nome" /></label>
            </div>
            {alvo.tipo !== "outro" && (
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={marcarPago} onChange={(e) => setMarcarPago(e.target.checked)} style={{ width: 22, minHeight: 22 }} />
                {alvo.tipo === "enc" ? "Marcar a encomenda como paga" : `Registrar o pagamento de ${mesLbl(km)}`}
              </label>
            )}
            <button disabled={enviando}>{enviando ? "Enviando para o Drive…" : "Enviar comprovante"}</button>
          </form>
        </details>
      )}

      <h3 className="secao">Encomendou e ainda não pagou</h3>
      {tabelaEnc(g.naoPagas, (e) => (
        <>{botaoSubir({ tipo: "enc", id: e.id })}{" "}
          <button className="ghost sm" onClick={() => run(A.marcarPago(e.id, true, hoje()), `Pagamento de ${e.cliente} registrado`)}>Pagou sem comprovante</button></>
      ), "Ninguém devendo encomenda.")}

      <h3 className="secao">Pagou, mas ainda não entregamos</h3>
      {tabelaEnc(g.pagasSemEntrega, (e) => (
        <><Ver c={compEnc(e.id)} />{" "}
          <button className="sm" onClick={() => run(A.mudarStatus(e.id, "entregue"), `Entregue para ${e.cliente}`)}>Marcar entregue</button></>
      ), "Nenhuma entrega pendente.")}

      <h3 className="secao">Mantenedores — {mesLbl(km)}</h3>
      {E.mantenedores.some((m) => m.ativo) ? (
        <table className="stack">
          <thead><tr><th>Nome</th><th className="n">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {[...g.manFalta, ...g.manPagos].map((m: Mantenedor) => {
              const pago = manPagou(m.id);
              return (
                <tr key={m.id}>
                  <td data-l="Nome"><b>{m.nome}</b>{m.dia && <div className="note">todo dia {m.dia}</div>}</td>
                  <td data-l="Valor" className="n">{brl(m.valor)}</td>
                  <td data-l="Situação"><span className={"tag " + (pago ? "t-doacao" : "t-gasto")}>{pago ? "Já pagou" : "Vai pagar"}</span></td>
                  <td data-l="" className="n" style={{ whiteSpace: "normal" }}>
                    {pago ? <Ver c={compMan(m.id)} /> : botaoSubir({ tipo: "man", id: m.id })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <div className="empty">Nenhum mantenedor ativo.</div>}

      <details style={{ marginTop: 22 }}>
        <summary>Pagou e já recebeu ({g.concluidas.length})</summary>
        <div style={{ marginTop: 10 }}>{tabelaEnc(g.concluidas, (e) => <Ver c={compEnc(e.id)} />, "Nada concluído ainda.")}</div>
      </details>

      <h3 className="secao">Comprovantes enviados</h3>
      {E.comprovantes.length ? (
        <table className="stack">
          <thead><tr><th>Data</th><th>De quem</th><th>Referente a</th><th className="n">Valor</th><th></th></tr></thead>
          <tbody>
            {E.comprovantes.map((c) => (
              <tr key={c.id}>
                <td data-l="Data">{new Date(c.criado).toLocaleDateString("pt-BR")}</td>
                <td data-l="De quem"><b>{c.pessoa}</b>{c.enviadoPor && <div className="note">enviado por {c.enviadoPor}</div>}</td>
                <td data-l="Referente a">{c.referencia || "—"}</td>
                <td data-l="Valor" className="n">{c.valor ? brl(c.valor) : "—"}</td>
                <td data-l="" className="n" style={{ whiteSpace: "normal" }}>
                  <a className="tag t-venda link" href={`/api/comprovantes/${c.id}`} target="_blank" rel="noopener">Abrir</a>{" "}
                  <Excluir onConfirm={() => run(A.excluirComprovante(c.id), "Comprovante removido (foi para a lixeira do Drive)")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">Nenhum comprovante enviado ainda.</div>}
    </section>
  );
}

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

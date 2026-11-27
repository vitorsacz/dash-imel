// Regras compartilhadas entre as ações e as rotas de API.
import { sql } from "./db";
import type { Item } from "./types";

export async function sincronizarPagamento(eid: string, pago: boolean, data: string | null) {
  await sql`delete from lancamentos where encomenda_id = ${eid}`;
  if (!pago) return;
  const [e] = await sql`select cliente, itens from encomendas where id = ${eid}`;
  if (!e) return;
  const itens = e.itens as Item[];
  await sql.transaction(
    itens.map((i, n) => sql`insert into lancamentos
        (id, tipo, data, valor, produto_id, produto_nome, preco, qtd, cliente, quem, encomenda_id)
        values (${`enc-${eid}-${n}`}, 'venda', coalesce(${data}::date, current_date),
                ${Math.round(i.qtd * i.preco * 100) / 100}, ${i.produtoId}, ${i.nome}, ${i.preco}, ${i.qtd},
                ${e.cliente}, 'Encomenda', ${eid})`),
  );
}


/** Lança a doação do mantenedor no mês, se ainda não houver uma. */
export async function pagarMantenedor(mid: string, data: string | null, mesLabel: string) {
  const [m] = await sql`select nome, valor::float8 as valor from mantenedores where id = ${mid}`;
  if (!m) throw new Error("Mantenedor não encontrado");
  const [ja] = await sql`select 1 from lancamentos where mantenedor_id = ${mid}
    and date_trunc('month', data) = date_trunc('month', coalesce(${data}::date, current_date))`;
  if (ja) return;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await sql`insert into lancamentos (id, tipo, data, valor, pessoa, descricao, mantenedor_id, quem)
            values (${id}, 'doacao', coalesce(${data}::date, current_date), ${m.valor}, ${m.nome},
                    ${"Mantenedor — " + mesLabel}, ${mid}, 'Mantenedor')`;
}

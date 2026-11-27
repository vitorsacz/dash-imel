import { neon } from "@neondatabase/serverless";
import type { Estado } from "./types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada");
}

export const sql = neon(process.env.DATABASE_URL);

export async function lerEstado(): Promise<Estado> {
  const [produtos, lancamentos, encomendas, mantenedores, config] = await sql.transaction([
    sql`select id, nome, preco::float8 as preco from produtos where ativo order by nome`,
    sql`select id, tipo, to_char(data, 'YYYY-MM-DD') as data, valor::float8 as valor,
          produto_id as "produtoId", produto_nome as "produtoNome", preco::float8 as preco, qtd,
          descricao, pessoa, cliente, quem, encomenda_id as "encomendaId", mantenedor_id as "mantenedorId",
          (extract(epoch from criado_em) * 1000)::float8 as criado
        from lancamentos order by data desc, criado_em desc`,
    sql`select id, cliente, contato, itens, to_char(entrega, 'YYYY-MM-DD') as entrega, obs, pago, status,
          (extract(epoch from criado_em) * 1000)::float8 as criado
        from encomendas order by entrega nulls last, criado_em`,
    sql`select id, nome, valor::float8 as valor, contato, dia, ativo from mantenedores order by nome`,
    sql`select meta_total::float8 as "metaTotal", meta_mes::float8 as "metaMes" from config where id = 1`,
  ]);
  return {
    produtos,
    lancamentos,
    encomendas,
    mantenedores,
    config: config[0] ?? { metaTotal: 4200, metaMes: 450 },
  } as unknown as Estado;
}

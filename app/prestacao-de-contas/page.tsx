import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { brl, dataBR } from "@/lib/format";

// Página pública: só números totais, sem nomes nem detalhes.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Prestação de contas · Caixa do Som · IMEL Mairiporã",
  description: "Quanto a igreja já arrecadou para os novos subs e retornos de som.",
};

async function dados() {
  const [r] = await sql`
    select
      coalesce(sum(case when tipo = 'gasto' then -valor else valor end), 0)::float8 as liquido,
      to_char(min(data), 'YYYY-MM-DD') as inicio,
      (select meta_total::float8 from config where id = 1) as meta
    from lancamentos`;
  return { liquido: Math.max(0, r.liquido as number), inicio: r.inicio as string | null, meta: (r.meta as number) ?? 4200 };
}

function tempo(inicio: string | null) {
  if (!inicio) return "Campanha começando agora";
  const dias = Math.max(1, Math.round((Date.now() - new Date(inicio + "T12:00:00-03:00").getTime()) / 86400000));
  const t = dias < 60 ? `${dias} dia${dias > 1 ? "s" : ""}` : `${Math.round(dias / 30)} meses`;
  return `Arrecadando há ${t} · desde ${dataBR(inicio)}`;
}

export default async function Prestacao() {
  const { liquido, inicio, meta } = await dados();
  const pct = Math.min(100, (liquido / meta) * 100);
  return (
    <main className="publico">
      <img className="logo" src="/logo-escuro.png" alt="Igreja Metodista Livre Mairiporã" />
      <section className="vidro cartaz">
        <p className="rotulo">Já arrecadamos para o som da igreja</p>
        <p className="valor">{brl(liquido)}</p>
        <div className="bar grande" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={liquido}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="linha">
          <span>{pct.toFixed(0)}% da meta</span>
          <span>Meta: {brl(meta)}</span>
        </div>
        <p className="tempo">{tempo(inicio).split(" · ").map((t, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{t}</span>)}</p>
        <p className="nota">Valor líquido: vendas e doações, já descontados os custos dos doces. Atualizado em tempo real.</p>
      </section>
      <Link className="voltar" href="/login">Área da equipe</Link>
    </main>
  );
}

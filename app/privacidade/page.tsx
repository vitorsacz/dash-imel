import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidade · Caixa do Som · IMEL Mairiporã" };

export default function Privacidade() {
  return (
    <main className="publico">
      <img className="logo" src="/logo-escuro.png" alt="Igreja Metodista Livre Mairiporã" />
      <section className="vidro cartaz texto-legal">
        <h1>Política de privacidade</h1>
        <p>O Caixa do Som é uma ferramenta interna da Igreja Metodista Livre de Mairiporã para controlar a arrecadação do projeto de som (vendas, encomendas, doações e mantenedores).</p>
        <h2>Quais dados guardamos</h2>
        <p>Nomes, contatos e valores informados pela equipe, além de comprovantes de pagamento enviados voluntariamente. O acesso é restrito à equipe por senha.</p>
        <h2>Google Drive e Planilhas</h2>
        <p>Com a autorização da conta da igreja, o app salva os comprovantes numa pasta do Google Drive da igreja e mantém uma planilha do Google atualizada com esses registros. O app não lê, altera nem compartilha outros arquivos e não usa os dados para publicidade.</p>
        <h2>Contato e exclusão</h2>
        <p>Para corrigir ou apagar seus dados, fale com a liderança da igreja ou escreva para imelmairipora@gmail.com. A autorização do Google pode ser removida a qualquer momento em myaccount.google.com/permissions.</p>
      </section>
      <Link className="voltar" href="/prestacao-de-contas">Prestação de contas</Link>
    </main>
  );
}

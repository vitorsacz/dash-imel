import type { Metadata, Viewport } from "next";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-600.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import "@fontsource/eb-garamond/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caixa do Som · IMEL Mairiporã",
  description: "Controle de vendas, encomendas, doações e mantenedores do projeto de som da igreja.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#003A70" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="fundo" aria-hidden>
          <i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" />
          <img className="marca" src="/icone-branco.png" alt="" />
          <div className="grao" />
        </div>
        {children}
        <footer className="rodape">
          <p>© 2026 IMEL Mairiporã. Todos os direitos reservados.</p>
          <p>
            Desenvolvido por{" "}
            <a href="https://vitorsantos.dev.br" target="_blank" rel="noopener">
              vitorsantos.dev.br
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}

export type Tipo = "venda" | "gasto" | "doacao";
export type Status = "afazer" | "pronta" | "entregue";

export type Produto = { id: string; nome: string; preco: number };

export type Lancamento = {
  id: string;
  tipo: Tipo;
  data: string; // yyyy-mm-dd
  valor: number;
  produtoId: string | null;
  produtoNome: string | null;
  preco: number | null;
  qtd: number | null;
  descricao: string;
  pessoa: string;
  cliente: string;
  quem: string;
  encomendaId: string | null;
  mantenedorId: string | null;
  criado: number;
};

export type Item = { produtoId: string; nome: string; preco: number; qtd: number };

export type Encomenda = {
  id: string;
  cliente: string;
  contato: string;
  itens: Item[];
  entrega: string | null;
  obs: string;
  pago: boolean;
  status: Status;
  criado: number;
};

export type Mantenedor = {
  id: string;
  nome: string;
  valor: number;
  contato: string;
  dia: number | null;
  ativo: boolean;
};

export type Config = { metaTotal: number; metaMes: number };

export type Comprovante = {
  id: string;
  categoria: "encomenda" | "doacao" | "compra";
  lancamentoId: string | null;
  pessoa: string;
  referencia: string;
  valor: number | null;
  encomendaId: string | null;
  mantenedorId: string | null;
  nomeArquivo: string;
  mime: string;
  enviadoPor: string;
  criado: number;
};

export type Drive = { configurado: boolean; conectado: boolean; email: string | null; pastaUrl: string | null; planilhaUrl: string | null };

export type Estado = {
  produtos: Produto[];
  lancamentos: Lancamento[];
  encomendas: Encomenda[];
  mantenedores: Mantenedor[];
  config: Config;
  comprovantes: Comprovante[];
  drive: Drive;
};

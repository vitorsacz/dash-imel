-- Esquema do banco (Neon / Postgres). Já aplicado no projeto "dash-imel".
create table produtos (
  id text primary key,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table mantenedores (
  id text primary key,
  nome text not null,
  valor numeric(10,2) not null check (valor >= 0),
  contato text not null default '',
  dia smallint,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table encomendas (
  id text primary key,
  cliente text not null,
  contato text not null default '',
  itens jsonb not null default '[]',          -- [{produtoId, nome, preco, qtd}]
  entrega date,
  obs text not null default '',
  pago boolean not null default false,
  status text not null default 'afazer' check (status in ('afazer','pronta','entregue')),
  criado_em timestamptz not null default now()
);

create table lancamentos (
  id text primary key,
  tipo text not null check (tipo in ('venda','gasto','doacao')),
  data date not null default current_date,
  valor numeric(10,2) not null check (valor >= 0),
  produto_id text,
  produto_nome text,
  preco numeric(10,2),
  qtd integer,
  descricao text not null default '',
  pessoa text not null default '',
  cliente text not null default '',
  quem text not null default '',
  encomenda_id text references encomendas(id) on delete cascade,
  mantenedor_id text references mantenedores(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index lancamentos_data_idx on lancamentos (data);

create table config (
  id smallint primary key default 1 check (id = 1),
  meta_total numeric(10,2) not null default 4200,
  meta_mes numeric(10,2) not null default 450
);
insert into config (id) values (1);
insert into produtos (id, nome, preco) values ('caixinha-brigadeiro', 'Caixinha de brigadeiro', 10);

-- Comprovantes de pagamento (arquivos ficam no Google Drive)
create table comprovantes (
  id text primary key,
  pessoa text not null,
  referencia text not null default '',
  valor numeric(10,2),
  encomenda_id text references encomendas(id) on delete set null,
  mantenedor_id text references mantenedores(id) on delete set null,
  drive_id text not null,
  nome_arquivo text not null,
  mime text not null,
  tamanho integer,
  enviado_por text not null default '',
  criado_em timestamptz not null default now()
);
create index comprovantes_encomenda_idx on comprovantes (encomenda_id);
create index comprovantes_mantenedor_idx on comprovantes (mantenedor_id);

-- Conexão com o Google Drive (uma só, da conta que autorizou)
create table google_conexao (
  id smallint primary key default 1 check (id = 1),
  refresh_token text not null,
  pasta_id text,
  email text,
  conectado_em timestamptz not null default now()
);

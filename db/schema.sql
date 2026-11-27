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

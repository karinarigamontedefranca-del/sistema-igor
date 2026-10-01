-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run

create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  university    text,                         -- faculdade
  course        text,                         -- curso
  checked_in    boolean not null default false,
  checked_in_at timestamptz,
  group_number  integer,                      -- null = ainda sem grupo
  created_at    timestamptz not null default now()
);

create index if not exists participants_checked_in_idx on public.participants (checked_in);
create index if not exists participants_group_idx on public.participants (group_number);

-- Segurança: RLS ligado e SEM policies = ninguém acessa pela chave pública (anon).
-- Só o servidor do Vercel, usando a chave service_role, lê e escreve.
alter table public.participants enable row level security;

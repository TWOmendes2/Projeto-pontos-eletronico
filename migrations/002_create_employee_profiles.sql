-- Deepontus / Batinga Cursos — v6
-- Cria tabela de perfis (dados obrigatórios CLT) para complementar o cadastro do funcionário.
-- Rode no Supabase SQL Editor ANTES da 003_employee_profiles_more_fields.sql

create table if not exists public.employee_profiles (
  employee_id text primary key references public.employees(employee_id) on delete cascade,
  full_name text,
  cpf text,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Atualiza updated_at automaticamente
create or replace function public.fn_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employee_profiles_updated_at on public.employee_profiles;
create trigger trg_employee_profiles_updated_at
before update on public.employee_profiles
for each row execute function public.fn_set_updated_at();

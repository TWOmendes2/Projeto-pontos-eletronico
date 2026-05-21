-- Deepontus / Batinga Cursos - v9
-- Correções: jornada diária, cálculo correto de hora extra diária, visualização de pontos do funcionário
-- e ajuste do RLS que causava: new row violates row-level security policy for table "employee_profiles".
-- Rode este arquivo no Supabase SQL Editor depois da migration 004.


-- 0) Garante que a tabela de perfis exista com as colunas usadas pela tela Meu cadastro.
create table if not exists public.employee_profiles (
  employee_id text primary key references public.employees(employee_id) on delete cascade,
  full_name text,
  cpf text,
  birth_date date,
  phone text,
  email text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_zip text,
  rg text,
  rg_issuer text,
  pis_pasep text,
  ctps_number text,
  ctps_series text,
  nationality text,
  marital_status text,
  photo_url text,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  mother_name text,
  naturality text,
  rg_uf text,
  emergency_name text,
  emergency_phone text,
  avatar_url text,
  pix_key text,
  pix_key_type text,
  bank_name text,
  bank_agency text,
  bank_account text,
  admission_date date
);

alter table public.employee_profiles
  add column if not exists full_name text,
  add column if not exists cpf text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists rg text,
  add column if not exists rg_issuer text,
  add column if not exists pis_pasep text,
  add column if not exists ctps_number text,
  add column if not exists ctps_series text,
  add column if not exists nationality text,
  add column if not exists marital_status text,
  add column if not exists photo_url text,
  add column if not exists is_completed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists mother_name text,
  add column if not exists naturality text,
  add column if not exists rg_uf text,
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists avatar_url text,
  add column if not exists pix_key text,
  add column if not exists pix_key_type text,
  add column if not exists bank_name text,
  add column if not exists bank_agency text,
  add column if not exists bank_account text,
  add column if not exists admission_date date;

-- 1) Jornada diária do funcionário.
alter table public.employees
  add column if not exists contracted_hours_day numeric(5,2) not null default 8;

-- Garante um valor válido para registros antigos.
update public.employees
set contracted_hours_day = 8
where contracted_hours_day is null or contracted_hours_day <= 0;

-- 2) Campos de valores/hora e hora extra, caso a migration 004 ainda não tenha sido rodada.
alter table public.employees
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists overtime_rate numeric(10,2),
  add column if not exists hourly_rate_monitoria numeric(10,2),
  add column if not exists hourly_rate_gravacao numeric(10,2),
  add column if not exists overtime_rate_monitoria numeric(10,2),
  add column if not exists overtime_rate_gravacao numeric(10,2);

alter table public.sessions
  add column if not exists is_overtime boolean default false,
  add column if not exists overtime_started_at timestamptz,
  add column if not exists overtime_minutes integer not null default 0,
  add column if not exists overtime_billable_minutes integer not null default 0,
  add column if not exists overtime_tolerance_minutes integer not null default 10,
  add column if not exists overtime_reason text,
  add column if not exists overtime_value numeric(12,2) not null default 0,
  add column if not exists overtime_rate_snapshot numeric(10,2),
  add column if not exists overtime_status text not null default 'none',
  add column if not exists overtime_reviewed_at timestamptz,
  add column if not exists overtime_reviewed_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_overtime_status_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_overtime_status_check
      check (overtime_status in ('none','pending','approved','rejected'));
  end if;
end $$;

create index if not exists idx_sessions_overtime_status
  on public.sessions (overtime_status)
  where coalesce(is_deleted,false) = false;

create index if not exists idx_sessions_overtime_employee_date
  on public.sessions (employee_id, date, overtime_status)
  where coalesce(is_deleted,false) = false;

create index if not exists idx_sessions_employee_date_v9
  on public.sessions (employee_id, date)
  where coalesce(is_deleted,false) = false;

update public.sessions
set overtime_status = 'none'
where overtime_status is null;

-- 3) Correção do RLS para o modelo atual do projeto.
-- O app usa login próprio salvo no localStorage e acessa o Supabase com anon key.
-- Por isso, policies baseadas em auth.uid() não reconhecem o funcionário e bloqueiam o upsert do perfil.
-- Para esta estrutura funcionar, liberamos employee_profiles para o front-end.
alter table public.employee_profiles disable row level security;

grant all on table public.employee_profiles to anon;
grant all on table public.employee_profiles to authenticated;

-- 4) Garante que o admin do próprio sistema consiga cadastrar/editar funcionários pelo front-end.
-- Evita falhas de INSERT quando employees está com RLS ativo.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and policyname = 'employees_insert_anon_v9'
  ) then
    create policy employees_insert_anon_v9
      on public.employees
      for insert
      to anon
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and policyname = 'employees_update_anon_v9'
  ) then
    create policy employees_update_anon_v9
      on public.employees
      for update
      to anon
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and policyname = 'employees_select_anon_v9'
  ) then
    create policy employees_select_anon_v9
      on public.employees
      for select
      to anon
      using (true);
  end if;
end $$;

grant all on table public.employees to anon;
grant all on table public.employees to authenticated;

-- Deepontus / Batinga Cursos - v10
-- Correção de conexão, campos de jornada diária, hora extra, perfil CLT e permissões RLS.
-- Pode rodar mais de uma vez no Supabase SQL Editor.

-- 1) Funcionários: jornada diária e valores/hora usados no cálculo de hora extra.
alter table public.employees
  add column if not exists contracted_hours_day numeric(5,2) not null default 8,
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists overtime_rate numeric(10,2),
  add column if not exists hourly_rate_monitoria numeric(10,2),
  add column if not exists hourly_rate_gravacao numeric(10,2),
  add column if not exists overtime_rate_monitoria numeric(10,2),
  add column if not exists overtime_rate_gravacao numeric(10,2),
  add column if not exists pay_mode text default 'salaried',
  add column if not exists base_salary numeric(12,2),
  add column if not exists job_function text,
  add column if not exists is_active boolean not null default true;

update public.employees
set contracted_hours_day = 8
where contracted_hours_day is null or contracted_hours_day <= 0;

update public.employees
set pay_mode = 'salaried'
where pay_mode is null or pay_mode not in ('salaried','hourly');

alter table public.employees drop constraint if exists employees_job_function_chk;
alter table public.employees drop constraint if exists employees_pay_mode_check;
alter table public.employees drop constraint if exists employees_role_check;

alter table public.employees
  add constraint employees_pay_mode_check check (pay_mode in ('salaried','hourly')),
  add constraint employees_role_check check (role in ('employee','admin')),
  add constraint employees_job_function_chk check (
    job_function is null or job_function in ('Financeiro','Marketing','Monitor','Recepcionista','Serviços Gerais','Suporte')
  );

-- 2) Sessões de ponto: campos para hora extra e lançamento manual.
alter table public.sessions
  add column if not exists source text not null default 'auto',
  add column if not exists origin text default 'web',
  add column if not exists is_deleted boolean default false,
  add column if not exists deleted_reason text,
  add column if not exists break_total_minutes integer not null default 0,
  add column if not exists break_open_since timestamptz,
  add column if not exists modality text default 'na',
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

update public.sessions
set overtime_status = 'none'
where overtime_status is null or overtime_status not in ('none','pending','approved','rejected');

update public.sessions
set is_deleted = false
where is_deleted is null;

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

create index if not exists idx_sessions_employee_date_v10
  on public.sessions (employee_id, date)
  where coalesce(is_deleted,false) = false;

create index if not exists idx_sessions_overtime_status_v10
  on public.sessions (overtime_status)
  where coalesce(is_deleted,false) = false;

create index if not exists idx_sessions_overtime_employee_date_v10
  on public.sessions (employee_id, date, overtime_status)
  where coalesce(is_deleted,false) = false;

-- 3) Perfil CLT usado pela tela "Meu cadastro".
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
  created_at timestamptz not null default now(),
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
  add column if not exists created_at timestamptz not null default now(),
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

-- 4) Permissões: este projeto usa login próprio no front com anon key, não Supabase Auth.
-- Por isso, RLS baseada em auth.uid() bloqueia inserts/selects do app.
alter table if exists public.employees disable row level security;
alter table if exists public.sessions disable row level security;
alter table if exists public.adjustments disable row level security;
alter table if exists public.attestations disable row level security;
alter table if exists public.salaries disable row level security;
alter table if exists public.employee_profiles disable row level security;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='daily_activities') then
    alter table public.daily_activities disable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='medical_certificates') then
    alter table public.medical_certificates disable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='employee_personal') then
    alter table public.employee_personal disable row level security;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant all privileges on all tables in schema public to anon, authenticated;
grant usage, select, update on all sequences in schema public to anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='employees') then
    drop policy if exists employees_select_anon_v9 on public.employees;
    drop policy if exists employees_insert_anon_v9 on public.employees;
    drop policy if exists employees_update_anon_v9 on public.employees;
  end if;
end $$;

-- 5) Atualiza estatísticas do Postgres para o PostgREST/Supabase enxergar colunas novas rapidamente.
notify pgrst, 'reload schema';

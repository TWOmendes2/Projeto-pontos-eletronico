-- Employee Profiles (dados CLT)
-- Rode este SQL no Supabase para habilitar a obrigatoriedade do cadastro.

create table if not exists public.employee_profiles (
  employee_id text primary key references public.employees(employee_id) on delete cascade,
  full_name text not null,
  cpf text not null,
  birth_date date not null,
  phone text not null,
  address_street text not null,
  address_number text not null,
  address_complement text,
  address_neighborhood text not null,
  address_city text not null,
  address_state text not null,
  address_zip text not null,
  updated_at timestamptz not null default now()
);

create index if not exists employee_profiles_employee_id_idx on public.employee_profiles(employee_id);

-- RLS
alter table public.employee_profiles enable row level security;

-- Colaborador pode ver/editar apenas o próprio perfil
create policy if not exists "employee_profiles_self_read"
on public.employee_profiles for select
using (
  exists (
    select 1 from public.employees e
    where e.employee_id = employee_profiles.employee_id
      and e.user_id = auth.uid()
  )
);

create policy if not exists "employee_profiles_self_upsert"
on public.employee_profiles for insert
with check (
  exists (
    select 1 from public.employees e
    where e.employee_id = employee_profiles.employee_id
      and e.user_id = auth.uid()
  )
);

create policy if not exists "employee_profiles_self_update"
on public.employee_profiles for update
using (
  exists (
    select 1 from public.employees e
    where e.employee_id = employee_profiles.employee_id
      and e.user_id = auth.uid()
  )
);

-- Admin pode ver tudo
create policy if not exists "employee_profiles_admin_all"
on public.employee_profiles for all
using (
  exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.role = 'admin'
  )
);

-- Trigger updated_at
create or replace function public.fn_employee_profiles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists tr_employee_profiles_touch on public.employee_profiles;
create trigger tr_employee_profiles_touch
before update on public.employee_profiles
for each row execute function public.fn_employee_profiles_touch_updated_at();

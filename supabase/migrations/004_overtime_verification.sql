-- Deepontus / Batinga Cursos — v8
-- Hora extra com tolerância de 10 minutos, justificativa obrigatória e conferência do admin.
-- Rode este arquivo no Supabase SQL Editor antes de publicar os arquivos atualizados.

-- 1) Garante os campos de valor de hora extra no cadastro do funcionário.
alter table public.employees
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists overtime_rate numeric(10,2),
  add column if not exists hourly_rate_monitoria numeric(10,2),
  add column if not exists hourly_rate_gravacao numeric(10,2),
  add column if not exists overtime_rate_monitoria numeric(10,2),
  add column if not exists overtime_rate_gravacao numeric(10,2);

-- 2) Guarda a hora extra diretamente na sessão de ponto fechada.
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

-- 3) Valida status possíveis da conferência.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_overtime_status_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_overtime_status_check
      check (overtime_status in ('none','pending','approved','rejected'));
  end if;
end $$;

-- 4) Índices para a tela de pendências e relatórios financeiros.
create index if not exists idx_sessions_overtime_status
  on public.sessions (overtime_status)
  where coalesce(is_deleted,false) = false;

create index if not exists idx_sessions_overtime_employee_date
  on public.sessions (employee_id, date, overtime_status)
  where coalesce(is_deleted,false) = false;

-- 5) Se já existirem registros antigos com is_overtime=true mas sem status, normaliza.
update public.sessions
set overtime_status = 'none'
where overtime_status is null;

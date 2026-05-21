-- Deepontus / Batinga Cursos — v4
-- Complemento de campos obrigatórios CLT no cadastro do funcionário
-- Rode no Supabase SQL Editor.

alter table public.employee_profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists mother_name text,
  add column if not exists marital_status text,
  add column if not exists nationality text,
  add column if not exists naturality text,
  add column if not exists rg text,
  add column if not exists rg_uf text,
  add column if not exists pis_pasep text,
  add column if not exists ctps_number text,
  add column if not exists ctps_series text,
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists address_zip text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists avatar_url text;

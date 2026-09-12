-- =============================================================================
-- MIGRAÇÃO 009 — enroll_device  ·  onboarding v2, D3
-- =============================================================================
-- ⚠️ POR APROVAR, E **NUNCA EXECUTADA EM LADO NENHUM**.
--
--    Estava previsto prová-la num branch de desenvolvimento do Supabase. Não
--    foi possível, e a razão fica escrita para não se confundir com descuido:
--
--      · `create_branch` devolveu `PaymentRequiredException: Branching is
--        supported only on the Pro plan or above`. O projecto `frugal` está no
--        plano Free.
--      · Nesta máquina não há Postgres nem Docker a correr
--        (`psql`, `initdb`, `docker info` — nenhum disponível), portanto também
--        não há onde a correr localmente.
--
--    O que isto significa, sem rodeios: este SQL foi **escrito contra o esquema
--    real** (lido em `landing/migrations/002` e `006`) e **revisto**, mas nunca
--    foi **parseado por um Postgres**. Um erro de sintaxe ou de tipo só
--    aparecerá na primeira execução.
--
--    NÃO a apliques em produção sem a correres primeiro num sítio descartável.
--    Duas formas que não custam dinheiro:
--      1. `docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:17`
--         e depois `psql -h localhost -p 5433 -U postgres -f este-ficheiro.sql`
--         (as tabelas `devices` e `mooter_install_tokens` têm de existir — cria-as
--         a partir de `landing/migrations/002` e `006`).
--      2. O SQL Editor do Supabase, dentro de uma transacção que se desfaz:
--         `begin;`  … este ficheiro …  `rollback;`
--
-- O QUE FAZ: a troca da D3. O código de instalação (uso único, 24 h) morre, e
-- nasce uma CHAVE DE DEVICE — escopada a um device, revogável, e guardada no
-- cliente com 0600.
--
-- PORQUE A TROCA É O PONTO TODO. O código de bootstrap é um portador: quem o
-- tiver, é o utilizador. Isso é aceitável uma vez e durante 24 h; não é
-- aceitável para sempre. Depois da troca, a credencial no disco vale só para
-- aquele device, pode ser revogada sozinha, e quem a roubar não consegue
-- enrolar outro device com ela.
--
-- ESCRITA CONTRA O ESQUEMA REAL, não contra o imaginado:
--   · `public.mooter_install_tokens` (migração 006) — `token`, `user_id`,
--     `expires_at`, `used_at`, `config`. RLS ligado, sem políticas: TODO o
--     acesso é por funções SECURITY DEFINER, e o token é o segredo portador.
--   · `public.devices` (migração 002) — `device_id` é a PK e é TEXT, e
--     `user_id` referencia `profiles(id)`, NÃO `auth.users(id)`.
--
-- =============================================================================

-- ── 1. As colunas novas em `devices` ────────────────────────────────────────
-- `if not exists` em cada uma: esta migração tem de poder correr duas vezes sem
-- estragar nada. Um `alter table add column` que rebenta a meio deixa a tabela
-- num estado que ninguém escreveu de propósito.

alter table public.devices add column if not exists device_pub   text;
alter table public.devices add column if not exists device_key   text;
alter table public.devices add column if not exists platform     text;
alter table public.devices add column if not exists enrolled_at  timestamptz;
alter table public.devices add column if not exists revoked_at   timestamptz;

-- A chave é procurada a cada pedido autenticado por device. Sem índice, isso é
-- uma varredura da tabela inteira por cada beacon.
-- `where device_key is not null`: a maioria dos devices (Free local) nunca tem
-- chave, e não há razão para os indexar.
create unique index if not exists devices_device_key_uniq
  on public.devices(device_key) where device_key is not null;

comment on column public.devices.device_pub  is 'Chave PÚBLICA Ed25519 do device (base64 SPKI). A privada nunca sai da máquina.';
comment on column public.devices.device_key  is 'Credencial de operação deste device. Emitida por enroll_device, revogável.';
comment on column public.devices.revoked_at  is 'Quando foi revogada. Estado B12: o device cai em Free local, nunca pára.';

-- ── 2. Um gerador de chaves de device ───────────────────────────────────────
-- Mesmo formato URL-safe do `gen_install_token` da 006 — mas 32 bytes em vez de
-- 24, porque esta credencial é PERSISTENTE e o token era efémero.

create or replace function public.gen_device_key() returns text
language sql volatile as $$
  select 'dk_' || replace(replace(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_');
$$;

-- ── 3. `enroll_device` ──────────────────────────────────────────────────────
-- Numa só transacção: valida o token, marca-o usado, cria/actualiza o device,
-- e devolve a chave. Se qualquer passo falhar, nenhum aconteceu — e isso
-- importa: um token consumido sem device criado deixaria a pessoa sem código
-- E sem chave, sem forma de recuperar a não ser gerar outro código.
--
-- NUNCA devolve o `user_id` nem nada do perfil: o device não precisa de saber
-- quem é o dono da conta para funcionar, e tudo o que devolve acaba num
-- ficheiro no disco de alguém.

create or replace function public.enroll_device(
  p_token      text,
  p_device_pub text,
  p_device_id  text,
  p_platform   text
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_tok public.mooter_install_tokens%rowtype;
  v_key text;
begin
  -- Validações de forma ANTES de tocar em qualquer linha. Barato, e a mensagem
  -- é melhor do que a de uma constraint a estoirar lá dentro.
  if p_device_pub is null or length(p_device_pub) not between 40 and 120 then
    return null;
  end if;
  if p_device_id is null or length(p_device_id) not between 1 and 64 then
    return null;
  end if;

  -- `for update` — o mesmo bloqueio que o `redeem_install_token` usa. Sem ele,
  -- dois pedidos simultâneos com o mesmo código enrolavam DOIS devices.
  select * into v_tok
    from public.mooter_install_tokens
   where token = p_token
     for update;

  if not found or v_tok.expires_at < now() or v_tok.used_at is not null then
    return null;  -- a rota traduz null em 410 «expirou ou já foi usado»
  end if;

  update public.mooter_install_tokens set used_at = now() where token = p_token;

  v_key := public.gen_device_key();

  -- `on conflict` no `device_id`: re-enrolar um device que já existe troca-lhe
  -- a chave em vez de rebentar. É o caso normal de quem reinstala.
  insert into public.devices (device_id, user_id, device_pub, device_key, platform, os_type, enrolled_at, revoked_at)
  values (p_device_id, v_tok.user_id, p_device_pub, v_key, p_platform, p_platform, now(), null)
  on conflict (device_id) do update
    set device_pub  = excluded.device_pub,
        device_key  = excluded.device_key,
        platform    = excluded.platform,
        enrolled_at = now(),
        revoked_at  = null;

  return json_build_object('device_key', v_key, 'device_id', p_device_id);
end $$;

-- ── 4. `revoke_device` — o estado A9/B12 ────────────────────────────────────
-- Não apaga a linha: marca-a. Apagar perderia o histórico de que aquele device
-- existiu, e o `device_pub` ainda serve para explicar beacons antigos.
-- Chamável só pelo DONO da conta (sem SECURITY DEFINER a contornar RLS).

create or replace function public.revoke_device(p_device_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  update public.devices
     set device_key = null, revoked_at = now()
   where device_id = p_device_id
     and user_id = v_user;
  return found;
end $$;

-- ── 5. Permissões ───────────────────────────────────────────────────────────
-- `anon` pode CHAMAR o enrolment: quem tem o código é o utilizador, e é esse o
-- modelo da 006 («o token é o segredo portador»). Não pode revogar — revogar
-- exige sessão.

grant execute on function public.enroll_device(text, text, text, text) to anon, authenticated;
grant execute on function public.revoke_device(text)                   to authenticated;
revoke execute on function public.gen_device_key()                     from anon, authenticated;

-- =============================================================================
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ, de propósito
-- =============================================================================
-- · Não verifica assinaturas Ed25519 dentro do Postgres. O `device_pub` é
--   guardado para quem verifica beacons o usar; pôr criptografia aqui era pôr
--   lógica num sítio sem testes.
-- · Não apaga nada. Nenhuma linha desta migração destrói dados.
-- · Não mexe em `mooter_install_tokens` para além de marcar `used_at`, que é
--   exactamente o que o `redeem_install_token` já fazia.
--
-- REVERSÃO (se for preciso):
--   drop function if exists public.enroll_device(text, text, text, text);
--   drop function if exists public.revoke_device(text);
--   drop function if exists public.gen_device_key();
--   drop index    if exists public.devices_device_key_uniq;
--   -- as colunas ficam: largá-las apagaria chaves de devices já enrolados.

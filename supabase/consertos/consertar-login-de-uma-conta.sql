-- ============================================================================
-- CONSERTO DO LOGIN DE UMA CONTA — Supabase → SQL Editor (projeto Agendause,
-- pnaupodddxrbqbjilhft).
--
-- Quando usar: a conta aparece em Authentication → Users, o e-mail está certo,
-- mas tentar entrar devolve erro 500 (o app mostra "O servidor de login está
-- fora do ar ou instável (erro 500)"). Duas causas conhecidas:
--
--   1. falta o registro em auth.identities (o login por senha precisa dele;
--      sem ele o GoTrue estoura um erro interno em vez de validar a senha);
--   2. a senha guardada não está em bcrypt ($2a$/$2b$) — por exemplo, se a
--      conta foi criada direto por SQL com outro algoritmo.
--
-- Como saber qual é o caso: rode só o PASSO 1 (leitura, não altera nada).
-- Se "identidades" vier 0, rode o PASSO 2 inteiro. Se o login continuar
-- falhando com o hash em branco ou em formato estranho, o PASSO 2 também
-- resolve (ele regrava a senha em bcrypt).
--
-- Troque o e-mail e a senha antes de rodar.
-- ============================================================================


-- PASSO 1 — raio-X (só leitura)
select
  u.id,
  u.email,
  u.email_confirmed_at is not null                                    as email_confirmado,
  left(coalesce(u.encrypted_password, '(sem senha)'), 4)              as inicio_do_hash,
  length(coalesce(u.encrypted_password, ''))                          as tamanho_do_hash,
  (select count(*) from auth.identities i where i.user_id = u.id)     as identidades,
  u.raw_app_meta_data->'providers'                                    as provedores
from auth.users u
where lower(u.email) = 'marcelo@usesistemas.com';
-- Esperado em uma conta saudável:
--   email_confirmado = true · inicio_do_hash = $2a$ (ou $2b$) · identidades = 1
--   provedores = ["email"]


-- PASSO 2 — conserto (grava): senha nova em bcrypt + e-mail confirmado +
-- identidade de e-mail garantida + provedores normalizados.
update auth.users set
  encrypted_password = extensions.crypt('EscolhaUmaSenhaNova123', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  email_change       = '',
  raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
                       || '{"provider":"email","providers":["email"]}'::jsonb,
  updated_at         = now()
where lower(email) = 'marcelo@usesistemas.com';

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where lower(u.email) = 'marcelo@usesistemas.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- Depois: entrar no site com o e-mail e a senha do PASSO 2.


-- ============================================================================
-- OBSERVAÇÕES
--
-- · Se aparecer "function extensions.crypt(...) does not exist", rode antes:
--     create extension if not exists pgcrypto;
--   (e, se ainda reclamar, troque "extensions.crypt"/"extensions.gen_salt"
--    por "crypt"/"gen_salt").
-- · Se aparecer "permission denied for table users", o banco não deixa o SQL
--   Editor gravar em auth.users — nesse caso use a Edge Function
--   (scripts/criar-usuario.mjs com a chave secreta) ou crie a conta pelo
--   painel (Authentication → Users → Add user).
-- · Não mexa na coluna "confirmed_at": em projetos novos ela é gerada
--   automaticamente e um UPDATE nela falha.
-- · Contas criadas pelo app (Admin → Controle de Acessos) já nascem com a
--   identidade — este conserto é para contas antigas/criadas por SQL.
-- ============================================================================

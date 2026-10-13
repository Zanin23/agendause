# Controle de usuários: erro ao chamar a Edge Function

A mensagem **Failed to send a request to the Edge Function** significa que o
navegador não conseguiu completar a chamada à `admin-users`. Pode ocorrer por
função não publicada no projeto atual, falha no preflight/CORS, indisponibilidade
ou bloqueio de rede. Ela **não indica que as contas foram apagadas**. Não recrie
contas só por causa desta mensagem.

## Como esta correção funciona

- A lista usa `public.admin_list_users()` via RPC do banco, sem depender da Edge
  Function. Lê as contas reais de `auth.users`, inclusive a conta conectada e
  contas sem perfil/role. Não fica limitada aos primeiros 1.000 usuários.
- A função SQL exige sessão e role `admin` no servidor. Não libera acesso direto
  a `auth.users` nem retorna hashes de senha ou tokens. As políticas das tabelas
  continuam intactas.
- Se o banco ainda não tem a migração, o app tenta a Edge Function antiga. Não
  faz fallback após erro de autorização.
- Falha de consulta aparece como erro com botão **Tentar novamente**, em vez de
  parecer uma lista vazia.
- Criar contas, trocar senha e alterar permissões continuam usando `admin-users`.
  Essa Edge Function ainda precisa estar publicada para essas operações.

## Publicação — são duas partes, não apenas o deploy da Vercel

### 1. Banco Supabase

No projeto **`psgekwifthuzduhpreay`**, abra **SQL Editor** e execute o conteúdo de:

`supabase/migrations/20261013130000_admin_list_users.sql`

É uma função de leitura; não apaga nem recria contas e pode ser aplicada novamente.
Requer as migrações anteriores de roles/permissões/workspaces/cronogramas.

Se usar o CLI com o projeto já vinculado e as migrações anteriores sincronizadas,
a alternativa é `supabase db push`. Confira as migrações pendentes antes de usar
este comando, pois ele aplica todas as que faltam, não apenas esta.

### 2. Edge Function e site

Com o CLI autenticado na sua máquina, na raiz do repositório:

```bash
supabase functions deploy admin-users --project-ref psgekwifthuzduhpreay
```

`supabase/config.toml` configura `verify_jwt = false` **somente para esta função**:
a validação do token ocorre dentro dela, com `auth.getUser(token)`, seguida da
checagem obrigatória `has_role(..., 'admin')`. Isso não torna a função pública
para listar ou modificar contas. Ela responde ao preflight OPTIONS e usa CORS
local com a versão do SDK fixada.

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pelo ambiente Supabase. Nunca
coloque a chave service role no front-end, na Vercel ou no repositório.

Integre também a alteração do front-end e aguarde o deploy na Vercel. Só publicar
o front-end não cria a RPC nem publica a Edge Function no Supabase.

## Conferência

1. Entre com uma conta com role `admin` e abra **Controle de Acessos**.
2. Confira a sua conta (marcada **Você**) e outras contas cadastradas.
3. Clique em **Atualizar**, filtre por nome/e-mail e confira as permissões.
4. Confira no painel Supabase **Authentication → Users** se o número de contas
   corresponde ao projeto atual. A correção não importa contas de outro projeto.
5. Teste uma operação administrativa, por exemplo alterar permissões de uma conta
   de teste, para confirmar também o deploy da Edge Function.
6. Contas sem role `admin` não podem chamar a RPC com sucesso, mesmo diretamente.

Teste automatizado da consulta e do tratamento de erros:

```bash
node --experimental-strip-types scripts/testes/admin-users.mjs
npm run build
```

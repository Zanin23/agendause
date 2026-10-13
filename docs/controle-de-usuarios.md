# Controle de Acessos: criar conta, senha, permissões e listagem

Esta tela (Admin → Controle de Acessos) **não depende mais de publicar a Edge
Function `admin-users`**. Listar, criar conta, definir senha, tornar/remover
administrador e salvar permissões funcionam direto pelo banco (RPC protegida),
como já acontecia com a listagem.

A Edge Function continua no repositório e o app ainda fala com ela **quando a
migração nova não está aplicada** — é só compatibilidade, não é o caminho
principal.

## O que cada caminho faz

| Operação | Caminho principal | Alternativa usada pelo app |
| --- | --- | --- |
| Listar contas | RPC `admin_list_users()` | Edge Function `admin-users` (`list`) |
| Criar conta | RPC `admin_create_user(...)` | Edge Function `admin-users` (`create_user`) |
| Definir senha | RPC `admin_set_password(...)` | Edge Function (`set_password`) |
| Administrador sim/não | RPC `admin_set_admin(...)` | Edge Function (`set_admin`) |
| Salvar permissões | RPC `admin_set_permissions(...)` | Edge Function (`set_permissions`) |
| Enviar e-mail de redefinição | e-mail do próprio login (GoTrue) | Edge Function (`send_reset`) |

Regras que valem para todas as RPCs:

- exigem sessão autenticada **e** role `admin` na tabela `user_roles` — quem não
  é admin recebe “Acesso restrito a administradores”, inclusive chamando direto;
- `anon` não executa nenhuma delas (só `authenticated`, e a checagem de admin
  acontece dentro da função);
- nenhuma delas devolve senha, hash ou token, e `auth.users` continua fechado
  para leitura pelo app;
- a conta criada nasce com e-mail **já confirmado**, com identidade de e-mail
  (`auth.identities`), perfil, vínculo com as bases e papel — pronta para entrar.

## Publicação — o que fazer no Supabase

### 1. Banco (obrigatório, só colar SQL)

No projeto **`psgekwifthuzduhpreay`**, abra **SQL Editor** e execute:

1. `supabase/migrations/20261013130000_admin_list_users.sql` (se ainda não rodou)
2. `supabase/migrations/20261013140000_admin_contas_sem_edge_function.sql`

Os dois arquivos são idempotentes (podem ser executados de novo) e não apagam
nem recriam contas. Requerem as migrações anteriores de roles/permissões/
workspaces.

### 2. Edge Function (opcional)

Só é necessária se o banco recusar as RPCs (veja “Se o banco recusar” abaixo) ou
se você preferir o caminho oficial de administração:

```bash
supabase functions deploy admin-users --project-ref psgekwifthuzduhpreay
```

`supabase/config.toml` configura `verify_jwt = false` **somente para esta
função**: a validação do token ocorre dentro dela, com `auth.getUser(token)`,
seguida da checagem obrigatória `has_role(..., 'admin')`. As variáveis
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são
disponibilizadas pelo ambiente Supabase. Nunca coloque a chave service role no
front-end, na Vercel ou no repositório.

Integre também a alteração do front-end e aguarde o deploy na Vercel. Só publicar
o front-end não cria as funções no banco.

### 3. Se o banco recusar (“permission denied for table users”)

Alguns bancos não autorizam gravar em `auth.users` a partir do SQL. Nesse caso a
tela mostra a mensagem orientando e existem dois caminhos, os dois usando a API
de administração do Supabase:

```bash
# A) publicar a Edge Function (passo 2) e usar a própria tela; ou
# B) criar a conta pela sua máquina, sem CLI e sem abrir o site:
SUPABASE_SERVICE_KEY=sb_secret_xxx \
node scripts/criar-usuario.mjs --email fulano@empresa.com --nome "Fulano de Tal" --admin
```

O script `scripts/criar-usuario.mjs` usa a chave **service_role**, que fica em
**Supabase → Project Settings → API**. Ela nunca vai para o repositório: passe
por variável de ambiente. `--senha` define a senha inicial (sem isso ele gera uma
e envia o e-mail para a pessoa escolher), `--telas schedules,clients` limita as
telas e `--simular` mostra o que seria feito sem gravar nada.

## Conferência

1. Entre com uma conta com role `admin` e abra **Controle de Acessos**.
2. Confira a sua conta (marcada **Você**) e as demais contas cadastradas.
3. Clique em **Novo Usuário**, preencha nome, e-mail e senha (mínimo 6
   caracteres), escolha o cargo e as telas e clique em **Criar Usuário**.
4. A conta nova aparece na lista logo depois, com “E-mail não confirmado” **sem**
   aparecer. Saia e entre com ela para confirmar o acesso.
5. Troque a senha de uma conta de teste (**Definir senha**), use **Tornar
   admin**/**Remover admin** e salve **Permissões** — os três também funcionam
   sem a Edge Function.
6. Confira no painel Supabase **Authentication → Users** se o número de contas
   corresponde ao projeto atual. A correção não importa contas de outro projeto.
7. Contas sem role `admin` não conseguem chamar as RPCs com sucesso, mesmo
   diretamente.

## Testes automatizados

```bash
node scripts/testes/admin-contas-sql.mjs      # SQL em PostgreSQL real (PGlite)
node --experimental-strip-types scripts/testes/admin-users.mjs
npm install --no-save @electric-sql/pglite    # só para o primeiro comando
npm run build
```

O primeiro roda a migração 20261013140000 num Postgres de verdade e confere
criação, senha, papéis, permissões, recusas de quem não é admin e idempotência.
O segundo testa a escolha de caminho do front-end (RPC primeiro, Edge Function
como compatibilidade) e as mensagens de erro.

## Mensagens que continuam aparecendo (e o que significam)

- **“Failed to send a request to the Edge Function”** — o navegador não
  conseguiu completar a chamada à `admin-users`. Ela **não indica que as contas
  foram apagadas**. Se a migração nova estiver aplicada, a tela nem chega a
  chamar a Edge Function.
- **“A gestão de contas ainda não está publicada neste banco…”** — faltam as
  migrações do passo 1 (e a Edge Function não está publicada).
- **“Sua sessão expirou. Saia e entre novamente.”** — token vencido; saia e
  entre de novo.
- **“Já existe uma conta com o e-mail …”** — use **Definir senha** ou **Enviar
  redefinição** para essa conta em vez de criar outra.

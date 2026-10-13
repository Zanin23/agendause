# Não consigo entrar com a minha conta — o que fazer

Guia de acesso do TreinaCheck. Vale para o site publicado
(`https://agendause.vercel.app`), para a prévia do editor e para a base local.

---

## 1. Como o login funciona hoje

- O app **não guarda usuários**. Quem valida e-mail e senha é o **Supabase**.
- O projeto em uso é o **`psgekwifthuzduhpreay`** (o mesmo da agenda, dos
  cronogramas e da integração com o relatório). Ele aparece no `.env` como
  `VITE_SUPABASE_URL`. A tela de login mostra esse endereço no rodapé do
  **Verificar o acesso**.
- As contas são criadas **apenas por administrador** — no site, em
  **Admin → Controle de Acessos → Novo Usuário**, ou fora dele com
  `scripts/criar-usuario.mjs` (veja `docs/controle-de-usuarios.md`). Não existe
  cadastro público.

---

## 1B. O erro na tela aparece como `{}` (ou "servidor fora do ar")?

Isso **não** é a sua senha. É como o sistema mostrava o erro de **infraestrutura**
do Supabase: quando o servidor de login responde 5xx (500, 503, 520…), o cliente
monta a mensagem com o objeto vazio e a tela exibia `{}`. Agora essa mensagem é
traduzida — mas a causa continua sendo uma destas:

| O que aparece | Causa provável | O que fazer |
| --- | --- | --- |
| `{}` / “erro 503” / “fora do ar” | **Projeto pausado** no Supabase (o plano gratuito pausa depois de dias sem uso) | Abra o painel do Supabase, confira se o projeto aparece como **Paused** e clique em **Restore/Resume**. Enquanto estiver pausado, ninguém entra |
| “erro 500/502/520–530” | Instabilidade momentânea do Supabase | Tente de novo em alguns minutos; confira o status do Supabase |
| `Invalid API key` | Chave pública errada no `.env` da Vercel | Confira `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` e faça um novo deploy |

Para confirmar em 10 segundos: tela de login → **Não consigo entrar** →
**Verificar o acesso**. O item **Teste real de login** tenta entrar com uma conta
de mentira:

- “o servidor recusou a conta de teste … o login está funcionando” → o servidor
  está de pé; o problema é a conta/senha de quem tenta entrar;
- “erro 503 …” → o servidor está fora (projeto pausado). O diagnóstico já traz o
  link do painel do Supabase.

---

## 2. A causa mais provável (troca de banco em 11/10/2026)

O sistema mudou de banco nessa data:

| Antes (até 11/10) | Agora |
| --- | --- |
| `pnaupodddxrbqbjilhft.supabase.co` (projeto antigo do Lovable) | `psgekwifthuzduhpreay.supabase.co` |

Quem foi criado **antes** dessa troca existe só no banco antigo. Ao tentar
entrar, o banco novo responde **“Invalid login credentials”** — que o app agora
traduz como:

> *“E-mail ou senha não conferem neste banco. Se a sua conta foi criada antes de
> 11/10 (o sistema trocou de banco nesse dia), use ‘Esqueci minha senha’ ou peça
> ao administrador para recriar a conta.”*

Ou seja: **não é a sua senha que está errada — é a conta que precisa existir no
banco novo.** A seção 4 traz os três caminhos para resolver.

---

## 3. Primeiro, descubra qual é o problema (2 minutos)

1. Abra a tela de login e clique em **“Não consigo entrar”** → **Verificar o
   acesso**. Ela testa, com a chave pública:
   - **Servidor de login** responde? (se não, é internet ou projeto pausado)
   - **Teste real de login** — tenta entrar com uma conta de mentira para separar
     “servidor fora do ar” de “e-mail/senha não conferem”;
   - **Banco de dados** responde?
   - **Integração do relatório** (tabela `documentos`) já foi publicada?
   - Existe **sessão** salva neste navegador?
2. Clique em **Copiar diagnóstico** — isso gera um bloco de texto com a data, a
   página, o projeto e o resultado de cada teste. Cole isso no suporte (ou
   mande aqui no chat) e o problema fica óbvio.
3. Se você **lembra a senha** e mesmo assim não entra → vá para a seção 4
   (conta provavelmente não existe no banco novo).
4. Se você **não lembra a senha** → “Esqueci minha senha” (seção 4A).

---

## 4. Os caminhos de correção

### 4A. “Esqueci minha senha” (o mais rápido)

1. Tela de login → **Esqueci minha senha** → informe o e-mail → **Enviar link**.
2. O e-mail vem do Supabase (assunto *Reset Password*). Confira **spam** e
   **Promoções**. O link vale 1 hora.
3. O link abre `/redefinir-senha`, onde você escolhe a senha nova e já entra.
4. Se o e-mail de redefinição **não chegar em alguns minutos**, quase certo que
   a conta não existe neste banco: os e-mails do Supabase não devolvem erro para
   e-mail inexistente (é proteção contra descoberta de contas). Vá para 4B/4C/4D.

> Requisito: o endereço que abre o link precisa estar liberado em
> **Supabase → Authentication → URL Configuration → Redirect URLs**
> (`https://agendause.vercel.app/redefinir-senha` e, se usar prévias,
> `https://*-<seu-time>.vercel.app/redefinir-senha`).

### 4B. Criar a conta pelo site (administrador)

Entre com uma conta administradora → **Admin → Controle de Acessos** → **Novo
Usuário** → nome, e-mail, senha (mínimo 6 caracteres), cargo e telas. A conta já
nasce com e-mail confirmado e vínculo com as bases.

Se essa tela reclamar que a gestão de contas não está publicada, use o painel
**Conferir publicação no Supabase**, no topo da própria tela: ele diz item por
item o que falta, copia o SQL e abre o editor — não é preciso publicar nenhuma
Edge Function. Instruções em `docs/controle-de-usuarios.md`.

### 4C. Criar a conta direto no painel do Supabase (5 cliques, sem código)

1. Abra **Supabase → projeto `psgekwifthuzduhpreay` → Authentication → Users**.
2. Procure o seu e-mail. Se não estiver na lista, clique em **Add user →
   Create new user**:
   - **email**: o seu
   - **password**: uma senha forte
   - marque **Auto Confirm User** (sem isso o login reclama de “e-mail não
     confirmado”)
3. Pronto para entrar. Depois confira os acessos (seções 4E e 4G).

### 4D. Trazer as contas do banco antigo (script)

Se houver mais gente na mesma situação, o script copia **todas** as contas do
projeto antigo para o banco novo — sem tocar em nada do antigo.

```bash
# do seu computador, na raiz deste repositório
# as chaves service_role ficam em Supabase → Project Settings → API
ANTIGO_URL=https://pnaupodddxrbqbjilhft.supabase.co \
ANTIGO_SERVICE_KEY=<service_role do projeto antigo> \
NOVO_SERVICE_KEY=<service_role do projeto psgekwifthuzduhpreay> \
node scripts/migrar-usuarios.mjs --dry-run          # mostra o que faria
```

Depois, para valer, e já mandando o link de nova senha para cada conta (ninguém
precisa saber senha antiga):

```bash
... node scripts/migrar-usuarios.mjs --enviar-redefinicao --admin seu@email.com
```

- `--admin seu@email.com` garante que a sua conta volte a ser administradora
  (sem isso você entra, mas não vê o menu **Admin**).
- `--com-bases` copia também o nome e a quais bases cada conta pertencia.
- Rodar duas vezes não duplica nada: quem já existe é apenas relatado.
- **As chaves service_role nunca vão para o repositório.** Passe por variável de
  ambiente na hora de rodar (o `.env` do app guarda só a chave pública).

### 4E. “Você não tem acesso a nenhuma base”

Isso é login ok, mas sem vínculo com a base (workspace). No **SQL Editor** do
projeto novo:

```sql
-- qual é o seu id
select id, email from auth.users where email = 'seu@email.com';

-- bases existentes
select id, slug, name from public.workspaces;

-- dê o vínculo (troque o e-mail; faça para cada base que você precisa)
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'member'
from public.workspaces w
join auth.users u on u.email = 'seu@email.com'
on conflict (workspace_id, user_id) do nothing;

-- defina a base que abre por padrão
update public.profiles
set active_workspace_id = (select id from public.workspaces where slug = 'implantacao')
where id = (select id from auth.users where email = 'seu@email.com');
```

### 4F. “Não foi possível carregar suas bases” / tudo travado

O app agora diz isso em vez de ficar girando em “Carregando...”. Significa que
ele não conseguiu ler `workspaces`:

- **Sem internet / rede corporativa bloqueando** → teste em outra rede.
- **Projeto pausado** (planos gratuitos pausam depois de dias sem uso): abra o
  painel do Supabase e clique em **Restore/Resume**. Enquanto estiver pausado,
  **ninguém** entra — nem pelo app, nem pelo site do relatório.
- **Chave errada no `.env`** → confira se `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_PUBLISHABLE_KEY` são do projeto `psgekwifthuzduhpreay`, e
  publique de novo (Vercel → Deployments → Redeploy).

### 4G. Entrei, mas não vejo o menu Admin

O papel de administrador fica em `user_roles`:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'seu@email.com'
on conflict (user_id, role) do nothing;
```

### 4H. “Entrar com Google”

O botão existe na tela de login. Para funcionar, o provedor precisa estar
ligado no banco:

1. **Supabase → Authentication → Providers → Google** → habilite e cole
   *Client ID* e *Client Secret* (do Google Cloud Console).
2. No Google Cloud, em **Authorized redirect URIs**, use o endereço mostrado
   pelo Supabase (`https://psgekwifthuzduhpreay.supabase.co/auth/v1/callback`).
3. Em **URL Configuration**, inclua `https://agendause.vercel.app`.

Se o botão responder *“O login com Google ainda não está habilitado neste
banco”*, o passo 1 ainda não foi feito — entre com e-mail e senha enquanto isso.

---

## 5. Resumo: “quero entrar agora”

| Situação | O que fazer |
| --- | --- |
| Não lembro a senha e já entrei antes | Login → **Esqueci minha senha** → `/redefinir-senha` |
| “E-mail ou senha não conferem” toda vez | Sua conta provavelmente é do banco antigo → **4C** (painel) ou **4D** (script) |
| Sou admin e não consigo **criar** conta | **4B** — publicar as funções pelo painel “Conferir publicação no Supabase” |
| Entro mas fico em “Escolha sua base” vazio | **4E** (vínculo com a base) |
| Entro mas não vejo **Admin** | **4G** (`user_roles`) |
| Nada carrega / “não foi possível falar com o banco” | **4F** (rede, projeto pausado, chave) |
| Login mostra `{}` ou “servidor fora do ar” | **1B** (projeto pausado no Supabase) |
| Quero entrar com Google | **4H** (habilitar provedor no Supabase) |

Ferramenta de apoio em qualquer um dos casos: tela de login → **Não consigo
entrar → Verificar o acesso → Copiar diagnóstico**.

---

## 6. Segurança (leia antes de rodar qualquer coisa)

- **Chave pública (`anon` / `publishable`)**: pode ficar no `.env` e no
  repositório; é ela que o app usa, e as permissões vêm das políticas de RLS.
- **Chave secreta (`service_role`)**: dá acesso total ao banco. **Nunca** a
  coloque no `.env`, em código, em print ou no GitHub. Use só na hora de rodar
  os scripts, por variável de ambiente.
- A tabela `documentos` (integração do relatório) é a **única** com RLS aberta
  para `anon` — isso é obrigatório porque o site do relatório é estático e sem
  login. Nenhuma outra tabela fica exposta assim.

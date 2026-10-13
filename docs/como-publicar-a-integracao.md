# Como publicar a integração — passo a passo mastigado

Este guia é para você executar. São 3 passos (mais um "passo 0" de um clique) e
uns 15 minutos no total. Nada aqui apaga dados: se você parar no meio, nenhum
dos dois sistemas para de funcionar.

Ordem importa: **1 → 2 → 3**. O passo 1 cria a tabela no banco novo; sem ele, os
outros dois não têm onde gravar.

---

## Passo 0 — Levar o código para o sistema publicado (1 clique)

A migração e a tela **Implantações** já estão na `main` (PR #2, mesclado). O que
ainda pode estar só na branch é o ajuste da **matriz de fases editável**, a
**grade da tela inicial** e a **recuperação de acesso** (`Esqueci minha senha` +
`/redefinir-senha` + `Verificar o acesso`), na branch
`arena/ae6ebd81-agendause` (PR aberto).

- Se você trabalha com PR: abra o pull request dessa branch e clique em
  **Merge**. (Se quiser, eu mesclo para você.)
- Se preferir testar antes: nada impede fazer os passos 1 a 3 primeiro — o
  banco e o site do relatório funcionam mesmo sem a tela nova. A tela é só a
  janela nova para olhar os dados.
- Depois do merge, confira em **Vercel → Deployments** se um novo deploy de
  produção começou. Se não começar em alguns minutos, use **Redeploy** no
  último deploy de produção.

**Como saber que deu certo:** depois do deploy, abrir o TreinaCheck e ver o
cartão **“Implantações — Cronogramas + relatório”** na tela inicial (e o item
“Implantações (relatório)” no atalho de busca, com `Ctrl+K`).

---

## Passo 1 — Publicar a integração no Supabase do TreinaCheck

**Onde:** no projeto **do TreinaCheck** (o mesmo que já guarda agenda,
cronogramas e treinamentos). É o projeto cuja URL termina em
`pnaupodddxrbqbjilhft` — **não** o do relatório (`dlnfuvhlkgnzesrnqgfd`).

### 1.1 Abrir o SQL Editor

Link direto (faça login no Supabase antes):

```
https://supabase.com/dashboard/project/pnaupodddxrbqbjilhft/sql/new
```

(ou: entre em supabase.com → escolha o projeto do TreinaCheck → menu da
esquerda → **SQL Editor** → **New query**)

### 1.2 Copiar o SQL

Abra este arquivo e use o botão de copiar do GitHub (ícone de duas folhinhas, no
canto do arquivo):

```
https://github.com/Zanin23/agendause/blob/arena/0b379185-agendause/supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql
```

> É o arquivo inteiro, do começo ao fim. Ele tem blocos comentados (`-- ...`)
> com sugestões opcionais — pode copiar como está.

### 1.3 Colar e rodar

Cole tudo na janela do SQL Editor e clique em **Run** (ou `Ctrl+Enter`).
Deve aparecer **“Success. No rows returned”** em alguns segundos.

### 1.4 Conferir (leva 20 segundos)

Na mesma janela, apague o conteúdo e rode:

```sql
select public.rel_sincronizar_agenda();
```

O esperado: uma linha como
`{"criados": 0, "atualizados": 0, "em": "..."}` — se você ainda não tem
cronograma cadastrado, pode dar `0` e `0` mesmo, isso já prova que a função
existe e rodou.

Depois:

```sql
select nome, agenda_progresso, itens_abertos, visitas_agendadas
  from public.vw_relatorio_implantacoes
 order by nome;
```

O esperado: a lista com as empresas que **já têm cronograma no TreinaCheck**.
(Se vier vazia, é porque nenhum cronograma foi criado ainda — normal.)

**Se der erro:**

| Erro | O que fazer |
| --- | --- |
| `permission denied for schema public` | confirme que está logado no projeto certo (você precisa ser owner/admin dele) |
| `relation "documentos" already exists` | você já rodou antes — pode ignorar, o arquivo é seguro de rodar de novo |
| `publication "supabase_realtime" does not exist` | é um projeto Supabase muito antigo; avise que eu ajusto o bloco de tempo real |
| Erro de sintaxe perto de `--` | provavelmente copiou só um pedaço; copie o arquivo inteiro |

> Rodar esse arquivo **duas vezes não estraga nada** (tudo é `create or replace`
> / `if not exists`).

---

## Passo 2 — Trazer as empresas que já estão no relatório antigo

Elas estão no banco antigo do relatório. Você tem duas rotas — escolha **uma**.

### Rota A — pelo próprio site (sem terminal, ~3 minutos) ✅ recomendada

1. Abra o site do relatório no navegador **que você mais usa** (é ali que estão
   as informações mais completas, guardadas no próprio navegador).
2. **Faça o backup:** menu **Dados ▾ → Exportar JSON**. Guarde esse arquivo.
3. Clique na pílula **☁** no topo (ou **Dados ▾ → Servidor compartilhado**).
4. Cole nos dois campos as chaves do TreinaCheck (estão no arquivo
   `integracao/relatorio-de-implantacoes/sync-config.js`, deste repositório):
   - **URL:** `https://pnaupodddxrbqbjilhft.supabase.co`
   - **Chave:** a linha `anonKey` (começa com `eyJhbGciOi...`)
5. Clique em **“Testar e conectar neste navegador”**.
6. Como o banco novo está vazio, o próprio site **publica sozinho** o relatório
   que está nesse navegador (é o comportamento que ele já tinha: “no primeiro
   acesso com o servidor vazio, o site publica o que estava no navegador”).
7. Confira: a carteira continua aparecendo igual, e a pílula do topo passa a
   mostrar **“ao vivo com a equipe”**.

   > Se alguma empresa não subir, use **Dados ▾ → Importar JSON** e escolha o
   > backup do item 2 — ele publica de novo, agora no banco novo.

Vantagem: como o id da empresa é gerado pela mesma regra nos dois lados (eu
testei nome por nome, inclusive com acento), quando a agenda sincronizar depois
ela **reconhece** essas empresas em vez de criar duplicatas.

### Rota B — pelo script (mais controlada, precisa do Node instalado)

No seu computador:

```bash
git clone https://github.com/Zanin23/agendause.git
cd agendause                              # a main já tem a integração
node -v                                   # precisa aparecer v18 ou maior
```

Se `node -v` não funcionar, instale em <https://nodejs.org> (versão LTS) e abra
o terminal de novo. Depois:

```bash
node scripts/migrar-documentos.mjs --dry-run   # só mostra o que faria
node scripts/migrar-documentos.mjs             # grava de verdade
```

Saída esperada:

```
Lendo https://dlnfuvhlkgnzesrnqgfd.supabase.co …
  12 linha(s) encontrada(s) no projeto antigo.
Já existem no destino: 0 linha(s).
A gravar: 12 linha(s).
✔ 12 linha(s) gravada(s) em https://pnaupodddxrbqbjilhft.supabase.co.
```

Não precisa de `npm install` — o script usa só o que já vem no Node. As duas
chaves usadas são as **públicas** (as mesmas que ficam no HTML dos sites), então
ninguém precisa de senha secreta aqui.

Extra: `--substituir` sobrescreve o que já existir no destino (use só se rodar
duas vezes e quiser que o projeto antigo mande); `--arquivo <backup.json>` lê o
backup do “Exportar JSON” em vez de acessar o banco antigo.

### Como saber que o passo 2 deu certo

Rode no SQL Editor do TreinaCheck:

```sql
select count(*) as empresas, count(*) filter (where dados ? 'cronograma') as com_cronograma
  from public.documentos where id <> '__meta__';
```

Deve bater com o número de empresas que você tinha no relatório.

---

## Passo 3 — Apontar o site do relatório para o banco novo (para a equipe toda)

O passo 2 valeu só para o **seu navegador** (fica no `localStorage` dele). Este
passo publica a mudança no repositório, e aí vale para todo mundo que abre o
link.

### 3.1 Preparar os arquivos

No repositório do TreinaCheck já estão prontos, em
`integracao/relatorio-de-implantacoes/`:

| Arquivo | O que fazer no repositório `Relat-rio-de-implanta-es` |
| --- | --- |
| `sync-config.js` | **substituir** o arquivo existente (é ele que diz para qual banco o site fala) |
| `sync-agenda.js` | **criar** (arquivo novo; é ele que publica o cronograma da agenda quando alguém abre o site) |

> Atalho: no painel ☁ do site, depois de conectar no item 2 acima, existe o
> botão **“Baixar sync-config.js pronto”**. O arquivo baixado é exatamente esse
> `sync-config.js` — dá para usar ele em vez de copiar do outro repositório.

### 3.2 Editar pelo próprio GitHub (sem instalar nada)

1. Abra <https://github.com/Zanin23/Relat-rio-de-implanta-es>.
2. **Substituir `sync-config.js`:** abra o arquivo → ícone de lápis (Edit) →
   apague tudo → cole o conteúdo do novo → **Commit changes**.
3. **Criar `sync-agenda.js`:** botão **Add file → Create new file** → nome
   `sync-agenda.js` → cole o conteúdo → **Commit changes**.
4. **Editar `index.html`:** abra → lápis (Edit) → no fim do arquivo, logo
   **depois** da linha `<script src="app.js"></script>`, adicione:

   ```html
   <script src="sync-agenda.js"></script>
   ```

   → **Commit changes**.

### 3.3 Esperar a Vercel

Não existe build nesse repositório: a Vercel publica em ~10 segundos depois do
commit. Acompanhe em <https://vercel.com> → projeto do relatório → aba
**Deployments** (o último deve ficar com bolinha verde **Ready**).

### Como saber que o passo 3 deu certo

1. Abra o site do relatório em **outro navegador** (ou numa janela anônima, para
   não usar o override local do passo 2).
2. A pílula do topo deve mostrar **“ao vivo com a equipe”** e a carteira deve
   estar lá.
3. Abra uma empresa com cronograma e confira os itens vindos da agenda.
4. Abra o TreinaCheck → **Implantações** e veja a mesma empresa com os dois
   lados (progresso do relatório × progresso da agenda).

---

## Depois de publicado — como fica o dia a dia

- Alguém mexe no cronograma no TreinaCheck → ao abrir a tela **Implantações**
  (uma vez por sessão) ou o site do relatório, o cronograma é republicado. Há
  também o botão **“Publicar cronogramas”** na tela, para forçar na hora.
- Alguém edita o relatório → o TreinaCheck recebe pelo tempo real, sem recarregar.
- Situação, progresso, “status atual”, feito/falta, grupo e observação: quem
  manda é o relatório. Cronograma, datas, responsáveis e visitas: quem manda é a
  agenda. Ninguém apaga o que é do outro.
- Se você quiser que a agenda mande **também** na situação e no progresso:

  ```sql
  select public.rel_sincronizar_agenda(null, true);
  ```

- Se quiser publicação instantânea (sem depender de alguém abrir o sistema),
  descomente o bloco `8) OPCIONAL` do arquivo SQL e rode-o de novo.

---

## Voltar atrás (se algo não gostar)

1. **Site do relatório:** restaure o `sync-config.js` antigo (dá para pegar no
   histórico do GitHub: abra o arquivo → **History** → versão anterior →
   copiar) e remova a linha do `sync-agenda.js` do `index.html`. O site volta a
   usar o banco antigo, que continua intacto — nada foi apagado de lá.
2. **Banco do TreinaCheck:** se quiser remover a integração por completo:

   ```sql
   drop view if exists public.vw_relatorio_implantacoes;
   drop function if exists public.rel_sincronizar_agenda(uuid, boolean);
   drop table if exists public.documentos;   -- só se ninguém estiver usando
   ```

---

## Perguntas que sempre aparecem

**Preciso pagar mais no Supabase?** Não. A integração usa uma tabela pequena
(uma linha por empresa), dentro do mesmo projeto que você já tem.

**Isso mexe no projeto antigo do relatório?** Não. Ele fica intacto como está,
servindo de backup/rollback.

**Alguém pode mexer no meu banco do TreinaCheck por causa disso?** Só na tabela
`documentos` — a permissão pública vale exclusivamente para ela. Agenda,
clientes, notas e cobranças continuam exigindo login e respeitando o
workspace. O texto completo está em
`docs/integracao-relatorio-implantacoes.md`, seção 6.

**Preciso avisar a equipe?** Só isto: “abram o relatório normalmente; o
cronograma agora vem da agenda”. Se alguém tiver colado chaves antigas no painel
☁ daquele navegador, clique em **“Esquecer chaves deste navegador”** para passar
a valer o arquivo do repositório.

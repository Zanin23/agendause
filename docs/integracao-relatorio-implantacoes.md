# Integração TreinaCheck × Relatório de Implantações

Dois sistemas, **um banco só**. O TreinaCheck (agenda, cronogramas, visitas) e o
[Relatório de Implantações](https://github.com/Zanin23/Relat-rio-de-implanta-es)
(dashboard da carteira) passam a ler e escrever no **mesmo projeto Supabase** —
o do TreinaCheck (`psgekwifthuzduhpreay`). Não existe sincronização entre dois
bancos: existe uma tabela compartilhada, uma função que publica o cronograma da
agenda nela e uma view que junta as duas visões.

```
   ┌──────────────────────────── Supabase do TreinaCheck ────────────────────────────┐
   │                                                                                 │
   │  agenda                        integração                      relatório         │
   │  ├ workspace_members           ├ documentos        ←──────  (site estático,     │
   │  ├ implementation_schedules ─┐ ├ rel_sincronizar_agenda()     sync.js, sem login)│
   │  ├ schedule_phases           ├→├ vw_relatorio_implantacoes                      │
   │  ├ schedule_items ───────────┘ └ rel_id_documento()                             │
   │  └ trainings                                                                    │
   │                                                                                 │
   │  tela “Implantações” do TreinaCheck  →  lê a view (as duas partes juntas)        │
   └─────────────────────────────────────────────────────────────────────────────────┘
```

- **A agenda manda** no cronograma: fases, itens, datas previstas/reais,
  responsáveis, visitas agendadas.
- **O relatório manda** no que é curado à mão: tipo de trabalho, situação
  (Aguardando cliente / Em andamento / Atenção / Concluído), progresso,
  “status atual”, “o que já foi feito”, “o que ainda falta”, grupo e observação.
- Nenhum dos dois apaga o que não é dele (detalhes em *Regras de merge*).

---

## 1. O que foi feito neste repositório

| Arquivo | O que é |
| --- | --- |
| `supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql` | Cria `documentos`, a RLS aberta dessa tabela, o tempo real, as funções `rel_*` e a view `vw_relatorio_implantacoes`. **É o coração da integração.** |
| `src/pages/Implantacoes.tsx` | Tela nova do TreinaCheck (rota `/implantacoes`): carteira com as duas visões, cronograma por fase, edição dos campos do relatório (incluindo a **matriz de fases**), publicação manual e tempo real. |
| `scripts/migrar-documentos.mjs` | Traz as empresas que já existem no projeto antigo do relatório (ou de um backup JSON) para o banco do TreinaCheck. |
| `integracao/relatorio-de-implantacoes/` | Arquivos para copiar no **outro repositório**: `sync-config.js` (aponta para o banco do TreinaCheck) e `sync-agenda.js` (chama a sincronização quando o site abre). |
| `src/App.tsx`, `src/pages/HomeExperimental.tsx`, `src/integrations/supabase/types.ts` | Rota, atalho na tela inicial e tipos. |

---

## 2. Passo a passo (uma vez só)

### Passo 1 — publicar o SQL no Supabase do TreinaCheck

1. Abra o projeto `psgekwifthuzduhpreay` → **SQL Editor** → **New query**.
2. Cole o conteúdo inteiro de
   `supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql` e
   clique **Run**. É idempotente: rodar de novo não estraga nada.
3. Confira: `select public.rel_sincronizar_agenda();` deve devolver
   `{"criados": N, "atualizados": M, ...}` e
   `select * from public.vw_relatorio_implantacoes;` deve listar sua carteira.

### Passo 2 — levar as empresas que já estão no relatório

O site do relatório hoje aponta para o projeto antigo (`dlnfuvhlkgnzesrnqgfd`).
As empresas de lá precisam ser copiadas para o projeto novo:

```bash
# do seu computador, na raiz deste repositório
node scripts/migrar-documentos.mjs --dry-run   # mostra o que vai fazer
node scripts/migrar-documentos.mjs             # grava (só cria o que não existe)
```

Alternativa sem rede: no site do relatório, **Dados ▾ → Exportar JSON** e depois

```bash
node scripts/migrar-documentos.mjs --arquivo ~/Downloads/implantacoes-2026-10-12.json
```

> Nada é apagado do projeto antigo: ele continua intacto e pode ser consultado
> (ou usado como rollback) quando você quiser.

### Passo 3 — apontar o site do relatório para o projeto novo

No repositório `Relat-rio-de-implanta-es`:

1. Substitua `sync-config.js` pelo arquivo de
   `integracao/relatorio-de-implantacoes/sync-config.js` (URL e chave do
   TreinaCheck).
2. Copie também `integracao/relatorio-de-implantacoes/sync-agenda.js` para a raiz.
3. No `index.html`, logo **depois** do `app.js`:

   ```html
   <script src="sync-agenda.js"></script>
   ```

4. `git commit` + `git push`. A Vercel publica sozinha.

Pronto: o relatório abre com as empresas que você migrou e, ao abrir, publica
os cronogramas da agenda antes de mostrar a tela.

### Passo 4 — usar

- **TreinaCheck → Implantações** (`/implantacoes`): carteira completa, cronograma
  item por item, visitas, atrasados, os campos do relatório editáveis e a
  **matriz de fases** — abra os detalhes do card e clique em **Editar matriz**.
- **Site do relatório**: como sempre foi, agora com o cronograma vindo da agenda.

---

## 3. De-para dos campos

| TreinaCheck (agenda) | Relatório (`documentos.dados.cronograma[]`) |
| --- | --- |
| `implementation_schedules.client_name` | `nome` (e o `id` da empresa, via `rel_id_documento`) |
| `schedule_phases.title` | `fase` |
| `schedule_items.title` | `atividade` |
| `schedule_items.planned_date` | `data` |
| `schedule_items.done_date` | `concluidoEm` |
| `schedule_items.assignee` | `responsavel` |
| `schedule_items.status` | `status`: `done`→concluido · `in_progress`→andamento · `blocked`→risco · `pending`/`rescheduled`→pendente · `not_applicable`→(não vai) |
| `schedule_items.training_id` → `trainings.scheduled_at` | `visitaData` + `hora` (e `categoria: "visita"`) |
| `trainings` do cliente sem item ligado | item extra com `categoria: "visita"`, `fase: "Visitas"`, `origem: "TreinaCheck · visita presencial/remota/interno"` |
| `trainings.status` | `agendado`→pendente · `concluido`/`realizado`→concluido · `cancelado`→risco (visitas canceladas não entram no cronograma) |
| `implementation_schedules.status` / `paused_at` / item `blocked` | situação da empresa: `concluido`, `risco` (pausada ou bloqueada) ou `andamento` |

Além do `cronograma`, na criação de uma empresa nova a sincronização já leva:
tipo `Nova implantação`, situação, progresso (itens concluídos ÷ itens),
“status atual” (ex.: `1 de 4 itens concluídos · 3 atrasado(s) · próxima visita
13/10 14:00 · resp.: Matheus Zanin`) e a matriz das 5 fases do relatório
(Cadastros básicos · Produtos & Estoque · Comercial / Vendas · Financeiro & PCP ·
Fiscal / Cloud), casando o nome das fases do cronograma com essas cinco.

O `id` da empresa é o **mesmo** que o app do relatório gera
(`n<nome-normalizado>-<hash djb2>`, com acentos removidos) — por isso os dois
lados reconhecem a mesma empresa sem duplicar. Isso é testado linha a linha.

---

## 4. Regras de merge (quem manda em quê)

`rel_sincronizar_agenda(p_workspace uuid default null, p_forcar_status boolean default false)`

| Campo | Na criação | Depois |
| --- | --- | --- |
| `nome`, `cronograma`, `atualizado` | agenda | **agenda** (sempre refeito) |
| `tipo`, `status`, `progresso`, `statusText`, `fases`, `historico` | semente da agenda | **relatório** (a agenda nunca mais toca) |
| `feito`, `falta`, `grupo`, `observacao` | vazio | **relatório** (a agenda nunca escreve) |

A **matriz de fases** (`fases`, sempre 5 pares `[estado, detalhe]` — Cadastros
básicos, Produtos & Estoque, Comercial / Vendas, Financeiro & PCP, Fiscal /
Cloud; estados `done`, `now`, `pend`, `na`) nasce do cronograma, mas depois é
editada à mão nos dois lados: no site do relatório (campo “Fases” do editor) ou
na tela **Implantações** do TreinaCheck — botão **Editar matriz**, no card da
empresa. Os dois gravam direto em `documentos.dados`, então o que muda de um
lado aparece no outro (no TreinaCheck, na hora, pelo tempo real).

- Rodar a função duas vezes seguidas não duplica nada (é idempotente).
- Se você **quiser** que a agenda mande também na situação e no progresso
  (sobrescrevendo o que estiver no relatório), chame com `true`:

  ```sql
  select public.rel_sincronizar_agenda(null, true);
  ```

- A tela Implantações usa o modo padrão (`false`) e mostra os dois números lado
  a lado: “progresso do relatório” e “progresso da agenda”.

---

## 5. Quando a sincronização acontece

- **Ao abrir o site do relatório** — `sync-agenda.js` chama a função e, em
  seguida, pede ao `sync.js` para reler o servidor.
- **Ao abrir a tela Implantações do TreinaCheck** — uma vez por sessão, mais o
  botão **Publicar cronogramas**.
- **Ao mudar algo no relatório** — o `sync.js` publica a empresa normalmente e o
  TreinaCheck recebe pelo tempo real (`postgres_changes` em `documentos`).

Não há cron e não é preciso clicar em nada. Se quiser publicação **instantânea**
(sem depender de alguém abrir o sistema), descomente o bloco `8) OPCIONAL` da
migração: ele cria gatilhos em `schedule_items`, `schedule_phases`,
`implementation_schedules` e `trainings` que chamam a sincronização a cada
mudança.

---

## 6. Segurança

- A tabela `documentos` fica com **RLS aberta para `anon`** (leitura e escrita).
  Isso é obrigatório: o site do relatório é estático, sem login, e usa a anon
  key. É o mesmo modelo que o relatório já tinha no projeto antigo.
- **Só `documentos` fica aberta.** As demais tabelas (agenda, clientes, notas,
  cobranças) continuam protegidas pelas políticas delas — quem não está logado
  não lê nada e quem está logado só vê a base em que é membro.
- Consequência prática: quem tiver a URL do site do relatório (ou a chave, que
  é pública no repositório) vê a carteira, o cronograma e as visitas — **e pode
  editar**. É o comportamento que o relatório já tinha. Se quiser fechar:
  1. proteção por senha na Vercel (*Settings → Deployment Protection*), e/ou
  2. trocar as políticas de escrita de `documentos` por “só autenticado”
     (`to authenticated`), deixando o site do relatório em modo somente leitura.
- A função `rel_sincronizar_agenda` é `security definer` para conseguir ler os
  cronogramas: ela **devolve apenas contadores** (`criados`, `atualizados`), não
  devolve dados internos. Notas internas dos itens (`notes`) e ids internos
  **não** são publicados no cronograma.
- Para limitar a sincronização a uma base: `select public.rel_sincronizar_agenda('<uuid da base>')`
  (exige ser membro da base).

---

## 7. Rollback

Nada é destrutivo. Para voltar atrás:

1. No repositório do relatório, restaure o `sync-config.js` antigo (projeto
   `dlnfuvhlkgnzesrnqgfd`) e remova a tag do `sync-agenda.js`. O site volta a
   funcionar sozinho, com os dados que já estavam lá.
2. No Supabase do TreinaCheck, se quiser apagar a integração:

   ```sql
   drop view  if exists public.vw_relatorio_implantacoes;
   drop function if exists public.rel_sincronizar_agenda(uuid, boolean);
   drop table if exists public.documentos;   -- só se ninguém estiver usando
   ```

---

## 8. Problemas comuns

| Sintoma | Causa provável | Saída |
| --- | --- | --- |
| A tela Implantações mostra “Integração pendente” | a migração ainda não foi rodada | Passo 1 |
| Empresa aparece duplicada no relatório | ela foi criada antes com id diferente (nome digitado de outro jeito) | o `sync.js` do relatório junta duplicatas pelo nome no primeiro boot; ou apague a linha extra em `documentos` |
| Cronograma aparece vazio no relatório | a empresa existe em `documentos` mas não tem cronograma na agenda | crie o cronograma no TreinaCheck ou clique em **Publicar cronogramas** |
| `function rel_sincronizar_agenda does not exist` | migração não publicada, ou o cache do PostgREST | rode o SQL e aguarde alguns segundos |
| Cronograma voltou para uma versão antiga | o relatório publicou um navegador com cache antigo | abre o relatório (ou clica em Publicar cronogramas) e a agenda reescreve |
| Visita não aparece | a visita está cancelada, ou o nome do cliente no treinamento difere do `client_name` do cronograma | ajuste o nome do cliente na visita (a comparação ignora acentos e maiúsculas) |

---

## 9. Testado

A migração foi validada contra um PostgreSQL real (PGlite) com dados de exemplo,
checando: geração de id idêntica à do app do relatório (inclusive nomes com
acento), criação e atualização de empresas, idempotência, preservação das
edições feitas no relatório, `p_forcar_status`, matriz de fases, visitas ligadas
e soltas, e ausência de vazamento de campos internos.

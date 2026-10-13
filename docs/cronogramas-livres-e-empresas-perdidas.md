# Cronogramas livres e Empresas perdidas

Duas coisas novas, feitas para o dia a dia:

1. **Cronograma livre** — um cronograma em branco, para qualquer outra coisa
   (obra, evento, manutenção, rotina, treinamento interno). Você cria, escreve as
   fases e as atividades, e ajusta à mão. Ele **não** entra no relatório de
   implantações.
2. **Empresas perdidas** — uma tela que compara a carteira antiga (banco antigo
   do relatório ou um arquivo exportado) com a de agora e devolve para
   `documentos` só as empresas que ficaram para trás — com o mesmo `id` que o
   relatório usa, sem duplicar nada.

---

## 0. Antes de usar: publicar o SQL (uma vez só)

O cronograma livre depende de três colunas novas na tabela dos cronogramas.
No projeto Supabase do TreinaCheck (`pnaupodddxrbqbjilhft`):

1. **SQL Editor → New query**
2. Cole o conteúdo inteiro de
   `supabase/migrations/20261013120000_cronogramas_livres.sql`
3. **Run**

O arquivo é idempotente e não apaga nada. O que ele faz:

| Passo | O que muda |
| --- | --- |
| Colunas novas em `implementation_schedules` | `kind` (`implantacao` \| `livre`), `title` (título do livre) e `subject` (assunto: Obra, Evento…). Todo cronograma que já existe continua `implantacao`. |
| `rel_sincronizar_agenda()` regravada | passa a publicar no relatório **só** `kind = 'implantacao'` — cronograma livre nunca vira empresa. |
| View `vw_relatorio_implantacoes` regravada | mesma regra, para a tela Implantações não mostrar cronograma livre como se fosse cliente. |

> Enquanto o SQL não estiver publicado, a criação de cronograma livre falha com
> um aviso claro mandando rodar esse arquivo. Implantação de cliente continua
> funcionando normalmente.

Não é preciso SQL para a tela **Empresas perdidas**: ela só lê e escreve em
`documentos`, que já está liberada para o site do relatório.

---

## 1. Cronograma livre (outras coisas)

**Onde:** `Cronogramas → Novo cronograma → “Cronograma livre”`
(atalho direto: `/cronogramas/novo?tipo=livre`, e no `Ctrl+K` → “Novo cronograma livre”).

Ao criar, você informa:

| Campo | Para que serve |
| --- | --- |
| **Título** | o nome do cronograma, ex.: “Obra — reforma da loja Centro”. É o que aparece na lista, no cabeçalho, no PDF e no link. |
| **Assunto** (opcional) | “Obra”, “Evento”, “Manutenção”, “Treinamento interno” — o campo aceita qualquer texto e aparece como selo **Livre · Obra**. |
| **Data de início** | a data de referência do cronograma. |
| **Responsáveis** (opcional) | quem cuida disso, separado por vírgula. |
| **Descrição** (opcional) | contexto; sai no cabeçalho e nas impressões. |
| **Fases iniciais** (opcional) | uma por linha. **Deixe em branco para começar 100% limpo.** |

Depois, na tela do cronograma:

- **Nova fase** (barra lateral) — cria um bloco em branco, você renomeia ali mesmo.
- **Adicionar item** — cria uma atividade em branco dentro da fase (título,
  prevista, conclusão, status, responsável, observações).
- **Colar lista** (barra de ferramentas ou “Colar várias atividades”) — o jeito
  rápido de preencher à mão: **uma atividade por linha**:

  ```
  Conferir medidas | João | 14/10
  Comprar material
  Iniciar execução | 21/10
  ```

  O que vem depois do `|` (ou `;`) é opcional: uma **data** (aceita `14/10`,
  `14/10/2026` e `2026-10-14`) e um **responsável**. Se a fase escrita no topo do
  diálogo ainda não existir, ela é criada na hora.
- Reordenar (↑/↓), duplicar, marcar como concluído, exportar **CSV**, imprimir
  **PDF** (com e sem datas), e o botão **Organograma** — tudo igual aos
  cronogramas de implantação.

O que **não** aparece no cronograma livre (porque não faz sentido):

- aba **Levantamento** (questionário de processos), **Link público** de aceite e
  **Termo p/ Suporte** — são do fluxo de cliente;
- ele não entra no relatório de implantações nem na tela Implantações;
- a lista de cronogramas tem os filtros **Todos · Implantações · Livres**.

---

## 2. Empresas perdidas

**Onde:** `Implantações → “Empresas perdidas”` (ou `Ctrl+K` → “Empresas perdidas”,
rota `/implantacoes/perdidas`). Exige a permissão da tela `reports` (como a
própria tela Implantações).

### De onde vêm as empresas antigas

| Origem | Como funciona |
| --- | --- |
| **Banco antigo** | Lê `documentos` do projeto antigo do relatório (`dlnfuvhlkgnzesrnqgfd`) com a chave pública que estava no site — só leitura, nada é alterado lá. Se um dia o endereço mudar, o botão “Trocar endereço/chave” deixa ajustar (fica guardado no navegador). |
| **JSON / dados.js** | Aceita o arquivo do **Dados ▾ → Exportar JSON** do site do relatório, o **`dados.js`** do repositório, uma lista de empresas ou as linhas de `documentos`. Pode escolher o arquivo ou colar o conteúdo. |

### O que a tela mostra

- **No arquivo antigo**, **no banco de agora**, **Perdidas** (não estão mais aqui)
  e **Novas** (criadas depois do arquivo).
- A lista das perdidas com tipo, situação, progresso, data de atualização e
  quantas etapas de cronograma vinham no arquivo.
- **Baixar CSV** e **Copiar lista** para mandar a lista para alguém.
- Duas listas de conferência (fechadas por padrão): empresas que existem **só**
  no banco de agora, e empresas com **id ou nome diferente** entre os dois lados
  (mesma empresa reconhecida pelo nome — não precisa restaurar).

### Como a comparação funciona

O `id` da empresa no relatório é gerado a partir do nome
(`n<nome-normalizado>-<hash djb2>`), igual no site do relatório, na função SQL
`rel_id_documento()` e no TreinaCheck. A tela compara nesta ordem:

1. **mesmo `id`** → já está aqui (se o nome estiver diferente, entra na lista de
   conferência);
2. **mesmo nome normalizado** (sem acento, minúsculo — igual ao relatório) →
   já está aqui, só o `id` foi criado de outra forma;
3. nenhum dos dois → **perdida**.

### Restaurar

- Marque as empresas (todas já vêm marcadas) e clique em **Restaurar**.
- A gravação usa `ignore-duplicates`: **nada que já existe é sobrescrito**.
- Duas opções antes de gravar:
  - **Trazer o cronograma que veio no arquivo** (marcado): a empresa volta com o
    cronograma antigo junto. Desmarque se você vai criar um cronograma novo na
    agenda (a agenda sempre manda no cronograma depois).
  - **Manter a posição original na lista**: por padrão as restauradas entram no
    fim da carteira.
- Depois de restaurar, a empresa aparece na hora na tela **Implantações** e no
  site do relatório (a tabela `documentos` é a mesma).
- Cada linha da lista tem o botão **Cronograma**, que abre
  `/cronogramas/novo?cliente=<nome>` com o nome já preenchido. Na tela
  Implantações, toda empresa sem cronograma também ganhou o botão
  **Criar cronograma**.

### Pelo terminal (opcional)

O mesmo diagnóstico, fora do navegador:

```bash
# comparar o banco antigo com o de agora (só relata, não grava)
node scripts/empresas-perdidas.mjs

# a partir de um arquivo exportado
node scripts/empresas-perdidas.mjs --arquivo ~/Downloads/implantacoes-2026-10-12.json

# guardar a lista em CSV e em JSON
node scripts/empresas-perdidas.mjs --csv perdidas.csv --json perdidas.json

# restaurar as que faltam
node scripts/empresas-perdidas.mjs --aplicar
```

Opções: `--de`, `--chave-de`, `--para`, `--chave-para` (trocar de servidor),
`--sem-cronograma`, `--manter-ordem`, `--detalhado`, `--ajuda`. O destino padrão
vem do `.env` do repositório; a origem padrão é o banco antigo do relatório.

---

## 3. Testes

```bash
# leitura/comparação das empresas (precisa de Node 22.6+)
node --experimental-strip-types scripts/testes/relatorio-empresas.mjs

# migração SQL num PostgreSQL de verdade (PGlite)
npm install --no-save @electric-sql/pglite
node scripts/testes/cronogramas-livres-sql.mjs
```

O primeiro confere a leitura dos três formatos (exportação, dados.js, linhas de
`documentos`), a comparação (perdida, id diferente, exclusiva do banco) e a
preparação da restauração. O segundo publica a migração num Postgres real e
confere: colunas e `check`, cronograma de implantação continuando a virar
empresa, cronograma livre fora da tabela **e** da view, idempotência, e o `id`
gerado no SQL batendo com o do app.js do relatório (inclusive com acento).

---

## 4. Perguntas rápidas

**Cronograma livre atrapalha o relatório?** Não. A sincronização e a view filtram
`kind = 'implantacao'`; é isso que a migração publica.

**Preciso marcar alguma coisa para o cronograma livre entrar em algum relatório?**
Não — e não entra. Se um dia quiser que ele apareça na tela Implantações, troque
`kind` para `implantacao` no SQL Editor:

```sql
update public.implementation_schedules set kind = 'implantacao' where id = '...';
select public.rel_sincronizar_agenda();
```

**Posso transformar um cronograma de implantação em livre (ou o contrário)?**
Sim, pela mesma coluna `kind` — o resto (fases, itens, visitas) fica igual.
Um cronograma livre que volte para `implantacao` passa a ter o nome do
`client_name` no relatório (no livre ele guarda o mesmo texto do título).

**Restaurei sem querer uma empresa repetida?** Não dá: a gravação ignora `id` que
já existe. E se aparecer duplicada por nome (nome digitado de outro jeito), o
próprio site do relatório junta as duplicatas pelo nome no primeiro boot.

**Apaguei alguém do relatório de propósito — a tela vai trazer de volta?** Só se
você clicar em **Restaurar**. A tela nunca grava sozinha.

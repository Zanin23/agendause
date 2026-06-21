Vou implementar quatro melhorias no TreinaCheck:

## 1. Reagendamento com histórico

- Nova tabela `training_reschedules` armazenando: treinamento, data anterior, nova data, duração anterior, nova duração, motivo, quem reagendou e quando.
- No diálogo "Editar data" (TrainingDetail), adicionar campo obrigatório **"Motivo do reagendamento"**. Ao salvar, além de atualizar `scheduled_at`/`duration_minutes`, registrar uma linha em `training_reschedules`.
- Nova seção **"Histórico de reagendamentos"** na página do treinamento, listando cada alteração com data antiga → nova, motivo e autor.

## 2. Anexos do treinamento

- Bucket privado `training-attachments` no storage com RLS:
  - leitura/upload/delete apenas para autenticados.
  - leitura também por anônimos via signed URLs quando o objeto pertence a um treinamento (o link público continuará exibindo só via signed URL gerada no servidor).
- Tabela `training_attachments`: treinamento, nome do arquivo, caminho no storage, mime type, tamanho, autor, created_at.
- Nova seção **"Anexos"** em `TrainingDetail`:
  - botão de upload (múltiplos arquivos, até 20 MB cada)
  - lista com ícone, nome, tamanho, botão baixar (signed URL) e excluir
- Na página pública de aceite (`/aceite/:id`), exibir os anexos como links para download (signed URL gerada no carregamento), para o cliente conseguir baixar o material.

## 3. Filtros avançados na lista de relatórios/agenda

Na página `Reports.tsx`, expandir a barra de busca atual com:

- Filtro de **cliente** (combobox com clientes distintos)
- Filtro de **status** (Agendado / Cancelado / Todos)
- Filtro de **período** (intervalo de datas com date picker)
- Filtro de **local** (texto livre)
- Botão "Limpar filtros"
- Os filtros são combináveis e atuam sobre a listagem atual. A busca textual existente permanece.

## 4. Comparativo semana a semana no relatório com IA

- A edge function `weekly-report` passa a calcular também as estatísticas da semana anterior à selecionada e enviá-las ao modelo para gerar uma seção de comparação.
- No card de stats da `Reports.tsx`, cada métrica (treinamentos, confirmados, cancelados, aceites) ganha uma seta ▲ verde / ▼ vermelha / ▬ com a variação percentual vs. a semana anterior.
- No corpo do relatório gerado pela IA, prompt atualizado para incluir um bloco "Comparativo com a semana anterior" com leitura qualitativa das variações.

## Detalhes técnicos

**Migrações SQL**

```text
training_reschedules(
  id, training_id FK, previous_scheduled_at, new_scheduled_at,
  previous_duration_minutes, new_duration_minutes,
  reason text not null, changed_by uuid, created_at
)
training_attachments(
  id, training_id FK, file_name, storage_path, mime_type,
  size_bytes, uploaded_by uuid, created_at
)
```

- GRANTs para `authenticated`/`service_role`, RLS por `auth.uid() is not null`, leitura pública de anexos via política `SELECT` para `anon` (o caminho do storage exige signed URL de qualquer forma).  

**Storage**

- bucket `training-attachments` (privado)
- políticas em `storage.objects`: insert/delete por autenticados; select por autenticados; signed URLs cobrem o caso público.

**Frontend**

- `TrainingDetail.tsx`: novos estados/seções para histórico, anexos e motivo no diálogo de reagendamento.
- `GuestAccept.tsx`: nova seção de anexos com download via edge function que retorna signed URL (para não exigir auth do cliente).
- Nova edge function `attachment-signed-url` para gerar signed URL no link público.
- `Reports.tsx`: barra de filtros + deltas semana-a-semana nos cards.
- `supabase/functions/weekly-report/index.ts`: calcular stats da semana anterior, retornar `previousStats` e ajustar prompt.

Vou criar uma migração agrupando as duas tabelas + GRANTs + RLS, criar o bucket via tool dedicada, atualizar a edge function `weekly-report`, criar a edge function `attachment-signed-url` e depois aplicar todas as mudanças de frontend.
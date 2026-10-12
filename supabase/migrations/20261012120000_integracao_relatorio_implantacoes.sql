/* ============================================================================
   INTEGRAÇÃO — TREINACHECK (agenda)  ⇄  RELATÓRIO DE IMPLANTAÇÕES
   ----------------------------------------------------------------------------
   O que este arquivo faz (roda UMA VEZ, no SQL Editor do projeto Supabase do
   TreinaCheck — o mesmo do VITE_SUPABASE_URL):

   1. Cria a tabela `documentos` — a mesma que o app "Relatório de
      Implantações" já usa (uma linha por empresa + a linha `__meta__`).
      Com ela neste projeto, os dois sistemas passam a viver no MESMO banco:
      não existe mais sincronização entre dois bancos, só um lugar onde tudo é
      lido e escrito.
   2. Libera leitura/escrita para `anon` (é assim que o relatório, que é um site
      estático sem login, funciona) e liga o tempo real para as abas abertas.
   3. Publica o cronograma da agenda dentro de `documentos.dados.cronograma` —
      o campo que o relatório já entende (abas Agenda, Pendências e Fases).
      Quem manda no cronograma é a AGENDA; quem manda no texto/status/progresso
      do relatório é o RELATÓRIO. A função de sincronização nunca apaga campo
      que ela não possui.
   4. Cria a view `vw_relatorio_implantacoes`, que junta as duas visões
      (relatório + agenda) numa linha por empresa — é o que a tela
      "Implantações" do TreinaCheck lê.

   Como publicar o cronograma:
     select public.rel_sincronizar_agenda();               -- todas as bases
     select public.rel_sincronizar_agenda('<uuid da base>'); -- uma base só
     select public.rel_sincronizar_agenda(null, true);     -- agenda manda
                                                            -- também no status
                                                            -- e no progresso

   A função é chamada sozinha (a) quando alguém abre a tela Implantações do
   TreinaCheck e (b) quando alguém abre o site do relatório — por isso o
   "sincroniza sozinho ao abrir" não precisa de cron nem de botão.
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) A tabela compartilhada
-- ---------------------------------------------------------------------------
create table if not exists public.documentos (
  id             text primary key,
  dados          jsonb not null default '{}'::jsonb,
  ordem          integer not null default 0,
  atualizado_em  timestamptz not null default now()
);

comment on table public.documentos is
  'Relatório de Implantações (integrado ao TreinaCheck): __meta__ = data do levantamento; demais linhas = uma empresa (dados = objeto como no dados.js do relatório). O campo dados.cronograma é publicado pela agenda.';

-- qualquer alteração empurra o "último update" para frente (igual ao relatório)
create or replace function public.documentos_atualiza_data()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists documentos_atualiza_data_gatilho on public.documentos;
create trigger documentos_atualiza_data_gatilho
  before update on public.documentos
  for each row execute function public.documentos_atualiza_data();

-- ---------------------------------------------------------------------------
-- 2) RLS aberta para quem tem o link (igual ao supabase.sql do relatório)
--    O site do relatório é estático e sem login: ele usa a anon key. As demais
--    tabelas deste projeto continuam protegidas pelas políticas delas — esta
--    liberação vale SÓ para `documentos`.
--    Para fechar depois, troque "using (true)" por uma checagem de JWT ou
--    apague as políticas de escrita e deixe só a de leitura.
-- ---------------------------------------------------------------------------
alter table public.documentos enable row level security;

grant select, insert, update, delete on public.documentos to anon, authenticated;
grant all on public.documentos to service_role;

drop policy if exists documentos_leitura  on public.documentos;
drop policy if exists documentos_insercao on public.documentos;
drop policy if exists documentos_escrita  on public.documentos;
drop policy if exists documentos_remocao  on public.documentos;

create policy documentos_leitura  on public.documentos for select to anon, authenticated using (true);
create policy documentos_insercao on public.documentos for insert to anon, authenticated with check (true);
create policy documentos_escrita  on public.documentos for update to anon, authenticated using (true) with check (true);
create policy documentos_remocao  on public.documentos for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3) Tempo real (as abas abertas recebem o que mudou, sem recarregar)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documentos'
  ) then
    alter publication supabase_realtime add table public.documentos;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Helpers — as MESMAS regras de nome do relatório (app.js e sync.js), para
--    o TreinaCheck gerar exatamente o mesmo id de empresa que o relatório.
-- ---------------------------------------------------------------------------
create or replace function public.rel_norm_nome(p_nome text)
returns text language sql immutable as $$
  select btrim(
    regexp_replace(
      translate(lower(coalesce(p_nome, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;

create or replace function public.rel_id_documento(p_nome text)
returns text language plpgsql immutable as $$
declare
  v_chave text;
  v_cru   text;
  v_hash  bigint := 5381;
  v_b36   text := '';
  v_dig   constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
begin
  v_chave := nullif(public.rel_norm_nome(p_nome), '');
  if v_chave is null then v_chave := 'empresa'; end if;
  v_chave := left(v_chave, 28);

  -- djb2 igual ao do relatório: h = (h * 33 + código) % 2^32, em base 36
  v_cru := lower(btrim(coalesce(p_nome, '')));
  for i in 1 .. char_length(v_cru) loop
    v_hash := (v_hash * 33 + ascii(substr(v_cru, i, 1))) % 4294967296;
  end loop;
  if v_hash = 0 then return 'n' || v_chave || '-0'; end if;
  while v_hash > 0 loop
    v_b36 := substr(v_dig, (v_hash % 36)::int + 1, 1) || v_b36;
    v_hash := v_hash / 36;
  end loop;
  return 'n' || v_chave || '-' || v_b36;
end $$;

-- status de item do cronograma -> status que o relatório entende
create or replace function public.rel_status_item(p_status text)
returns text language sql immutable as $$
  select case lower(coalesce(p_status, ''))
    when 'done'          then 'concluido'
    when 'in_progress'   then 'andamento'
    when 'blocked'       then 'risco'
    when 'rescheduled'   then 'pendente'
    when 'pending'       then 'pendente'
    else ''
  end
$$;

-- status de treinamento/visita -> status que o relatório entende
create or replace function public.rel_status_visita(p_status text)
returns text language sql immutable as $$
  select case lower(coalesce(p_status, ''))
    when 'concluido'  then 'concluido'
    when 'realizado'  then 'concluido'
    when 'cancelado'  then 'risco'
    else 'pendente'
  end
$$;

-- rótulo amigável do tipo de visita
create or replace function public.rel_rotulo_visita(p_tipo text)
returns text language sql immutable as $$
  select case lower(coalesce(p_tipo, ''))
    when 'presencial' then 'visita presencial'
    when 'remoto'     then 'treinamento remoto'
    when 'interno'    then 'ajuste interno'
    else coalesce(nullif(p_tipo, ''), 'visita')
  end
$$;

-- ---------------------------------------------------------------------------
-- 5) Monta o cronograma (fases + itens + visitas) no formato do relatório
-- ---------------------------------------------------------------------------
create or replace function public.rel_cronograma_agenda(p_schedule_id uuid)
returns jsonb language sql stable as $$
  with itens as (
    select
      p.position * 10000 + i.position as ord,
      jsonb_build_object(
        'id',          'tc-' || replace(i.id::text, '-', ''),
        'atividade',   i.title,
        'fase',        coalesce(p.title, ''),
        'data',        coalesce(i.planned_date::text, ''),
        'visitaData',  case when t.id is not null
                            then to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
                            else '' end,
        'concluidoEm', coalesce(i.done_date::text, ''),
        'responsavel', coalesce(i.assignee, ''),
        'hora',        case when t.id is not null
                            then to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI')
                            else '' end,
        'categoria',   case when t.id is not null then 'visita' else 'etapa' end,
        'status',      case when i.status = 'done' then 'concluido'
                            else public.rel_status_item(i.status::text) end,
        'progresso',   null,
        'origem',      'TreinaCheck',
        'atualizado',  to_char(coalesce(i.done_date, i.updated_at::date), 'YYYY-MM-DD')
      ) as item
    from public.schedule_phases p
    join public.schedule_items i on i.phase_id = p.id
    left join public.trainings t on t.id = i.training_id
    where p.schedule_id = p_schedule_id
      and i.status <> 'not_applicable'
  ),
  visitas_soltas as (
    -- visitas/treinamentos do cliente que não estão presos a um item do cronograma
    select
      900000 + row_number() over (order by t.scheduled_at) as ord,
      jsonb_build_object(
        'id',          'tcv-' || replace(t.id::text, '-', ''),
        'atividade',   coalesce(nullif(t.title, ''), 'Visita'),
        'fase',        'Visitas',
        'data',        to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'visitaData',  to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'concluidoEm', case when t.status in ('concluido', 'realizado')
                            then to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
                            else '' end,
        'responsavel', '',
        'hora',        to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'categoria',   'visita',
        'status',      public.rel_status_visita(t.status),
        'progresso',   null,
        'origem',      'TreinaCheck · ' || public.rel_rotulo_visita(t.visit_type),
        'atualizado',  to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
      ) as item
    from public.trainings t
    join public.implementation_schedules s on s.id = p_schedule_id
    where t.client is not null
      and t.workspace_id = s.workspace_id
      and public.rel_norm_nome(t.client) = public.rel_norm_nome(s.client_name)
      and t.status <> 'cancelado'
      and not exists (
        select 1
        from public.schedule_items i
        join public.schedule_phases p on p.id = i.phase_id
        where p.schedule_id = p_schedule_id and i.training_id = t.id
      )
  ),
  tudo as (
    select * from itens union all select * from visitas_soltas
  )
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) from tudo
$$;

-- ---------------------------------------------------------------------------
-- 6) Sincronização: agenda -> documentos
--    · SEMPRE atualiza: nome, cronograma e data da atualização
--    · SÓ NA CRIAÇÃO: tipo, status, progresso, statusText e a matriz de fases
--      (para a empresa não nascer vazia no relatório)
--    · p_forcar_status = true faz a agenda mandar também no status/progresso,
--      sobrescrevendo o que estiver no relatório — use com consciência.
--    · Nunca toca em feito, falta, grupo, observacao, historico e nas edições
--      feitas no próprio relatório.
-- ---------------------------------------------------------------------------
create or replace function public.rel_sincronizar_agenda(
  p_workspace uuid default null,
  p_forcar_status boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agenda        record;
  v_id            text;
  v_existente     jsonb;
  v_cronograma    jsonb;
  v_itens_total   int;
  v_itens_done    int;
  v_itens_atras   int;
  v_progresso     int;
  v_status        text;
  v_status_texto  text;
  v_fases         jsonb := '[]'::jsonb;
  v_fase_rotulos  text[] := array['Cadastros básicos', 'Produtos & Estoque', 'Comercial / Vendas', 'Financeiro & PCP', 'Fiscal / Cloud'];
  v_rotulo        text;
  v_fase          record;
  v_prox          record;
  v_visitas       record;
  v_equipe        text;
  v_patch         jsonb;
  v_novo          jsonb;
  v_ordem         int;
  v_criados       int := 0;
  v_atualizados   int := 0;
begin
  if p_workspace is not null
     and not (coalesce(public.is_workspace_member(p_workspace), false) or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Sem permissão para sincronizar esta base';
  end if;

  -- evita duas abas sincronizando ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('rel_sincronizar_agenda'));

  select coalesce(max(ordem), 0) into v_ordem
  from public.documentos where id <> '__meta__';

  for v_agenda in
    select s.id, s.client_name, s.workspace_id, s.status, s.modality, s.cadence,
           s.start_date, s.use_team, s.paused_at, s.pause_reason
    from public.implementation_schedules s
    where p_workspace is null or s.workspace_id = p_workspace
    order by s.client_name
  loop
    v_id := public.rel_id_documento(v_agenda.client_name);

    -- itens: concluídos, total e atrasados (item aberto com prazo já vencido)
    select count(*),
           count(*) filter (where i.status = 'done'),
           count(*) filter (where i.status <> 'done'
                              and i.planned_date is not null
                              and i.planned_date < current_date)
      into v_itens_total, v_itens_done, v_itens_atras
    from public.schedule_phases p
    join public.schedule_items i on i.phase_id = p.id
    where p.schedule_id = v_agenda.id
      and i.status <> 'not_applicable';

    v_progresso := case when coalesce(v_itens_total, 0) > 0
                        then round(v_itens_done::numeric * 100 / v_itens_total)::int
                        else 0 end;

    -- situação da empresa: concluída, em risco (parada/bloqueada) ou em andamento
    v_status := case
      when v_agenda.status = 'concluido' then 'concluido'
      when v_agenda.status = 'draft' then 'andamento'
      when v_agenda.paused_at is not null then 'risco'
      when exists (
        select 1 from public.schedule_phases p
        join public.schedule_items i on i.phase_id = p.id
        where p.schedule_id = v_agenda.id and i.status = 'blocked'
      ) then 'risco'
      when v_itens_total > 0 and v_itens_done = v_itens_total then 'concluido'
      else 'andamento'
    end;

    -- matriz de fases (as 5 caixas que o relatório mostra)
    v_fases := '[]'::jsonb;
    foreach v_rotulo in array v_fase_rotulos loop
      select count(i.*) as total,
             count(*) filter (where i.status = 'done') as done,
             count(*) filter (where i.status in ('in_progress', 'rescheduled')) as em_curso
        into v_fase
      from public.schedule_phases p
      left join public.schedule_items i on i.phase_id = p.id
      where p.schedule_id = v_agenda.id
        and public.rel_norm_nome(p.title) = public.rel_norm_nome(v_rotulo)
      group by public.rel_norm_nome(p.title)
      limit 1;

      v_fases := v_fases || jsonb_build_array(jsonb_build_array(
        case
          when coalesce(v_fase.total, 0) = 0 then 'na'
          when v_fase.done = v_fase.total then 'done'
          when v_fase.done > 0 or coalesce(v_fase.em_curso, 0) > 0 then 'now'
          else 'pend'
        end,
        case when coalesce(v_fase.total, 0) > 0
             then v_fase.done || '/' || v_fase.total || ' itens'
             else '' end
      ));
    end loop;

    -- próxima visita e resumo das visitas do cliente
    select count(*) as total,
           count(*) filter (where t.status in ('concluido', 'realizado')) as realizadas,
           count(*) filter (where t.status = 'cancelado') as canceladas,
           count(*) filter (where t.status = 'agendado') as agendadas
      into v_visitas
    from public.trainings t
    where t.client is not null
      and t.workspace_id = v_agenda.workspace_id
      and public.rel_norm_nome(t.client) = public.rel_norm_nome(v_agenda.client_name);

    select t.title,
           to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM') as dia,
           to_char(t.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI') as hora
      into v_prox
    from public.trainings t
    where t.client is not null
      and t.workspace_id = v_agenda.workspace_id
      and public.rel_norm_nome(t.client) = public.rel_norm_nome(v_agenda.client_name)
      and t.status = 'agendado'
      and t.scheduled_at >= now()
    order by t.scheduled_at
    limit 1;

    v_equipe := case
      when v_agenda.use_team is null or cardinality(v_agenda.use_team) = 0 then ''
      else ' · resp.: ' || array_to_string(v_agenda.use_team, ', ')
    end;

    v_status_texto := concat(
      coalesce(v_itens_done, 0), ' de ', coalesce(v_itens_total, 0), ' itens concluídos',
      case when coalesce(v_itens_atras, 0) > 0 then ' · ' || v_itens_atras || ' atrasado(s)' else '' end,
      case when v_prox.dia is not null then ' · próxima visita ' || v_prox.dia || ' ' || v_prox.hora else '' end,
      case when v_agenda.paused_at is not null then ' · cronograma pausado' else '' end,
      v_equipe
    );

    v_cronograma := public.rel_cronograma_agenda(v_agenda.id);

    -- o que vai ser atualizado em quem já existe
    v_patch := jsonb_build_object(
      'nome',        v_agenda.client_name,
      'cronograma',  v_cronograma,
      'atualizado',  to_char(current_date, 'YYYY-MM-DD')
    ) || case when p_forcar_status then jsonb_build_object(
      'status',     v_status,
      'progresso',  v_progresso,
      'statusText', v_status_texto
    ) else '{}'::jsonb end;

    select dados into v_existente
    from public.documentos where id = v_id;

    if v_existente is null then
      -- empresa nova no relatório: nasce com o que a agenda já sabe
      v_novo := jsonb_build_object(
        'id',         v_id,
        'nome',       v_agenda.client_name,
        'tipo',       'Nova implantação',
        'status',     v_status,
        'progresso',  v_progresso,
        'statusText', v_status_texto,
        'feito',      '[]'::jsonb,
        'falta',      '[]'::jsonb,
        'grupo',      '[]'::jsonb,
        'fases',      v_fases,
        'observacao', coalesce(v_agenda.pause_reason, ''),
        'atualizado', to_char(current_date, 'YYYY-MM-DD'),
        'historico',  jsonb_build_array(jsonb_build_object(
          'data', to_char(current_date, 'YYYY-MM-DD'),
          'progresso', v_progresso,
          'status', v_status,
          'texto', 'Empresa criada a partir do cronograma do TreinaCheck'
        )),
        'cronograma', v_cronograma
      );

      v_ordem := v_ordem + 1;
      insert into public.documentos (id, dados, ordem)
      values (v_id, v_novo, v_ordem);
      v_criados := v_criados + 1;
    else
      update public.documentos
         set dados = v_existente || v_patch
       where id = v_id;
      v_atualizados := v_atualizados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'criados', v_criados,
    'atualizados', v_atualizados,
    'em', now()
  );
end $$;

revoke all on function public.rel_sincronizar_agenda(uuid, boolean) from public;
grant execute on function public.rel_sincronizar_agenda(uuid, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) A view que junta relatório + agenda (uma linha por empresa)
--    security_invoker = true: quem lê vê o que as políticas de RLS deixarem —
--    o anon enxerga a parte do relatório; o usuário logado do TreinaCheck
--    enxerga também a agenda da base em que é membro.
-- ---------------------------------------------------------------------------
drop view if exists public.vw_relatorio_implantacoes;

create view public.vw_relatorio_implantacoes
with (security_invoker = true) as
with agenda as (
  select distinct on (public.rel_id_documento(s.client_name))
    public.rel_id_documento(s.client_name) as id,
    s.id            as schedule_id,
    s.client_name   as nome_agenda,
    s.workspace_id,
    s.status        as agenda_status,
    s.modality::text as modalidade,
    s.cadence::text  as cadencia,
    s.start_date    as inicio,
    s.use_team      as equipe,
    s.paused_at,
    s.pause_reason,
    s.updated_at    as atualizado_agenda
  from public.implementation_schedules s
  order by public.rel_id_documento(s.client_name), s.start_date desc, s.updated_at desc
),
itens as (
  select a.id,
         count(i.*)                                              as itens_total,
         count(*) filter (where i.status = 'done')               as itens_concluidos,
         count(*) filter (where i.status <> 'done')              as itens_abertos,
         count(*) filter (where i.status <> 'done'
                            and i.planned_date is not null
                            and i.planned_date < current_date)     as itens_atrasados
  from agenda a
  join public.schedule_phases p on p.schedule_id = a.schedule_id
  left join public.schedule_items i on i.phase_id = p.id and i.status <> 'not_applicable'
  group by a.id
),
visitas as (
  select a.id,
         count(t.*)                                                        as visitas_total,
         count(*) filter (where t.status in ('concluido', 'realizado'))      as visitas_realizadas,
         count(*) filter (where t.status = 'agendado')                      as visitas_agendadas,
         count(*) filter (where t.status = 'cancelado')                     as visitas_canceladas,
         min(t.scheduled_at) filter (where t.status = 'agendado' and t.scheduled_at >= now()) as proxima_visita,
         (array_agg(t.title order by t.scheduled_at)
            filter (where t.status = 'agendado' and t.scheduled_at >= now()))[1] as proxima_visita_titulo
  from agenda a
  join public.trainings t
    on t.workspace_id = a.workspace_id
   and t.client is not null
   and public.rel_norm_nome(t.client) = public.rel_norm_nome(a.nome_agenda)
  group by a.id
)
select
  coalesce(d.id, a.id)                                    as id,
  coalesce(d.dados ->> 'nome', a.nome_agenda)             as nome,
  a.nome_agenda,
  a.schedule_id,
  case when d.id is null then 'agenda'
       when a.id is null then 'relatorio'
       else 'ambos' end                                   as origem,
  d.ordem,
  d.dados                                                 as relatorio,
  d.atualizado_em                                         as atualizado_relatorio,
  d.dados ->> 'status'                                    as status_relatorio,
  -- só converte quando é número de verdade (o relatório grava 0-100)
  case when (d.dados ->> 'progresso') ~ '^[0-9]{1,3}$'
       then (d.dados ->> 'progresso')::int else null end  as progresso_relatorio,
  d.dados ->> 'statusText'                                as status_text,
  d.dados ->> 'tipo'                                      as tipo,
  a.workspace_id,
  a.agenda_status,
  a.modalidade,
  a.cadencia,
  a.inicio,
  a.equipe,
  (a.paused_at is not null)                               as pausado,
  a.pause_reason                                          as motivo_pausa,
  a.atualizado_agenda,
  case when coalesce(i.itens_total, 0) > 0
       then round(coalesce(i.itens_concluidos, 0)::numeric * 100 / i.itens_total)::int
       else null end                                      as agenda_progresso,
  coalesce(i.itens_total, 0)                              as itens_total,
  coalesce(i.itens_concluidos, 0)                         as itens_concluidos,
  coalesce(i.itens_abertos, 0)                            as itens_abertos,
  coalesce(i.itens_atrasados, 0)                          as itens_atrasados,
  coalesce(v.visitas_total, 0)                            as visitas_total,
  coalesce(v.visitas_realizadas, 0)                       as visitas_realizadas,
  coalesce(v.visitas_agendadas, 0)                        as visitas_agendadas,
  coalesce(v.visitas_canceladas, 0)                       as visitas_canceladas,
  to_char(v.proxima_visita at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as proxima_visita_data,
  to_char(v.proxima_visita at time zone 'America/Sao_Paulo', 'HH24:MI')    as proxima_visita_hora,
  v.proxima_visita_titulo,
  case when a.schedule_id is not null
       then public.rel_cronograma_agenda(a.schedule_id)
       else coalesce(d.dados -> 'cronograma', '[]'::jsonb) end as cronograma
from public.documentos d
full outer join agenda a on a.id = d.id
left join itens i on i.id = a.id
left join visitas v on v.id = a.id
where coalesce(d.id, a.id) <> '__meta__';

comment on view public.vw_relatorio_implantacoes is
  'Uma linha por empresa juntando o relatório (documentos.dados) e o cronograma/visitas da agenda. Usada pela tela Implantações do TreinaCheck.';

grant select on public.vw_relatorio_implantacoes to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) OPCIONAL — publicar na hora, sem depender de alguém abrir o sistema.
--    Descomente se quiser que cada mudança em item/fase/cronograma empurre o
--    cronograma para o relatório no mesmo instante.
-- ---------------------------------------------------------------------------
-- create or replace function public.rel_sincronizar_agenda_gatilho()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   perform public.rel_sincronizar_agenda(null, false);
--   return null;
-- end $$;
--
-- drop trigger if exists rel_sync_itens on public.schedule_items;
-- create trigger rel_sync_itens after insert or update or delete on public.schedule_items
--   for each statement execute function public.rel_sincronizar_agenda_gatilho();
-- drop trigger if exists rel_sync_fases on public.schedule_phases;
-- create trigger rel_sync_fases after insert or update or delete on public.schedule_phases
--   for each statement execute function public.rel_sincronizar_agenda_gatilho();
-- drop trigger if exists rel_sync_cronogramas on public.implementation_schedules;
-- create trigger rel_sync_cronogramas after insert or update or delete on public.implementation_schedules
--   for each statement execute function public.rel_sincronizar_agenda_gatilho();
-- drop trigger if exists rel_sync_trainings on public.trainings;
-- create trigger rel_sync_trainings after insert or update or delete on public.trainings
--   for each statement execute function public.rel_sincronizar_agenda_gatilho();

-- ---------------------------------------------------------------------------
-- 9) Conferência rápida (rode depois de publicar algo)
-- ---------------------------------------------------------------------------
-- select public.rel_sincronizar_agenda();
-- select id, nome, agenda_progresso, progresso_relatorio, itens_abertos, visitas_agendadas
--   from public.vw_relatorio_implantacoes order by nome;

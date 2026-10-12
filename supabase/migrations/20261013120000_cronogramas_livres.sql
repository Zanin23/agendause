/* ============================================================================
   CRONOGRAMAS LIVRES ("outras coisas") + EMPRESAS PERDIDAS
   ----------------------------------------------------------------------------
   O que este arquivo faz (roda UMA VEZ, no SQL Editor do projeto Supabase do
   TreinaCheck — o mesmo do VITE_SUPABASE_URL):

   1. Cria a distinção entre dois tipos de cronograma:
        kind = 'implantacao'  → cliente do relatório (como sempre foi);
        kind = 'livre'        → cronograma de qualquer outra coisa (obra,
                                 evento, manutenção, rotina interna…).
      Ganha também `title` (título do cronograma livre) e `subject` (o assunto:
      "Obra", "Evento", "Treinamento interno"…), que podem ser editados na
      agenda e não afetam nada dos cronogramas de implantação.

   2. Refaz `rel_sincronizar_agenda()` e a view `vw_relatorio_implantacoes`
      para que cronograma livre NÃO vire empresa no relatório: a carteira do
      relatório continua sendo só implantação de cliente.

   Nada é apagado e nada muda de lugar: os cronogramas que já existem nascem
   com kind = 'implantacao', exatamente como estavam.
   É idempotente — rodar de novo não estraga nada.

   A leitura/comparação das empresas perdidas e a criação dos cronogramas
   livres acontecem pela própria interface (telas "Empresas perdidas" e
   "Novo cronograma → Cronograma livre"); não é preciso mais nada no banco.
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) Os dois tipos de cronograma
-- ---------------------------------------------------------------------------
alter table public.implementation_schedules
  add column if not exists kind    text not null default 'implantacao',
  add column if not exists title   text,
  add column if not exists subject text;

comment on column public.implementation_schedules.kind is
  'implantacao = cliente do relatório de implantações; livre = cronograma de outra coisa (não entra no relatório).';
comment on column public.implementation_schedules.title is
  'Título do cronograma livre (quando kind = livre). Nos cronogramas de implantação, o nome continua sendo client_name.';
comment on column public.implementation_schedules.subject is
  'Assunto do cronograma livre: Obra, Evento, Manutenção, Treinamento interno…';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'implementation_schedules_kind_check'
  ) then
    alter table public.implementation_schedules
      add constraint implementation_schedules_kind_check check (kind in ('implantacao', 'livre'));
  end if;
end $$;

create index if not exists implementation_schedules_kind_idx
  on public.implementation_schedules(kind, start_date desc);

-- ---------------------------------------------------------------------------
-- 2) A agenda → relatório passa a considerar só implantação de cliente
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
    -- cronogramas livres ("outras coisas") NÃO entram no relatório de implantações
    where s.kind = 'implantacao'
      and (p_workspace is null or s.workspace_id = p_workspace)
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
-- 3) A view da tela Implantações (mesma coisa, agora só com implantação)
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
  where s.kind = 'implantacao'   -- cronograma livre fica fora da carteira do relatório
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

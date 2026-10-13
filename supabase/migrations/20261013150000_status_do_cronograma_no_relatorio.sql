-- ============================================================================
-- O status do cronograma (que agora muda dentro do próprio cronograma) chega
-- certo no relatório de implantações.
--
-- O app grava `implementation_schedules.status` como 'completed' quando o
-- cronograma é marcado como Concluído, mas `rel_sincronizar_agenda()` só
-- conhecia 'concluido' — a empresa continuava aparecendo "Em andamento" no
-- relatório até todas as etapas ficarem concluídas. Esta migração corrige isso
-- e também trata 'paused'/'waiting_client' como parada (risco), mesmo quando
-- `paused_at` estiver vazio.
--
-- Quem publica o status no relatório é a chamada com p_forcar_status = true
-- (a opção "agenda manda também no status e no progresso"): é o que o botão de
-- status dentro do cronograma faz ao mudar para Concluído/Arquivado e ao
-- pausar/retomar. Sem forçar, o relatório continua dono do próprio status.
--
-- É só a MESMA função `rel_sincronizar_agenda` publicada de novo, com o CASE
-- do status ajustado. Idempotente: pode rodar quantas vezes quiser.
--
-- Publicação: SQL Editor do projeto pnaupodddxrbqbjilhft → cole este arquivo.
-- ============================================================================

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
      -- 'completed' é o "Concluído" que o app grava; 'concluido' era o valor antigo
      when v_agenda.status in ('concluido', 'completed') then 'concluido'
      when v_agenda.status = 'draft' then 'andamento'
      when v_agenda.status in ('paused', 'waiting_client') then 'risco'
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

comment on function public.rel_sincronizar_agenda(uuid, boolean) is
  'Agenda -> relatório: publica cronogramas de implantação em documentos. Status concluído aceita ''completed'' (app) e ''concluido''; pausa vale por status ou paused_at.';

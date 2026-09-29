// Gera uma URL assinada e temporária para download de um anexo de treinamento.
//
// POR QUE MUDOU
// A versão anterior não verificava quem estava chamando: bastava enviar um
// `attachment_id` para receber um link de download válido por 10 minutos. Um ID
// de anexo que escapasse por log, histórico de navegador ou resposta de outra
// tela dava acesso ao arquivo sem nenhuma relação com o treinamento.
//
// O QUE EXIGE AGORA
//   1. `attachment_id` E `training_id`, e o anexo precisa pertencer àquele
//      treinamento — um ID de anexo solto não serve mais para nada.
//   2. Autorização por um dos dois caminhos:
//        (a) equipe: JWT válido cuja base ativa seja a dona do treinamento;
//        (b) convidado: conhecimento do UUID do treinamento, que é exatamente o
//            que está no link /aceite/:id que ele recebeu por e-mail/WhatsApp.
//
// LIMITAÇÃO CONHECIDA (documentada de propósito)
// O caminho (b) continua confiando no UUID do treinamento como credencial,
// porque a tabela `trainings` não tem coluna `public_token` — diferente de
// `implementation_schedules`, `handoff_terms` e `process_surveys`, que têm.
// Os links /aceite/:id já enviados a clientes não podem ser trocados sem quebrar.
// Endurecer de verdade exige uma migração em duas etapas:
//   1. ALTER TABLE public.trainings ADD COLUMN public_token text UNIQUE
//        DEFAULT encode(gen_random_bytes(16),'hex');
//      e manter /aceite/:id aceitando os dois formatos;
//   2. quando não houver mais links antigos em circulação, passar a rota para
//      /aceite/:token e exigir o token aqui no lugar do UUID.
// Enquanto isso, UUID v4 tem 122 bits de entropia: não é enumerável por força
// bruta. O risco residual é um link encaminhado a terceiro — que já dava acesso
// à página de aceite inteira de qualquer forma.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Link válido por 5 minutos: suficiente para o download começar, curto o
// bastante para não circular se for copiado.
const SIGNED_URL_TTL_SECONDS = 60 * 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json({ error: 'Missing server configuration' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const attachmentId = String(body?.attachment_id || '').trim();
    const trainingId = String(body?.training_id || '').trim();
    if (!attachmentId || !trainingId) {
      return json({ error: 'attachment_id e training_id são obrigatórios' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) O anexo precisa existir E pertencer ao treinamento informado.
    const { data: att, error: attErr } = await supabase
      .from('training_attachments')
      .select('id, training_id, storage_path, file_name')
      .eq('id', attachmentId)
      .maybeSingle();
    // Mensagem genérica de propósito: não devolver o erro cru do Postgres,
    // que revelava detalhes do schema a chamadores anônimos.
    if (attErr) return json({ error: 'Não foi possível consultar o anexo' }, 500);
    if (!att || att.training_id !== trainingId) {
      return json({ error: 'Anexo não encontrado' }, 404);
    }

    // 2) Autorização.
    const { data: training } = await supabase
      .from('trainings')
      .select('id, workspace_id')
      .eq('id', trainingId)
      .maybeSingle();
    if (!training) return json({ error: 'Treinamento não encontrado' }, 404);

    let authorized = false;

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (token) {
      // Caminho (a) — equipe autenticada: precisa pertencer à base dona do
      // treinamento, o mesmo critério da política restritiva de RLS.
      const { data: userData, error: userErr } = await createClient(SUPABASE_URL, ANON_KEY)
        .auth.getUser(token);
      if (!userErr && userData?.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('active_workspace_id')
          .eq('id', userData.user.id)
          .maybeSingle();
        authorized =
          !!training.workspace_id &&
          training.workspace_id === (prof as { active_workspace_id?: string | null } | null)?.active_workspace_id;
      }
    }

    if (!authorized) {
      // Caminho (b) — convidado anônimo: a posse do UUID do treinamento é a
      // credencial. Ver LIMITAÇÃO CONHECIDA no cabeçalho deste arquivo.
      // Chegamos aqui sabendo que o anexo pertence ao treinamento (passo 1),
      // então o que resta é garantir que o treinamento é um fluxo de aceite
      // público — não um registro interno qualquer.
      const { data: pub } = await supabase
        .from('trainings')
        .select('id, requires_acceptance')
        .eq('id', trainingId)
        .maybeSingle();
      authorized = !!pub && pub.requires_acceptance === true;
    }

    if (!authorized) return json({ error: 'Não autorizado' }, 403);

    const { data: signed, error: signErr } = await supabase.storage
      .from('training-attachments')
      .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SECONDS, { download: att.file_name });
    if (signErr || !signed) return json({ error: 'Falha ao gerar o link de download' }, 500);

    return json({ url: signed.signedUrl, file_name: att.file_name, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch {
    // Nunca vazar a mensagem interna da exceção para o cliente.
    return json({ error: 'Erro interno' }, 500);
  }
});

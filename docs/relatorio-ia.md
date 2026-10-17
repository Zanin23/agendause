# Relatório com IA — Gemini direto

A tela **Relatórios de aceite → Aceites → Relatório com IA** chama a Edge Function
`weekly-report`, que agora usa a API do Google Gemini diretamente. Não depende
mais do gateway, da chave ou dos créditos de IA do Lovable.

## Configuração segura

1. Crie uma chave da Gemini API no [Google AI Studio](https://aistudio.google.com/apikey)
   em um projeto sob seu controle. Confira a habilitação da API, as restrições da
   chave, as cotas, o faturamento e os termos de uso de dados do projeto escolhido.
   Não presumimos disponibilidade gratuita ou cota ilimitada.
2. No projeto Supabase **Agendause** (`pnaupodddxrbqbjilhft`), abra
   [Edge Functions → Secrets](https://supabase.com/dashboard/project/pnaupodddxrbqbjilhft/functions/secrets)
   e salve a chave com o nome **`GEMINI_API_KEY`**.
   Não envie a chave no chat, não use a chave do Supabase e não coloque esse
   segredo em variáveis `VITE_*`, no repositório ou no navegador.
3. Opcional: configure **`GEMINI_MODEL`** com o identificador de um modelo de
   texto compatível com `generateContent`, disponível para sua chave. O padrão
   do código é `gemini-2.5-flash`. Não inclua `models/` nem uma URL. Se o Google
   retirar ou restringir esse modelo, ajuste essa configuração.

A função lê as configurações no servidor em cada requisição. Após cadastrar a
chave, não é necessário recompilar o front-end. `LOVABLE_API_KEY` não é mais lido
por esta função; não remova esse segredo se outros recursos ainda o utilizam.

## Publicação

Com o Supabase CLI autenticado, a partir da raiz do repositório:

```sh
supabase functions deploy weekly-report --project-ref pnaupodddxrbqbjilhft
```

O CLI usa `[functions.weekly-report]` em `supabase/config.toml`, com
`verify_jwt = false`. Essa configuração evita a validação legada do gateway
incompatível com novos signing keys. **Não desative a validação no gateway sem
publicar junto o handler atualizado:** ele valida o token com `auth.getUser`,
exige administrador ou permissão `reports/read` e consulta os dados com a sessão
do solicitante, respeitando RLS.

Publique as mudanças do front-end pelo fluxo habitual do site. Entre com uma
conta autorizada, selecione um intervalo e clique em **Gerar relatório**. Confira
os indicadores, a análise e o comparativo. Publicar apenas o site não atualiza
a Edge Function.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas
pelo ambiente das Edge Functions. A chave de serviço é usada apenas no servidor
para validar a sessão e consultar permissões; as consultas do relatório usam a
sessão do usuário.

## Dados e segurança

- A chamada é feita pelo servidor a
  `https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent`.
  A chave vai no cabeçalho `x-goog-api-key`, nunca na URL.
- O Google recebe as estatísticas dos dois períodos e os dados de visitas usados
  na análise: datas, títulos, nomes de clientes, status, contagens de aceites e
  motivos de cancelamento. Os dados armazenados continuam no Supabase; a análise
  desses dados passa a ser processada pelo Google. Confira os termos de uso de
  dados aplicáveis antes de enviar informações confidenciais.
- Não são enviados senhas, tokens de sessão ou a chave de serviço do Supabase.
- O formato de resposta para a tela continua sendo `report`, `stats`,
  `previousStats`, `comparison`, `weeks` e `period_days`.
- Apenas texto de uma resposta concluída é exibido. Partes de raciocínio
  (`thought`), respostas truncadas e bloqueios não viram um relatório válido.
- Não há fallback para outro provedor nem narrativa inventada se a IA falhar.

## Diagnóstico

| Mensagem | Verificação |
| --- | --- |
| Função não publicada / não foi possível acessar | Confira o deploy no projeto indicado, conexão e logs de inicialização da função. |
| Sessão expirada | Saia e entre novamente. Confira a configuração de JWT acima. |
| Sem permissão | A conta precisa ser admin ou ter `reports/read`. |
| IA não configurada | Cadastre `GEMINI_API_KEY` nos Secrets do Supabase. |
| Credencial recusada | Confira a validade e as restrições da chave, e a API habilitada no projeto Google. |
| Limite de requisições ou cota | Confira os limites e o faturamento no Google AI Studio; aguarde antes de tentar novamente. |
| Projeto precisa de configuração | Confira a disponibilidade da API e o faturamento do projeto Google. |
| Modelo indisponível | Configure `GEMINI_MODEL` com um modelo de texto habilitado para sua chave. |
| Restrição de conteúdo | Revise os textos dos registros; não tente desativar os filtros do provedor. |
| Resposta excedeu o limite / IA demorou | Selecione um período menor e tente novamente. |
| Falha genérica | Confira os logs de `weekly-report`, incluindo as consultas ao banco. |

## Validação local

```sh
node --experimental-strip-types --test scripts/testes/weekly-report.mjs
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

Os testes executam o handler real com Supabase e Gemini simulados. Cobrem
sessão, permissões, CORS, RLS, datas, contrato HTTP do Google, chave no cabeçalho,
modelo configurável, partes da resposta, bloqueios, truncamento, timeout, erros
nativos e mensagens no cliente. Não consomem cota nem comprovam a configuração
ou disponibilidade da API em produção; isso exige uma chave válida e um teste
autenticado após a publicação.

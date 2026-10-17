# Relatório com IA — publicação e diagnóstico

A tela **Relatórios de aceite → Aceites → Relatório com IA** chama a Edge Function
`weekly-report`. Publicar apenas o front-end não atualiza essa função.

## Publicação

1. No projeto Supabase **Agendause** (`pnaupodddxrbqbjilhft`), confira em
   **Edge Functions → Secrets** se `LOVABLE_API_KEY` está configurado com uma
   credencial válida do workspace Lovable que fornece a IA. Não use a chave
   pública do Supabase e não coloque esse segredo em variáveis `VITE_*`, no
   repositório ou no navegador.
2. Com o Supabase CLI autenticado, a partir da raiz do repositório:

   ```sh
   supabase functions deploy weekly-report --project-ref pnaupodddxrbqbjilhft
   ```

   O CLI usa `[functions.weekly-report]` em `supabase/config.toml`, com
   `verify_jwt = false`. Essa configuração evita a validação legada do gateway
   incompatível com novos signing keys. **Não desative a validação no gateway
   sem publicar junto o handler atualizado:** ele valida o token com
   `auth.getUser`, exige administrador ou permissão `reports/read`, e consulta
   os dados com a sessão do solicitante, respeitando RLS.
3. Publique também as mudanças do front-end pelo fluxo habitual do site.
4. Entre com uma conta autorizada, abra a tela, selecione um intervalo e clique
   em **Gerar relatório**. Confira o resumo, os indicadores e o comparativo.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis
fornecidas pelo ambiente das Edge Functions. A chave de serviço é usada apenas
no servidor para validar a sessão e consultar permissões; as consultas do
relatório utilizam a sessão do usuário.

## O que foi corrigido

- A chamada HTTP ao gateway de IA envia `Authorization: Bearer <LOVABLE_API_KEY>`.
- O preflight CORS e a validação de sessão são explícitos na função.
- Erros HTTP retornados pela função são lidos de `FunctionsHttpError.context`
  e exibidos de forma persistente no cartão, em vez de apenas uma mensagem
  genérica de status HTTP.
- Datas vazias/inválidas não derrubam a tela nem geram requisições inválidas.
- Resposta vazia da IA, falha nas consultas de aceites e timeout não são
  apresentados como sucesso. Visitas canceladas não entram no numerador da
  taxa de confirmação de visitas não canceladas.

## Se ainda houver erro

| Mensagem | Verificação |
| --- | --- |
| Função não publicada / não foi possível acessar | Confira o deploy no projeto indicado, conexão e logs de inicialização da função. |
| Sessão expirada | Saia e entre novamente. Confira se o deploy aplicou a configuração de JWT acima. |
| Sem permissão | A conta precisa ser admin ou ter `reports/read`. |
| IA não configurada / credencial recusada | Confira o segredo `LOVABLE_API_KEY` do projeto. |
| Créditos esgotados | Confira os créditos de IA no workspace Lovable. |
| Limite de requisições | Aguarde antes de tentar novamente. |
| IA demorou / indisponível | Tente novamente; para períodos grandes, reduza o intervalo. Confira os logs da função. |
| Falha genérica | Confira os logs de `weekly-report`, incluindo erros nas consultas ao banco. |

Não há fallback que invente uma narrativa: se a IA falhar, o cartão informa a
falha e permite tentar novamente.

## Validação local

```sh
node --experimental-strip-types --test scripts/testes/weekly-report.mjs
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

Os testes executam o handler real com Supabase e gateway de IA simulados,
abrangendo autenticação, autorização, CORS, consultas com RLS, datas, sucesso,
créditos, rate limit, timeout, resposta vazia e mensagens no cliente. Não
consomem créditos nem comprovam a configuração ou a disponibilidade da IA em
produção; a verificação final depende da publicação e do teste autenticado.

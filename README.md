# TreinaCheck — agenda, cronogramas e aceite de treinamentos

Sistema interno da **Use Sistemas** para gestão de implantação em clientes.

Produção: https://agendause.lovable.app
Backend: Supabase — projeto `psgekwifthuzduhpreay`

## O que o sistema faz

| Módulo | Rota | Função |
|---|---|---|
| **Agenda** | `/agenda` | Visitas e treinamentos: tipo (presencial, interno, remoto), duração, reagendamento, cancelamento com motivo, pausa/retomada, opção "dia todo" |
| **Aceite do cliente** | `/aceite/:id` | **Público.** Convidado assina o termo (nome, e-mail e assinatura desenhada) sem precisar de conta |
| **Cronogramas** | `/cronogramas` | Fases e etapas da implantação, com organograma, impressão e termo de entrega |
| **Clientes** | `/clientes` | Saúde de cada implantação (em dia / atenção / atrasado / concluído), histórico e dossiê em PDF |
| **Levantamentos** | `/q/:token` | **Público.** Questionário de processos respondido pelo cliente, com envio de arquivos |
| **Cobranças** | `/cobrar` | Solicitações a cobrar por semana, com notificação push agendada por dia e horário |
| **Relatórios** | `/relatorios` | Relatório executivo gerado por IA, com comparativo entre períodos |
| **Anotações** | `/anotacoes` | Notas por empresa, com anexos |
| **Administração** | `/admin`, `/configuracoes` | Usuários, papéis, permissões por tela e por cronograma |

Rotas públicas por token (não exigem conta): `/aceite/:id`, `/c/:token`, `/q/:token`, `/t/:token`.
Todas as demais passam por `<ProtectedRoute>` e exigem sessão e base de trabalho selecionada.

## Stack

```
Front-end   Vite 5 · React 18 · TypeScript 5.8 · Tailwind 3 · shadcn/ui (Radix)
Estado      TanStack Query 5 + Context API (Auth, Workspace, Theme, A11y)
Visual      reactflow (organograma) · @hello-pangea/dnd · react-day-picker · lucide-react
PDF         jspdf · jspdf-autotable · html2canvas
Backend     Supabase — Postgres com RLS, Auth, Storage e Edge Functions em Deno
IA          Lovable AI Gateway (google/gemini-3-flash-preview)
PWA         manifest + service worker dedicado a Web Push (web-push + VAPID)
```

## Rodando localmente

Requisitos: **Node 20+** e **npm 10+**. Use apenas npm — o lockfile do projeto é `package-lock.json`.

```bash
git clone https://github.com/Zanin23/agendause.git
cd agendause
npm install
cp .env.example .env      # preencha com os valores do painel do Supabase
npm run dev               # http://localhost:8080
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 8080 |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run lint` | ESLint (flat config) |
| `npm run lint:fix` | ESLint corrigindo o que for automático |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | lint + typecheck + build de uma vez |
| `npm run audit:high` | Vulnerabilidades de dependência de gravidade alta ou pior |

## Variáveis de ambiente

Ver **`.env.example`**, que documenta cada uma.

Regra de ouro: tudo que começa com `VITE_` é embutido no JavaScript que vai para o
navegador — qualquer pessoa consegue ler. Portanto só a **chave pública** do Supabase
vai no `.env`. Segredos ficam exclusivamente no Supabase:

```bash
supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
```

| Segredo | Usado por |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | injetado pela plataforma — ignora o RLS |
| `LOVABLE_API_KEY` | `weekly-report` |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `send-billing-notifications` |
| `CRON_SECRET` | `send-billing-notifications` — **obrigatório** |

## Banco de dados

25 tabelas, todas com **Row Level Security**. O isolamento entre bases (multi-tenant) é
feito pela coluna `workspace_id`, comparada com `public.current_workspace()` — que lê
`profiles.active_workspace_id` — através de políticas **`RESTRICTIVE`**.

Política restritiva se soma às demais por `AND`: mesmo que outra política abra acesso,
o isolamento prevalece. Não remova nem converta para `PERMISSIVE` sem entender isso.

As tabelas filhas que não têm `workspace_id` próprio (`survey_questions`, `survey_answers`,
`survey_files`) herdam o tenant do registro pai via `EXISTS`.

```bash
supabase db push                              # aplicar migrations pendentes
supabase migration new nome_descritivo        # criar nova
```

Use nomes descritivos nas migrations novas. As 46 existentes têm UUID no nome porque
foram geradas pela plataforma.

## Edge Functions

| Função | Quem pode chamar | Protegida por |
|---|---|---|
| `admin-users` | administradores | JWT + papel `admin` via RPC `has_role` |
| `weekly-report` | usuário logado | JWT + restrição à base ativa de quem chamou |
| `attachment-signed-url` | equipe ou convidado | vínculo anexo↔treinamento + JWT da base, ou aceite público |
| `send-billing-notifications` | `pg_cron` ou o próprio usuário | header `X-Cron-Secret`, ou JWT restrito ao próprio `user_id` |

```bash
supabase functions deploy admin-users
supabase functions deploy weekly-report
supabase functions deploy attachment-signed-url
supabase functions deploy send-billing-notifications
```

`verify_jwt` de cada função é definido em **`supabase/config.toml`**. As duas exceções
(`attachment-signed-url` e `send-billing-notifications`) estão justificadas em comentário
no próprio arquivo — não altere sem ler.

> ⚠️ **Commitar não publica.** Mudar o código no repositório não altera as funções em
> produção. É preciso rodar `supabase functions deploy`. O mesmo vale para migrations:
> o arquivo `.sql` só afeta o banco depois de `supabase db push`.

## Estrutura do código

```
src/
  App.tsx                     todas as rotas
  pages/                      uma tela por arquivo
  components/                 componentes reutilizáveis
  components/ui/              primitives do shadcn — não editar à mão
  hooks/                      useAuth · useWorkspace · usePermissions · useTheme · useA11y
  lib/                        regras puras, sem React: schedule · clientHealth · visitType
                              surveyTemplate · publicUrl · push
  integrations/supabase/      client.ts e types.ts — GERADOS, não editar
supabase/
  migrations/                 schema do banco em SQL
  functions/                  Edge Functions em Deno
  config.toml                 verify_jwt por função
```

`src/lib/` concentra a lógica de negócio pura. São funções sem dependência de React nem
de rede — o lugar mais barato para começar a escrever testes.

## Fluxo de desenvolvimento (Lovable → GitHub)

Este repositório é alimentado pela plataforma **Lovable**: historicamente todos os commits
vieram do bot `gpt-engineer-app`. Consequências práticas:

- As mensagens de commit do histórico ("Changes", "Fast Visual Edit") **não descrevem** a
  mudança. Para entender contexto, use este README e os documentos em `.lovable/plan/`.
- `git bisect` não funciona no histórico antigo.
- **Não faça push direto em `main`** sem combinar com o fluxo da Lovable: o bot pode
  commitar por cima e gerar divergência. Trabalhe em branch e abra pull request.
- Commits feitos à mão devem ter mensagem descritiva, no formato
  `tipo: descrição` (`fix:`, `feat:`, `chore:`, `docs:`).

## Qualidade

Verificado em `2e45dab`:

| Verificação | Estado |
|---|---|
| `npm run build` | ✅ passa — mas gera um único chunk de 2,3 MB (674 kB gzip) |
| `npm run typecheck` | ✅ passa |
| `npm run lint` | ❌ 203 erros, sendo 195 `@typescript-eslint/no-explicit-any` |
| Testes | ❌ nenhum |
| CI | ✅ `.github/workflows/ci.yml` |

O `tsconfig.app.json` tem `strict: false` — padrão do template Lovable. O typecheck passar,
portanto, garante menos do que parece. Ligar `noImplicitAny` e `strictNullChecks`
gradualmente, diretório por diretório, é a melhoria de qualidade mais barata disponível.

Melhorias pendentes registradas em `roadmap.md` e no relatório de auditoria.

## Segurança

O isolamento por workspace é aplicado **no banco**, não no front-end — que é o lugar certo.
Três regras para não quebrar isso:

1. Toda tabela nova com dados de cliente precisa de `workspace_id` **e** de política
   `RESTRICTIVE ws_isolation`.
2. Nunca crie política `USING (true)` em tabela com dado de cliente. Foi exatamente isso
   que deixou os levantamentos expostos entre bases até 2026-09-28.
3. Toda Edge Function nova precisa verificar quem está chamando. Ela roda com
   `service_role`, que **ignora o RLS** — uma função sem autenticação anula todo o
   trabalho de isolamento do banco.

# Levantamento Comercial

Funcionalidade de registro comercial e pré-implantação integrada aos cronogramas existentes. O levantamento pode ser iniciado antes do cronograma e associado depois; quando iniciado a partir do detalhe de um cliente ou cronograma, o vínculo é preenchido automaticamente. O levantamento de processos já existente continua separado e sem alteração.

## Publicar a estrutura do banco

Antes de publicar a aplicação, aplique uma vez no SQL Editor do Supabase:

```text
supabase/migrations/20261015120000_levantamento_comercial.sql
```

A migração é transacional e não apaga nem regrava os dados atuais. Ela cria tabelas relacionais para empresas, módulos, emissores, integrações, migração, demandas, contatos, dimensionamento, respostas de infraestrutura, histórico e arquivos. Também cria catálogos por base de trabalho, políticas RLS e o vínculo opcional ao cronograma existente.

A migração adiciona duas colunas opcionais de origem em `schedule_items`, usadas para rastrear e deduplicar atividades sugeridas. O bucket de arquivos do levantamento é privado e separado dos arquivos do questionário público.

## Acesso e permissões

No **Controle de Acessos → Telas acessíveis**, o administrador pode conceder:

- **Levantamento Comercial**: comercial pode preencher e enviar para análise;
- **Análise técnica do levantamento**: implantação pode iniciar análise, devolver, validar e aprovar.

Administradores mantêm todos os acessos. O acesso de leitura/escrita já concedido a um cronograma vinculado também é considerado pela RLS e pela aplicação. Não foi criado um mecanismo de autenticação paralelo.

Administradores podem abrir **Catálogos** no formulário para incluir ou desativar opções de módulos, categorias de integração/demanda, emissores e grupos de migração. Desativar preserva os registros antigos.

## Uso

- Abra **Levantamento Comercial** pela página inicial ou pelo cadastro do cliente/cronograma.
- Preencha as seis seções; os campos não essenciais podem ficar vazios ou como “A confirmar”. O primeiro salvamento exige somente o nome do cliente/grupo.
- O formulário salva automaticamente após pequenas pausas e também oferece **Salvar agora**. Um rascunho incompleto pode ser reaberto posteriormente.
- Cada empresa/CNPJ tem seus próprios dados fiscais e emissores.
- Integrações são independentes. O nome ou a categoria não significa viabilidade técnica, contratação ou homologação.
- Demandas comerciais começam aguardando análise e não são aprovadas/contratadas automaticamente.
- A equipe de implantação precisa iniciar a análise e concluir o checklist técnico para aprovar o planejamento. A alteração de situação gera histórico com usuário e data.
- Após a aprovação, quem pode editar o cronograma pode revisar a prévia de atividades. Só as atividades confirmadas são criadas; sem datas, duração ou responsável presumidos. Origem da sugestão é salva no item e sugestões repetidas pela mesma origem são bloqueadas no banco.
- **Relatório** oferece uma visualização imprimível; no navegador, escolha “Salvar como PDF”.

## Testes

```bash
npm run build
npx tsc --noEmit -p tsconfig.app.json
npm run test:levantamento-comercial
```

O cenário fictício de lógica cobre duas empresas/CNPJs, módulos contratados e não contratados, integrador de pedidos, migração, desenvolvimento ainda pendente e deduplicação da prévia.

Para testar a migração, as políticas e as transições em PostgreSQL embutido (PGlite):

```bash
npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @electric-sql/pglite
npm run test:levantamento-comercial-sql
```

O teste SQL cria uma base local efêmera com cliente fictício; não grava registros no Supabase real. A validação final em uma base real requer aplicar a migração no projeto Supabase e testar com contas de comercial/implantação provisionadas pelo administrador.

# Controle de bases de dados

Como funciona a gestão das bases (**workspaces**) em **Configurações → Bases de dados**.

---

## 1. O que dá para fazer

| Ação | Quem pode | O que acontece |
| --- | --- | --- |
| **Trocar a base ativa** | qualquer usuário com acesso à base | muda só o `active_workspace_id` do seu perfil; nada é copiado nem apagado |
| **Criar base** | administrador | cria uma base **vazia**, com identificador (`slug`) gerado a partir do nome, e dá acesso a todos os usuários |
| **Renomear** | administrador | muda **somente o nome de exibição**; o `slug` e todos os registros ficam iguais |
| **Excluir** | administrador | só para bases **novas**, **vazias** e **sem usuários com ela ativa** |

O que **não** muda em nenhuma dessas ações: treinamentos, cronogramas, aceites,
anotações, cobranças, levantamentos e qualquer outro registro das bases existentes.

---

## 2. Proteções contra perda de dados

1. **Bases que já existiam são protegidas.**
   A migração cria a coluna `is_protected` e marca como `true` tudo o que já
   existia. O banco recusa a exclusão dessas bases, mesmo que alguém chame a
   função direto.

2. **Exclusão só de base vazia.**
   A função varre **todas** as tabelas que têm `workspace_id` (inclusive as que
   forem criadas no futuro). Se houver **uma única linha**, a exclusão é
   cancelada com a lista de tabelas e quantidades. Nada é apagado.

3. **Nenhum `ON DELETE CASCADE` pode surpreender.**
   Tabelas como `commercial_assessments` usam `ON DELETE CASCADE`. Como a base
   precisa estar vazia para ser excluída, o cascade nunca encontra dados.

4. **Base ativa de alguém não pode ser excluída.**
   A função também bloqueia quando existe perfil com `active_workspace_id`
   apontando para a base.

5. **Confirmação pelo nome exato.**
   A exclusão exige digitar o nome da base exatamente como ele aparece.

6. **Administrador autenticado.**
   Todas as funções verificam `has_role(auth.uid(), 'admin')`. A interface
   esconde os controles de quem não é admin, mas a checagem real é no banco.

7. **Renomear não mexe em dados.**
   A função `admin_rename_workspace` atualiza apenas a coluna `name`. O `slug`
   é o identificador estável e nunca é alterado.

---

## 3. Instalação (uma vez)

No **SQL Editor** do projeto Supabase oficial (`pnaupodddxrbqbjilhft`), rode:

```text
supabase/migrations/20261019120000_controle_de_bases.sql
```

O arquivo é idempotente: rodar de novo recria as funções e não altera dados.
Enquanto ele não for rodado, a tela **Configurações → Bases de dados** mostra o
aviso *“Controle de bases ainda não ativado”* e os botões de gestão ficam
desabilitados — a troca de base ativa continua funcionando normalmente.

> **Não é preciso rodar nenhuma outra migração antiga de novo.** Este arquivo
> só adiciona a coluna `is_protected` e funções novas; não faz backfill nem
> atualiza registros das bases.

---

## 4. Onde fica na interface

- **Configurações → Bases de dados**
  - lista das bases, com etiquetas **Ativa**, **Protegida** e **Criada pelo app**;
  - botão **Nova base** (admin);
  - botão de lápis **Renomear** (admin);
  - botão de lixeira **Excluir** (admin; desabilitado para bases protegidas);
  - ao excluir, o app mostra quantos registros existem na base antes de liberar
    a confirmação.

---

## 5. Funções criadas no banco

| Função | Para que serve |
| --- | --- |
| `admin_list_workspaces()` | lista as bases com `is_protected`, vínculos e usuários ativos |
| `admin_create_workspace(_name text)` | cria a base vazia e os vínculos de todos os usuários |
| `admin_rename_workspace(_workspace_id uuid, _name text)` | altera apenas o nome de exibição |
| `admin_workspace_usage(_workspace_id uuid)` | devolve `{ total, tables, active_users }` |
| `admin_delete_workspace(_workspace_id uuid, _confirm_name text)` | exclui com todas as travas acima |
| `workspace_slug(_name text)` | gera o identificador (sem acentos, minúsculo) |

Todas são `SECURITY DEFINER` com `search_path = public`, executáveis apenas por
`authenticated`, e as de gestão exigem `admin`.

---

## 6. Como conferir no banco

```sql
-- quais bases existem e quais estão protegidas
select id, slug, name, is_protected, created_at
  from public.workspaces
 order by name;

-- quantos registros existem em cada base (rode como administrador autenticado)
select w.slug, public.admin_workspace_usage(w.id) as uso
  from public.workspaces w;

-- quem está usando qual base agora
select p.email, w.slug
  from public.profiles p
  left join public.workspaces w on w.id = p.active_workspace_id
 order by p.email;
```

Se você quiser **proteger** uma base criada pelo app depois de usá-la, rode:

```sql
update public.workspaces set is_protected = true where slug = 'nome-da-base';
```

Se quiser **liberar** uma base antiga para exclusão (não recomendado),
`set is_protected = false` — mas ela ainda precisará estar vazia para excluir.

---

## 7. Teste automatizado da migração

O teste roda a migração num PostgreSQL real em WebAssembly (PGlite) e confere
todas as travas, inclusive que nenhum dado de outra base é afetado:

```bash
npm install --no-save @electric-sql/pglite
npm run test:bases-de-dados-sql
```

---

## 8. Problemas comuns

| Sintoma | Causa | O que fazer |
| --- | --- | --- |
| “Controle de bases ainda não ativado” | migração não rodada ou cache do PostgREST | rode o arquivo no SQL Editor; ele termina com `NOTIFY pgrst` |
| “Apenas administradores…” | sua conta não tem role `admin` | veja `docs/controle-de-usuarios.md` |
| “A base … ainda tem N registros” | a base não está vazia | mova/apague os registros naquela base antes; nada foi apagado |
| “A base … está ativa para pelo menos um usuário” | alguém está com ela selecionada | peça para trocarem de base em **Configurações** |
| “já existia … e está protegida” | é uma base anterior ao recurso | por segurança, não é excluível; só o nome pode mudar |

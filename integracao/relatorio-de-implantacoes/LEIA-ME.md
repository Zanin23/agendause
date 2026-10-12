# Arquivos para o repositório do Relatório de Implantações

Copie estes dois arquivos para a **raiz** do repositório
`Zanin23/Relat-rio-de-implanta-es`:

| Arquivo | O que fazer |
| --- | --- |
| `sync-config.js` | **Substituir** o que já existe. Ele passa a apontar para o Supabase do TreinaCheck (o banco único da integração). |
| `sync-agenda.js` | **Adicionar** (é novo). Chama `rel_sincronizar_agenda()` quando o site abre, publicando o cronograma da agenda dentro de `documentos`. |

No `index.html`, logo **depois** do `<script src="app.js"></script>`:

```html
<script src="sync-agenda.js"></script>
```

Depois: `git add . && git commit -m "Integração com a agenda (banco único)" && git push`.
A Vercel publica sozinha — não existe build nesse repositório.

## Antes de copiar

1. A migração `supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql`
   já foi publicada no projeto Supabase do TreinaCheck? (é ela que cria a tabela
   `documentos`, a RLS e a função que o `sync-agenda.js` chama)
2. As empresas que já estão no relatório já foram copiadas para o projeto novo?
   (`node scripts/migrar-documentos.mjs`, na raiz do repositório do TreinaCheck)

Passo a passo completo, de-para de campos, regras de merge e rollback:
`docs/integracao-relatorio-implantacoes.md`, no repositório do TreinaCheck.

> Enquanto você não trocar o `sync-config.js`, o site continua no projeto antigo
> e nada muda para quem usa.

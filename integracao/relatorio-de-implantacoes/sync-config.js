/* =====================================================================
   SERVIDOR COMPARTILHADO do Relatório de Implantações.

   ATENÇÃO — este arquivo aponta para o projeto Supabase do TREINACHECK
   (o mesmo da agenda: projeto **Agendause**, `pnaupodddxrbqbjilhft`). Os dois sistemas usam o MESMO banco:

     · a tabela `documentos` (a que este site lê e escreve) agora vive lá;
     · o cronograma e as visitas da agenda são publicados dentro de
       `documentos.dados.cronograma` pela função `rel_sincronizar_agenda()`;
     · `sync-agenda.js` chama essa função sozinho quando alguém abre este site.

   A anon key é pública por natureza: ela vai no HTML e é visível no navegador
   de qualquer um. A proteção vem das políticas de RLS. As demais tabelas do
   projeto continuam fechadas — a liberação vale só para `documentos`.
   ===================================================================== */
window.SYNC_CONFIG = {
  url: "https://pnaupodddxrbqbjilhft.supabase.co",
    anonKey: "sb_publishable_vz9REAkToghXmd1R0adsTw_J8PYkZmz",
  table: "documentos",
  schema: "public"
};

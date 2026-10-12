/* =====================================================================
   SERVIDOR COMPARTILHADO do Relatório de Implantações.

   ATENÇÃO — este arquivo aponta para o projeto Supabase do TREINACHECK
   (o mesmo da agenda). Os dois sistemas passaram a usar o MESMO banco:

     · a tabela `documentos` (a que este site lê e escreve) agora vive lá;
     · o cronograma e as visitas da agenda são publicados dentro de
       `documentos.dados.cronograma` pela função `rel_sincronizar_agenda()`;
     · `sync-agenda.js` chama essa função sozinho quando alguém abre este site.

   A anon key é pública por natureza: ela vai no HTML e é visível no navegador
   de qualquer um. A proteção vem das políticas de RLS. As demais tabelas do
   projeto continuam fechadas — a liberação vale só para `documentos`.
   ===================================================================== */
window.SYNC_CONFIG = {
  url: "https://psgekwifthuzduhpreay.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZ2Vrd2lmdGh1emR1aHByZWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzIyODcsImV4cCI6MjA5NzQ0ODI4N30.GO3NVpIPD5BRx5EP9ovc_VuvrkOSxp9Pb8jWz0fTIA8",
  table: "documentos",
  schema: "public"
};

/* =====================================================================
   RELATÓRIO DE IMPLANTAÇÕES × AGENDA (TreinaCheck) — ponte da agenda
   ---------------------------------------------------------------------
   O que faz: chama a função `rel_sincronizar_agenda()` do Supabase, que lê os
   cronogramas/itens/visitas da agenda e publica em `documentos.dados.cronograma`
   — o campo que este relatório já mostra nas abas Agenda, Pendências e Fases.

   Quando chama: ao abrir o site (é o "sincroniza sozinho ao abrir") e, depois,
   sempre que alguém usar `window.SYNC_AGENDA.sincronizarAgora()` no console.
   Como é idempotente e rápida, pode ser chamada quantas vezes quiser.

   Arquivos deste bloco (copie os dois para a raiz do repositório):
     sync-config.js   -> URL + chave do Supabase (agora o mesmo do TreinaCheck)
     sync-agenda.js   -> este arquivo

   No index.html, logo DEPOIS das tags do sync.js e do app.js:
     <script src="sync-agenda.js"></script>

   Nada aqui mexe nos dados que este relatório escreve (status, progresso,
   texto, listas): a função só atualiza nome + cronograma, e cria a empresa
   quando ela ainda não existe no relatório.
   ===================================================================== */
(function () {
  "use strict";

  var LS_CONF = "relatorio-implantacoes.sync-conf.v1"; // mesmo override local do sync.js
  var ESPERA = 900;                                    // deixa o app e o sync.js subirem primeiro
  var sb = null, sbUrl = "";

  function config() {
    var base = window.SYNC_CONFIG || {};
    var out = { url: base.url || "", anonKey: base.anonKey || base.key || "" };
    try {
      var ov = JSON.parse(localStorage.getItem(LS_CONF) || "null");
      if (ov) {
        out.url = ov.url || out.url;
        out.anonKey = ov.key || ov.anonKey || out.anonKey;
      }
    } catch (e) {}
    try {
      var q = new URLSearchParams(location.search);
      var u = q.get("sburl") || q.get("supabase_url");
      var k = q.get("sbkey") || q.get("supabase_key");
      if (u) out.url = u;
      if (k) out.anonKey = k;
    } catch (e) {}
    out.url = String(out.url).trim().replace(/\/+$/, "");
    out.anonKey = String(out.anonKey).trim();
    return out;
  }

  function cliente() {
    var c = config();
    if (!c.url || !c.anonKey || !window.supabase || !window.supabase.createClient) return null;
    if (!sb || sbUrl !== c.url) {
      sb = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: false } });
      sbUrl = c.url;
    }
    return sb;
  }

  /** Publica o cronograma da agenda no relatório. Resolve com
      { criados, atualizados, em } ou null quando não há servidor configurado. */
  function sincronizarAgora(silencioso) {
    var c = cliente();
    if (!c) return Promise.resolve(null);
    return c
      .rpc("rel_sincronizar_agenda")
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data || {};
      })
      .catch(function (e) {
        if (!silencioso) {
          console.warn("[agenda] não consegui publicar os cronogramas:", e && e.message ? e.message : e);
        }
        return null;
      });
  }

  /** Publica e, em seguida, pede ao sync.js do relatório para reler o servidor. */
  function atualizarTudo(silencioso) {
    return sincronizarAgora(silencioso).then(function (r) {
      if (r && window.sync && typeof window.sync.sincronizarAgora === "function") {
        return window.sync.sincronizarAgora().then(function () {
          return r;
        });
      }
      return r;
    });
  }

  window.SYNC_AGENDA = {
    sincronizarAgora: sincronizarAgora,
    atualizarTudo: atualizarTudo
  };

  function iniciar() {
    setTimeout(function () {
      atualizarTudo(true).then(function (r) {
        if (r && (r.criados || r.atualizados)) {
          console.log(
            "[agenda] cronogramas publicados: " + (r.criados || 0) + " empresa(s) criada(s), " +
            (r.atualizados || 0) + " atualizada(s)."
          );
        }
      });
    }, ESPERA);
  }

  if (document.readyState === "complete") iniciar();
  else window.addEventListener("load", iniciar);
})();

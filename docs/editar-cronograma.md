# Editar o cronograma: status e remarcar um módulo inteiro

Duas coisas que dá para fazer **dentro do cronograma** (tela `/cronogramas/<id>`),
sem voltar para a lista:

1. **Mudar o status do cronograma** — a etiqueta ao lado do botão *Pausar*.
2. **Remarcar um módulo (fase) inteiro** — botão **Datas**, no cabeçalho da fase.

---

## 1. Status do cronograma (dentro dele mesmo)

A etiqueta mostra o status atual (Rascunho, Ativo, Em andamento, Concluído,
Arquivado, Pausado ou Pendente pelo cliente). Clicando nela, o menu oferece:

| Status | O que significa |
| --- | --- |
| **Rascunho** | Ainda sendo montado; não conta como atrasado. |
| **Ativo** | Em execução — o estado do dia a dia. |
| **Em andamento** | Igual a Ativo, para quem prefere este rótulo. |
| **Concluído** | Encerrado. Pede confirmação e oferece marcar as etapas pendentes como concluídas. |
| **Arquivado** | Sai do acompanhamento, sem apagar nada. |

- **Concluído** e **Arquivado** pedem confirmação. Ao concluir, se houver etapas
  pendentes, aparece a opção *“Marcar as N etapas pendentes como concluídas”*
  (data de conclusão = hoje) — assim o progresso da tela fecha em 100% e o
  relatório mostra o mesmo resultado.
- **Pausa continua tendo controle próprio**: o botão *Pausar* cuida de
  “Pendente pelo cliente”/“Pausado” com motivo e, ao retomar, remaneja as datas.
  Por isso a pausa não aparece no menu de status. Trocar para outro status
  enquanto está pausado encerra a pausa e **não** mexe nas datas (o aviso diz
  isso).
- Só quem pode editar o cronograma muda o status; os demais veem apenas a
  etiqueta.

### O status chega no relatório de implantações

O relatório é dono do próprio texto/status: a função `rel_sincronizar_agenda()`
só reescreve status/progresso de uma empresa que já existe quando a chamada
pede (`p_forcar_status = true` — a opção documentada “agenda manda também no
status e no progresso”).

É o que o botão faz: ao mudar o status (ou pausar/retomar, ou concluir), o app
publica a situação da base no relatório. A migração
`20261013150000_status_do_cronograma_no_relatorio.sql` ensina a função a
entender o “Concluído” do app (`completed`, que antes só era reconhecido como
`concluido`) e a tratar pausa por status mesmo sem `paused_at`. Se a publicação
falhar, o status é salvo do mesmo jeito e aparece só um aviso.

---

## 2. Remarcar um módulo (fase) inteiro

No cabeçalho da fase, ao lado das setas de ordem, o botão **Datas** abre a
janela *“Remarcar o módulo (fase) inteiro”*:

- **Nova data de início** — informe o dia da primeira etapa da fase; todas as
  outras andam o mesmo tanto, então **a distância entre elas continua igual**.
- **Adiar / antecipar** — botões de ±1 e ±7 dias ou o número exato (negativo
  antecipa). Ex.: `−3` antecipa três dias.
- **Fim de semana vai para segunda** (ligado por padrão).
- **Incluir etapas já concluídas** — desligado por padrão: o que já aconteceu
  mantém a data; ligando, a fase inteira anda junta.
- A janela mostra a **prévia** (“4 etapa(s) adiadas 7 dia(s) · nova janela
  19/10 → 28/10”) antes de aplicar, lista as primeiras mudanças, avisa quantas
  etapas ficam de fora e, se houver, avisa que **etapas com visita vinculada
  mudam a data prevista mas a visita continua no mesmo dia**.

Aplicar grava só as etapas que realmente mudam de data.

### O que mais mexe em datas

- **Retomar cronograma** (aviso de pausa): remaneja as etapas pendentes do
  cronograma inteiro, mantendo o intervalo.
- **Editar etapa por etapa**: cada atividade tem “Prevista” e “Conclusão” nos
  detalhes.

---

## Testes

```bash
node --experimental-strip-types scripts/testes/remarcar-fase.mjs   # regras puras
node scripts/testes/cronogramas-livres-sql.mjs                     # status no relatório (Postgres real)
npm install --no-save @electric-sql/pglite                         # só para o segundo
```

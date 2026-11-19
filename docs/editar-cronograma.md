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

## 3. Remover etapas e fases — e o que sai na impressão

A etapa removida aqui **sai também do PDF/impressão**: a tela de impressão
(`/cronogramas/<id>/imprimir`) relê o banco toda vez que abre, então o papel
mostra exatamente o que está no cronograma naquele momento.

- **Uma etapa**: abra os detalhes da etapa (clique no título) e use **Remover**.
  Pede confirmação.
- **Várias de uma vez**: marque as caixinhas à esquerda das etapas — aparece a
  faixa *“N etapa(s) selecionada(s)”* com **Remover selecionadas**. É uma única
  chamada ao banco (`schedule_items_delete`), então ou sai tudo ou o app avisa
  quantas saíram.
- **Fase inteira**: lixeira no cabeçalho da fase (pede confirmação e apaga as
  etapas junto).
- **Só a data prevista**: nos detalhes da etapa, o **X** ao lado do campo
  “Prevista” limpa a data (a etapa continua, sem data).

No papel, além das datas, cada etapa leva a etiqueta de status. Etapas
**“Não aplicável” ficam fora do PDF** por padrão (documento do cliente); o botão
*Mostrar “não aplicável”* acima da folha inclui elas quando for preciso.

### Quando a exclusão/edição não é autorizada

Se o servidor negar a operação, **nada é apagado e o cronograma é recarregado**,
com um aviso na tela — antes o app atualizava a tela como se tivesse apagado, e
o item reaparecia na impressão (o banco responde “sucesso” mesmo quando o RLS
bloqueia; só a contagem de linhas afetadas revela). O mesmo vale para datas,
ordem das etapas, status e título: toda gravação agora confere as linhas
realmente gravadas.

Quem pode remover/editar: administrador, quem tem a tela `schedules` com escrita
ou quem tem permissão específica naquele cronograma — e sempre dentro da base
ativa. A migração `20261119120000_acesso_e_exclusao_itens_cronograma.sql` aplica
essas regras; antes dela as políticas de exclusão dependiam de
`implementation_schedules.owner_id`, e cronogramas cujo dono já não existe em
`auth.users` não podiam ser apagados por ninguém.

---

## Testes

```bash
node --experimental-strip-types scripts/testes/remarcar-fase.mjs        # regras puras
node scripts/testes/exclusao-itens-cronograma-sql.mjs                   # exclusão de item/fase (Postgres real)
node scripts/testes/cronogramas-livres-sql.mjs                          # status no relatório (Postgres real)
npm install --no-save @electric-sql/pglite                              # só para os dois últimos
```

---

## 4. Termo de Passagem para o Suporte — impressão

O termo sai em **A4 retrato** pelo botão *Imprimir / PDF* (`/cronogramas/<id>/termo`).
O cliente também pode imprimir pelo link público (`/t/<token>`).

O que mudou na impressão (por que antes “quase cortava”):

- O papel era montado escondendo o resto da tela com `visibility: hidden` e
  jogando a folha em `position: absolute; left: 0; right: 0` **sem padding** —
  o conteúdo começava na borda da área útil e a última coluna de cada linha
  (data, “documento nº”, rodapé) ficava no limite do papel.
- Agora a folha mantém margem própria (`@page: A4; margin: 14mm 16mm 16mm` +
  3 mm de respiro), nada é posicionado em absoluto no papel e o fundo do app
  (escuro) não vai mais para o papel: só a folha fica visível, com fundo branco.
- Nome de cliente, módulos e textos longos quebram dentro da própria coluna em
  vez de empurrar a linha para fora da margem.
- O diálogo “Concluir o cronograma?” e o cabeçalho do app nunca são impressos.
- O link público ganhou o mesmo CSS de papel e um botão *Imprimir / PDF*.

Dica: na janela de impressão do navegador, deixe **Margens: Padrão** (ou
“Mínimo”) e **Gráficos de plano de fundo** ligado, para as linhas do documento
saírem no PDF.

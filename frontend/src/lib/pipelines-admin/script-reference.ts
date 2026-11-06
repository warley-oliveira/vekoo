// A referência da API JS ao lado do editor, como dado. O código é contrato (`kanban.*`, sem tradução);
// a descrição vem de `pipelinesAdmin.code.reference.<grupo>.<id>`.

export type ReferenceItem = {
  id: string
  code: string
  /** O que entra no editor ao clicar em inserir. Sem ele, o próprio `code`. */
  insert?: string
}

export type ReferenceGroup = {
  id: string
  items: ReferenceItem[]
}

export const SCRIPT_REFERENCE: ReferenceGroup[] = [
  {
    id: "params",
    items: [
      { id: "card", code: "params.card" },
      { id: "board", code: "params.board" },
      { id: "trigger", code: "params.trigger" },
      { id: "event", code: "params.event.event_type" },
    ],
  },
  {
    id: "find",
    items: [
      { id: "card", code: "kanban.card(id)", insert: "kanban.card(params.card.id)" },
      { id: "board", code: "kanban.board(ref)", insert: "kanban.board(params.board.id)" },
      { id: "boards", code: "kanban.boards()" },
      { id: "cardsForConversation", code: "kanban.cardsForConversation()" },
      { id: "labels", code: "kanban.labels()" },
    ],
  },
  {
    id: "card",
    items: [
      { id: "update", code: "card.update(attrs)", insert: "card.update({ priority: 'high' })" },
      { id: "moveTo", code: "card.moveTo(etapa, noFim)", insert: "card.moveTo('Proposta enviada')" },
      { id: "markWon", code: "card.markWon()" },
      { id: "markLost", code: "card.markLost(motivo)", insert: "card.markLost('Sem orçamento')" },
      { id: "reopen", code: "card.reopen()" },
      { id: "archive", code: "card.archive()" },
      { id: "unarchive", code: "card.unarchive()" },
      { id: "addLabel", code: "card.addLabel(ref)", insert: "card.addLabel('Quente')" },
      { id: "removeLabel", code: "card.removeLabel(id)" },
      { id: "setCustomField", code: "card.setCustomField(chave, valor)", insert: "card.setCustomField('Origem do contato', 'Site')" },
      { id: "getCustomField", code: "card.getCustomField(chave)", insert: "card.getCustomField('Origem do contato')" },
      { id: "incrementCustomField", code: "card.incrementCustomField(chave, delta)", insert: "card.incrementCustomField('Lead Score', 10)" },
      { id: "addComment", code: "card.addComment(texto)", insert: "card.addComment('Comentário da automação')" },
      { id: "comments", code: "card.comments(limite)" },
      { id: "addChecklist", code: "card.addChecklist(nome)" },
      { id: "checklists", code: "card.checklists()" },
      { id: "refresh", code: "card.refresh()" },
    ],
  },
  {
    id: "board",
    items: [
      { id: "column", code: "board.column(ref)" },
      { id: "cards", code: "board.cards(filtros)", insert: "board.cards({ priority: 'high' })" },
      { id: "createCard", code: "board.createCard(etapa, attrs)", insert: "board.createCard('Novos contatos', { title: 'Novo card' })" },
      { id: "customFields", code: "board.customFields()" },
    ],
  },
  {
    id: "contact",
    items: [
      { id: "getContactInfo", code: "getContactInfo()" },
      { id: "tagAdd", code: "tag.add(nome)", insert: "tag.add('VIP')" },
      { id: "contactAttribute", code: "contactAttribute.setItem(chave, valor)" },
      { id: "assignUserByEmail", code: "assignUserByEmail(email)" },
    ],
  },
  {
    id: "network",
    items: [
      { id: "fetch", code: "await fetch(url, opcoes)", insert: "const resposta = await fetch('https://api.exemplo.com.br/pedidos');\nconst dados = await resposta.json();" },
      { id: "collection", code: "collection.Create(tabela, dados)" },
      { id: "catalog", code: "catalog.Search(busca)" },
      { id: "console", code: "console.log(valor)" },
    ],
  },
]

/** Exemplos prontos para colar: cada um resolve um pedido comum de ponta a ponta. */
export const SCRIPT_SNIPPETS: { id: string; code: string }[] = [
  {
    id: "score",
    code: `const card = kanban.card(params.card.id);
const pontos = card.incrementCustomField('Lead Score', 10);
return { pontos };`,
  },
  {
    id: "webhook",
    code: `const resposta = await fetch('https://api.exemplo.com.br/pedidos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ card: params.card.id, titulo: params.card.title }),
});
return { ok: resposta.ok, status: resposta.status };`,
  },
  {
    id: "label",
    code: `const card = kanban.card(params.card.id);
if ((params.card.deal_value ?? 0) >= 5000) {
  card.addLabel('Quente');
  card.addComment('Negócio acima de R$ 5 mil: prioridade para a gerência.');
}
return { evento: params.event.event_type };`,
  },
]

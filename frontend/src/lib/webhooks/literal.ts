/**
 * Para `t(chave, LITERAL)`: textos que mostram uma variável de verdade, como `{{body.nome}}`. Sem isto, o i18next acha que
 * é dele, procura `body.nome` nos valores e apaga do texto.
 */
export const LITERAL = { skipInterpolation: true } as const

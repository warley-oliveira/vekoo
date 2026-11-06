type Positioned = { id: string; position: number }

/**
 * O que precisa mudar para a ordem nova valer. A API ordena por `position` e desempata
 * por outro critério, então "só mandar para o topo" não basta: posição repetida deixaria
 * a ordem na mão do desempate. Numera a lista inteira e manda só o que mudou.
 */
export function positionChanges<T extends Positioned>(ordered: readonly T[]): Positioned[] {
  return ordered.flatMap((entry, index) =>
    entry.position === index ? [] : [{ id: entry.id, position: index }]
  )
}

/** A lista na ordem nova, com as posições já acertadas: para a atualização otimista. */
export function withPositions<T extends Positioned>(ordered: readonly T[]): T[] {
  return ordered.map((entry, index) => ({ ...entry, position: index }))
}

/** Roda `task` em todos, com no máximo `limit` ao mesmo tempo. */
export async function runPool<T>(
  values: readonly T[],
  limit: number,
  task: (value: T) => Promise<unknown>
): Promise<{ succeeded: T[]; failed: T[] }> {
  const queue = [...values]
  const succeeded: T[] = []
  const failed: T[] = []

  async function worker() {
    for (let value = queue.shift(); value !== undefined; value = queue.shift()) {
      try {
        await task(value)
        succeeded.push(value)
      } catch {
        failed.push(value)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return { succeeded, failed }
}

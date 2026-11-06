// A distribuição de um serviço: quanto de cada atendimento vai para cada colaborador. Soma 100, em
// números inteiros, e a API recusa salvar enquanto não somar. Quem saiu do calendário some daqui
// sozinho, e aí a soma cai: é o estado que a tela precisa explicar.

export type Distribution = Record<string, number>

export const FULL = 100
/** Arrastando, ninguém encolhe até sumir: tirar alguém é desmarcar. A mesma regra da origem. */
export const MIN_SHARE = 2
/** Quanto entra quem é marcado com a soma já completa, tirado dos outros. A mesma regra da origem. */
const JOINING_SHARE = 10

export function sumOf(distribution: Distribution): number {
  return Object.values(distribution).reduce((total, value) => total + (Number(value) || 0), 0)
}

/** Quem atende, de verdade: quem está na distribuição e continua no calendário. */
export function sharesOf<TProfessional extends { id: string }>(
  distribution: Distribution,
  professionals: TProfessional[]
): { professional: TProfessional; share: number }[] {
  return professionals.flatMap((professional) => {
    const share = Number(distribution[professional.id]) || 0
    return share > 0 ? [{ professional, share }] : []
  })
}

/** A soma deixou de dar 100: normalmente porque alguém saiu do calendário. */
export function isBroken(distribution: Distribution, professionals: { id: string }[]): boolean {
  return sharesOf(distribution, professionals).reduce((sum, { share }) => sum + share, 0) !== FULL
}

/**
 * Um número para cada colaborador de hoje, zero para quem não atende. Id que não é mais de ninguém
 * fica de fora, porque a API o recusa, e a soma cai como se a pessoa tivesse saído: é o que ela fez.
 */
export function forProfessionals(
  distribution: Distribution,
  professionals: { id: string }[]
): Distribution {
  return Object.fromEntries(
    professionals.map(({ id }) => [id, Number(distribution[id]) || 0] as const)
  )
}

/**
 * O que vai para a API. Porcentagem zero é o que tira o colaborador do serviço, então quem acabou de
 * sair precisa ir com zero; quem nunca atendeu não precisa aparecer.
 */
export function distributionForApi(
  distribution: Distribution,
  original: Distribution,
  professionals: { id: string }[]
): Distribution {
  return Object.fromEntries(
    professionals.flatMap(({ id }) => {
      const share = Number(distribution[id]) || 0
      return share > 0 || (Number(original[id]) || 0) > 0 ? [[id, share] as const] : []
    })
  )
}

/** Leva a soma de quem já está no serviço até `target`, mantendo a proporção entre eles. */
export function scaleTo(distribution: Distribution, target = FULL): Distribution {
  const active = Object.entries(distribution).filter(([, share]) => share > 0)
  const total = active.reduce((sum, [, share]) => sum + share, 0)
  if (total === 0) return distribution

  const exact = active.map(([id, share]) => ({ id, exact: (share * target) / total }))
  const result: Distribution = { ...distribution }
  for (const { id, exact: value } of exact) result[id] = Math.floor(value)

  // O arredondamento fica com quem perdeu mais casas, para a soma fechar certinho.
  const rest = target - exact.reduce((sum, { exact: value }) => sum + Math.floor(value), 0)
  ;[...exact]
    .sort((a, b) => b.exact % 1 - a.exact % 1)
    .slice(0, rest)
    .forEach(({ id }) => {
      result[id] += 1
    })
  return result
}

/** 100 dividido por igual. O que não dá para dividir vai para os primeiros: 34, 33, 33. */
export function splitEvenly(
  ids: string[],
  base: Distribution = {}
): Distribution {
  const result: Distribution = Object.fromEntries(Object.keys(base).map((id) => [id, 0] as const))
  if (ids.length === 0) return result

  const share = Math.floor(FULL / ids.length)
  const rest = FULL - share * ids.length
  ids.forEach((id, index) => {
    result[id] = share + (index < rest ? 1 : 0)
  })
  return result
}

export function withMember(distribution: Distribution, id: string): Distribution {
  const sum = sumOf(distribution)
  if (sum <= 0) return { ...distribution, [id]: FULL }
  if (sum < FULL) return { ...distribution, [id]: FULL - sum }
  return { ...scaleTo({ ...distribution, [id]: 0 }, FULL - JOINING_SHARE), [id]: JOINING_SHARE }
}

export function withoutMember(distribution: Distribution, id: string): Distribution {
  const next = { ...distribution, [id]: 0 }
  return sumOf(next) > 0 ? scaleTo(next) : next
}

/** A divisa entre dois vizinhos: o que um ganha o outro perde, e a soma não muda. */
export function withBoundaryMoved(
  distribution: Distribution,
  leftId: string,
  rightId: string,
  nextLeft: number
): Distribution {
  const pair = distribution[leftId] + distribution[rightId]
  const left = Math.min(Math.max(Math.round(nextLeft), MIN_SHARE), pair - MIN_SHARE)
  return { ...distribution, [leftId]: left, [rightId]: pair - left }
}

import { nextPosition } from "./reorder"
import type { ProductCategory } from "./types"

// A API entrega a árvore plana, com cada filho logo depois do pai.

const PATH_LABEL_SEPARATOR = " › "

/**
 * Filhos diretos de cada categoria, entre irmãos pela posição e depois pelo nome, como a
 * API. Ordena aqui também para a árvore refletir uma reordenação otimista. A raiz fica em
 * `null`.
 */
export function childrenByParent(
  categories: readonly ProductCategory[]
): Map<string | null, ProductCategory[]> {
  const groups = new Map<string | null, ProductCategory[]>()
  categories.forEach((category) => {
    const siblings = groups.get(category.parentId)
    if (siblings) siblings.push(category)
    else groups.set(category.parentId, [category])
  })
  groups.forEach((siblings) =>
    siblings.sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug))
  )
  return groups
}

/** A categoria e tudo o que está dentro dela. */
export function subtreeOf(
  categories: readonly ProductCategory[],
  category: Pick<ProductCategory, "id" | "path">
): ProductCategory[] {
  const prefix = `${category.path}/`
  return categories.filter(
    (candidate) => candidate.id === category.id || candidate.path.startsWith(prefix)
  )
}

/** "Moda › Feminino › Vestidos": a forma legível do caminho. */
export function categoryPathLabel(
  categories: readonly ProductCategory[],
  category: ProductCategory
): string {
  const byId = new Map(categories.map((candidate) => [candidate.id, candidate]))
  const names = [category.name]
  let parent = category.parentId ? byId.get(category.parentId) : undefined
  while (parent) {
    names.unshift(parent.name)
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return names.join(PATH_LABEL_SEPARATOR)
}

/**
 * Quantos itens o filtro por esta categoria alcança, aproximado: filtrar vale a
 * subárvore, e `itemsCount` só conta os vínculos diretos. Um item em duas categorias
 * irmãs entra duas vezes na soma.
 */
export function subtreeItemCount(
  categories: readonly ProductCategory[],
  category: ProductCategory
): number {
  return subtreeOf(categories, category).reduce((sum, item) => sum + item.itemsCount, 0)
}

/** A posição que põe uma categoria nova depois das irmãs. */
export function nextSiblingPosition(
  categories: readonly ProductCategory[],
  parentId: string | null
): number {
  return nextPosition(categories.filter((category) => category.parentId === parentId))
}

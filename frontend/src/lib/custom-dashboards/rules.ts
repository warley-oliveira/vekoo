import type { ConditionalRule } from "./types"

/** A primeira faixa que casa, na ordem em que foi escrita. */
export function matchRule(rules: ConditionalRule[] | undefined, value: number | null): ConditionalRule | null {
  if (!rules?.length || value === null || !Number.isFinite(value)) return null

  for (const rule of rules) {
    const hit =
      (rule.operator === "gt" && value > rule.value) ||
      (rule.operator === "gte" && value >= rule.value) ||
      (rule.operator === "lt" && value < rule.value) ||
      (rule.operator === "lte" && value <= rule.value) ||
      (rule.operator === "eq" && value === rule.value)
    if (hit) return rule
  }
  return null
}

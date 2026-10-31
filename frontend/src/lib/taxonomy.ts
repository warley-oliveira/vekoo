// Gerado por `bin/rails taxonomy:export` a partir de
// backend/config/reference_taxonomy.yml — não edite à mão.
//
// Os códigos são contrato (API, banco, prompt). Os rótulos de tela vivem
// nos locales, em `taxonomy.<lista>.<código>`.

export const NICHES = [
  "food_beverage",
  "real_estate",
  "healthcare",
  "beauty_aesthetics",
  "fashion_retail",
  "fitness",
  "education",
  "professional_services",
  "pet",
  "home_construction",
] as const
export type Niche = (typeof NICHES)[number]

export const REFERENCE_SIZES = [
  "global",
  "national",
  "regional",
  "local",
] as const
export type ReferenceSize = (typeof REFERENCE_SIZES)[number]

export const ARCHETYPES = [
  "premium_minimal",
  "popular_warm",
  "technical_authority",
  "young_irreverent",
  "natural_artisanal",
  "caring_welcoming",
  "bold_energetic",
  "traditional_heritage",
] as const
export type Archetype = (typeof ARCHETYPES)[number]

export const OBJECTIVES = [
  "direct_sale",
  "launch",
  "authority_education",
  "community_engagement",
  "behind_the_scenes",
  "social_proof",
  "seasonal_date",
] as const
export type Objective = (typeof OBJECTIVES)[number]

export const REFERENCE_FORMATS = [
  "carousel",
  "static",
  "story",
  "reels",
  "ad",
] as const
export type ReferenceFormat = (typeof REFERENCE_FORMATS)[number]

export const HOOK_TYPES = [
  "question",
  "number",
  "contrast",
  "promise",
  "controversy",
  "curiosity",
  "announcement",
  "visual",
] as const
export type HookType = (typeof HOOK_TYPES)[number]

export const TARGET_METRICS = [
  "saves",
  "shares",
  "comments",
  "clicks",
  "reach",
] as const
export type TargetMetric = (typeof TARGET_METRICS)[number]

export const REPLICABILITY = [
  1,
  2,
  3,
] as const
export type Replicability = (typeof REPLICABILITY)[number]

export const POST_REQUIREMENTS = [
  "product_photo",
  "brand_person",
  "customer",
  "space",
  "event",
  "promotion",
] as const
export type PostRequirement = (typeof POST_REQUIREMENTS)[number]

export const REFERENCE_ORIGINS = [
  "external",
  "vekoo",
  "authored",
] as const
export type ReferenceOrigin = (typeof REFERENCE_ORIGINS)[number]

export const REFERENCE_STATUSES = [
  "draft",
  "in_review",
  "published",
  "archived",
] as const
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number]

/** Formato da peça do Vekoo → formato de referência que serve a ela. */
export const PIECE_FORMAT_REFERENCE = {
  feed_square: "static",
  feed_portrait: "static",
  story: "story",
  carousel: "carousel",
} as const satisfies Record<string, ReferenceFormat>

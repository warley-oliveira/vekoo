import { withBrazilCountryCode } from "@/lib/contacts/import-parser"
import { onlyDigits } from "@/lib/format-phone"
import type { ImportContact } from "./import-protocol"
import type { PlaceContact, PlaceResult } from "./types"

// Um estabelecimento encontrado vira destinatário: o nome, o telefone e o que se sabe dele, que chega
// às variáveis (`{{city}}`) e aos dados da conversa.

export const placeKey = (place: PlaceResult) =>
  "extractionId" in place ? `${place.placeId}-${(place as PlaceContact).extractionId}` : place.placeId

export function placePhone(place: PlaceResult): string {
  return place.phoneUnformatted || onlyDigits(place.phone)
}

export const hasPhone = (place: PlaceResult) => placePhone(place).length > 0

export function placeToContact(place: PlaceResult, includeCountryCode: boolean): ImportContact {
  const phone = placePhone(place)
  const metadata: Record<string, unknown> = {
    address: place.address,
    street: place.street,
    city: place.city,
    state: place.state,
    postalCode: place.postalCode,
    website: place.website,
    categoryName: place.categoryName,
    categories: place.categories,
    totalScore: place.totalScore,
    reviewsCount: place.reviewsCount,
    imageUrl: place.imageUrl,
    mapsUrl: place.url,
    placeId: place.placeId,
    latitude: place.latitude,
    longitude: place.longitude,
    instagram: place.instagram,
    facebook: place.facebook,
    openingHours: place.openingHours,
  }

  const compact = Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0)
    )
  ) as Record<string, string>

  return {
    userName: place.title,
    externalId: includeCountryCode ? withBrazilCountryCode(phone) : phone,
    contactMetadata: compact,
  }
}

export const REVIEW_SORTS = ["newest", "mostRelevant", "highestRanking", "lowestRanking"] as const

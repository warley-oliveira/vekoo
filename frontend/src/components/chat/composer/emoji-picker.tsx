import { useMemo } from "react"
import Picker, {
  Categories,
  EmojiStyle,
  SkinTones,
  Theme,
  type EmojiClickData,
  type EmojiDataLoader,
  type PickerLabels,
} from "emoji-picker-react"
import { useTranslation } from "react-i18next"

import { useLanguage } from "@/lib/i18n"

/** Em português, a busca entende "coração" e "sorriso": o inglês já vem junto com o seletor. */
const loadPortuguese: EmojiDataLoader = () => import("emoji-picker-react/data/emojis-pt")

const CATEGORIES = [
  [Categories.SUGGESTED, "suggested"],
  [Categories.SMILEYS_PEOPLE, "people"],
  [Categories.ANIMALS_NATURE, "nature"],
  [Categories.FOOD_DRINK, "food"],
  [Categories.TRAVEL_PLACES, "travel"],
  [Categories.ACTIVITIES, "activities"],
  [Categories.OBJECTS, "objects"],
  [Categories.SYMBOLS, "symbols"],
  [Categories.FLAGS, "flags"],
] as const

/**
 * O seletor completo, em chunk próprio: é pesado demais para descer com o chat. Emoji nativo, para
 * não buscar imagens em CDN a cada abertura e para combinar com o que o contato vê.
 */
export default function EmojiPicker({
  onPick,
  height = 340,
}: {
  onPick: (emoji: string) => void
  height?: number
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  const categories = useMemo(
    () =>
      CATEGORIES.map(([category, key]) => ({
        category,
        name: t(`chat.composer.emojiPicker.categories.${key}`),
      })),
    [t]
  )

  const labels = useMemo<Partial<PickerLabels>>(
    () => ({
      searchPlaceholder: t("chat.composer.emojiPicker.search"),
      searchLabel: t("chat.composer.emojiPicker.search"),
      searchClear: t("chat.composer.emojiPicker.clear"),
      searchResultsNone: t("chat.composer.emojiPicker.none"),
      searchResultsOne: t("chat.composer.emojiPicker.one"),
      searchResultsMany: t("chat.composer.emojiPicker.many"),
      categoryNavigation: t("chat.composer.emojiPicker.navigation"),
      loading: t("chat.composer.emojiPicker.loading"),
      loadingError: t("chat.composer.emojiPicker.loadingError"),
      retryLoading: t("chat.composer.emojiPicker.retry"),
      skinToneNeutral: t("chat.composer.emojiPicker.tones.neutral"),
      skinToneLight: t("chat.composer.emojiPicker.tones.light"),
      skinToneMediumLight: t("chat.composer.emojiPicker.tones.mediumLight"),
      skinToneMedium: t("chat.composer.emojiPicker.tones.medium"),
      skinToneMediumDark: t("chat.composer.emojiPicker.tones.mediumDark"),
      skinToneDark: t("chat.composer.emojiPicker.tones.dark"),
    }),
    [t]
  )

  return (
    <Picker
      onEmojiClick={(data: EmojiClickData) => onPick(data.emoji)}
      emojiData={language === "pt-BR" ? loadPortuguese : undefined}
      categories={categories}
      labels={labels}
      emojiStyle={EmojiStyle.NATIVE}
      theme={Theme.LIGHT}
      defaultSkinTone={SkinTones.NEUTRAL}
      lazyLoadEmojis
      autoFocusSearch={false}
      previewConfig={{ showPreview: false }}
      width="100%"
      height={height}
      style={{ border: "none", minWidth: "18rem" }}
    />
  )
}

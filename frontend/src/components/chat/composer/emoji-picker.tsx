import Picker, { EmojiStyle, SkinTones, Theme, type EmojiClickData } from "emoji-picker-react"
import { useTranslation } from "react-i18next"

/**
 * O seletor completo, em chunk próprio: é pesado demais para descer com o chat. Emoji nativo, para
 * não buscar imagens em CDN a cada abertura e para combinar com o que o contato vê.
 */
export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation()

  return (
    <Picker
      onEmojiClick={(data: EmojiClickData) => onPick(data.emoji)}
      emojiStyle={EmojiStyle.NATIVE}
      theme={Theme.LIGHT}
      defaultSkinTone={SkinTones.NEUTRAL}
      lazyLoadEmojis
      autoFocusSearch={false}
      searchPlaceHolder={t("chat.composer.emojiSearch")}
      previewConfig={{ showPreview: false }}
      width="100%"
      height={340}
      style={{ border: "none", minWidth: "18rem" }}
    />
  )
}

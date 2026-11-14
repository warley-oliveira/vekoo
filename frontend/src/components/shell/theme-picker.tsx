import { useTranslation } from "react-i18next"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"

import { SegmentedControl } from "@/components/shared"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  THEME_PREFERENCES,
  setThemePreference,
  useResolvedTheme,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme"

const ICONS: Record<ThemePreference, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/**
 * O tema no menu da pessoa, ao lado do idioma. O gatilho mostra o tema que está na tela (sol ou
 * lua) e diz a escolha atual; as três opções são itens de rádio, com teclado e leitor de tela do
 * próprio menu.
 */
export function ThemeSubmenu() {
  const { t } = useTranslation()
  const preference = useThemePreference()
  const resolved = useResolvedTheme()
  const TriggerIcon = resolved === "dark" ? Moon : Sun

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <TriggerIcon /> {t("theme.label")}
        <span className="ml-auto text-xs text-muted-foreground">{t(`theme.${preference}`)}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => {
            if (isPreference(value)) setThemePreference(value)
          }}
        >
          {THEME_PREFERENCES.map((option) => {
            const Icon = ICONS[option]
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <Icon /> {t(`theme.${option}`)}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/**
 * O tema em três segmentos, com ícone e rótulo: em Perfil, no menu do celular e na vitrine.
 * `compact` deixa só o ícone (o rótulo vai para o leitor de tela).
 */
export function ThemeSegmented({
  compact = false,
  fullWidth = false,
  className,
}: {
  compact?: boolean
  fullWidth?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const preference = useThemePreference()

  return (
    <SegmentedControl
      aria-label={t("theme.label")}
      value={preference}
      onChange={setThemePreference}
      fullWidth={fullWidth}
      className={className}
      options={THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option]
        return {
          value: option,
          icon: <Icon aria-hidden />,
          label: compact ? null : t(`theme.${option}`),
          "aria-label": compact ? t(`theme.${option}`) : undefined,
        }
      })}
    />
  )
}

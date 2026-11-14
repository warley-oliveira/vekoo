import i18n from "@/lib/i18n"

import en from "@/admin/locales/en.json"
import ptBR from "@/admin/locales/pt-BR.json"

// Os textos da área da Vekoo entram no bundle só quando ela carrega — o
// assinante nunca baixa este arquivo. Mesmo namespace do app (`admin.*`), para
// `t()` funcionar igual nos dois lados.
i18n.addResourceBundle("pt-BR", "translation", ptBR, true, false)

// O inglês do app desce sob demanda (`lib/i18n-en.ts`): um bundle `en` criado antes disso faria
// o i18next achar que o idioma já chegou e não buscar o resto. Os textos daqui entram depois.
function addEnglish() {
  if (i18n.hasResourceBundle("en", "translation")) {
    i18n.addResourceBundle("en", "translation", en, true, false)
  }
}
addEnglish()
i18n.on("loaded", addEnglish)

import i18n from "@/lib/i18n"

import en from "@/admin/locales/en.json"
import ptBR from "@/admin/locales/pt-BR.json"

// Os textos da área da Vekoo entram no bundle só quando ela carrega — o
// assinante nunca baixa este arquivo. Mesmo namespace do app (`admin.*`), para
// `t()` funcionar igual nos dois lados.
i18n.addResourceBundle("pt-BR", "translation", ptBR, true, false)
i18n.addResourceBundle("en", "translation", en, true, false)

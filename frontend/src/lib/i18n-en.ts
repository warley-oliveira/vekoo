import en from "@/locales/en.json"
import { buildBundle, type Bundle } from "@/lib/i18n-bundles"

// O inglês inteiro, em um chunk só: quem usa o app em português não paga por ele.
const domainFiles = import.meta.glob<Bundle>("../locales/en/*.json", {
  eager: true,
  import: "default",
})

export default buildBundle(en, domainFiles)

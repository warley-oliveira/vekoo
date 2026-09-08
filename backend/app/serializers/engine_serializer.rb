# O catálogo de motores como a tela monta o formulário: o manifesto, já com
# os textos no idioma da requisição, e as dimensões de cada formato.
class EngineSerializer < ApplicationSerializer
  def self.one(entry)
    entry.manifest.as_json(locale: I18n.locale)
  end

  def self.catalog(entries)
    {
      engines: entries.map { |entry| one(entry) },
      dimensions: Engines::Manifest::DIMENSIONS.transform_values { |(w, h)| { width: w, height: h } }
    }
  end
end

# A taxonomia do banco de referências, lida de `config/reference_taxonomy.yml`
# — a fonte única. Validação (ReferenceCard, Brandcore), agente e tela usam
# estas listas; o front as recebe em `frontend/src/lib/taxonomy.ts`, gerado
# por `bin/rails taxonomy:export` (`Taxonomy.typescript`).
module Taxonomy
  PATH = Rails.root.join("config/reference_taxonomy.yml")
  DATA = YAML.safe_load_file(PATH).each_value(&:freeze).freeze

  NICHES = DATA.fetch("niches").keys.freeze
  SIZES = DATA.fetch("sizes").keys.freeze
  ARCHETYPES = DATA.fetch("archetypes").keys.freeze
  OBJECTIVES = DATA.fetch("objectives").keys.freeze
  FORMATS = DATA.fetch("formats").keys.freeze
  HOOK_TYPES = DATA.fetch("hook_types").keys.freeze
  TARGET_METRICS = DATA.fetch("target_metrics").keys.freeze
  REPLICABILITY = DATA.fetch("replicability").keys.freeze
  REQUIRES = DATA.fetch("requires").keys.freeze
  ORIGINS = DATA.fetch("origins").keys.freeze
  STATUSES = DATA.fetch("statuses").keys.freeze

  # Formato da peça → formato de referência que serve a ela.
  PIECE_FORMATS = DATA.fetch("piece_formats")

  # A lista do YAML → o nome da constante e do tipo no TypeScript.
  TYPESCRIPT = {
    "niches" => %w[NICHES Niche],
    "sizes" => %w[REFERENCE_SIZES ReferenceSize],
    "archetypes" => %w[ARCHETYPES Archetype],
    "objectives" => %w[OBJECTIVES Objective],
    "formats" => %w[REFERENCE_FORMATS ReferenceFormat],
    "hook_types" => %w[HOOK_TYPES HookType],
    "target_metrics" => %w[TARGET_METRICS TargetMetric],
    "replicability" => %w[REPLICABILITY Replicability],
    "requires" => %w[POST_REQUIREMENTS PostRequirement],
    "origins" => %w[REFERENCE_ORIGINS ReferenceOrigin],
    "statuses" => %w[REFERENCE_STATUSES ReferenceStatus]
  }.freeze

  TYPESCRIPT_PATH = Rails.root.join("../frontend/src/lib/taxonomy.ts")

  module_function

  def values(list) = DATA.fetch(list.to_s).keys

  # O que o código quer dizer, em pt-BR — para o prompt do modelo, não para a
  # tela.
  def describe(list, code) = DATA.fetch(list.to_s)[code]

  def reference_format(piece_format) = PIECE_FORMATS[piece_format.to_s]

  def typescript
    lists = TYPESCRIPT.map { |list, (constant, type)|
      items = values(list).map { |value| "  #{value.to_json}," }.join("\n")
      "export const #{constant} = [\n#{items}\n] as const\nexport type #{type} = (typeof #{constant})[number]\n"
    }
    formats = PIECE_FORMATS.map { |piece, reference| "  #{piece}: #{reference.to_json}," }.join("\n")
    <<~TS
      // Gerado por `bin/rails taxonomy:export` a partir de
      // backend/config/reference_taxonomy.yml — não edite à mão.
      //
      // Os códigos são contrato (API, banco, prompt). Os rótulos de tela vivem
      // nos locales, em `taxonomy.<lista>.<código>`.

      #{lists.join("\n").chomp}

      /** Formato da peça do Vekoo → formato de referência que serve a ela. */
      export const PIECE_FORMAT_REFERENCE = {
      #{formats}
      } as const satisfies Record<string, ReferenceFormat>
    TS
  end
end

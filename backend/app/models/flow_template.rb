# Modelo de fluxo pronto para começar: não é tabela, é arquivo (`db/seeds/flow_templates/*.json`), igual
# para toda organização. Carrega na primeira leitura. Reabre em desenvolvimento junto com a classe.
class FlowTemplate
  DIRECTORY = Rails.root.join("db/seeds/flow_templates")
  ATTRIBUTES = %i[slug name description category trigger_type tags thumbnail_url definition].freeze

  attr_reader(*ATTRIBUTES)

  class << self
    def all
      registry.values
    end

    def find(slug)
      registry[slug.to_s]
    end

    def register(template)
      registry[template.slug] = template
    end

    def reset!
      @registry = nil
    end

    def load_from_directory(path)
      @registry = {}
      Dir.glob(File.join(path, "*.json")).sort.each do |file|
        register(new(JSON.parse(File.read(file))))
      rescue JSON::ParserError, KeyError => e
        Rails.logger.warn("[FlowTemplate] não carregou #{file}: #{e.message}")
      end
      @registry
    end

    private

    def registry
      @registry || load_from_directory(DIRECTORY)
    end
  end

  def initialize(attrs = {})
    attrs = attrs.with_indifferent_access
    @slug = attrs.fetch(:slug).to_s
    @name = attrs.fetch(:name).to_s
    @description = attrs[:description].to_s
    @category = attrs[:category].to_s
    @trigger_type = attrs[:trigger_type].to_s
    @tags = Array(attrs[:tags])
    @thumbnail_url = attrs[:thumbnail_url].to_s
    @definition = attrs[:definition]&.to_h || { "nodes" => [], "edges" => [], "viewport" => {} }
  end
end

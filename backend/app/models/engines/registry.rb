# O catálogo de motores. Na primeira consulta varre `engines/*/`, valida cada
# manifesto e carrega o `render.rb` correspondente. Adicionar um motor novo é
# adicionar um diretório — nada aqui precisa mudar.
#
# O cache mora numa variável do módulo: no recarregamento do Zeitwerk em
# desenvolvimento o módulo `Engines` nasce de novo e a varredura repete,
# então editar um `render.rb` vale sem reiniciar o servidor.
module Engines
  module Registry
    Entry = Struct.new(:manifest, :renderer, :dir, keyword_init: true) do
      def id = manifest.id
    end

    module_function

    def root
      Rails.root.join("engines")
    end

    def all
      @entries ||= scan!
    end

    def ids
      all.keys
    end

    def find(id)
      all[id.to_s]
    end

    def fetch(id)
      find(id) || raise(GenerationError.new("engineUnknown", nil, engineId: id.to_s))
    end

    def reset!
      @entries = nil
    end

    def scan!
      Dir.children(root).sort.filter_map { |name|
        dir = root.join(name)
        next unless dir.directory?

        manifest = Manifest.load(dir.join("manifest.yml"), expected_id: name)
        renderer = load_renderer(dir, manifest)
        [ manifest.id, Entry.new(manifest: manifest, renderer: renderer, dir: dir) ]
      }.to_h.freeze
    end

    # `render.rb` define `Engines::<IdCamelizado>`, uma subclasse de `Base`.
    def load_renderer(dir, manifest)
      path = dir.join("render.rb")
      raise InvalidManifest, "motor #{manifest.id}: falta render.rb" unless path.exist?

      load path
      constant = "Engines::#{manifest.id.camelize}"
      renderer = constant.safe_constantize
      raise InvalidManifest, "motor #{manifest.id}: render.rb não define #{constant}" unless renderer
      raise InvalidManifest, "motor #{manifest.id}: #{constant} precisa herdar de Engines::Base" unless renderer < Base

      renderer
    end
  end
end

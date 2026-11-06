module MiniRacerEngine
  class Base
    # Toda extensão é um arquivo aqui. Não há lista fixa: um domínio acrescenta a própria
    # (`workers/kanban.rb`) sem tocar no núcleo, e duas frentes não disputam o mesmo arquivo.
    EXTENSIONS_DIR = File.expand_path("workers", __dir__)

    def initialize(context = SessionContext.new)
      @context = context
    end

    def set_context(key, data)
      @context.set(key, data)
    end

    def get_context(key)
      @context.get(key)
    end

    def self.extension_files
      Dir.glob(File.join(EXTENSIONS_DIR, "*.rb"))
    end

    # Em ordem alfabética, para o carregamento ser o mesmo em toda máquina. Resolve a classe
    # a cada execução para continuar certo depois de um reload em desenvolvimento.
    def self.registered_modules
      extension_files.sort.map do |path|
        extension = "MiniRacerEngine::Workers::#{File.basename(path, ".rb").camelize}".constantize
        next extension if extension < EngineModule

        raise TypeError, "#{extension} precisa herdar de MiniRacerEngine::EngineModule"
      end
    end

    protected

    def list_modules
      self.class.registered_modules
    end
  end
end

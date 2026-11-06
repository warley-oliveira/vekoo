module Tools
  class UninstallService
    def initialize(installation)
      @installation = installation
    end

    # Função que a pessoa personalizou já não aponta para a instalação, e fica.
    def call
      @installation.tool_functions.where(tool_installation_id: @installation.id.to_s).destroy_all
      @installation.destroy
      Result.new(success: true)
    end
  end
end

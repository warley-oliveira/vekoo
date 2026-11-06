module Tools
  # Instala uma ferramenta do catálogo na organização: cada modelo de função vira uma função de verdade, ligada à instalação.
  # Instalar de novo refaz as funções, com o código atual do catálogo.
  class InstallService
    def initialize(tool, organization, credentials: {})
      @tool = tool
      @organization = organization
      @credentials = (credentials || {}).to_h.stringify_keys
    end

    def call
      missing = missing_required_credentials
      return Result.new(success: false, errors: missing) if missing.any?

      installation = ToolInstallation.find_or_initialize_by(tool_id: @tool.id.to_s, organization_id: @organization.id.to_s)
      installation.credentials = @credentials if @credentials.any?
      installation.save!

      destroy_previous_clones(installation)
      installation.update!(tool_function_ids: clone_templates(installation), enabled: true)

      Result.new(success: true, data: installation)
    rescue Mongoid::Errors::Validations => e
      Result.new(success: false, errors: e.document.errors.full_messages)
    end

    private

    def missing_required_credentials
      Array(@tool.credentials_schema)
        .select { |spec| [ "true", true ].include?(spec["required"]) }
        .map { |spec| spec["name"] }
        .reject { |name| @credentials[name].present? }
        .map { |name| I18n.t("automation.tools.errors.missing_credential", name: name) }
    end

    def destroy_previous_clones(installation)
      return if installation.tool_function_ids.blank?

      installation.tool_functions.destroy_all
    end

    def clone_templates(installation)
      Array(@tool.function_templates).map do |template|
        template = template.with_indifferent_access
        function = ToolFunction::MiniRacer.create!(
          name: template[:name],
          description: template[:description],
          parameters: template[:parameters] || [],
          js_code: template[:js_code],
          organization_id: @organization.id.to_s,
          tool_installation_id: installation.id.to_s
        )
        function.id.to_s
      end
    end
  end
end

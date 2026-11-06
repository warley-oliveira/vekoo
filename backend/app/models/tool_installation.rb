# Uma ferramenta do catálogo instalada na organização. Na origem era por assistente; aqui a instalação é da
# organização, e quem escolhe qual função usa é cada bloco (`ai_assistant.tool_ids`, `execute_tool.tool_id`).
class ToolInstallation
  include Mongoid::Document
  include Mongoid::Timestamps
  include EncryptedField

  field :tool_id, type: String
  field :organization_id, type: String
  field :enabled, type: Boolean, default: true
  field :tool_function_ids, type: Array, default: []

  encrypted_field :credentials_payload

  validates :tool_id, :organization_id, presence: true

  index({ organization_id: 1, tool_id: 1 }, { unique: true })

  scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }

  def self.scoped(organization_id, id)
    for_organization(organization_id).where(id: id).take
  end

  def credentials
    payload = credentials_payload
    payload.present? ? JSON.parse(payload) : {}
  end

  def credentials=(hash)
    self.credentials_payload = hash.presence&.to_json
  end

  def credentials?
    credentials_payload_ciphertext.present?
  end

  def tool
    @tool ||= Tool.where(id: tool_id).take
  end

  def tool_functions
    ToolFunction::MiniRacer.for_organization(organization_id).where(:_id.in => tool_function_ids)
  end
end

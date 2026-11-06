class ChatTag
  include Mongoid::Document
  include Mongoid::Timestamps

  field :name, type: String
  field :description, type: String
  field :color, type: String
  field :organization_id, type: String

  # Cor de etiqueta criada sem escolha da pessoa (fluxo, importação).
  DEFAULT_COLOR = "#f1c40f".freeze

  # Etiquetas aplicadas automaticamente pelo sistema a partir de eventos de domínio
  # (Pipelines e Agenda). Os nomes já estão na forma final de `parameterize.dasherize`,
  # então casam com o que o before_save grava.
  SYSTEM_TAGS = {
    won: { name: "ganho", color: "#2ecc71", description: "Ganho" },
    lost: { name: "perdido", color: "#e74c3c", description: "Perdido" },
    show: { name: "compareceu", color: "#2ecc71", description: "Compareceu" },
    no_show: { name: "nao-compareceu", color: "#e74c3c", description: "Não compareceu" },
    # Conversa aberta pela Agenda para avisar um profissional, e não um lead.
    # Fora de SYSTEM_TAG_GROUPS: não exclui nenhuma outra etiqueta, só marca a
    # origem para o atendimento saber que aquilo não é um cliente.
    professional: { name: "profissional", color: "#20cc95", description: "Profissional" }
  }.freeze

  # Grupos mutuamente exclusivos: no máximo uma tag de cada grupo por conversa.
  SYSTEM_TAG_GROUPS = {
    deal: %i[won lost],
    attendance: %i[show no_show]
  }.freeze

  index({ organization_id: 1, name: 1 })

  before_destroy :detach_from_chats

  before_save :parameterize_name

  validates :name, presence: true
  validates :color, presence: true
  validates :organization_id, presence: true

  # Busca (ou cria) a etiqueta de sistema `key` na organização. Idempotente: uma tag
  # manual de mesmo nome já existente é reusada, sem duplicar e sem sobrescrever a cor
  # escolhida pela pessoa.
  def self.system_tag!(key, organization_id)
    spec = SYSTEM_TAGS.fetch(key)

    find_or_create_by(name: spec[:name], organization_id: organization_id.to_s) do |tag|
      tag.color = spec[:color]
      tag.description = spec[:description]
    end
  end

  def self.system_tag_names(keys)
    Array(keys).map { |key| SYSTEM_TAGS.fetch(key)[:name] }
  end

  # As conversas com esta etiqueta. A lista mora em `Chat#chat_tag_ids`.
  def chats
    Chat.where(organization_id: organization_id, chat_tag_ids: id)
  end

  private

  def parameterize_name
    self.name = name.parameterize.dasherize
  end

  # Remove o próprio id de `chat_tag_ids` em TODAS as conversas em que estiver: um
  # update_all + $pull, um round-trip só, sem carregar cada conversa em memória.
  def detach_from_chats
    chats.update_all("$pull" => { chat_tag_ids: id })
  end
end

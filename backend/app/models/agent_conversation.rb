# Uma conversa de criação: a pessoa descreve o que quer, o agente entrega a
# peça. A conversa existe porque o ajuste depende do fio ("agora deixa o fundo
# mais escuro" só faz sentido depois de "post da promoção de quarta").
#
# É andaime, não obra: some depois de #{RETENTION.inspect} sem uso. As peças
# ficam — `pieces.agent_turn_id` vira nulo e nada se perde.
class AgentConversation < ApplicationRecord
  RETENTION = 30.days
  # Um título é para achar a conversa na lista, não para descrever o pedido.
  TITLE_LIMIT = 80

  belongs_to :organization
  belongs_to :brand_core
  belongs_to :account, optional: true

  has_many :turns, -> { order(:created_at) },
    class_name: "AgentTurn", foreign_key: :agent_conversation_id,
    inverse_of: :conversation, dependent: :destroy

  validates :title, presence: true, length: { maximum: 120 }

  # `last_turn_at` só existe depois do primeiro turno; até lá vale a criação.
  scope :recent_first, -> { order(Arel.sql("COALESCE(last_turn_at, created_at) DESC")) }
  scope :stale, -> { where(last_turn_at: ...RETENTION.ago) }

  # O título sai da primeira frase do pedido: é assim que a pessoa reconhece a
  # conversa numa lista, sem ter que nomear nada.
  def self.title_from(prompt)
    title = prompt.to_s.squish
    return I18n.t("agent.untitled") if title.blank?

    title.length > TITLE_LIMIT ? "#{title[0, TITLE_LIMIT - 1].rstrip}…" : title
  end

  # Um turno pensando de cada vez: a pessoa não deve conseguir empilhar
  # chamadas ao modelo clicando duas vezes, e o custo é real.
  def busy?
    turns.thinking.exists?
  end

  def touch_turn!
    update!(last_turn_at: Time.current)
  end
end

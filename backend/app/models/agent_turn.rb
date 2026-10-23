# Um turno da conversa: um pedido da pessoa e uma chamada ao modelo.
#
# Guarda o que foi pedido, o que o agente decidiu (`plan`, já validado contra
# os manifestos) e **o que custou** — tokens e dólares. É dessa soma que sai o
# teto de OPEX e, amanhã, o limite por plano; por isso o custo mora aqui, e
# não num log.
class AgentTurn < ApplicationRecord
  # `create` é o pedido livre (2–3 variações); `adjust` é o ajuste em
  # linguagem natural sobre uma peça (1 variação); `vary` pede mais
  # composições da mesma ideia.
  #
  # No onboarding, cada fala da pessoa é um turno: `answer` é a resposta
  # escrita, `suggest` é o "cria pra mim", `choose` é o clique numa das
  # propostas e `logo` é o arquivo enviado. O que o agente responde vai em
  # `plan["reply"]`, como **códigos** — a tela traduz. `back` é o "← voltar":
  # não passa pelo modelo nem pela fila, só deixa no fio a pergunta reaberta.
  CREATION_KINDS = %w[create adjust vary].freeze
  ONBOARDING_KINDS = %w[answer suggest choose logo].freeze
  KINDS = (CREATION_KINDS + ONBOARDING_KINDS + %w[back]).freeze
  STATUSES = %w[thinking answered question failed].freeze

  belongs_to :conversation, class_name: "AgentConversation",
    foreign_key: :agent_conversation_id, inverse_of: :turns
  belongs_to :organization
  belongs_to :account, optional: true

  # A peça sobrevive à faxina da conversa: por isso `nullify`, nunca `destroy`.
  has_many :pieces, foreign_key: :agent_turn_id, inverse_of: :agent_turn, dependent: :nullify

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  # `vary` não tem pedido escrito: a pessoa clicou "gerar variações" sobre uma
  # peça. A tela desenha esse turno pelo `kind`, não pelo texto. No
  # onboarding, só a resposta escrita tem texto.
  validates :prompt, presence: true, if: -> { kind.in?(%w[create adjust answer]) }
  validates :prompt, length: { maximum: 2_000 }

  scope :thinking, -> { where(status: "thinking") }
  scope :chronological, -> { order(:created_at) }

  def thinking? = status == "thinking"
  def answered? = status == "answered"
  def question? = status == "question"
  def failed? = status == "failed"

  def variations
    Array(plan["variations"])
  end

  def reply
    Array(plan["reply"])
  end

  # Quanto a organização gastou de verdade no período — a base do teto mensal.
  def self.cost_micro_usd_since(organization, since)
    where(organization: organization).where(created_at: since..).sum(:cost_micro_usd)
  end
end

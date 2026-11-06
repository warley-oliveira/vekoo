# Mensagem rápida: texto pronto que a pessoa chama no chat pelo atalho (`trigger`).
class QuickReply < ApplicationRecord
  belongs_to :organization

  before_validation :normalize_trigger

  validates :name, :trigger, :content, presence: true
  # Dois textos no mesmo atalho: a tela não teria como saber qual inserir.
  validates :trigger, uniqueness: { scope: :organization_id }

  private

  # Antes da validação: atalho que vira vazio (`!!!`) é inválido, e não um atalho em branco.
  def normalize_trigger
    self.trigger = trigger.to_s.parameterize if trigger.present?
  end
end

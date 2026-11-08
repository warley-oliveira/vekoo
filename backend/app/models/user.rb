# A pessoa: identidade e login. Vale em todas as organizações dela; o que muda de uma para
# outra (papel, grupo, departamentos, revogação) mora no vínculo, a `Account`.
#
# `master` é o suporte do Vekoo: entra em qualquer organização com todas as permissões. Só liga
# por tarefa (`bin/rails support:grant EMAIL`) ou console. Nenhum controlador e nenhum
# parâmetro permitido escrevem nele.
class User < ApplicationRecord
  # Igual ao que a tela valida (zod) — o mesmo mínimo dos dois lados.
  MINIMUM_PASSWORD_LENGTH = 8
  EMAIL_FORMAT = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

  has_many :accounts, dependent: :destroy
  has_many :organizations, through: :accounts
  has_many :sessions, dependent: :destroy
  has_many :password_resets, dependent: :destroy
  has_many :push_devices, dependent: :destroy
  has_many :support_accesses, dependent: :delete_all

  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_fill: [ 256, 256 ], format: :jpg, saver: { quality: 85 }
  end

  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, with: ->(name) { name.squish }
  normalizes :phone, with: ->(phone) { phone.strip.presence }
  normalizes :locale, with: ->(locale) { locale.strip.presence }

  validates :name, presence: true, length: { minimum: 2, maximum: 60 }
  validates :email, presence: true, format: { with: EMAIL_FORMAT }, uniqueness: true
  validates :password, length: { minimum: MINIMUM_PASSWORD_LENGTH }, allow_nil: true
  validates :phone, length: { maximum: 30 }, allow_nil: true
  validates :locale, inclusion: { in: ->(_) { I18n.available_locales.map(&:to_s) } }, allow_nil: true

  after_update_commit :drop_support_realtime, if: -> { saved_change_to_master? && !master? }

  def self.find_by_login(email)
    find_by(email: email.to_s.strip.downcase)
  end

  # Os vínculos que a pessoa usa: os de suporte não entram, nem os revogados.
  def memberships
    accounts.where(support: false, revoked_at: nil)
  end

  # Tinha organização e perdeu o acesso a todas. Quem nunca teve (vínculo removido) entra e
  # cria a sua; quem foi revogado ouve o motivo, como antes da multi-organização.
  def locked_out?
    return false if master?

    !memberships.exists? && accounts.where(support: false).where.not(revoked_at: nil).exists?
  end

  # Derruba as sessões abertas. Com `except`, poupa a sessão de quem está pedindo. O WebSocket é
  # identificado pelo vínculo: cai o de todos os vínculos, e quem tem token que ainda vale volta.
  def end_sessions!(except: nil)
    scope = except ? sessions.where.not(id: except.id) : sessions
    scope.destroy_all
    accounts.each { |account| account.send(:disconnect_realtime, reconnect: except.present?) }
  end

  def reconnect_realtime
    accounts.each(&:reconnect_realtime)
  end

  private

  # Deixou de ser suporte: as abas abertas como suporte perdem o acesso na hora.
  def drop_support_realtime
    accounts.where(support: true).each { |account| account.send(:disconnect_realtime) }
  end
end

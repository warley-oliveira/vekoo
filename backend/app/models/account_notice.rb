# Aviso para uma pessoa: "novo agendamento", "conversa atribuída a você". Diferente do
# `Notification` (chave de tradução, da organização inteira), este carrega o texto
# pronto, porque nasce de um evento com dados: quem criou já sabe o que dizer.
#
# Criar um aviso transmite em `NotificationsChannel` e dispara push: é por aqui, e não
# chamando os dois à mão, que os domínios avisam alguém.
class AccountNotice
  include Mongoid::Document
  include Mongoid::Timestamps

  CATEGORIES = %w[chat calendar system general].freeze

  field :account_id, type: String
  field :organization_id, type: String
  field :title, type: String
  field :description, type: String
  field :url, type: String
  field :category, type: String
  field :actions, type: Array, default: []
  field :read_at, type: Time
  field :archived_at, type: Time

  validates :account_id, presence: true
  validates :organization_id, presence: true
  validates :title, presence: true, length: { maximum: 255 }
  validates :description, presence: true, length: { maximum: 1000 }
  validates :category, inclusion: { in: CATEGORIES }

  # `bin/rails db:mongoid:create_indexes`. Toda leitura parte da pessoa + organização, e
  # o `created_at` por último serve a ordenação da lista sem varrer os documentos.
  index({ account_id: 1, organization_id: 1, created_at: -1 }, background: true)
  index({ account_id: 1, organization_id: 1, category: 1, created_at: -1 }, background: true)
  index({ organization_id: 1, created_at: -1 }, background: true)

  scope :for_account, ->(account) { where(account_id: account.id, organization_id: account.organization_id) }
  # Sem o `default_scope` da origem: arquivado tem aba própria, e cada consulta deixa
  # claro o que está pedindo.
  scope :visible, -> { where(archived_at: nil) }
  scope :archived, -> { ne(archived_at: nil) }
  scope :unread, -> { where(read_at: nil) }
  # Não pode se chamar `read`: `Criteria#read` já existe (preferência de leitura).
  scope :already_read, -> { ne(read_at: nil) }
  scope :by_category, ->(category) { where(category: category) }
  scope :recent, -> { desc(:created_at) }

  after_create :notify_account

  def read?
    read_at.present?
  end

  def unread?
    !read?
  end

  def archived?
    archived_at.present?
  end

  # A data que a lista unificada usa para ordenar, a mesma do `Notification`.
  def notified_at
    created_at
  end

  # Idempotente: a data que importa é a da primeira leitura.
  def mark_as_read!
    update!(read_at: Time.current) unless read?
  end

  def mark_as_unread!
    update!(read_at: nil)
  end

  def archive!
    update!(archived_at: Time.current) unless archived?
  end

  # Tirar da lista, o mesmo gesto do `Notification#dismiss!`. Aqui é arquivar: o aviso
  # continua na aba de arquivados.
  def dismiss!
    archive!
  end

  private

  # Um canal fora do ar não pode impedir o outro, nem a gravação do aviso.
  def notify_account
    broadcast_to_account
    push_to_devices
  end

  def broadcast_to_account
    NotificationsChannel.broadcast_notice(self)
  rescue StandardError => e
    Rails.logger.error("[AccountNotice] falha ao transmitir #{id}: #{e.message}")
  end

  def push_to_devices
    account = Account.find_by(id: account_id)
    return unless account

    Push::Delivery.send_notification(
      account,
      title,
      description,
      url: url,
      tag: "notice-#{id}",
      actions: actions,
      data: { noticeId: id.to_s, category: category }
    )
  rescue StandardError => e
    Rails.logger.error("[AccountNotice] falha ao enfileirar o push de #{id}: #{e.message}")
  end
end

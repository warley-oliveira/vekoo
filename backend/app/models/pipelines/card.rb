module Pipelines
  class Card < ApplicationRecord
    include Pipelines::OrderedList
    include Pipelines::Trackable
    include Pipelines::Broadcastable

    PRIORITIES = %w[low medium high urgent].freeze
    MAX_TAGS = 50
    MAX_TAG_LENGTH = 100
    # `custom_field_values` e `description_json` vêm de tela, de script e de fluxo. Sem teto, um
    # script em laço transformaria uma linha numa coluna TOAST de megabytes, regravada a cada edição.
    MAX_CUSTOM_VALUES_BYTES = 64.kilobytes
    MAX_DESCRIPTION_JSON_BYTES = 256.kilobytes
    MAX_DEAL_VALUE = 10**10 # numeric(12, 2)

    belongs_to :organization
    belongs_to :stage, class_name: "Pipelines::Stage", inverse_of: :cards
    belongs_to :assigned_to, class_name: "Account", optional: true
    belongs_to :created_by, class_name: "Account", optional: true

    has_many :comments, class_name: "Pipelines::Comment", foreign_key: :card_id, inverse_of: :card, dependent: :destroy
    has_many :watchers, class_name: "Pipelines::CardWatcher", foreign_key: :card_id, inverse_of: :card, dependent: :destroy
    has_many :watcher_accounts, through: :watchers, source: :account
    has_many :attachments, class_name: "Pipelines::CardAttachment", foreign_key: :card_id, inverse_of: :card,
      dependent: :destroy
    has_many :card_labels, class_name: "Pipelines::CardLabel", foreign_key: :card_id, inverse_of: :card, dependent: :destroy
    has_many :labels, through: :card_labels, source: :label
    has_many :checklists, class_name: "Pipelines::Checklist", foreign_key: :card_id, inverse_of: :card, dependent: :destroy
    has_many :stage_checks, class_name: "Pipelines::CardStageCheck", foreign_key: :card_id, inverse_of: :card,
      dependent: :destroy
    has_many :activities, class_name: "Pipelines::CardActivity", foreign_key: :card_id, inverse_of: :card,
      dependent: :destroy
    has_many :trigger_executions, class_name: "Pipelines::TriggerExecution", foreign_key: :card_id, inverse_of: :card,
      dependent: :delete_all

    before_validation :inherit_organization, on: :create

    ordered_within :stage_id

    validates :title, presence: true, length: { maximum: 500 }
    validates :priority, inclusion: { in: PRIORITIES }, allow_nil: true
    validates :deal_probability, numericality: { only_integer: true, in: 0..100 }, allow_nil: true
    validates :deal_value, numericality: { greater_than: -MAX_DEAL_VALUE, less_than: MAX_DEAL_VALUE }, allow_nil: true
    validate :stage_belongs_to_organization
    validate :assigned_to_belongs_to_organization, if: :assigned_to_id_changed?
    validate :tags_within_limit, if: :tags_changed?
    validate :custom_field_values_within_limit, if: :custom_field_values_changed?
    validate :description_json_within_limit, if: :description_json_changed?

    # — Scopes ————————————————————————————————
    scope :active, -> { where(archived: false) }
    scope :archived, -> { where(archived: true) }
    scope :by_priority, ->(priority) { where(priority: priority) }
    scope :by_assigned_to, ->(account_id) { where(assigned_to_id: account_id) }
    scope :by_tags, ->(tags) { where("pipeline_cards.tags && ARRAY[?]::varchar[]", Array(tags)) }
    scope :by_due_date_range, ->(from, to) { where(due_date: from..to) }
    scope :by_chat, ->(chat_id) { where(chat_id: chat_id) }
    scope :search_by_title, ->(query) { where("pipeline_cards.title ILIKE ?", "%#{sanitize_sql_like(query)}%") }
    scope :overdue, -> { where("pipeline_cards.due_date < ? AND pipeline_cards.completed_at IS NULL", Time.current) }
    scope :won, -> { where.not(won_at: nil) }
    scope :lost, -> { where.not(lost_at: nil) }
    scope :open_deals, -> { where(won_at: nil, lost_at: nil).where.not(deal_value: nil) }
    scope :closed_deals, -> { where("pipeline_cards.won_at IS NOT NULL OR pipeline_cards.lost_at IS NOT NULL") }
    scope :stale, ->(days) { where("pipeline_cards.updated_at < ?", days.days.ago) }

    # — Callbacks ————————————————————————————————
    before_save :sync_description_text, if: :will_save_change_to_description_json?
    before_save :stamp_stage_entered_at, if: :will_save_change_to_stage_id?
    after_save :capture_trigger_context
    after_save :capture_deal_tag_change
    after_commit :evaluate_triggers_after_commit, on: %i[create update]
    after_commit :sync_chat_deal_tags, on: %i[create update]

    # Quem mexe no card sem querer disparar gatilho: o próprio gatilho (senão um "mover card" ao
    # entrar na etapa rodaria para sempre), a semente e o script que nasceu de um gatilho.
    attr_accessor :suppress_trigger_evaluation
    # Ao arquivar por job: o motivo vai para a atividade, no lugar do `archived` comum.
    attr_accessor :auto_archive_reason

    # — Conversa (no Mongo) —————————————————————
    # Caminho de sistema: gatilho, job, etiqueta de ganho e perdido. Em nome de uma pessoa, a consulta
    # é outra: `Chat.visible_to(account)`, ver `ChatSummary`.
    def chat
      return nil if chat_id.blank?
      return @chat if @chat&.id.to_s == chat_id

      @chat = Chat.scoped(organization_id, chat_id)
    end

    def board
      stage&.board
    end

    # — Arquivar e fechar ——————————————————————
    def archive!
      update!(archived: true)
    end

    def complete!
      update!(completed_at: Time.current)
    end

    def mark_won!
      attributes = { won_at: Time.current, lost_at: nil, lost_reason: nil, completed_at: Time.current }
      attributes[:archived] = true if board&.immediate_deal_archive?
      update!(attributes)
    end

    def mark_lost!(reason = nil)
      attributes = { lost_at: Time.current, won_at: nil, lost_reason: reason, completed_at: Time.current }
      attributes[:archived] = true if board&.immediate_deal_archive?
      update!(attributes)
    end

    def reopen_deal!
      update!(won_at: nil, lost_at: nil, lost_reason: nil, completed_at: nil, archived: false)
    end

    def rotting?
      return false if won_at.present? || lost_at.present?

      days = board&.deal_rotting_days
      return false unless days&.positive?

      stage_entered_at < days.days.ago
    end

    def checklist_progress
      items = ChecklistItem.unscoped.joins(:checklist).where(pipeline_checklists: { card_id: id })
      { completed: items.where(completed: true).count, total: items.count }
    end

    # — Campos personalizados ———————————————————
    def custom_field_value(key)
      custom_field_values[key.to_s]
    end

    def set_custom_field_value(key, value)
      self.custom_field_values = custom_field_values.merge(key.to_s => value)
    end

    # Troca as etiquetas do card, gravando a atividade de cada uma. Só aceita da mesma organização.
    def sync_labels!(ids)
      wanted = organization.pipeline_labels.where(id: Array(ids).select { |id| Pipelines.uuid?(id) }).pluck(:id)
      current = card_labels.pluck(:label_id)

      card_labels.where(label_id: current - wanted).destroy_all
      (wanted - current).each { |label_id| card_labels.create!(label_id: label_id) }
      labels.reset
    end

    private

    def inherit_organization
      self.organization_id ||= stage&.board&.organization_id
    end

    # Aqui, e não em quem move: move o controlador, o gatilho, o script e o fluxo. Na origem, só a tela
    # gravava, e o card movido por gatilho parecia parado na etapa antiga.
    def stamp_stage_entered_at
      self.stage_entered_at = Time.current unless will_save_change_to_stage_entered_at?
    end

    # Etapa, responsável e campos: o id que chega da tela, de script ou de gatilho nunca é confiável.
    def stage_belongs_to_organization
      return if stage.nil? || organization_id.nil?

      errors.add(:stage_id, :invalid) if stage.board&.organization_id != organization_id
    end

    def assigned_to_belongs_to_organization
      return if assigned_to_id.blank?
      return if Pipelines.uuid?(assigned_to_id) && Account.exists?(id: assigned_to_id, organization_id: organization_id)

      errors.add(:assigned_to_id, :invalid)
    end

    def tags_within_limit
      return errors.add(:tags, :too_many, count: MAX_TAGS) if Array(tags).size > MAX_TAGS

      errors.add(:tags, :too_long, count: MAX_TAG_LENGTH) if Array(tags).any? { |tag| tag.to_s.length > MAX_TAG_LENGTH }
    end

    def custom_field_values_within_limit
      return errors.add(:custom_field_values, :invalid) unless custom_field_values.is_a?(Hash)

      errors.add(:custom_field_values, :too_large) if custom_field_values.to_json.bytesize > MAX_CUSTOM_VALUES_BYTES
    end

    def description_json_within_limit
      return if description_json.nil?

      errors.add(:description_json, :too_large) if description_json.to_json.bytesize > MAX_DESCRIPTION_JSON_BYTES
    end

    # O texto puro sai do JSON do editor, para a busca.
    def sync_description_text
      return if description_json.blank?

      self.description = extract_text_from_tiptap(description_json)
    end

    def extract_text_from_tiptap(node)
      return "" unless node.is_a?(Hash)

      text = node["text"].to_s
      children = Array(node["content"]).map { |child| extract_text_from_tiptap(child) }
      parts = [ text, *children ].reject(&:blank?)
      parts.join(node["type"] == "paragraph" ? "\n" : "")
    end

    # O que mudou é lido aqui, onde o dirty tracking ainda vale, e o gatilho é avaliado depois do
    # commit. Vale o evento mais significativo: criado > ganho/perdido/reaberto > movido > atualizado.
    #
    # Mudar só de posição não é "card atualizado": sem este corte, arrastar um card dentro da etapa
    # disparava os gatilhos de `card_updated`.
    NOT_AN_UPDATE = %w[position updated_at stage_entered_at sla_notified_at due_notified_at].freeze

    def capture_trigger_context
      return if suppress_trigger_evaluation

      if previously_new_record?
        @_trigger_event_context = { event_type: "card_created" }
      elsif saved_change_to_won_at? && won_at.present?
        @_trigger_event_context = { event_type: "deal_won" }
      elsif saved_change_to_lost_at? && lost_at.present?
        @_trigger_event_context = { event_type: "deal_lost" }
      elsif deal_reopened_now?
        @_trigger_event_context = { event_type: "deal_reopened" }
      elsif saved_change_to_stage_id?
        from_id, to_id = saved_change_to_stage_id
        @_trigger_event_context = { event_type: "card_moved", from_stage_id: from_id, to_stage_id: to_id }
      elsif (saved_changes.keys - NOT_AN_UPDATE).any? && @_trigger_event_context.blank?
        @_trigger_event_context = { event_type: "card_updated" }
      end
    end

    # Só um dos dois estava preenchido: exigir que os dois mudassem, como na origem, fazia o negócio
    # reaberto nunca virar evento nem atividade.
    def deal_reopened_now?
      (saved_change_to_won_at? || saved_change_to_lost_at?) && won_at.nil? && lost_at.nil?
    end

    # `||=`: um segundo save na mesma transação não apaga o que o primeiro viu.
    def capture_deal_tag_change
      @_deal_tag_changed ||= saved_change_to_won_at? || saved_change_to_lost_at?
    end

    # Espelha o desfecho do negócio como etiqueta na conversa. Depois do commit, para nunca marcar a
    # conversa de um negócio que acabou em rollback.
    def sync_chat_deal_tags
      changed = @_deal_tag_changed
      @_deal_tag_changed = nil
      return unless changed

      conversation = chat
      return if conversation.blank?

      keep = if won_at.present?
        :won
      elsif lost_at.present?
        :lost
      end

      conversation.sync_system_tags!(:deal, keep)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::Card#sync_chat_deal_tags] #{e.class}: #{e.message}")
    end

    # Depois do commit: o `TriggerJob` enfileirado sempre lê o que já está gravado.
    def evaluate_triggers_after_commit
      context = @_trigger_event_context
      @_trigger_event_context = nil
      return if suppress_trigger_evaluation || context.blank?

      current_board = board
      return unless current_board&.triggers&.active&.exists?

      TriggerEvaluator.call(self, current_board, context)
    rescue StandardError => e
      # A gravação do card já aconteceu: uma falha aqui não pode virar erro para quem salvou.
      Rails.logger.error("[Pipelines::Card#evaluate_triggers_after_commit] #{e.class}: #{e.message}")
    end
  end
end

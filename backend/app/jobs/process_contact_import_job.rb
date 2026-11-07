# Transforma as linhas de uma importação em conversas. Conversa que já existe (por qualquer forma do
# número) sobe na lista e recebe a atribuição, se veio; a nova nasce sem automação e fora do tempo
# real, em massa e sem passar pelos callbacks: uma planilha não pode virar uma tempestade de eventos
# nem milhares de ida e volta.
#
# Recebe o escopo junto com os ids.
class ProcessContactImportJob < ApplicationJob
  queue_as :default

  BATCH_SIZE = 100
  # Nasce com a data no passado para não encher o topo da lista de quem atende, como na origem.
  IMPORTED_AT_OFFSET = 2.days

  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  # @param contact_import_ids [Array<String>]
  def perform(contact_import_ids, organization_id)
    ContactImport.where(organization_id: organization_id, id: contact_import_ids).find_each do |contact_import|
      process(contact_import)
    end
  end

  private

  def process(contact_import)
    connector = contact_import.connector
    return contact_import.mark_failed! if connector.nil?

    contact_import.start_processing!

    # Sempre a próxima leva de pendentes: reprocessar depois de uma falha continua de onde parou.
    loop do
      rows = contact_import.contact_import_rows.pending.limit(BATCH_SIZE).to_a
      break if rows.empty?

      process_rows(rows, connector, contact_import.organization)
    end

    contact_import.update!(
      status: "completed",
      completed_at: Time.current,
      imported_contacts_count: contact_import.contact_import_rows.completed.count,
      errors_count: contact_import.total_contacts - contact_import.contact_import_rows.completed.count
    )
  rescue StandardError
    contact_import.mark_failed!
    raise
  end

  def process_rows(rows, connector, organization)
    assignees = lookup(Chats::Assignment.assignable_accounts(organization).joins(:user), name: "users.name", id: "accounts.id")
    teams = lookup(organization.teams)

    invalid, valid = rows.partition { |row| BrPhoneVariants.digits_of(row.phone).blank? }
    invalid.each { |row| row.mark_as_failed!(I18n.t("errors.invalid_phone")) }
    return if valid.empty?

    existing = existing_chats(valid, connector)
    to_create = {}
    updates = []

    valid.each do |row|
      digits = BrPhoneVariants.digits_of(row.phone)
      assignment = assignment_for(row, assignees, teams)
      chat = BrPhoneVariants.call(digits).filter_map { |variant| existing[variant] }.first

      if chat
        updates << update_operation(chat, assignment)
      else
        # A mesma pessoa duas vezes na planilha vira uma conversa só.
        to_create[digits] ||= new_chat_document(row, digits, connector, assignment)
      end
    end

    Chat.collection.bulk_write(updates) if updates.any?
    Chat.collection.insert_many(to_create.values) if to_create.any?

    ContactImportRow.where(id: valid.map(&:id)).update_all(status: "completed", processed_at: Time.current, updated_at: Time.current)
  end

  def lookup(scope, name: :name, id: :id)
    scope.pluck(name, id).to_h { |value, key| [ value.to_s.strip.downcase, key.to_s ] }
  end

  # Nome que não acha ninguém é ignorado: a conversa entra, sem atribuição.
  def assignment_for(row, assignees, teams)
    data = row.additional_data.to_h
    result = {}

    assignee = assignees[data["assigned_user_name"].to_s.strip.downcase]
    result[:assigned_account_id] = assignee if assignee

    team = teams[data["department_name"].to_s.strip.downcase]
    result[:team_id] = team if team

    result
  end

  # Pelo prefixo do índice { connector_id, external_id }, com todas as formas de cada número.
  def existing_chats(rows, connector)
    variants = rows.flat_map { |row| BrPhoneVariants.call(row.phone) }.uniq

    Chat.where(connector_id: connector.id, :external_id.in => variants)
        .only(:_id, :external_id)
        .index_by(&:external_id)
  end

  def update_operation(chat, assignment)
    {
      update_one: {
        filter: { _id: chat.id },
        update: { "$set" => { last_message_at: Time.current, updated_at: Time.current }.merge(assignment) }
      }
    }
  end

  # `Chat.new` para trazer os valores padrão de todos os campos: o documento entra por fora do
  # Mongoid, e campo ausente não casa em filtro nenhum (na origem, `status` ficava de fora, e a
  # conversa importada não aparecia em "abertas").
  def new_chat_document(row, digits, connector, assignment)
    imported_at = Time.current - IMPORTED_AT_OFFSET

    Chat.new(
      organization_id: connector.organization_id,
      connector_id: connector.id,
      external_id: digits,
      user_name: row.name,
      audience_type: "import_feature",
      automation_enabled: false,
      status: "open",
      last_message_at: imported_at,
      created_at: imported_at,
      updated_at: imported_at,
      **assignment
    ).as_document.to_h
  end
end

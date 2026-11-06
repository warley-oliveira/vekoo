# Importação de contatos para um canal (origem: `import_contacts*` em integrations_controller). As
# linhas viram conversas em ProcessContactImportJob, em segundo plano.
#
# A tela da origem manda listas grandes em lotes de 1000, um POST por lote; o arquivo CSV é dividido
# aqui. Quem pode: quem cuida de contatos e quem configura os canais, que é onde a tela da origem
# oferecia isso.
class ContactImportsController < PlatformController
  include InboxAccess

  BATCH_SIZE = 1_000

  require_any_permission :contacts, :core_settings

  before_action :set_connector, only: %i[create create_from_file]

  def index
    records, meta = paginate(current_organization.contact_imports.recent_first)

    render json: { contactImports: ContactImportSerializer.many(records), meta: meta }
  end

  def show
    render json: { contactImport: ContactImportSerializer.one(current_organization.contact_imports.find(params[:id])) }
  end

  # POST /contact-imports
  # { connectorId, contacts: [{ externalId, userName, assignedUserName?, departmentName? }],
  #   includeCountryCode?, batchIndex?, totalBatches?, fileName? }
  def create
    contacts = contacts_param
    return render_error(status: :unprocessable_content, code: "noContactsProvided", field: "contacts") if contacts.empty?
    return render_error(status: :unprocessable_content, code: "tooManyContacts", field: "contacts") if contacts.size > BATCH_SIZE

    # O nome do arquivo vem da tela, que leu a planilha: é por ele que a pessoa reconhece a
    # importação no histórico.
    result = creator(contacts, batch_index: params[:batch_index], total_batches: params[:total_batches], file_name: params[:file_name].to_s.first(255).presence)
    return render_no_valid_contacts if result.contact_import.nil?

    ProcessContactImportJob.perform_later([ result.contact_import.id ], current_organization.id)

    render json: {
      contactImport: ContactImportSerializer.one(result.contact_import),
      importedCount: result.imported_count,
      totalContacts: result.total_contacts
    }, status: :created
  end

  # POST /contact-imports/file: multipart com `file`, `connectorId` e `includeCountryCode`.
  def create_from_file
    file = params[:file]
    return render_error(status: :unprocessable_content, code: "fileRequired", field: "file") unless file.respond_to?(:read)
    return render_error(status: :unprocessable_content, code: "invalidCsv", field: "file") unless csv_file?(file)

    contacts = ContactImports::CsvParser.parse(file.read)
    return render_no_valid_contacts if contacts.empty?

    results = contacts.each_slice(BATCH_SIZE).with_index.map do |slice, index|
      creator(slice, batch_index: index, total_batches: (contacts.size.to_f / BATCH_SIZE).ceil, file_name: file.original_filename)
    end
    imports = results.filter_map(&:contact_import)
    return render_no_valid_contacts if imports.empty?

    ProcessContactImportJob.perform_later(imports.map(&:id), current_organization.id)

    render json: {
      contactImports: ContactImportSerializer.many(imports),
      importedCount: results.sum(&:imported_count),
      totalContacts: contacts.size,
      totalBatches: imports.size,
      fileName: file.original_filename
    }, status: :created
  rescue CSV::MalformedCSVError => e
    Rails.logger.warn("[ContactImportsController] CSV malformado: #{e.message}")
    render_error(status: :unprocessable_content, code: "malformedCsv", field: "file")
  end

  private

  def set_connector
    @connector = Connector::Base.scoped(current_organization.id, params[:connector_id])
    return render_error(status: :unprocessable_content, code: "invalidConnector", field: "connectorId") unless @connector

    # Planilha traz telefone: num canal que não começa conversa por número, viraria conversa morta.
    return if ChatsController::PHONE_CONNECTOR_TYPES.include?(@connector._type)

    render_error(status: :unprocessable_content, code: "connectorTypeMismatch", field: "connectorId")
  end

  def contacts_param
    Array(params[:contacts]).filter_map do |contact|
      contact = contact.to_unsafe_h if contact.respond_to?(:to_unsafe_h)
      contact if contact.is_a?(Hash)
    end
  end

  def creator(contacts, batch_index: nil, total_batches: nil, file_name: nil)
    ContactImports::Creator.call(
      organization: current_organization,
      account: current_account,
      connector: @connector,
      contacts: contacts,
      include_country_code: ActiveModel::Type::Boolean.new.cast(params[:include_country_code]) || false,
      batch_index: batch_index,
      total_batches: total_batches,
      file_name: file_name
    )
  end

  def csv_file?(file)
    file.content_type == "text/csv" || file.original_filename.to_s.downcase.end_with?(".csv")
  end

  def render_no_valid_contacts
    render_error(status: :unprocessable_content, code: "noValidContacts", field: "contacts")
  end
end

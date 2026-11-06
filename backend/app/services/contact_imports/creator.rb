module ContactImports
  # Grava uma leva de contatos para importar: um `ContactImport` com as linhas, que
  # ProcessContactImportJob transforma em conversas. Sem chamar provedor.
  class Creator
    # Quem não tem telefone e nome fica de fora, sem derrubar o resto. Vem da origem.
    Result = Struct.new(:contact_import, :imported_count, :total_contacts, keyword_init: true)

    def self.call(**arguments)
      new(**arguments).call
    end

    # @param contacts [Array<Hash>] { external_id, user_name, assigned_user_name?, department_name? }
    def initialize(organization:, account:, connector:, contacts:, include_country_code: false, batch_index: nil, total_batches: nil, file_name: nil)
      @organization = organization
      @account = account
      @connector = connector
      @contacts = contacts
      @include_country_code = include_country_code
      @batch_index = batch_index
      @total_batches = total_batches
      @file_name = file_name
    end

    # @return [Result] `contact_import` nil quando nenhum contato presta
    def call
      rows = contacts.filter_map { |contact| row_from(contact.to_h.with_indifferent_access) }
      return Result.new(contact_import: nil, imported_count: 0, total_contacts: contacts.size) if rows.empty?

      contact_import = organization.contact_imports.create!(
        account: account,
        connector_id: connector.id.to_s,
        file_name: file_name,
        total_contacts: contacts.size,
        imported_contacts_count: rows.size,
        errors_count: contacts.size - rows.size,
        include_country_code: include_country_code,
        batch_index: batch_index,
        total_batches: total_batches
      )

      now = Time.current
      ContactImportRow.insert_all!(rows.map { |row| row.merge(contact_import_id: contact_import.id, created_at: now, updated_at: now) })

      Result.new(contact_import: contact_import, imported_count: rows.size, total_contacts: contacts.size)
    end

    private

    attr_reader :organization, :account, :connector, :contacts, :include_country_code, :batch_index, :total_batches, :file_name

    def row_from(contact)
      phone = contact[:external_id].to_s.strip
      name = contact[:user_name].to_s.strip
      return nil if phone.blank? || name.blank?

      phone = "55#{phone}" if include_country_code && !phone.start_with?("55")

      { name: name, phone: phone, additional_data: contact, status: "pending" }
    end
  end
end

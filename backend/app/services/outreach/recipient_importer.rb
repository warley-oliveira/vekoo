module Outreach
  # Grava destinatários em bloco, sem repetir pessoa na campanha: a mesma pessoa pode vir com e sem o
  # 9º dígito (`5531971810932` e `553171810932`), e seria a mesma conta de WhatsApp recebendo duas vezes.
  class RecipientImporter
    BULK_SIZE = 500
    # Bem acima do que uma busca de estabelecimentos traz. Sem teto, um documento grande demais para o
    # Mongo derrubaria o bloco inteiro de 500 linhas.
    MAX_VARIABLES_BYTES = 16.kilobytes
    DUPLICATE_KEY = 11_000

    Result = Struct.new(:imported, :skipped, :invalid, keyword_init: true)

    def initialize(campaign)
      @campaign = campaign
      @known = campaign.recipients.pluck(:phone_key).to_set
      @imported = 0
      @skipped = 0
      @invalid = 0
    end

    # @param rows [Enumerable<Hash>] com :phone, :name, :contact_id e :custom_variables
    # @return [Result]
    def import(rows)
      rows.each_slice(BULK_SIZE) { |slice| insert(slice.filter_map { |row| document_for(row) }) }

      campaign.inc(recipients_count: imported) if imported.positive?
      Result.new(imported: imported, skipped: skipped, invalid: invalid)
    end

    private

    attr_reader :campaign, :known, :imported, :skipped, :invalid

    def document_for(row)
      phone = BrPhoneVariants.digits_of(row[:phone])
      if phone.blank?
        @invalid += 1
        return nil
      end

      key = Recipient.key_for(phone)
      unless known.add?(key)
        @skipped += 1
        return nil
      end

      build_document(row, phone, key)
    end

    def build_document(row, phone, key)
      now = Time.current

      {
        _id: BSON::ObjectId.new,
        campaign_id: campaign.id,
        contact_id: row[:contact_id],
        phone: phone,
        phone_key: key,
        name: row[:name].to_s.strip.presence || phone,
        custom_variables: variables_of(row),
        status_cd: "pending",
        created_at: now,
        updated_at: now
      }
    end

    def variables_of(row)
      variables = row[:custom_variables].presence || {}
      variables.to_json.bytesize > MAX_VARIABLES_BYTES ? {} : variables
    end

    # Sem ordem: uma duplicata (duas importações ao mesmo tempo) não pode impedir as outras linhas.
    def insert(docs)
      return if docs.empty?

      @imported += Recipient.collection.insert_many(docs, ordered: false).inserted_count
    rescue Mongo::Error::BulkWriteError => e
      result = e.result
      errors = Array(result["writeErrors"])
      raise unless errors.all? { |error| error["code"] == DUPLICATE_KEY }

      @imported += result["n_inserted"].to_i
      @skipped += errors.size
    end
  end
end

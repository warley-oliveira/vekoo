module Outreach
  # A conversa de um destinatário no canal: acha ou cria, e deixa pronta para a campanha (dados do
  # Apify, etiquetas, quem responde).
  class RecipientChat
    # Sem nada disto no destinatário, os dados não vieram de uma busca de estabelecimentos.
    ENRICHMENT_MARKERS = %w[place_id category_name maps_url].freeze
    ENRICHMENT_FIELDS = %w[
      address street city state postal_code website category_name categories total_score reviews_count
      image_url maps_url place_id latitude longitude instagram facebook opening_hours
    ].freeze

    # O provedor não respondeu à consulta do número: o problema é do canal, não do destinatário.
    class ChannelUnavailable < StandardError; end

    def initialize(recipient:, campaign:, connector:)
      @recipient = recipient
      @campaign = campaign
      @connector = connector
    end

    # Texto e mídia saem por `chat.phone_number`, então a conversa tem de carregar o número que existe
    # no WhatsApp. Quando o provedor confirma o número (Evolution), só vale a conversa com essa forma
    # exata: reaproveitar a variante com ou sem o 9 repetiria o envio para o número errado.
    #
    # @raise [WhatsappNumberNotFoundError] nenhuma forma do número existe, e nenhuma conversa é criada
    def resolved
      return prepare(locate) unless connector.try(:verifies_whatsapp_numbers?)

      number = resolve_number
      raise WhatsappNumberNotFoundError, "#{digits} não existe no WhatsApp" if number.nil?

      prepare(locate_exactly(number))
    end

    # Modelo: cada número da WABA tem a própria conversa com o contato.
    def for_sender(phone_number_id)
      sender = phone_number_id.to_i
      chat = locate(sender)
      # Conversa antiga, de antes de a conta ter vários números: passa a ser deste.
      chat.set(sender_phone_number_id: sender) if chat.sender_phone_number_id.blank?
      prepare(chat)
    end

    private

    attr_reader :recipient, :campaign, :connector

    def digits
      @digits ||= BrPhoneVariants.digits_of(recipient.phone)
    end

    def resolve_number
      connector.resolve_whatsapp_number(digits)
    rescue StandardError => e
      raise ChannelUnavailable, "#{e.class}: #{e.message}"
    end

    # A forma exata primeiro. Só depois vale a variante, que é o que o `Locator` procura.
    def locate(sender = nil)
      scope = Chat.where(connector_id: connector.id, :external_id.in => [ digits, "#{digits}#{BrPhoneVariants::JID_SUFFIX}" ])
      scope = scope.where(sender_phone_number_id: sender) if sender

      scope.order_by(last_message_at: :desc).first ||
        Chats::Locator.find_or_create(
          connector: connector,
          phone: digits,
          sender_phone_number_id: sender,
          attributes: creation_attributes
        )
    end

    # Com a mesma trava do `Locator` e a mesma chave, para um webhook do mesmo contato chegando junto
    # não abrir uma segunda conversa.
    def locate_exactly(number)
      forms = [ number, "#{number}#{BrPhoneVariants::JID_SUFFIX}" ]
      find = -> { Chat.where(connector_id: connector.id, :external_id.in => forms).order_by(last_message_at: :desc).first }

      Chats::Locator.create_once("#{connector.id}.#{number}.", find: find) do
        organization = connector.organization

        Chat.create!(
          {
            connector: connector,
            organization_id: connector.organization_id,
            external_id: number,
            automation_enabled: organization ? organization.default_automation_enabled : true,
            status: "open"
          }.merge(creation_attributes)
        )
      end
    end

    def creation_attributes
      attributes = { user_name: recipient.name }
      enrichment = enrichment_data
      attributes[:contact_storage] = enrichment if enrichment.present?
      # Escolher um fluxo na campanha é pedir que alguém responda: conversa nova já nasce com
      # automação. Conversa que já existe mantém o que a pessoa decidiu nela.
      attributes[:automation_enabled] = true if campaign.flow_id.present?
      attributes
    end

    def prepare(chat)
      merge_enrichment(chat)
      assign_tags(chat)
      chat.set(outreach_flow_id: campaign.flow_id) if campaign.flow_id.present? && chat.outreach_flow_id != campaign.flow_id
      chat
    end

    def enrichment_data
      variables = recipient.custom_variables
      return nil if variables.blank? || ENRICHMENT_MARKERS.none? { |marker| variables.key?(marker) }

      variables.slice(*ENRICHMENT_FIELDS).compact
    end

    def merge_enrichment(chat)
      enrichment = enrichment_data
      return if enrichment.blank?

      existing = chat.contact_storage || {}
      merged = existing.deep_merge(enrichment)
      chat.set(contact_storage: merged) if merged != existing
    end

    def assign_tags(chat)
      tag_ids = Array(campaign.chat_tag_ids).filter_map { |id| BSON::ObjectId.legal?(id) ? BSON::ObjectId.from_string(id.to_s) : nil }
      missing = tag_ids - Array(chat.chat_tag_ids)
      chat.add_to_set(chat_tag_ids: missing) if missing.any?
    end
  end
end

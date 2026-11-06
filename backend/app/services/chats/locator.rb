module Chats
  # Encontra ou cria a conversa de um número em um conector. É por aqui que toda a
  # plataforma chega numa conversa a partir de um telefone: a comparação no banco é
  # igualdade exata de String, e o mesmo número chega em formas diferentes:
  #
  #   * 9º dígito: a Meta devolve `553171810932`, a base guarda `5531971810932`;
  #   * sufixo: Z-API e Evolution podem guardar `...@s.whatsapp.net`.
  #
  # `BrPhoneVariants` gera as formas equivalentes e a busca cobre todas, sempre pelo
  # prefixo do índice `{connector_id: 1, external_id: 1}`.
  class Locator
    # Dois webhooks do mesmo contato novo chegando juntos (uma rajada de mensagens) não
    # podem abrir duas conversas: quem perde a trava espera a conversa do outro aparecer.
    CREATION_LOCK_TTL = 10.seconds
    CREATION_WAIT_ATTEMPTS = 20
    CREATION_WAIT_INTERVAL = 0.1

    # @param connector [Connector::Base]
    # @param phone [String] número em qualquer formato (com máscara, com JID)
    # @param sender_phone_number_id [Integer, String, nil] número de origem na WABA: cada
    #   número da conta tem a própria conversa com o contato
    # @return [Chat, nil]
    def self.find(connector:, phone:, sender_phone_number_id: nil)
      new(connector, phone, sender_phone_number_id).find
    end

    # @param attributes [Hash] usados só na criação (`user_name`, `automation_enabled`...)
    # @return [Chat]
    def self.find_or_create(connector:, phone:, sender_phone_number_id: nil, attributes: {})
      new(connector, phone, sender_phone_number_id).find_or_create(attributes)
    end

    def initialize(connector, phone, sender_phone_number_id = nil)
      @connector = connector
      @phone = phone
      @sender_phone_number_id = sender_phone_number_id.presence&.to_i
    end

    def find
      return nil if variants.empty?

      if sender_phone_number_id
        matching_sender = criteria.where(sender_phone_number_id: sender_phone_number_id)
        most_recent(matching_sender) || most_recent(criteria.where(sender_phone_number_id: nil))
      else
        most_recent(criteria)
      end
    end

    def find_or_create(attributes = {})
      find || create_guarded(attributes)
    end

    private

    attr_reader :connector, :phone, :sender_phone_number_id

    def variants
      @variants ||= BrPhoneVariants.call(phone)
    end

    def criteria
      Chat.where(connector_id: connector.id, :external_id.in => variants)
    end

    # Com as duas formas do número gravadas, vale a conversa em uso.
    def most_recent(scope)
      scope.order_by(last_message_at: :desc).first
    end

    def create_guarded(attributes)
      lock_key = "chats.creation.#{connector.id}.#{BrPhoneVariants.digits_of(phone)}.#{sender_phone_number_id}"

      if Rails.cache.write(lock_key, true, unless_exist: true, expires_in: CREATION_LOCK_TTL)
        begin
          find || create(attributes)
        ensure
          Rails.cache.delete(lock_key)
        end
      else
        wait_for_concurrent_creation || create(attributes)
      end
    end

    def wait_for_concurrent_creation
      CREATION_WAIT_ATTEMPTS.times do
        sleep(CREATION_WAIT_INTERVAL)
        found = find
        return found if found
      end
      nil
    end

    def create(attributes)
      organization = connector.organization

      Chat.create!(
        {
          connector: connector,
          organization_id: connector.organization_id,
          external_id: BrPhoneVariants.digits_of(phone),
          sender_phone_number_id: sender_phone_number_id,
          automation_enabled: organization ? organization.default_automation_enabled : true,
          status: "open"
        }.merge(attributes)
      )
    end
  end
end

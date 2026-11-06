module Outreach
  # Aplica no destinatário o status que o provedor informou da mensagem. Quem chama são os
  # processadores de webhook (`WabaStatusUpdateService`, `Inbound::EvolutionEvents`).
  #
  # A troca é atômica e só conta quem de fato trocou: `delivered` e `read` podem chegar juntos, em
  # dois jobs, e o contador não pode andar duas vezes.
  class RecipientStatus
    # Os dois vocabulários: o do histórico da mensagem e o do destinatário.
    RANK = { "pending" => 0, "server_ack" => 1, "sent" => 1, "delivery_ack" => 2, "delivered" => 2, "read" => 3 }.freeze
    # Só quem saiu do nosso lado tem o que avançar. `failed` é terminal.
    ADVANCEABLE = %w[sent delivered].freeze
    # Quem perde a corrida relê e decide de novo: `read` não pode se perder só porque `delivered`
    # chegou um instante antes.
    ATTEMPTS = 3

    # @param external_id [String] id da mensagem no provedor
    # @param status [String] server_ack, delivery_ack, read ou failed
    def self.apply(external_id, status, error_message: nil)
      new(external_id, status, error_message).call
    end

    def initialize(external_id, status, error_message)
      @external_id = external_id
      @status = status.to_s
      @error_message = error_message
    end

    def call
      return if external_id.blank?

      ATTEMPTS.times do
        # `take`: sem o sort implícito de `first`, usa só o índice esparso.
        recipient = Recipient.where(whatsapp_message_id: external_id).take
        return if recipient.nil?

        change = status == "failed" ? failure_of(recipient) : advance_of(recipient)
        return if change.nil?

        changed = swap(recipient, **change)
        return announce(changed) if changed
      end
    end

    private

    attr_reader :external_id, :status, :error_message

    # `sent_count` segue contando o que o provedor aceitou: só `failed_count` avança.
    def failure_of(recipient)
      return nil if recipient.status_failed?

      {
        attributes: {
          status_cd: "failed",
          error_code: SendRecipientService::WHATSAPP_ERROR,
          error_message: error_message&.truncate(Recipient::ERROR_MESSAGE_LIMIT)
        },
        counters: { failed_count: 1 }
      }
    end

    def advance_of(recipient)
      return nil unless ADVANCEABLE.include?(recipient.status_cd)
      return nil if RANK.fetch(status, 0) <= RANK.fetch(recipient.status_cd, 0)

      case status
      when "delivery_ack", "delivered"
        { attributes: { status_cd: "delivered", delivered_at: Time.current }, counters: { delivered_count: 1 } }
      when "read"
        read_change(recipient)
      end
    end

    # Pulando de enviado direto para lido, a entrega também precisa ser contada.
    def read_change(recipient)
      return { attributes: { status_cd: "read", read_at: Time.current }, counters: { read_count: 1 } } unless recipient.status_sent?

      {
        attributes: { status_cd: "read", delivered_at: Time.current, read_at: Time.current },
        counters: { delivered_count: 1, read_count: 1 }
      }
    end

    # @return [Recipient, nil] nil quando outro evento mudou primeiro
    def swap(recipient, attributes:, counters:)
      changed = Recipient.where(_id: recipient.id, status_cd: recipient.status_cd)
                         .find_one_and_update({ "$set" => attributes.merge(updated_at: Time.current) }, return_document: :after)
      Campaign.where(_id: recipient.campaign_id).inc(counters) if changed
      changed
    end

    def announce(recipient)
      campaign = recipient.campaign
      return unless campaign

      MonitorEvents.recipient(campaign, recipient)
      MonitorEvents.progress(campaign)
    end
  end
end

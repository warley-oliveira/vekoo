module Outreach
  # Por onde uma campanha pode enviar agora. Um canal é o que tem limite próprio: no modo texto, o
  # conector; no modo modelo, cada número da WABA.
  class Channels
    Channel = Struct.new(:connector, :phone_number_id, keyword_init: true) do
      def key
        "#{connector.id}:#{phone_number_id}"
      end
    end

    Result = Struct.new(:active, :disconnected, keyword_init: true)

    # @return [Result] `active` são os canais utilizáveis; `disconnected`, os conectores pulados
    def self.for(campaign)
      campaign.template_mode? ? template_channels(campaign) : text_channels(campaign)
    end

    def self.text_channels(campaign)
      connectors = campaign.connectors.to_a
      active, disconnected = connectors.partition(&:active?)

      Result.new(
        active: active.map { |connector| Channel.new(connector: connector, phone_number_id: nil) },
        disconnected: disconnected
      )
    end
    private_class_method :text_channels

    def self.template_channels(campaign)
      connector = campaign.waba_connector
      return Result.new(active: [], disconnected: [ connector ].compact) unless connector&.active?

      Result.new(
        active: campaign.normalized_phone_number_ids.map { |id| Channel.new(connector: connector, phone_number_id: id) },
        disconnected: []
      )
    end
    private_class_method :template_channels
  end
end

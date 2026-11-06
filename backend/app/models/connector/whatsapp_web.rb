class Connector::WhatsappWeb < Connector::Base
  field :instance_name, type: String
  index({ number_id: 1, organization_id: 1 })
  encrypted_field :instance_api_key
  field :number_id, type: String
  field :phone_number_pairing, type: String
  field :profile_picture_url, type: String
  field :profile_name, type: String
  field :base_url, type: String
  # Vazio: vale a chave global do servidor do provedor (ver #provider_api_key).
  encrypted_field :api_key

  field :provider_api, type: String, default: -> { ENV.fetch('WHATSAPP_WEB_DEFAULT_PROVIDER', 'evolution_api') }
  field :zapi_instance_id, type: String
  encrypted_field :zapi_token

  PREFIX_INSTANCE = 'IWA-'.freeze

  # Provider strategy modules. Each value must respond to the same surface
  # documented in `Providers::Base`. Adding a new provider = one module file
  # + one entry here.
  PROVIDERS = {
    'aiva_api' => Providers::AivaApi, # Providers::AivaApi,
    'zapi' => Providers::Zapi,
    'evolution_api' => Providers::EvolutionApi
  }.freeze

  # Sem isto, um provider desconhecido cairia no AIVA sem `base_url`, e a ativação sairia para
  # `http://:80` levando a chave no cabeçalho.
  validates :provider_api, inclusion: { in: PROVIDERS.keys }, allow_nil: true

  before_create do
    # When the caller (frontend) passes `provider_api` explicitly, the organization's
    # `zapi` feature flag must NOT silently overwrite it.
    self.provider_api = 'zapi' if provider_api.blank? && organization&.features.to_h['zapi']
    self.base_url = self.class.default_base_url(provider_api) if base_url.blank?
  end

  before_update do
    if status_cd_changed? && active? && !zapi_provider?
      tolerate_profile_failure ? refresh_profile : fetch_current_information
      migrate_chats
    end
  end

  # Busca o perfil sem deixar a falha subir. Ver `tolerate_profile_failure`.
  def refresh_profile
    fetch_current_information(ignore_migration: true)
  rescue StandardError => e
    Rails.logger.warn("[Connector::WhatsappWeb] Perfil não atualizado (#{id}): #{e.class}: #{e.message}")
  end

  # ============================================================================
  # Provider dispatch
  # ============================================================================

  def self.default_base_url(provider_api)
    case provider_api.to_s
    when 'evolution_api' then ENV.fetch('EVOLUTION_API_URL', 'http://localhost:8089')
    when 'aiva_api' then ENV.fetch('WHATSAPP_API_URL', 'http://localhost:8080')
    end
  end

  def display_name
    profile_name.presence || instance_name.presence || "#{PREFIX_INSTANCE}#{id}"
  end

  def provider_api_key
    api_key.presence || ENV[evolution_provider? ? 'EVOLUTION_API_KEY' : 'WHATSAPP_API_KEY']
  end

  def provider
    PROVIDERS.fetch(provider_api) { PROVIDERS.fetch('aiva_api') }
  end

  def zapi_provider?
    provider_api == 'zapi'
  end

  def evolution_provider?
    provider_api == 'evolution_api'
  end

  # ============================================================================
  # Public messaging API — same contract for every provider
  # ============================================================================

  def send_text_message(to, message, _origin_phone_number = nil, reply_to_external_id: nil)
    if closed?
      errors.add(:not_connected, 'not connected')
      return
    end

    provider.send_text_message(self, to, message, reply_to_external_id: reply_to_external_id)
  end

  def send_media_message(to, media_dto, _origin_phone_number = nil)
    provider.send_media_message(self, to, media_dto)
  end

  def send_audio_message(to, media_dto, _origin_phone_number = nil)
    Rails.logger.info("Sending audio file: #{media_dto.as_json}")

    send_audio_message_by_url(to, media_dto.media_url, nil)
  end

  def send_audio_message_by_url(to, audio_url, _chat = nil)
    provider.send_audio_message_by_url(self, to, Media::Storage.public_url(audio_url))
  end

  def mark_read_message(remote_jid, id)
    provider.mark_read_message(self, remote_jid, id)
  end

  # Reage a uma mensagem já enviada/recebida. `external_message_id` e `from_me`
  # descrevem a mensagem ALVO; `emoji` em branco remove a reação.
  def send_reaction(to, external_message_id, from_me, emoji)
    provider.send_reaction(self, to, external_message_id, from_me, emoji)
  end

  # Resolve o número para a forma que de fato tem conta no WhatsApp. Números
  # brasileiros são consultados com e sem o 9º dígito (`BrPhoneVariants`): o JID
  # de celulares antigos de DDD >= 31 não tem o 9, e mandar a forma errada
  # resulta em `exists: false`. Havendo as duas, vale a forma original.
  #
  # Providers sem consulta de número devolvem os dígitos como vieram.
  #
  # @param phone [String] número em qualquer formato
  # @return [String] dígitos do número que existe no WhatsApp
  # @return [nil] quando nenhuma forma existe
  def resolve_whatsapp_number(phone)
    candidates = BrPhoneVariants.call(phone).reject { |form| form.include?('@') }
    return BrPhoneVariants.digits_of(phone) unless verifies_whatsapp_numbers? && candidates.any?

    results = provider.check_whatsapp_numbers(self, candidates)
    candidates.each do |candidate|
      match = results.find do |result|
        result['exists'] == true && BrPhoneVariants.digits_of(result['number']) == candidate
      end
      return whatsapp_number_from(match, candidate) if match
    end
    nil
  end

  def verifies_whatsapp_numbers?
    provider.respond_to?(:check_whatsapp_numbers)
  end

  # Available values: 'unavailable', 'available', 'composing', 'recording', 'paused'
  def send_presence(number, presence)
    provider.send_presence(self, number, presence)
  end

  def retriever_media_message_with_payload(id, msg_type: :audio, base64: false, payload: nil)
    retriever_media_message(id, msg_type, base64, payload)
  end

  def retriever_media_message(id, msg_type = :audio, base64 = nil, payload = nil)
    provider.retriever_media_message(self, id, msg_type, base64, payload)
  end

  # ============================================================================
  # Instance lifecycle
  # ============================================================================

  def activate
    provider.activate(self)
  end

  # Lifecycle methods route through the dispatcher so each provider implements
  # them as needed. Providers that have no analogue (e.g. Z-API for the
  # Evolution-style setup_webhook!) are free to no-op their version.

  def setup_webhook!
    provider.setup_webhook!(self)
  end

  def reload_instance
    return unless active?

    provider.reload_instance(self)
  end

  def logout_instance
    Rails.logger.info("Delete instance: #{instance_name}")
    return unless active?

    provider.logout_instance(self)
  end

  def fetch_current_information(ignore_migration: false)
    migrate_chats unless ignore_migration
    provider.fetch_current_information(self)
  end

  def retriever_media_message_complete(id, message, msg_type = :audio, resp_base64 = nil)
    provider.retriever_media_message_complete(self, id, message, msg_type, resp_base64)
  end

  # ============================================================================
  # Z-API-specific public methods
  # ============================================================================
  # These have no AIVA equivalent today. Each guards on `zapi_provider?` and
  # delegates straight to `ZapiClient` to preserve the original error class
  # callers depend on.

  def zapi_get_qr_code
    require_zapi!
    Rails.logger.info("[ZapiClient] Getting QR Code for instance: #{zapi_instance_id}")
    zapi_client.get_qr_code
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to get QR Code: #{e.message}")
    raise e
  end

  def zapi_get_qr_code_image
    require_zapi!
    Rails.logger.info("[ZapiClient] Getting QR Code image for instance: #{zapi_instance_id}")
    zapi_client.get_qr_code_image
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to get QR Code image: #{e.message}")
    raise e
  end

  def zapi_get_phone_code(phone)
    require_zapi!
    Rails.logger.info("[ZapiClient] Getting phone code for: #{phone}")
    zapi_client.get_phone_code(phone)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to get phone code: #{e.message}")
    raise e
  end

  # Revokes a message at the provider. Only supported on Z-API — the WABA
  # Cloud API does not expose a delete endpoint, so callers must check the
  # provider before invoking this method.
  def delete_message(phone:, message_id:, owner: true)
    require_zapi!
    Rails.logger.info("[ZapiClient] Deleting message #{message_id} for #{phone} (owner=#{owner})")
    zapi_client.delete_message(phone: phone, message_id: message_id, owner: owner)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to delete message: #{e.message}")
    raise e
  end

  def zapi_update_notify_sent_by_me(enabled: true)
    require_zapi!
    Rails.logger.info("[ZapiClient] Updating notifySentByMe=#{enabled} for instance: #{zapi_instance_id}")
    zapi_client.update_notify_sent_by_me(enabled: enabled)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to update notifySentByMe: #{e.message}")
    raise e
  end

  def sign_zapi_instance
    require_zapi!
    raise ZapiClient::Error, 'Z-API account token is required' unless zapi_account_token.present?

    Rails.logger.info("[ZapiClient] Signing instance: #{zapi_instance_id}")
    ZapiClient.sign_instance(zapi_instance_id, zapi_token, account_token: zapi_account_token)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to sign instance: #{e.message}")
    raise e
  end

  def metadata(phone)
    require_zapi!
    Rails.logger.info("[ZapiClient] Getting metadata for: #{phone}")
    zapi_client.metadata(phone)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to get metadata: #{e.message}")
    raise e
  end

  def list_contacts
    require_zapi!
    Rails.logger.info("[ZapiClient] Listing contacts for instance: #{zapi_instance_id}")
    zapi_client.list_contacts
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to list contacts: #{e.message}")
    raise e
  end

  def contact_metadata(phone)
    require_zapi!
    Rails.logger.info("[ZapiClient] Getting contact metadata for: #{phone}")
    zapi_client.contact_metadata(phone)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to get contact metadata: #{e.message}")
    raise e
  end

  # `zapi_`: `chats` são as conversas do conector (a associação).
  def zapi_chats(page: 1, page_size: 20)
    require_zapi!
    Rails.logger.info("[ZapiClient] Listing chats for instance: #{zapi_instance_id}")
    zapi_client.chats(page: page, page_size: page_size)
  rescue ZapiClient::Error => e
    Rails.logger.error("[ZapiClient] Failed to list chats: #{e.message}")
    raise e
  end

  # ============================================================================
  # Serialization / formatting
  # ============================================================================

  def number_formated
    return number_id unless number_id

    digits = number_id.gsub(/\D/, '')

    case digits.length
    when 12
      digits.gsub(/(\d{2})(\d{2})(\d{4})(\d{4})/, '(\2) \3-\4')
    when 13
      digits.gsub(/(\d{2})(\d{2})(\d{5})(\d{4})/, '(\2) \3-\4')
    else
      number_id
    end
  end

  # ============================================================================
  # Mongo-only maintenance / migration
  # ============================================================================

  def migrate_chats
    return if number_id.nil?

    unloaded_instance_ids = Connector::WhatsappWeb.where(
      organization_id: organization_id,
      number_id: number_id
    ).where.not(status_cd: 'active').pluck(:id)

    return unless unloaded_instance_ids.present?

    Chat.where(
      organization_id: organization_id,
      :connector_id.in => unloaded_instance_ids
    ).update_all(connector_id: id)
  end

  def deduplicate_chats
    # Step 1: Strip @s.whatsapp.net from external_id
    account_id = organization_id
    dirty_chats = Chat.where(
      organization_id: account_id,
      connector_id: id,
      external_id: /@s\.whatsapp\.net$/
    )

    puts '=== Step 1: Stripping @s.whatsapp.net ==='
    puts "Found #{dirty_chats.count} chats with @s.whatsapp.net"

    dirty_chats.each do |conv|
      clean_id = conv.external_id.gsub('@s.whatsapp.net', '')
      puts "  #{conv.id}: #{conv.external_id} -> #{clean_id}"
      conv.set(external_id: clean_id)
    end

    # Step 2: Find and merge duplicates
    puts "\n=== Step 2: Finding duplicates ==="

    pipeline = [
      { '$match' => { organization_id: account_id, connector_id: id } },
      { '$group' => {
        _id: '$external_id',
        count: { '$sum' => 1 },
        ids: { '$push' => '$_id' }
      } },
      { '$match' => { count: { '$gt' => 1 } } }
    ]

    duplicates = Chat.collection.aggregate(pipeline).to_a
    puts "Found #{duplicates.length} duplicate groups"

    merged_count = 0
    deleted_count = 0

    duplicates.each do |dup|
      convs = Chat.where(
        organization_id: account_id,
        connector_id: id,
        external_id: dup['_id']
      ).order_by(created_at: :asc).to_a

      oldest = convs.first
      newer = convs[1..]

      puts "\n  Duplicate external_id: #{dup['_id']} (#{convs.length} records)"
      puts "    Keeping: #{oldest.id} (created #{oldest.created_at})"

      newer.each do |recent|
        puts "    Merging: #{recent.id} (created #{recent.created_at}) -> into #{oldest.id}"

        update_fields = {}
        update_fields[:external_lid] = recent.external_lid if recent.external_lid.present?
        update_fields[:profile_picture_url] = recent.profile_picture_url if recent.profile_picture_url.present?
        update_fields[:user_name] = recent.user_name if recent.user_name.present?
        if recent.last_message_at.present? && (oldest.last_message_at.nil? || recent.last_message_at > oldest.last_message_at)
          update_fields[:last_message_at] =
            recent.last_message_at
        end
        update_fields[:last_message_content] = recent.last_message_content if recent.last_message_content.present?
        update_fields[:last_message_type] = recent.last_message_type if recent.last_message_type.present?
        update_fields[:status] = recent.status if recent.status.present? && recent.status != 'closed'
        update_fields[:chat_tag_ids] = (oldest.chat_tag_ids + recent.chat_tag_ids).uniq if recent.chat_tag_ids.present?

        if update_fields.any?
          oldest.set(update_fields)
          puts "    Updated fields: #{update_fields.keys.join(', ')}"
        end

        migrated = ChatMessage::Base.unscoped.where(chat_id: recent.id).update_all(chat_id: oldest.id)
        puts "    Migrated #{migrated} messages"

        recent.ignore_events = true
        recent.destroy
        deleted_count += 1
        puts "    Deleted #{recent.id}"
      end

      merged_count += 1
    end

    puts "\n=== Done ==="
    puts "Merged #{merged_count} duplicate groups, deleted #{deleted_count} records"
  end

  # ============================================================================
  # Helpers shared with provider modules
  # ============================================================================

  # The provider modules call this on the connector; expose as public.
  def headers
    @headers ||= {
      'Content-Type': 'application/json',
      apikey: provider_api_key
    }
  end

  def zapi_client
    @zapi_client ||= ZapiClient.new(zapi_instance_id, zapi_token, account_token: ENV['ZAPI_CLIENT_TOKEN'])
  end

  def zapi_account_token
    @zapi_account_token ||= ENV['ZAPI_ACCOUNT_TOKEN']
  end

  private

  # O `jid` é a forma canônica, mas pode vir como `@lid` (cache da Evolution);
  # nesse caso os dígitos não são telefone e vale a forma consultada.
  def whatsapp_number_from(result, candidate)
    jid = result['jid'].to_s
    jid.end_with?(BrPhoneVariants::JID_SUFFIX) ? BrPhoneVariants.digits_of(jid) : candidate
  end

  def require_zapi!
    raise ZapiClient::Error, 'Z-API credentials are required' unless zapi_provider?
  end
end

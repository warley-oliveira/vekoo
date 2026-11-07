class Connector::WhatsappCloud < Connector::Base
  FACEBOOK_OAUTH_URL = 'https://graph.facebook.com/v22.0/oauth/access_token'.freeze

  # Hosts da Meta que exigem o Bearer token no download de mídia. A CDN de
  # destino (scontent/fbcdn) usa URLs pré-assinadas e NÃO deve receber o token.
  META_MEDIA_AUTH_HOSTS = %w[lookaside.fbsbx.com graph.facebook.com facebook.com].freeze
  META_MEDIA_USER_AGENT = 'Vekoo/1.0 (+https://my.vekoo.app)'.freeze

  # Resultado do download de mídia. Usamos Struct (métodos de acesso reais e
  # garantidos) em vez de OpenStruct: em produção o acessor `.file_path` do
  # OpenStruct retornava nil mesmo com o valor presente na tabela (visível no
  # inspect), porque o OpenStruct define os acessores dinamicamente e pode não
  # criá-los quando o nome colide com algum método já presente no runtime. Isso
  # quebrava `File.exist?(file_response.file_path)` no controller. O Struct não
  # depende disso — os acessores são definidos na própria classe.
  MediaDownloadResult = Struct.new(:file_size, :file_path, :mime_type, keyword_init: true)

  # Códigos de erro da Meta que indicam que o template existe mas não naquele
  # idioma (ou que o par nome+idioma não foi encontrado).
  TEMPLATE_TRANSLATION_ERROR_CODES = [132_001].freeze

  # Listagem de templates: versão da Graph API, tamanho de página e teto de
  # páginas (trava contra loop de paginação).
  TEMPLATES_API_VERSION = 'v24.0'.freeze
  TEMPLATES_PAGE_SIZE = 100
  TEMPLATES_MAX_PAGES = 50

  # Campos pedidos explicitamente na listagem. `quality_score` e afins não vêm
  # no payload default da Graph API.
  TEMPLATE_FIELDS = %w[
    id name language status category sub_category previous_category
    correct_category rejected_reason quality_score components
    parameter_format message_send_ttl_seconds library_template_name
    cta_url_link_tracking_opted_out
  ].join(',').freeze

  # Locales irmãos tentados quando não conseguimos consultar a lista real de
  # templates na Meta. A ordem importa: o primeiro que a API aceitar vence.
  LANGUAGE_FALLBACKS = {
    'pt_BR' => %w[pt pt_PT],
    'pt' => %w[pt_BR pt_PT],
    'pt_PT' => %w[pt_BR pt],
    'en_US' => %w[en en_GB],
    'en' => %w[en_US en_GB],
    'en_GB' => %w[en en_US],
    'es_ES' => %w[es es_MX es_AR],
    'es' => %w[es_ES es_MX es_AR],
    'es_MX' => %w[es es_ES es_AR]
  }.freeze

  field :verification_token, type: String
  field :phone_number_id, type: Integer
  field :waba_id, type: Integer
  field :business_id, type: Integer
  encrypted_field :access_token
  encrypted_field :user_access_token

  # Field of connector: display_phone_number, verified_name, status, quality_rating
  field :display_phone_number, type: String
  field :verified_name, type: String
  field :quality_rating, type: String
  field :fb_status, type: String
  field :phone_number_details, type: Hash, default: {}
  field :phone_number_list, type: Array, default: []

  has_many :whatsapp_templates, class_name: 'WhatsappTemplate', inverse_of: :connector, dependent: :destroy

  before_create do
    self.verification_token = SecureRandom.base36(32)
  end

  def instance_name
    verified_name.presence || display_phone_number.presence || super
  end

  def activate(code = nil)
    exchange_oauth_code_for_token(code: code) if code.present?
    phone_numbers_api = WhatsappSdk::Api::PhoneNumbers.new(whatsapp_client)
    registered_number = phone_numbers_api.registered_number(phone_number_id)

    if registered_number.error.present?
      self.error_message = registered_number.error.message
      Rails.logger.error "[activate] Error fetching registered number: #{error_message}"
      self.status = :failed
      save!
      return
    end
    self.phone_number_list = fetch_registered_numbers
    self.display_phone_number = registered_number.data.display_phone_number
    self.verified_name = registered_number.data.verified_name
    self.fb_status = registered_number.data.status
    self.quality_rating = registered_number.data.quality_rating
    subscribe_app!
    self.status = :active
    save!
    refresh_all_phone_details!
  end

  def register_number(number_id)
    phone_numbers_api = WhatsappSdk::Api::PhoneNumbers.new(whatsapp_client)
    phone_numbers_api.register_number(number_id, 102_030)
  end

  def fetch_registered_numbers!
    self.phone_number_list = fetch_registered_numbers
    save!
    refresh_all_phone_details!
  end

  def fetch_registered_numbers
    bid = waba_id.present? ? waba_id : business_id
    phone_numbers_api = WhatsappSdk::Api::PhoneNumbers.new(whatsapp_client)
    numbers = phone_numbers_api.registered_numbers(bid)
    has_pending = false
    numbers.data.phone_numbers.map do |phone|
      if phone.status.eql?('PENDING')
        register_number(phone.id.to_i)
        has_pending = true
      end
    end
    numbers = phone_numbers_api.registered_numbers(bid) if has_pending
    numbers.data.phone_numbers.map do |phone|
      {
        id: phone.id,
        verified_name: phone.verified_name,
        display_phone_number: phone.display_phone_number,
        quality_rating: phone.quality_rating,
        is_pin_enabled: phone.is_pin_enabled,
        is_official_business_account: phone.is_official_business_account,
        account_mode: phone.account_mode,
        certificate: phone.certificate,
        code_verification_status: phone.code_verification_status,
        eligibility_for_api_business_global_search: phone.eligibility_for_api_business_global_search,
        name_status: phone.name_status,
        new_name_status: phone.new_name_status,
        status: phone.status,
        search_visibility: phone.search_visibility
      }
    end
  end

  def refresh_details(number_id = phone_number_id)
    bp = WhatsappSdk::Api::BusinessProfile.new(whatsapp_client)
    details = bp.details(number_id)
    phone_number_details[number_id.to_s] = {
      about: details.data.about,
      address: details.data.address,
      description: details.data.description,
      email: details.data.email,
      profile_picture_url: details.data.profile_picture_url,
      websites: details.data.websites
    }
  end

  def refresh_all_phone_details!
    phone_number_list.each do |phone|
      refresh_details((phone['id'] || phone[:id]).to_i)
    rescue StandardError => e
      Rails.logger.error "[refresh_all_phone_details!] Error for phone #{phone['id'] || phone[:id]}: #{e.message}"
    end
    save!
  end

  def setup_webhook!
    raise 'Not implemented'
  end

  # O SDK não levanta quando a Meta recusa: a recusa vem na resposta, e aqui o retorno é nil como
  # em todo conector sem id. O motivo fica em `last_send_error`, para o histórico guardar.
  attr_reader :last_send_error

  def send_text_message(recipient_number, message, chat = nil, reply_to_external_id: nil)
    Rails.logger.info "Sending message: `#{message}` (reply_to=#{reply_to_external_id.inspect})"
    @messages_sdk ||= WhatsappSdk::Api::Messages.new(whatsapp_client)
    response = @messages_sdk.send_text(
      sender_id: chat&.sender_phone_number_id || phone_number_id,
      recipient_number: recipient_number.to_i,
      message: message,
      message_id: reply_to_external_id.presence
    )
    Rails.logger.info "[send_text_message] Response: #{response}"
    error = response.try(:error)
    @last_send_error = error && WabaErrorHandler.humanize(error.code, error.message)
    extract_wamid(response)
  end

  def templates_obj
    @templates_obj ||= WhatsappSdk::Api::Templates.new(whatsapp_client)
  end

  def business_templates
    bid = waba_id.present? ? waba_id : business_id
    templates_obj.templates(business_id: bid)
  end

  # Sincroniza os templates locais com a WABA.
  #
  # Lê a listagem crua da Graph API (paginada) em vez de usar o SDK: a gem
  # 0.12.1 só expõe id/name/language/status/category/components — e devolve
  # `status`/`category` nil para valores que não conhece (PAUSED, DISABLED,
  # IN_APPEAL...), o que quebrava o sync inteiro no primeiro template pausado.
  #
  # Templates que não aparecem mais na WABA são marcados como `removed`
  # (nunca apagados): campanhas e webhooks guardam o id do template.
  #
  # @return [Hash] resumo { created:, updated:, unchanged:, removed:, total: }
  def sync_templates
    remote_templates = fetch_remote_templates
    summary = { created: 0, updated: 0, unchanged: 0, removed: 0, total: remote_templates.size }
    seen_ids = []

    remote_templates.each do |payload|
      template_id = payload['id'].to_s
      next if template_id.blank?

      seen_ids << template_id
      summary[upsert_remote_template(template_id, payload)] += 1
    end

    summary[:removed] = mark_missing_templates_as_removed(seen_ids)

    Rails.logger.info "[sync_templates] Integração #{id}: #{summary.inspect}"
    summary
  end

  # @return [Symbol] :created, :updated ou :unchanged
  def upsert_remote_template(template_id, payload)
    template = WhatsappTemplate.where(template_id: template_id, connector_id: id).first_or_initialize
    new_record = template.new_record?
    changed = template.assign_meta_attributes(payload)
    template.last_synced_at = Time.current

    # Sem validação de propósito: os dados vêm da Meta, que é a fonte da
    # verdade. Validar aqui dispararia o `validate on: :create` do model — que
    # tenta CRIAR o template na Meta — e a checagem de unicidade nome+idioma
    # contra registros já marcados como removidos.
    template.save!(validate: false)

    return :created if new_record

    changed ? :updated : :unchanged
  end

  # Marca como removido todo template local que não veio na listagem da WABA.
  # Só é chamado quando a listagem completa foi obtida com sucesso — uma falha
  # de rede no meio da paginação levanta antes de chegar aqui, então nunca
  # marcamos a base inteira como removida por causa de um erro transitório.
  #
  # @param seen_ids [Array<String>] ids retornados pela Meta nesta execução
  # @return [Integer] quantidade de templates marcados
  def mark_missing_templates_as_removed(seen_ids)
    orphans = whatsapp_templates.available.where(
      :template_id.nin => seen_ids,
      :template_id.ne => nil
    ).to_a

    orphans.count do |template|
      next false if template.template_id.blank?

      Rails.logger.warn(
        "[sync_templates] Template '#{template.name}' (#{template.language}/#{template.template_id}) " \
        'não existe mais na WABA — marcando como removido'
      )
      template.mark_as_removed!
    end
  end

  # Busca todos os templates da WABA percorrendo a paginação por cursor.
  # A listagem do SDK trazia no máximo uma página de 100 templates.
  #
  # @return [Array<Hash>] payloads crus da Graph API
  # @raise [StandardError] se qualquer página falhar
  def fetch_remote_templates
    bid = waba_id.present? ? waba_id : business_id
    raise 'WABA/business id ausente na integração' if bid.blank?

    url = "https://graph.facebook.com/#{TEMPLATES_API_VERSION}/#{bid}/message_templates"
    query = {
      access_token: retrieve_current_token,
      limit: TEMPLATES_PAGE_SIZE,
      fields: TEMPLATE_FIELDS
    }

    collected = []
    TEMPLATES_MAX_PAGES.times do
      body = request_templates_page(url, query)
      collected.concat(Array(body['data']))

      url = body.dig('paging', 'next')
      break if url.blank?

      # A URL de `paging.next` já carrega access_token, cursor e fields
      query = nil
    end

    Rails.logger.info "[fetch_remote_templates] #{collected.size} templates recebidos da WABA #{bid}"
    collected
  end

  def request_templates_page(url, query)
    response = HTTParty.get(
      url,
      headers: { 'Accept' => 'application/json' },
      query: query,
      timeout: 30
    )
    body = response.parsed_response

    # Field inválido para a versão da API: refaz sem `fields` e usa o default
    if !response.success? && query&.key?(:fields) && body.dig('error', 'code') == 100
      Rails.logger.warn "[fetch_remote_templates] Fields rejeitados pela Graph API, repetindo sem `fields`: #{body}"
      return request_templates_page(url, query.except(:fields))
    end

    unless response.success?
      error_message = body.dig('error', 'message') || "HTTP #{response.code}"
      raise "Falha ao listar templates da WABA: #{error_message}"
    end

    body
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    Rails.logger.error "[fetch_remote_templates] HTTP Error: #{e.message}"
    raise
  end

  def send_template_message(template, components, chat)
    Rails.logger.info "Sending template message: #{template.name} to #{chat.external_id}"

    # Normalize and complete the components based on template definition
    processed_components = prepare_template_components(template, components)

    Rails.logger.info "[send_template_message] Processed components: #{processed_components.inspect}"

    response = dispatch_template(template.name, template.language, processed_components, chat)
    return response unless template_translation_error?(response)

    send_template_with_language_fallback(template, processed_components, chat, response)
  end

  # Erro 132001 da Meta: "Template name does not exist in the translation".
  # O nome do template existe na WABA, mas não na tradução (idioma) enviada —
  # normalmente porque o `language` gravado localmente ficou dessincronizado do
  # que existe na Meta (template recriado/traduzido em outro locale).
  # Reenvia nos idiomas realmente disponíveis e corrige o registro local.
  def send_template_with_language_fallback(template, processed_components, chat, original_response)
    candidates = fallback_languages_for(template)
    Rails.logger.warn(
      "[send_template_message] Template '#{template.name}' não existe em #{template.language}. " \
      "Tentando fallback: #{candidates.inspect}"
    )

    candidates.each do |language|
      response = dispatch_template(template.name, language, processed_components, chat)
      next if response.error?

      # Corrige o idioma local para que os próximos envios acertem de primeira.
      # `set` grava direto no Mongo, sem disparar o after_update de sync na Meta.
      template.set(language: language)
      Rails.logger.info(
        "[send_template_message] Fallback bem-sucedido em #{language}; idioma do template corrigido localmente."
      )
      return response
    end

    Rails.logger.error(
      "[send_template_message] Nenhum idioma disponível para o template '#{template.name}' " \
      "(tentados: #{[template.language, *candidates].inspect})"
    )
    original_response
  end

  # Idiomas a tentar, em ordem: os que a própria Meta reporta para esse nome de
  # template (fonte da verdade) e, se a consulta falhar, os locales irmãos.
  def fallback_languages_for(template)
    remote = remote_template_languages(template.name)
    fallbacks = remote.presence || LANGUAGE_FALLBACKS.fetch(template.language.to_s, [])
    (fallbacks - [template.language]).uniq
  end

  # Idiomas aprovados disponíveis na WABA para um nome de template.
  def remote_template_languages(template_name)
    fetch_remote_templates.filter_map do |payload|
      next unless payload['name'] == template_name
      next unless payload['status'].to_s.casecmp('APPROVED').zero?

      payload['language']
    end
  rescue StandardError => e
    Rails.logger.error "[remote_template_languages] Falha ao consultar templates na Meta: #{e.message}"
    []
  end

  def dispatch_template(name, language, processed_components, chat)
    @messages_sdk ||= WhatsappSdk::Api::Messages.new(whatsapp_client)

    response = @messages_sdk.send_template(
      sender_id: chat&.sender_phone_number_id || phone_number_id,
      recipient_number: chat.external_id.to_i,
      name: name,
      language: language,
      components_json: processed_components
    )

    Rails.logger.info "[send_template_message] Response (#{language}): #{response}"
    response
  end

  def template_translation_error?(response)
    return false unless response.respond_to?(:error?) && response.error?

    TEMPLATE_TRANSLATION_ERROR_CODES.include?(response.error&.code)
  end

  # Prepares the components array for sending a template message.
  # Adds missing HEADER component for templates with media headers.
  #
  # A mídia vem do Attachment vinculado ao template (ver
  # WhatsappTemplate#resolved_header_media_url), nunca do `example.header_handle`
  # devolvido pela Meta no sync: aquele link aponta para o CDN interno
  # (scontent.whatsapp.net), é assinado por sessão e o downloader da própria
  # Meta leva 403 nele — o envio falha depois, no callback, com o erro 131053.
  #
  # @param template [WhatsappTemplate] The template being sent
  # @param frontend_components [Array] The components received from frontend
  # @return [Array] The complete components array ready for WhatsApp API
  def prepare_template_components(template, frontend_components)
    components = frontend_components.deep_dup || []

    return components unless template.has_media_header?
    return components if components.any? { |c| c['type']&.upcase == 'HEADER' }

    media_url = template.resolved_header_media_url

    if media_url.blank?
      Rails.logger.error(
        "[prepare_template_components] Template '#{template.name}' tem header " \
        "#{template.header_format} mas nenhuma URL pública de mídia — o attachment de origem " \
        'não está vinculado. Reenvie a mídia pelo formulário do template.'
      )
      return components
    end

    header_format = template.header_format.downcase # 'image', 'video', 'document'

    components.unshift(
      'type' => 'header',
      'parameters' => [
        {
          'type' => header_format,
          header_format => { 'link' => media_url }
        }
      ]
    )

    Rails.logger.info "[prepare_template_components] Added HEADER component with #{header_format}: #{media_url}"
    components
  end

  def send_audio_message(to, media_dto, chat = nil)
    Rails.logger.info("Sending audio file: #{media_dto.as_json}")

    send_audio_message_by_url(to, media_dto.media_url, chat)
  end

  def send_audio_message_by_url(to, audio_url, chat = nil)
    @messages_sdk ||= WhatsappSdk::Api::Messages.new(whatsapp_client)
    response = @messages_sdk.send_audio(
      sender_id: chat&.sender_phone_number_id || phone_number_id,
      recipient_number: to.to_i, link: Media::Storage.public_url(audio_url)
    )
    Rails.logger.info "[send_audio_message_by_url] Response: #{response.inspect}"
    extract_wamid(response)
  end

  def send_media_message(to, media_dto, chat = nil)
    @messages_sdk ||= WhatsappSdk::Api::Messages.new(whatsapp_client)
    # WhatsappSdk::Api::Medias.new.get(media_id: media_dto.media_id) ###

    case media_dto.media_type
    when 'image'
      @messages_sdk.send_image(
        sender_id: chat&.sender_phone_number_id || phone_number_id,
        recipient_number: to.to_i,
        link: media_dto.media_url,
        caption: ''
      )
    when 'video'
      @messages_sdk.send_video(
        sender_id: chat&.sender_phone_number_id || phone_number_id,
        recipient_number: to.to_i,
        link: media_dto.media_url,
        caption: ''
      )
    else
      @messages_sdk.send_document(
        sender_id: chat&.sender_phone_number_id || phone_number_id,
        recipient_number: to.to_i,
        link: media_dto.media_url,
        caption: ''
      )
    end
  end

  def mark_read_message(_sender_id, message_id)
    # TODO: fix to `chat.sender_phone_number_id || phone_number_id`
    @messages_sdk ||= WhatsappSdk::Api::Messages.new(whatsapp_client)
    # @messages_sdk.read_message(sender_id: sender_id, message_id: message_id)
    @messages_sdk.read_message(sender_id: phone_number_id, message_id: message_id)
  end

  # Available values: 'unavailable', 'available', 'composing', 'recording', 'paused'
  def send_presence(_number, _presence)
    # raise 'Not implemented'
  end

  def retriever_media_message(media_id, msg_type = :image, _resp_base64 = false, _payload = nil) # rubocop:disable Style/OptionalBooleanParameter
    download_media(media_id: media_id, format: msg_type == :image ? 'jpg' : 'bin')
  end

  def retriever_image_message(media_id)
    download_media(media_id: media_id, format: 'jpg')
  end

  def reload_instance
    raise 'Not implemented'
  end

  # /instance/logout/104-h0jhorpywtju1bw1
  def logout_instance
    raise 'Not implemented'
  end

  # Mp3 toca em qualquer navegador; ogg/opus, não. Sem ffmpeg na máquina (ou se ele
  # falhar) fica o arquivo original: melhor um formato ruim do que perder a mensagem.
  def retrieve_audio_message(media_id)
    file_path = download_media(media_id: media_id, format: 'ogg')
    converted_file_path = "#{file_path}.mp3"

    # ffmpeg -i input.ogg -ac 1 -ar 16000 -b:a 96k output.mp3
    converted = system('ffmpeg', '-y', '-loglevel', 'error', '-i', file_path.to_s, '-ac', '1', '-ar', '16000', '-b:a', '96k', converted_file_path)
    return file_path unless converted && File.exist?(converted_file_path)

    File.delete(file_path)
    converted_file_path
  end

  def download_media(media_id:, format: 'ogg')
    download_media_object(media_id: media_id, format: format).file_path
  end

  def download_media_object(media_id:, format: 'ogg')
    obj = WhatsappSdk::Api::Medias.new(whatsapp_client)
    response_media = obj.media(media_id: media_id)

    Rails.logger.info "Downloading media ID: #{media_id} as .#{format}\n#{response_media.inspect}"

    media_url = response_media.data&.url
    if media_url.blank?
      Rails.logger.error "WABA media metadata missing URL (media_id=#{media_id}, response=#{response_media.raw_response.inspect})"
      raise "WABA media metadata missing URL (media_id=#{media_id}, response=#{response_media.raw_response.inspect})"
    end

    # `media_id` vem do webhook: nunca entra cru em caminho de arquivo.
    file_path = File.join(Rails.root, 'tmp', "wab-#{media_id.to_s.gsub(/[^\w-]/, '')}-#{SecureRandom.hex(4)}#{format ? ".#{format}" : ''}")
    download_media_binary!(url: media_url, file_path: file_path, media_id: media_id)

    MediaDownloadResult.new(
      file_size: response_media.data.file_size || File.size(file_path),
      file_path: file_path,
      mime_type: response_media.data.mime_type
    )
  end

  # Exchanges an OAuth authorization code for a user access token.
  # The token is automatically encrypted by Mongoid::EncryptedString before being saved.
  #
  # @param code [String] The authorization code received from Facebook OAuth callback
  # @param redirect_uri [String] The redirect URI used in the OAuth flow
  # @return [Hash] The response containing access_token and token_type, or error details
  # @raise [StandardError] If the HTTP request fails
  def exchange_oauth_code_for_token(code:)
    response = HTTParty.post(
      FACEBOOK_OAUTH_URL,
      headers: { 'Content-Type' => 'application/json' },
      body: {
        client_id: ENV['META_APP_ID'],
        client_secret: ENV['META_APP_SECRET'],
        code: code,
        grant_type: 'authorization_code'
      }.to_json,
      timeout: 30
    )

    Rails.logger.info "[exchange_oauth_code_for_token] Response status: #{response.code}"

    if response.success?
      parsed_response = response.parsed_response
      self.user_access_token = parsed_response['access_token']
      save!

      Rails.logger.info '[exchange_oauth_code_for_token] Token exchanged and saved successfully'
      { success: true, token_type: parsed_response['token_type'] }
    else
      error_message = response.parsed_response&.dig('error', 'message') || 'Unknown error'
      Rails.logger.error "[exchange_oauth_code_for_token] Error: #{response.parsed_response}"
      { success: false, error: error_message }
    end
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    Rails.logger.error "[exchange_oauth_code_for_token] HTTP Error: #{e.message}"
    raise
  end

  # private

  def whatsapp_client
    @whatsapp_client ||= WhatsappSdk::Api::Client.new(retrieve_current_token)
  end

  def retrieve_current_token
    return access_token  if access_token.present?

    user_access_token
  end

  # Retrieves the list of apps subscribed to webhooks for this WhatsApp Business Account.
  #
  # @return [Hash] The response containing subscribed apps data or error details
  # @raise [StandardError] If the HTTP request fails
  def subscribed_apps
    waba = waba_id.present? ? waba_id : business_id
    url = "https://graph.facebook.com/v24.0/#{waba}/subscribed_apps"

    response = HTTParty.get(
      url,
      headers: { 'Accept' => 'application/json' },
      query: { access_token: retrieve_current_token },
      timeout: 30
    )

    Rails.logger.info "[get_subscribed_apps] Response status: #{response.code}"

    if response.success?
      Rails.logger.info '[get_subscribed_apps] Subscribed apps retrieved successfully'
      { success: true, data: response.parsed_response }
    else
      error_message = response.parsed_response&.dig('error', 'message') || 'Unknown error'
      Rails.logger.error "[get_subscribed_apps] Error: #{response.parsed_response}"
      { success: false, error: error_message }
    end
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    Rails.logger.error "[get_subscribed_apps] HTTP Error: #{e.message}"
    raise
  end

  # Subscribes an app to webhooks for this WhatsApp Business Account.
  #
  # @param app_id [String] The app ID to subscribe (defaults to the WABA app ID from credentials)
  # @return [Hash] The response containing success status or error details
  # @raise [StandardError] If the HTTP request fails
  def subscribe_app!(app_id = ENV['META_APP_ID'])
    waba = waba_id.present? ? waba_id : business_id
    url = "https://graph.facebook.com/v24.0/#{waba}/subscribed_apps"

    response = HTTParty.post(
      url,
      headers: { 'Accept' => 'application/json' },
      query: {
        access_token: retrieve_current_token,
        app_id: app_id
      },
      timeout: 30
    )

    Rails.logger.info "[subscribe_app] Response status: #{response.code}"

    if response.success?
      Rails.logger.info "[subscribe_app] App #{app_id} subscribed successfully"
      { success: true, data: response.parsed_response }
    else
      error_message = response.parsed_response&.dig('error', 'message') || 'Unknown error'
      Rails.logger.error "[subscribe_app] Error: #{response.parsed_response}"
      { success: false, error: error_message }
    end
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    Rails.logger.error "[subscribe_app] HTTP Error: #{e.message}"
    raise
  end

  # Uploads a file using Meta's Resumable Upload API and returns the header_handle.
  # This is required for creating message templates with media headers.
  #
  # @param file_url [String] The URL of the file to upload
  # @return [String, nil] The header_handle to use in template creation, or nil on failure
  def upload_media_for_template(file_url)
    Rails.logger.info "[upload_media_for_template] Starting upload for URL: #{file_url}"

    # Download the file from URL. A URL vem de quem cria o modelo.
    file_response = Media::RemoteFile.get(file_url)
    unless file_response.success?
      Rails.logger.error "[upload_media_for_template] Failed to download file from URL: #{file_url}"
      return nil
    end

    file_content = file_response.body
    file_length = file_content.bytesize
    content_type = file_response.content_type.presence || detect_content_type(file_url)
    file_name = extract_file_name(file_url, content_type)

    Rails.logger.info "[upload_media_for_template] File size: #{file_length}, Type: #{content_type}, Name: #{file_name}"

    # Step 1: Create upload session
    app_id = ENV['META_APP_ID']
    session_response = HTTParty.post(
      "https://graph.facebook.com/v22.0/#{app_id}/uploads",
      headers: { 'Content-Type' => 'application/json' },
      query: {
        file_name: file_name,
        file_length: file_length,
        file_type: content_type,
        access_token: retrieve_current_token
      },
      timeout: 30
    )

    unless session_response.success?
      Rails.logger.error "[upload_media_for_template] Failed to create upload session: #{session_response.parsed_response}"
      return nil
    end

    upload_session_id = session_response.parsed_response['id']
    Rails.logger.info "[upload_media_for_template] Created upload session: #{upload_session_id}"

    # Step 2: Upload the file
    upload_response = HTTParty.post(
      "https://graph.facebook.com/v22.0/#{upload_session_id}",
      headers: {
        'Authorization' => "OAuth #{retrieve_current_token}",
        'file_offset' => '0',
        'Content-Type' => 'application/octet-stream'
      },
      body: file_content,
      timeout: 120
    )

    unless upload_response.success?
      Rails.logger.error "[upload_media_for_template] Failed to upload file: #{upload_response.parsed_response}"
      return nil
    end

    header_handle = upload_response.parsed_response['h']
    Rails.logger.info "[upload_media_for_template] Upload complete. Header handle: #{header_handle}"

    header_handle
  rescue StandardError => e
    Rails.logger.error "[upload_media_for_template] Error: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
    nil
  end

  private

  # Todos os demais integradores devolvem o id externo como String — ZApi
  # (`response&.dig('messageId')`), os providers de WhatsappApi (`dig('key','id')`)
  # e WebWidget (uuid). É o contrato que `ChatMessage#message_id` (type: String)
  # espera. O SDK da Meta devolve um objeto de resposta; sem desempacotar aqui, o
  # Mongoid persistia o `to_s` desse objeto e nenhum webhook de status conseguia
  # casar a mensagem pelo wamid.
  #
  # `try` em vez de `&.` porque a resposta pode não ser nil e ainda assim não
  # responder a `data` (erro do SDK, stub de teste).
  def extract_wamid(response)
    response.try(:data).try(:messages)&.first.try(:id)
  end

  # Baixa o binário da mídia da Meta para +file_path+.
  #
  # A URL devolvida pela Graph API (GET /{media-id}) aponta para
  # lookaside.fbsbx.com e normalmente responde com um 302 para a CDN assinada.
  # O download nativo da whatsapp_sdk usa Net::HTTP cru, que NÃO segue redirects
  # e, em qualquer resposta != 200, simplesmente não grava o arquivo (sem erro).
  # Isso fazia a falha aparecer só depois como "arquivo não encontrado".
  #
  # Fazemos o download nós mesmos, seguindo o redirect manualmente: o Bearer só
  # vai para o host da Meta; ao redirecionar para a CDN assinada, o header de
  # auth é removido (senão a CDN rejeita). Falhamos alto com o status HTTP real.
  def download_media_binary!(url:, file_path:, media_id:, attempts: 3)
    last_error = nil

    attempts.times do |attempt|
      response = fetch_media_response(url)
      content = media_response_bytes(response)

      if response.success? && content.bytesize.positive?
        File.binwrite(file_path, content)
        if File.exist?(file_path) && File.size(file_path).positive?
          Rails.logger.info(
            "[download_media_binary!] wrote #{File.size(file_path)} bytes to #{file_path} (media_id=#{media_id})"
          )
          return file_path
        end

        last_error = "wrote empty file (status=#{response.code})"
      else
        last_error = "status=#{response.code} bytes=#{content.bytesize}"
      end

      Rails.logger.warn(
        "[download_media_binary!] attempt #{attempt + 1}/#{attempts} failed " \
        "for media_id=#{media_id}: #{last_error}"
      )
      sleep(0.5 * (attempt + 1)) unless attempt == attempts - 1
    end

    raise "WABA media download failed (media_id=#{media_id}, #{last_error})"
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    raise "WABA media download error (media_id=#{media_id}): #{e.class} #{e.message}"
  end

  # Extrai os bytes do binário da resposta do HTTParty. Para application/pdf (e
  # outros tipos sem parser) o corpo bruto pode chegar em +parsed_response+ e não
  # em +body+ dependendo do hop de redirect/CDN — então usamos o que estiver
  # preenchido. +parsed_response+ é ignorado quando vier como Hash (corpo de erro
  # JSON), para nunca gravar algo que não seja o binário.
  def media_response_bytes(response)
    body = response.body.to_s
    return body unless body.empty?

    parsed = response.parsed_response
    parsed.is_a?(String) ? parsed : ''
  end

  # A mídia da Meta vem em dois saltos: a URL do lookaside.fbsbx.com exige o
  # Bearer e responde 302 para uma URL de CDN (scontent/fbcdn) JÁ assinada. Essa
  # URL de CDN precisa ser baixada SEM o header Authorization — encaminhar o
  # bearer no redirect faz a CDN rejeitar (por isso a chamada de metadados passa
  # com o mesmo token, mas o download do binário falha). O HTTParty reenvia os
  # headers ao seguir redirect, então percorremos a cadeia manualmente e só
  # enviamos auth para hosts da Meta.
  def fetch_media_response(url, redirect_limit: 5)
    raise 'WABA media download exceeded redirect limit' if redirect_limit.negative?

    uri = URI.parse(url)
    headers = { 'User-Agent' => META_MEDIA_USER_AGENT }
    headers['Authorization'] = "Bearer #{retrieve_current_token}" if meta_auth_host?(uri.host)

    response = HTTParty.get(url, headers: headers, follow_redirects: false, timeout: 60)
    Rails.logger.info "[fetch_media_response] #{response.code} for #{uri.host} (auth=#{headers.key?('Authorization')})"
    return response unless [301, 302, 303, 307, 308].include?(response.code)

    location = response.headers['location']
    return response if location.blank?

    fetch_media_response(location, redirect_limit: redirect_limit - 1)
  end

  def meta_auth_host?(host)
    META_MEDIA_AUTH_HOSTS.any? { |h| host.to_s == h || host.to_s.end_with?(".#{h}") }
  end

  def detect_content_type(url)
    extension = File.extname(URI.parse(url).path).downcase
    case extension
    when '.jpg', '.jpeg' then 'image/jpeg'
    when '.png' then 'image/png'
    when '.mp4' then 'video/mp4'
    when '.pdf' then 'application/pdf'
    when '.doc' then 'application/msword'
    when '.docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else 'application/octet-stream'
    end
  end

  def extract_file_name(url, content_type)
    uri = URI.parse(url)
    name = File.basename(uri.path)
    return name if name.include?('.')

    # Add extension based on content type if missing
    extension = case content_type
                when 'image/jpeg' then '.jpg'
                when 'image/png' then '.png'
                when 'video/mp4' then '.mp4'
                when 'application/pdf' then '.pdf'
                else ''
                end
    "media_#{SecureRandom.hex(4)}#{extension}"
  end

  public

  # Simula um erro de cobrança/conta WABA para testes.
  # Persiste o error_message no conector e dispara o aviso da organização.
  #
  # Uso no rails console:
  #   connector = Connector::WhatsappCloud.find('...')
  #   connector.simulate_billing_error!(133_010)
  #
  # Códigos suportados: 190, 368, 131031, 133010, 131050, 131055
  def simulate_billing_error!(error_code = 133_010)
    error_code = error_code.to_i
    unless WabaErrorHandler.account_billing_error?(error_code)
      return
    end

    humanized = WabaErrorHandler.humanize(error_code, 'Simulated billing error for testing')
    update(error_message: humanized)

    Connectors::Alerts.error(
      self,
      code: "waba_billing_#{error_code}",
      message: humanized,
      metadata: {
        error_code: error_code,
        simulated: true,
        occurred_at: Time.current.iso8601
      }
    )

    Rails.logger.info "[simulate_billing_error!] Alert raised for connector #{id} with code #{error_code}"
    humanized
  end

  # Remove o erro simulado e resolve os alertas de billing da connector
  def clear_billing_error!
    update(error_message: nil)

    Connectors::Alerts.reconnected(self)

    Rails.logger.info "[clear_billing_error!] Alerts resolved for connector #{id}"
  end
end

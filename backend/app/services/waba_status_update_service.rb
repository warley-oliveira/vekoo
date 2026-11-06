# frozen_string_literal: true

# Aplica um evento de `statuses` do webhook da Meta (WhatsApp Cloud API) sobre a
# mensagem correspondente.
#
# A resolução é pelo wamid dentro das conversas candidatas do número, sem exigir o
# casamento exato `(connector_id, external_id == recipient_id)`, que falhava por dois
# motivos independentes:
#
#   * deriva de conector: a conversa pode ter sido gravada sob outro conector da
#     mesma organização;
#   * deriva de telefone: a Meta devolve `recipient_id` de celulares brasileiros sem
#     o 9º dígito, e a comparação é igualdade exata de String (ver `BrPhoneVariants`).
class WabaStatusUpdateService
  # Status da Meta → status aceitos na plataforma
  STATUS_MAP = {
    'sent' => 'server_ack',
    'delivered' => 'delivery_ack',
    'read' => 'read',
    'failed' => 'failed',
    'pending' => 'pending'
  }.freeze

  FAILED = 'failed'

  # Ordem de progressão de um envio. Espelha o consumidor Z-API
  # (`RabbitmqConsumerService#messages_update_event`) para que webhooks fora de
  # ordem — que a Meta reentrega com frequência — não regridam o status.
  STATUS_RANK = { 'pending' => 0, 'server_ack' => 1, 'delivery_ack' => 2, 'read' => 3 }.freeze

  # Backoff para o caso em que o webhook chega antes de o envio persistir o wamid.
  RETRY_DELAYS = [5.seconds, 30.seconds, 2.minutes].freeze

  # Um disparo de campanha com erro de conta gera um webhook `failed` por
  # destinatário; sem isto seria um alerta (e um broadcast de badge) por mensagem.
  BILLING_ALERT_TTL = 1.hour

  Result = Struct.new(:code, :message_id, :waba_status, :mapped_status, keyword_init: true)

  def initialize(connector, status, phone_number_id, attempt: 0)
    @connector = connector
    @status = normalize(status)
    @phone_number_id = phone_number_id
    @attempt = attempt.to_i
  end

  def call
    return result(:missing_id) if message_id.blank?
    return result(:unknown_status) if mapped_status.blank?

    # Antes do lookup: um erro de conta/cobrança vale o alerta mesmo que a mensagem
    # específica não seja encontrada. Era exatamente o que se perdia antes — o
    # alerta estava aninhado depois do lookup de conversa, que abortava primeiro.
    notify_account_error
    update_campaign_recipient

    chat_messages = find_chat_messages
    return schedule_retry_or_give_up if chat_messages.nil?
    return result(:ignored_regression) if regression?(chat_messages.status)

    chat_messages.update(update_attrs)
    Rails.logger.info(
      "[WabaStatus] wamid=#{message_id} status='#{mapped_status}' (Meta: '#{waba_status}') " \
      "conversa=#{chat_messages.chat_id}"
    )
    result(:updated)
  end

  private

  attr_reader :connector, :status, :phone_number_id, :attempt

  # Aceita ActionController::Parameters (controller) e Hash de chaves String (Sidekiq).
  def normalize(raw)
    return {}.with_indifferent_access if raw.blank?

    hash = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
    hash.with_indifferent_access
  end

  def message_id
    status[:id]
  end

  def waba_status
    status[:status]
  end

  def recipient_id
    status[:recipient_id]
  end

  def mapped_status
    STATUS_MAP[waba_status]
  end

  def error
    @error ||= Array(status[:errors]).first || {}
  end

  def error_code
    error[:code]
  end

  def meta_details
    error[:message] || error[:title]
  end

  def humanized_error
    return nil if error_code.blank?

    @humanized_error ||= WabaErrorHandler.humanize(error_code, meta_details)
  end

  def update_attrs
    attrs = { status: mapped_status }
    attrs[:status_message] = humanized_error if mapped_status == FAILED && humanized_error.present?
    attrs
  end

  # `failed` é terminal: sempre aplica, e uma vez gravado nada o reverte.
  def regression?(current)
    return false if mapped_status == FAILED
    return true  if current == FAILED
    return false if current.blank?

    STATUS_RANK.fetch(mapped_status, -1) < STATUS_RANK.fetch(current, -1)
  end

  # ── Resolução da mensagem ───────────────────────────────────────────────────

  # Máximo de conversas consideradas para um mesmo número. Na prática são 1 ou 2
  # (uma por integração); o teto existe só para o caso patológico.
  CHAT_CANDIDATE_LIMIT = 20

  # SEMPRE escopado por `chat_id`: buscar por `message_id` sozinho varreria a maior
  # coleção do banco a cada webhook de status.
  #
  # `take` e não `first`: `first` sem sort explícito faz o Mongoid injetar
  # `sort({_id: 1})`, o que reintroduz `IXSCAN(_id)` sobre a coleção inteira como plano.
  def find_chat_messages
    return nil if candidate_chat_ids.empty?

    ChatMessage::Base.unscoped
                        .where(:chat_id.in => candidate_chat_ids, message_id: message_id)
                        .take
  end

  # As duas derivas que quebravam o casamento por conversa, resolvidas sem abrir
  # mão do índice:
  #
  #   * telefone — a Meta devolve `recipient_id` de celular brasileiro sem o 9º
  #     dígito; `BrPhoneVariants` gera as formas equivalentes e o `$in` cobre todas;
  #   * integração — a conversa pode ter sido gravada sob outra integração do mesmo
  #     organization, então há uma segunda tentativa escopada pela conta.
  #
  # A primeira usa `{connector_id: 1, external_id: 1}`; a segunda,
  # `{organization_id: 1, external_id: 1, last_message_at: -1}`.
  # Ambas com prefixo casando, e a segunda só roda quando a primeira não acha nada.
  def candidate_chat_ids
    @candidate_chat_ids ||=
      if phone_variants.empty?
        []
      else
        chat_ids_scoped_by(connector_id: connector.id).presence ||
          chat_ids_scoped_by(organization_id: connector.organization_id)
      end
  end

  def chat_ids_scoped_by(scope)
    Chat.where(scope.merge(:external_id.in => phone_variants))
                .limit(CHAT_CANDIDATE_LIMIT)
                .pluck(:_id)
  end

  def phone_variants
    @phone_variants ||= BrPhoneVariants.call(recipient_id)
  end

  # ── Alerta de conta/cobrança ────────────────────────────────────────────────

  def notify_account_error
    return unless mapped_status == FAILED
    return if error_code.blank?
    return unless WabaErrorHandler.account_billing_error?(error_code)
    return unless claim_billing_alert!

    connector.update(error_message: humanized_error)
    Connectors::Alerts.error(
      connector,
      code: "waba_billing_#{error_code}",
      message: humanized_error,
      metadata: {
        error_code: error_code,
        meta_details: meta_details,
        recipient_id: recipient_id,
        occurred_at: Time.current.iso8601
      }
    )
  rescue StandardError => e
    # Um alerta que falha não pode abortar a atualização do status.
    Rails.logger.error("[WabaStatus] Falha ao alertar erro de conta: #{e.full_message}")
  end

  def claim_billing_alert!
    Rails.cache.write(
      "waba_billing_alert:#{connector.id}:#{error_code}",
      true,
      expires_in: BILLING_ALERT_TTL,
      unless_exist: true
    )
  end

  # ── Outreach::Recipient ─────────────────────────────────────────────────────

  # Roda mesmo quando o ChatMessage não é encontrado: `whatsapp_message_id` tem índice
  # esparso próprio, então é uma busca barata e independente. Um erro aqui não pode abortar
  # a atualização da mensagem.
  def update_campaign_recipient
    Outreach::RecipientStatus.apply(message_id, mapped_status, error_message: humanized_error)
  rescue StandardError => e
    Rails.logger.error("[WabaStatus] Falha ao atualizar Outreach::Recipient: #{e.full_message}")
  end

  # ── Mensagem ainda não persistida ───────────────────────────────────────────

  def schedule_retry_or_give_up
    log_unresolved

    if attempt < RETRY_DELAYS.size
      # `as_json` e não `to_h`: o Sidekiq exige tipos JSON nativos e o `to_h` de um
      # HashWithIndifferentAccess mantém os hashes aninhados (ex.: `errors`) como HWIA.
      WabaStatusRetryJob.set(wait: RETRY_DELAYS[attempt]).perform_later(connector.id.to_s, status.as_json, phone_number_id, attempt + 1
      )
      return result(:retry_scheduled)
    end

    result(:not_found)
  end

  # Diagnóstico de graça: variantes e conversas candidatas já foram resolvidas
  # pelo lookup (memoizadas, por índice). Nenhuma query extra aqui — a versão
  # anterior fazia `Chat.where(:external_id.in => ...)` sem prefixo de
  # índice, um collection scan por status não resolvido só para compor esta linha.
  def log_unresolved
    Rails.logger.warn(
      "[WabaStatus] wamid=#{message_id} sem ChatMessage (tentativa #{attempt}). " \
      "recipient=#{recipient_id} variantes=#{phone_variants.inspect} " \
      "integracao_webhook=#{connector.id} " \
      "conversas_candidatas=#{candidate_chat_ids.map(&:to_s).inspect}"
    )
  end

  def result(code)
    Result.new(code: code, message_id: message_id, waba_status: waba_status, mapped_status: mapped_status)
  end
end

# Webhook: a URL pública `/inbound/webhooks/:uid` e as ações que ela executa (origem: Webhook).
#
#   test      guarda o que chegou, para a pessoa mapear as variáveis, e não executa nada
#   active    executa as ações
#   inactive  só registra no log
class Hook < ApplicationRecord
  include Alertable

  STATUSES = %w[active test inactive].freeze
  SIGNING_SECRET_PREFIX = "whsec_".freeze
  ALERT_CODE = "webhook_delivery_failed".freeze

  # Teto do histórico de capturas do modo teste.
  #
  # `received_payload` é um jsonb na LINHA de configuração do webhook, e jsonb não tem append parcial:
  # cada requisição reescreve a coluna inteira. Sem teto o array cresce para sempre e o custo vira
  # quadrático: a requisição nº N regrava N payloads. Acima de ~2 KB a coluna vai para TOAST, e cada UPDATE
  # passa a ler, descomprimir, recomprimir e regravar o valor completo.
  #
  # Como é sempre a mesma linha, tudo serializa num lock de tupla. Na origem isso chegou a 6 MB e 4589
  # itens: UPDATE de 32 minutos, 61 requisições enfileiradas atrás dele e `max_connections` esgotado.
  #
  # 10 basta para o propósito da coluna: as telas de depuração leem só o último.
  MAX_STORED_PAYLOADS = 10

  belongs_to :organization
  # Saem com o webhook, em cascata no banco: ação não tem callback.
  has_many :hook_actions, -> { order(created_at: :asc, id: :asc) }, class_name: "HookAction::Base", inverse_of: :hook

  # `received_payload` é a coluna pesada: a entrada de webhook não precisa dela.
  scope :light, -> { select(column_names - %w[received_payload]) }
  scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }

  validates :name, presence: true, length: { maximum: 120 }
  validates :status, inclusion: { in: STATUSES }

  before_save :set_slug
  before_validation :set_uid, on: :create

  after_destroy do
    HookLog.where(hook_id: id.to_s).delete_all
    # Sem o webhook, nenhuma entrega resolveria o aviso, e o número do menu ficaria preso.
    resolve_failure_alert!
  end

  def self.scoped(organization_id, id)
    for_organization(organization_id).find_by(id: id)
  end

  def active?
    status == "active"
  end

  def inactive?
    status == "inactive"
  end

  def test?
    status == "test"
  end

  # O último que chegou, como `caminho.do.campo => valor`: é a lista de variáveis que a tela oferece.
  def last_payload_fields
    last = Array(received_payload).last
    last ? Hooks::SlimJsonPath.fetch_all_slim(Hooks::Capture.payload_of(last)) : {}
  end

  # Mantém só as capturas mais recentes. Reatribuir, em vez de `<<`, é deliberado: o array gravado fica
  # sempre limitado.
  def store_capture!(capture)
    update_columns(
      received_payload: Array(self.class.where(id: id).pick(:received_payload)).last(MAX_STORED_PAYLOADS - 1) + [ capture ],
      updated_at: Time.current
    )
  end

  def count_request!
    self.class.where(id: id).update_all("total_request = total_request + 1")
  end

  # ------------------------------------------------------------------------------------------
  # Assinatura HMAC das requisições recebidas.
  #
  # O segredo precisa ser recuperável (o HMAC é recalculado a cada requisição), então fica cifrado e não em
  # hash. Só `enable_signature!` e `rotate_signing_secret!` devolvem o texto puro, e só uma vez: é o que
  # chega à tela. Depois disso, resta renovar.
  # ------------------------------------------------------------------------------------------

  def self.encryptor
    key = Rails.application.key_generator.generate_key("hook_signing_secret", ActiveSupport::MessageEncryptor.key_len)
    ActiveSupport::MessageEncryptor.new(key)
  end

  def self.generate_signing_secret
    "#{SIGNING_SECRET_PREFIX}#{SecureRandom.hex(32)}"
  end

  def signing_secret
    return nil if signing_secret_ciphertext.blank?

    self.class.encryptor.decrypt_and_verify(signing_secret_ciphertext)
  rescue ActiveSupport::MessageEncryptor::InvalidMessage, ActiveSupport::MessageVerifier::InvalidSignature
    nil
  end

  def signing_secret=(value)
    if value.blank?
      self.signing_secret_ciphertext = nil
      self.signing_secret_last_four = nil
    else
      self.signing_secret_ciphertext = self.class.encryptor.encrypt_and_sign(value)
      self.signing_secret_last_four = value.last(4)
    end
  end

  # Só gera credencial na primeira vez: religar preserva a chave que o cliente já configurou do lado dele.
  #
  # @return [String, nil] o texto puro quando uma chave nova foi criada; nil quando a anterior continua
  def enable_signature!
    return rotate_signing_secret! if signing_secret_ciphertext.blank?

    update!(signature_enabled: true)
    nil
  end

  # Único caminho que troca a chave. A anterior é descartada na hora: requisição assinada com ela passa a
  # ser recusada imediatamente.
  def rotate_signing_secret!
    secret = self.class.generate_signing_secret
    self.signing_secret = secret
    self.signature_enabled = true
    self.signing_secret_generated_at = Time.current
    save!
    secret
  end

  # A credencial fica de propósito: desligar e religar a verificação não pode invalidar a chave que o
  # cliente implementou.
  def disable_signature!
    update!(signature_enabled: false)
  end

  # Para a pessoa reconhecer a chave ativa, nunca o segredo inteiro.
  def signing_secret_hint
    return nil if signing_secret_last_four.blank?

    "#{SIGNING_SECRET_PREFIX}#{'•' * 8}#{signing_secret_last_four}"
  end

  # ------------------------------------------------------------------------------------------
  # Alertas. Quem resolve é a próxima entrega que dá certo, ou a pessoa ao salvar o webhook.
  # ------------------------------------------------------------------------------------------

  def alert_failure!(message)
    @alerted = true
    raise_organization_alert!(
      organization: organization,
      category: "webhooks",
      origin_type: "Hook",
      origin_id: id,
      origin_name: name,
      code: ALERT_CODE,
      message: message.to_s.truncate(500),
      metadata: { webhook_uid: uid, failed_at: Time.current.iso8601 }
    )
  end

  def resolve_failure_alert!
    resolve_organization_alert!(organization: organization, origin_type: "Hook", origin_id: id, code: ALERT_CODE)
  end

  # Alguma ação desta rodada falhou? Então a rodada não resolve o alerta que ela mesma levantou.
  def alerted?
    @alerted == true
  end

  private

  def set_uid
    self.uid ||= SecureRandom.alphanumeric(24)
  end

  def set_slug
    self.slug = name.to_s.parameterize
  end
end

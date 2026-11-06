module ChatMessage
  # A mensagem de uma conversa (origem: MessageHistory::Base). É a maior coleção da
  # plataforma: nunca busque só por id, escope por `chat_id`
  # (`ChatMessage::Base.unscoped.where(chat_id: chat.id, id: id).take`).
  class Base
    include Mongoid::Document
    include Mongoid::Timestamps

    attr_accessor :ignore_events

    # Opt-out do sync de last_message_* em Chat (ver #sync_chat_last_message).
    # Usado por fluxos que gerenciam last_message_at de propósito (ex.: mensagem "silenciosa").
    attr_accessor :skip_chat_sync

    ROLES = %w[user assistant system tool function base].freeze
    REAL_ROLES = %w[user assistant].freeze

    # O papel da mensagem:
    #  - user: do contato
    #  - assistant: do nosso lado (operador, fluxo, campanha)
    #  - system: contexto para a IA (ex.: cartão de contexto do widget)
    #  - base: nota do histórico, fora do contexto da IA (atribuição, pausa, anúncio...)
    #  - tool / function: chamadas de ferramenta dos blocos de IA dos fluxos
    field :role, type: String
    field :role_base_type, type: String

    field :content, type: String, default: "" # texto da mensagem
    field :name, type: String # só para tool
    field :message_id, type: String # id no provedor
    field :active, type: Boolean
    field :has_span, type: Boolean, default: false
    field :is_span, type: Boolean, default: false

    belongs_to :chat, class_name: "Chat"

    field :args, type: Hash, default: {}

    field :tool_calls, type: Array # só com role assistant
    field :tool_call_id, type: String # só com role tool
    field :message_origin, type: String, default: "platform"

    # Sem default de propósito: nesta coleção um campo a mais em todo documento pesa.
    field :usage_prompt_tokens, type: Integer
    field :usage_completion_tokens, type: Integer
    field :usage_cached_tokens, type: Integer
    field :usage_model, type: String

    field :sender_name, type: String
    # Conta (Postgres) que originou a mensagem pela plataforma. Só em mensagem de operador.
    field :account_id, type: String
    field :context_message, type: Hash
    field :extended_text_message, type: Hash, default: {}
    # Metadados do anúncio Click-to-WhatsApp. Só nas notas 'instagram-ad-greeting';
    # é daqui que a tela monta o cartão do anúncio.
    field :external_ad_reply, type: Hash
    field :status, type: String
    field :original_created_at, type: Time, default: -> { Time.now }
    field :status_message, type: String

    # Apagada para todos: a tela mostra "Mensagem apagada" no lugar do conteúdo.
    field :deleted_at, type: Time

    # Com deleted_at: 'everyone' (propagada ao contato). Apagar só para mim remove o
    # documento, então este campo nunca vale 'me' na prática.
    field :deleted_scope, type: String

    # Quando esta mensagem responde a outra: o id Mongo da citada. O id externo é
    # resolvido na hora do envio (Chats::SendOperatorMessage); a tela usa este id para
    # montar o bloco de citação a partir da lista já carregada.
    field :reply_to_message_id, type: String

    # A mensagem ainda não chegou inteira do WhatsApp Web ("Aguardando mensagem").
    field :missing_message, type: Boolean

    # Reações estilo WhatsApp. Numa conversa 1:1 cada lado tem no máximo UMA reação por
    # mensagem: trocar de emoji substitui a entrada daquele lado e remover (texto vazio
    # no evento, ou emoji em branco no envio) apaga a entrada. Formato de cada item:
    #   { 'emoji' => '👍', 'from' => 'user' | 'assistant',
    #     'sender_name' => String, 'account_id' => String, 'reacted_at' => Time }
    field :reactions, type: Array, default: []

    # Campanha que originou a mensagem. Campo solto: `Outreach::Campaign` é de outro domínio.
    field :campaign_id, type: String

    # Anexo escolhido pela pessoa (`Attachment`, domínio inbox).
    field :attachment_id, type: String
    # Blob do Active Storage que pertence só a esta mensagem (mídia recebida).
    # Apagar a mensagem apaga o arquivo; ver Media::Storage.
    field :media_blob_id, type: String

    validates :role, inclusion: { in: ROLES }

    default_scope -> { where(active: true, is_span: false).where.not(role: "base") }

    index({ chat_id: 1 })
    index({ created_at: 1 })
    index({ campaign_id: 1 }, { sparse: true })
    # Composto: histórico da conversa em ordem.
    index({ chat_id: 1, created_at: -1 })
    # Esparso: só mensagem de operador tem account_id. Serve "mensagens do operador X no
    # período" sem passar pelo join com chats.
    index({ account_id: 1, created_at: -1 }, { sparse: true })
    # Id externo dentro da conversa: alvo de reação, citação e reconciliação de status.
    index({ chat_id: 1, message_id: 1 }, { sparse: true })

    # Assim a lista enxerga as partes de uma mensagem dividida, e nunca a mensagem
    # inteira que as originou: has_span marca a original, is_span cada parte.
    scope :list_for_chat, lambda {
      where(
        has_span: false,
        is_span: false
      ).where.or(
        is_span: true,
        has_span: false
      )
    }

    # O que a pessoa vê na conversa: não mostra chamada de ferramenta.
    scope :visible, -> { list_for_chat.where(:role.nin => %w[tool function], tool_calls: nil) }

    scope :ia, -> { where(message_origin: "platform", role: "assistant") }
    scope :human, -> { where(role_base_type: "human") }
    scope :within_range, ->(range) { where(:created_at.gte => range.first, :created_at.lt => range.last) }

    before_create { self.active = true unless active.nil? }
    after_create :broadcast_created

    before_update :broadcast_changes

    # Mantém os campos denormalizados de last_message_* do Chat em sincronia sempre que
    # uma mensagem real (user/assistant) entra no banco, de forma resiliente à sobrescrita
    # por instância em memória desatualizada. Ver #sync_chat_last_message.
    after_create :sync_chat_last_message

    # Reabre a conversa quando o contato manda mensagem numa conversa fechada, se a
    # organização habilitou. Ver #reopen_chat_if_enabled.
    after_create :reopen_chat_if_enabled

    after_destroy :purge_media_blob

    def deleted?
      deleted_at.present?
    end

    def type_element
      _type
    rescue StandardError
      nil
    end

    # Calcula a nova lista de reações substituindo a entrada de `from`. Numa conversa 1:1
    # do WhatsApp cada lado tem no máximo uma reação por mensagem, então trocar o emoji
    # sobrescreve a anterior e um emoji em branco remove.
    #
    # Não persiste: o caller decide (`update(reactions: ...)`), o que mantém a
    # transmissão do before_update num único ponto.
    #
    # @param emoji [String] emoji único, ou vazio para remover
    # @param from [String] 'user' (contato) ou 'assistant' (nosso lado)
    # @return [Array<Hash>]
    def apply_reaction(emoji, from:, sender_name: nil, account_id: nil)
      author = from.to_s
      remaining = Array(reactions).reject { |entry| (entry["from"] || entry[:from]).to_s == author }
      return remaining if emoji.blank?

      remaining + [ {
        "emoji" => emoji,
        "from" => author,
        "sender_name" => sender_name,
        "account_id" => account_id,
        "reacted_at" => Time.current
      }.compact ]
    end

    # O stream único da conversa. Na origem havia dois (_super e _user), para o super_user
    # ver as notas de depuração da IA em tempo real; aqui não há super_user.
    def self.stream_for(chat)
      ApplicationCable::Channel.organization_stream(chat.organization_id, "chat:#{chat.id}")
    end

    private

    def broadcast_created
      return if ignore_events
      # Partes (is_span) saem no lugar da original (has_span), que nunca aparece na lista.
      return if has_span
      return unless broadcast_role?

      broadcast_message
    end

    def broadcast_changes
      return if ignore_events
      return unless status_changed? || deleted_at_changed? || reactions_changed?

      broadcast_message
    end

    # Ferramentas e contexto da IA ficam de fora. A exceção é o cartão de contexto do
    # widget, que a pessoa precisa ver.
    def broadcast_role?
      REAL_ROLES.include?(role) || role == "base" || message_origin == "widget_context"
    end

    def broadcast_message
      ActionCable.server.broadcast(self.class.stream_for(chat), ChatMessageSerializer.one(self))
    end

    # Atualiza last_message_at/type/by/content do Chat a partir desta mensagem. Usa a mesma
    # regra de seleção de Chat#update_last_message (só role user/assistant), ignorando
    # notas (role base/tool/system/function) e fragmentos.
    #
    # Persiste com `set` (atomic $set): grava direto no Mongo, atualiza a instância em
    # memória e limpa o dirty-tracking apenas desses 4 campos. Como a mensagem normalmente é
    # criada via `chat: record`, `chat` é a MESMA instância que o caller segura, então um
    # `record.save` posterior não reescreve esses campos com valores velhos.
    def sync_chat_last_message
      return if ignore_events || skip_chat_sync
      return if is_span || tool_calls.present?
      return unless REAL_ROLES.include?(role)
      # type_element de um Base cru vira o nome da classe; a lista garante um tipo válido.
      return unless %w[text media image audio].include?(type_element)

      target = chat
      return if target.nil? || !target.persisted?

      message_time = created_at
      # Só avança: nunca move a chave de ordenação para trás (protege inserts com data antiga).
      return if target.last_message_at.present? && message_time.to_time < target.last_message_at.to_time

      target.set(
        last_message_at: message_time,
        last_message_type: type_element,
        last_message_content: content,
        last_message_by: role
      )

      # `set` não dispara after_update; emite o evento de reordenação para a lista da
      # tela atualizar em tempo real.
      target.dispatch_event! unless target.ignore_events
    end

    # Volta a conversa para 'open' quando o contato escreve numa conversa fechada e a
    # organização habilitou `reopen_conversation_on_inbound_enabled`. Cobre todos os canais
    # de entrada de uma vez, inclusive as mídias, que criam a mensagem dentro dos jobs.
    #
    # Callback separado de #sync_chat_last_message de propósito: aquele método tem um guard
    # "só avança" que retorna cedo quando `created_at` da mensagem é anterior a
    # `chat.last_message_at`, caso comum na Evolution, que grava a mensagem com o timestamp
    # do provedor depois de já ter atualizado last_message_at.
    def reopen_chat_if_enabled
      return if ignore_events || skip_chat_sync
      return if is_span || tool_calls.present?
      return unless role == "user" # só mensagem recebida do contato

      target = chat
      return if target.nil? || !target.persisted?
      # Checagem em memória primeiro: só conversa fechada paga a consulta do flag.
      return unless target.status == "closed"
      return unless Organization.reopen_on_inbound_enabled?(target.organization_id)

      target.set(status: "open")
      target.dispatch_event! unless target.ignore_events
    end

    def purge_media_blob
      Media::Storage.purge(media_blob_id)
    end
  end
end

module Ai
  # Uma geração, do crédito ao último byte.
  #
  # A regra do dinheiro em um lugar só: **reserva antes**, porque o cliente não
  # pode descobrir no fim que não tinha saldo; **estorna** se nada útil saiu.
  # Conteúdo entregue é cobrado, mesmo que a pessoa cancele no meio — ela ficou
  # com os cards.
  class Run
    # Uma geração em voo por organização. Não é preciosismo: cada stream aberto
    # segura uma thread do Puma, e são dez no total em produção. Dez gerações
    # simultâneas travariam a API inteira, inclusive para quem só quer entrar.
    BUSY_TTL = 5.minutes

    class Busy < StandardError; end

    def initialize(organization, cost:, chat: Chat.new)
      @organization = organization
      @cost = cost
      @chat = chat
      @delivered = false
      @charged = false
    end

    attr_reader :chat

    # Marca que o cliente já recebeu algo de valor — daqui em diante não se
    # estorna.
    def delivered!
      @delivered = true
    end

    def credits
      CreditsSerializer.one(@organization.reload)
    end

    # Roda a geração inteira. Devolve o que o bloco devolver.
    #
    # Levanta `Organization::NoCreditsError` **antes** de qualquer escrita, para
    # o controlador ainda poder responder com status HTTP de verdade.
    def call
      claim_slot!
      @organization.reserve_credits!(@cost)
      @charged = true

      begin
        yield self
      rescue StandardError
        refund_unless_delivered
        raise
      end
    ensure
      release_slot
    end

    def refund_unless_delivered
      return if @delivered || !@charged

      @organization.refund_credits!(@cost)
      @charged = false
    end

    private

    def claim_slot!
      raise Busy unless Rails.cache.write(slot_key, true, expires_in: BUSY_TTL, unless_exist: true)
    end

    def release_slot
      Rails.cache.delete(slot_key)
    end

    def slot_key = "ai:running:#{@organization.id}"
  end
end

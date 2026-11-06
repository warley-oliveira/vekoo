module Funnels
  # Põe uma conversa numa etapa do funil, ou a tira dele. É o único caminho de escrita da posição: a
  # tela chama por `PUT /funnels/:id/chats/:chatId`, e um bloco de fluxo deve chamar daqui:
  #
  #   funnel = chat.organization.funnels.find(funnel_id)
  #   Funnels::MoveChat.call(chat: chat, funnel: funnel, stage_id: stage_id) # nil tira do funil
  #
  # Quem decide se a pessoa pode ver a conversa é quem chama (`Chat.visible_to`): um fluxo não age em
  # nome de ninguém. A etapa e o funil são sempre conferidos aqui, para um id guardado não colocar a
  # conversa em etapa de outro funil ou de outra organização.
  #
  # Mover para onde já está não escreve nem transmite: o fluxo pode passar pelo mesmo bloco várias vezes.
  class MoveChat
    class InvalidStage < StandardError; end
    class ForeignFunnel < StandardError; end

    Result = Struct.new(:chat, :stage, :moved, keyword_init: true) do
      alias_method :moved?, :moved
    end

    def self.call(chat:, funnel:, stage_id:)
      new(chat, funnel, stage_id).call
    end

    def initialize(chat, funnel, stage_id)
      @chat = chat
      @funnel = funnel
      @stage_id = stage_id.presence&.to_s
    end

    # @return [Result]
    # @raise [InvalidStage] a etapa não é deste funil
    # @raise [ForeignFunnel] o funil é de outra organização
    def call
      raise ForeignFunnel if funnel.organization_id.to_s != chat.organization_id.to_s

      stage = stage_id && funnel.stages.find_by(id: stage_id)
      raise InvalidStage if stage_id && stage.nil?

      return Result.new(chat: chat, stage: stage, moved: false) if chat.funnel_stage_id(funnel.id) == stage_id

      stage ? chat.place_in_funnel!(funnel.id, stage.id) : chat.remove_from_funnel!(funnel.id)
      # A escrita atômica não passa pelos callbacks: a lista conectada fica sabendo por aqui.
      chat.dispatch_event!

      Result.new(chat: chat, stage: stage, moved: true)
    end

    private

    attr_reader :chat, :funnel, :stage_id
  end
end

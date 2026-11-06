# O modelo de mentira das specs do copiloto: responde o roteiro que mandarmos, sem tocar a rede.
module CopilotHelpers
  FakeMessage = Struct.new(:stop_reason, :content, keyword_init: true)
  FakeText = Struct.new(:text) do
    def type = :text
  end
  FakeToolUse = Struct.new(:id, :name, :input) do
    def type = :tool_use
  end
  FakeBlock = Struct.new(:type)

  def text_response(text, stop_reason: :end_turn)
    FakeMessage.new(stop_reason: stop_reason, content: [ FakeText.new(text) ])
  end

  def tool_response(name, input = {}, id: "toolu_#{SecureRandom.hex(4)}", text: nil)
    blocks = []
    blocks << FakeText.new(text) if text
    blocks << FakeToolUse.new(id, name, input)
    FakeMessage.new(stop_reason: :tool_use, content: blocks)
  end

  # Um Ai::Chat que entrega o texto em pedaços e devolve cada resposta do roteiro, na ordem.
  # `seen` guarda o que o agente mandou em cada rodada.
  def scripted_chat(*responses, complete: "resposta curta")
    seen = []

    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:converse) do |**arguments, &block|
        seen << arguments.merge(messages: arguments[:messages].dup)
        response = responses.shift || raise("o roteiro do modelo acabou")
        raise response if response.is_a?(Exception)

        response.content.each { |entry| block&.call(entry.text) if entry.type == :text }
        response
      end
      allow(chat).to receive(:complete).and_return(complete)
      chat.define_singleton_method(:seen) { seen }
    end
  end
end

RSpec.configure do |config|
  config.include CopilotHelpers
end

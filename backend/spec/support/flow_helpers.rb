# Atalhos das specs de fluxo: uma definição enxuta, publicada, e um `Ai::Chat` de mentira que responde o roteiro.
module FlowHelpers
  FakeMessage = Struct.new(:stop_reason, :content, keyword_init: true)
  FakeText = Struct.new(:text) do
    def type = :text
  end
  FakeToolUse = Struct.new(:id, :name, :input) do
    def type = :tool_use
  end

  def node(id, type, data = {})
    { "id" => id, "type" => type, "position" => { "x" => 0, "y" => 0 }, "data" => data.deep_stringify_keys }
  end

  def edge(source, target, handle = nil)
    { "id" => "#{source}-#{target}-#{handle}", "source" => source, "target" => target, "sourceHandle" => handle }.compact
  end

  # @example published_flow(organization, [node("t", "trigger_manual"), node("a", "send_text", text: "oi")], [edge("t", "a")])
  def published_flow(organization, nodes, edges = [], trigger_type: "manual", **definition_extra)
    flow = create(:flow, organization: organization, trigger_type: trigger_type)
    version = flow.versions.create!(
      version_number: 1,
      definition: { "nodes" => nodes, "edges" => edges, "viewport" => {} }.merge(definition_extra.deep_stringify_keys)
    )
    flow.update!(status: "published", published_version: version)
    flow
  end

  # Um canal de verdade, com o envio do provedor por WebMock. Guarda o texto de cada envio em `sent_texts`.
  def stub_flow_channel(connector)
    @sent_texts = []
    stub_request(:post, "http://evolution.test/message/sendText/#{connector.instance_name}").to_return do |request|
      @sent_texts << JSON.parse(request.body)["text"]
      { status: 201, body: { key: { id: "SENT-#{@sent_texts.length}" } }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  attr_reader :sent_texts

  def llm_text(text, stop_reason: :end_turn)
    FakeMessage.new(stop_reason: stop_reason, content: [ FakeText.new(text) ])
  end

  def llm_json(hash)
    llm_text(hash.to_json)
  end

  def llm_tool(name, input = {}, id: "toolu_#{SecureRandom.hex(4)}")
    FakeMessage.new(stop_reason: :tool_use, content: [ FakeToolUse.new(id, name, input) ])
  end

  # Cada chamada a `Ai::Chat#respond` devolve a próxima do roteiro. `seen` guarda os argumentos.
  def script_llm(*responses)
    seen = []
    chat = instance_double(Ai::Chat)

    allow(chat).to receive(:respond) do |**arguments|
      seen << arguments.merge(messages: arguments[:messages].dup)
      response = responses.shift || raise("o roteiro do modelo acabou")
      raise response if response.is_a?(Exception)

      response
    end
    allow(Ai::Chat).to receive(:new).and_return(chat)
    chat.define_singleton_method(:seen) { seen }
    chat
  end

  def run_flow(flow, chat: nil, message: nil, playground: false, variables: {})
    FlowRuntime::Engine.start(
      flow: flow,
      chat: chat,
      last_message: message && FlowRuntime::InboundMessage.new(message),
      playground: playground,
      variables: variables
    )
  end

  def resume_flow(execution, message)
    FlowRuntime::Engine.resume(execution, last_message: FlowRuntime::InboundMessage.new(message))
  end

  def log_of(execution, node_id)
    execution.logs.reload.find { |log| log.node_id == node_id }
  end
end

RSpec.configure do |config|
  config.include FlowHelpers
end

# frozen_string_literal: true

require "rails_helper"

# Um domínio acrescenta a própria extensão criando um arquivo em
# lib/mini_racer_engine/workers/, sem editar o núcleo. É isso que estes exemplos travam: duas
# frentes em worktrees separados não podem disputar o mesmo arquivo.
RSpec.describe "MiniRacerEngine: extensões" do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }
  let(:session) { script_session(organization: organization, chat: chat) }
  let(:worker) { MiniRacerEngine::Worker.new(session) }

  # O mesmo exemplo de docs/migration/api/script-engine.md: se ele mudar lá, muda aqui.
  let(:extension) do
    Class.new(MiniRacerEngine::EngineModule) do
      def register(worker, context, event)
        @worker = worker
        context.attach("exemplo.cumprimentar", proc { |*params| attach_method(method(:cumprimentar), params, event) })
        context.attach("exemplo.contarConversas", proc { |*params| attach_method(method(:contar_conversas), params, event) })
      end

      def bootstrap_js
        <<~JS
          globalThis.exemplo.gritar = function (nome) {
            return exemplo.cumprimentar(nome).mensagem.toUpperCase();
          };
        JS
      end

      private

      def cumprimentar(params)
        { mensagem: "Olá, #{params[0]}", organizacao: organization_id, conversa: chat&.id&.to_s }
      end

      def contar_conversas(_params)
        require_organization!
        { data: Chat.for_organization(organization_id).count, ok: true }
      end
    end
  end

  before do
    stub_const("MiniRacerEngine::Workers::Exemplo", extension)
    allow(MiniRacerEngine::Worker).to receive(:extension_files).and_wrap_original do |original|
      original.call + [ "/qualquer/caminho/workers/exemplo.rb" ]
    end
  end

  it "um arquivo em workers/ basta: o script enxerga a API, sem tocar no núcleo" do
    result = worker.perform("return exemplo.cumprimentar('Ana');").result

    expect(result).to eq("mensagem" => "Olá, Ana", "organizacao" => organization.id, "conversa" => chat.id.to_s)
  end

  it "a extensão acrescenta JavaScript sobre as funções dela" do
    expect(worker.perform("return exemplo.gritar('Ana');").result).to eq("OLÁ, ANA")
  end

  it "os dados saem do contexto da execução" do
    create(:chat, organization: organization)
    create(:chat, organization: create(:organization))
    chat

    expect(worker.perform("return exemplo.contarConversas();").result).to eq("data" => 2, "ok" => true)
  end

  it "ganha o evento e a cota de graça" do
    events = []
    worker.on_event { |name, payload| events << [ name, payload ] }

    worker.perform("exemplo.cumprimentar('Ana');")

    expect(events.first.first).to eq(:cumprimentar)
    expect(events.first.last).to include(input: [ "Ana" ])

    stub_const("MiniRacerEngine::Limits::MAX_CALLS", 1)
    expect { worker.perform("exemplo.cumprimentar('a'); exemplo.cumprimentar('b');") }
      .to raise_error(MiniRacer::RuntimeError, /limit of 1 calls/)
  end

  it "sem organização, require_organization! falha fechado" do
    expect { MiniRacerEngine::Worker.new(script_session).perform("return exemplo.contarConversas();") }
      .to raise_error(MiniRacer::RuntimeError, /No organization in context/)
  end

  describe "descoberta" do
    it "acha toda extensão que está na pasta, sem lista fixa" do
      allow(MiniRacerEngine::Worker).to receive(:extension_files).and_call_original

      names = Dir[Rails.root.join("lib/mini_racer_engine/workers/*.rb")].map { |path| File.basename(path, ".rb") }
      modules = MiniRacerEngine::Worker.registered_modules

      expect(modules.map { |extension| extension.name.demodulize.underscore }).to match_array(names)
      expect(modules).to all(be < MiniRacerEngine::EngineModule)
      expect(names).to include(*%w[catalog console contact contact_storage dynamic_table fetch maps tag web_apis])
    end

    it "carrega sempre na mesma ordem" do
      allow(MiniRacerEngine::Worker).to receive(:extension_files).and_return(%w[/w/tag.rb /w/console.rb])

      expect(MiniRacerEngine::Worker.registered_modules)
        .to eq([ MiniRacerEngine::Workers::Console, MiniRacerEngine::Workers::Tag ])
    end

    it "arquivo que não é extensão é erro de programa, não uma extensão a menos" do
      stub_const("MiniRacerEngine::Workers::NaoEExtensao", Class.new)
      allow(MiniRacerEngine::Worker).to receive(:extension_files).and_return(%w[/w/nao_e_extensao.rb])

      expect { MiniRacerEngine::Worker.registered_modules }.to raise_error(TypeError, /EngineModule/)
    end

    it "o núcleo não cita extensão nenhuma" do
      core = Rails.root.join("lib/mini_racer_engine/worker.rb").read

      expect(core).not_to match(/Workers::(Fetch|Console|Tag|Catalog|Contact|DynamicTable|Maps|WebApis)\b/)
    end
  end

  # A origem chamava o `kanban.rb` também sem V8 (`FlowRuntime::KanbanGateway`).
  describe "extensão chamada direto, sem V8" do
    it "attach_method funciona sem execução em andamento" do
      instance = extension.new
      instance.instance_variable_set(:@worker, worker)

      expect(instance.attach_method(instance.method(:cumprimentar), [ "Ana" ]))
        .to include("mensagem" => "Olá, Ana", "organizacao" => organization.id)
    end
  end

  it "quem esquece de implementar register fica sabendo" do
    expect { MiniRacerEngine::EngineModule.new.register(nil, nil, nil) }.to raise_error(NotImplementedError)
  end
end

# A pasta legada `legacy_assistant` não pode voltar: é o critério de "arquivo portado".
RSpec.describe "MiniRacerEngine: assistente fora" do
  it "nenhum arquivo do motor cita o assistente" do
    files = Dir[Rails.root.join("lib/mini_racer_engine/**/*.rb")] + [
      Rails.root.join("lib/mini_racer_engine.rb").to_s,
      Rails.root.join("app/services/mini_racer_service.rb").to_s,
      Rails.root.join("app/models/dynamic_table.rb").to_s,
      Rails.root.join("app/models/dynamic_record.rb").to_s
    ]

    offenders = files.select { |path| File.read(path).match?(/legacy_assistant|LegacyAssistant|LegacyUserAccess|Admin::/) }

    expect(offenders).to be_empty
  end
end

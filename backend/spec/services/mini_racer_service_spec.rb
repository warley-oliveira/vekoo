# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerService do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, user_name: "Maria Souza") }

  describe "#run" do
    it "roda com a organização e a conversa no contexto" do
      response = described_class.new(organization, chat).run("return getContactInfo().name + '/' + params.a;", { a: 1 })

      expect(response).to be_a(MiniRacerEngine::Response)
      expect(response.result).to eq("Maria Souza/1")
    end

    it "funciona sem conversa, para o que não precisa dela" do
      expect(described_class.new(organization).run("return 1 + 1;").result).to eq(2)
    end

    it "sem conversa, o que precisa dela diz isso" do
      expect { described_class.new(organization).run("return getContactInfo();") }
        .to raise_error(MiniRacer::RuntimeError, /No chat in context/)
    end

    it "repassa credenciais" do
      service = described_class.new(organization, credentials: { "token" => "abc" })

      expect(service.run("return credentials.token;").result).to eq("abc")
    end

    it "repassa os eventos" do
      events = []

      described_class.new(organization).run("console.log('oi');") { |name, payload| events << [ name, payload ] }

      expect(events.first.first).to eq(:console_log)
      expect(events.first.last).to include(input: [ "oi" ])
    end

    it "repassa os limites" do
      expect { described_class.new(organization).run("while (true) {}", timeout_ms: 50) }
        .to raise_error(MiniRacer::ScriptTerminatedError)
      expect { described_class.new(organization).run("const a = []; while (true) a.push(new Array(1000));", max_memory: 16.megabytes) }
        .to raise_error(MiniRacer::V8OutOfMemoryError)
    end

    it "repassa track_caller" do
      lines = []

      described_class.new(organization, chat).run("\ngetContactInfo();", track_caller: true) { |_, payload| lines << payload[:caller_line] }

      expect(lines).to eq([ 2 ])
    end

    it "cada execução começa do zero" do
      service = described_class.new(organization)
      service.run("globalThis.x = 1;")

      expect(service.run("return typeof x;").result).to eq("undefined")
    end
  end

  describe "isolamento" do
    it "recusa conversa de outra organização antes de qualquer JavaScript" do
      foreign = create(:chat, organization: create(:organization))

      expect { described_class.new(organization, foreign) }.to raise_error(MiniRacerEngine::Error, /does not belong/)
    end

    it "organização é obrigatória" do
      expect { described_class.new(nil) }.to raise_error(ArgumentError)
    end
  end
end

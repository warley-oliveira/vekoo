# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::ContactStorage do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }

  def run(code, on_chat: chat)
    run_script(code, organization: organization, chat: on_chat)
  end

  { "contactStorage" => :contact_storage, "contactAttribute" => :custom_attributes }.each do |api, field|
    describe api do
      it "guarda e lê de volta, na mesma execução e na seguinte" do
        expect(run("#{api}.setItem('cor', 'azul'); return #{api}.getItem('cor');")).to eq("azul")
        expect(run("return #{api}.getItem('cor');")).to eq("azul")
        expect(chat.reload.public_send(field)).to include("cor" => "azul")
      end

      it "normaliza a chave" do
        run("#{api}.setItem('Cor Preferida!', 'azul');")

        expect(chat.reload.public_send(field)).to eq("cor_preferida" => "azul")
        expect(run("return #{api}.getItem('COR-PREFERIDA');")).to eq("azul")
      end

      it "guarda qualquer dado de JSON" do
        expect(run("#{api}.setItem('o', { a: [1, { b: true }], c: null }); return #{api}.getItem('o');"))
          .to eq("a" => [ 1, { "b" => true } ], "c" => nil)
      end

      it "sem chave não faz nada" do
        expect(run("return [#{api}.getItem(), #{api}.setItem()];")).to eq([ nil, nil ])
      end

      it "chave que não sobra nada depois de normalizar é erro" do
        expect { run("#{api}.setItem('!!!', 1);") }.to raise_error(MiniRacer::RuntimeError, /Invalid key/)
      end

      it "aceita chave que não é texto" do
        expect(run("#{api}.setItem(123, 'a'); return #{api}.getItem(123);")).to eq("a")
      end

      # `.` e `$` numa chave virariam caminho e operador no `$set`.
      it "a chave não vira caminho nem operador do Mongo" do
        run("#{api}.setItem('a.b', 1); #{api}.setItem('$set', 2);")

        expect(chat.reload.public_send(field)).to eq("a_b" => 1, "set" => 2)
      end

      it "texto em bytes inválidos não derruba" do
        expect(run("#{api}.setItem('t', '\\uD83D'); return typeof #{api}.getItem('t');")).to eq("string")
      end

      it "recusa valor grande demais, sem gravar" do
        stub_const("#{described_class}::MAX_VALUE_BYTES", 10)

        expect { run("#{api}.setItem('t', 'x'.repeat(50));") }.to raise_error(MiniRacer::RuntimeError, /too large/)
        expect(chat.reload.public_send(field)).to be_empty
      end

      it "recusa chave nova além do teto, mas deixa atualizar as que existem" do
        stub_const("#{described_class}::MAX_KEYS", 1)
        run("#{api}.setItem('a', 1);")

        expect { run("#{api}.setItem('b', 1);") }.to raise_error(MiniRacer::RuntimeError, /Too many keys/)
        expect(run("#{api}.setItem('a', 2); return #{api}.getItem('a');")).to eq(2)
      end

      it "conta na cota de bytes da execução" do
        stub_const("MiniRacerEngine::Limits::MAX_STORED_BYTES", 10)

        expect { run("for (let i = 0; i < 5; i++) #{api}.setItem('k' + i, 'xxxxxx');") }
          .to raise_error(MiniRacer::RuntimeError, /stored bytes/)
      end

      # `save!` gravaria o mapa inteiro, e apagaria o que o outro escreveu.
      it "duas execuções na mesma conversa não apagam a chave uma da outra" do
        stale = Chat.scoped(organization.id, chat.id)
        stale.public_send(field) # já leu o mapa, antes de a outra escrever

        run("#{api}.setItem('de_quem_chegou_antes', 1);")
        run_script("#{api}.setItem('de_quem_leu_antes', 2);", organization: organization, chat: stale)

        expect(chat.reload.public_send(field)).to eq("de_quem_chegou_antes" => 1, "de_quem_leu_antes" => 2)
      end

      it "um save! depois, na mesma execução, não reescreve o mapa" do
        stale = Chat.scoped(organization.id, chat.id)
        stale.public_send(field)
        run("#{api}.setItem('da_outra', 1);")

        run_script("#{api}.setItem('minha', 2); disableAutomation();", organization: organization, chat: stale)

        expect(chat.reload.public_send(field)).to eq("da_outra" => 1, "minha" => 2)
      end

      it "só escreve na conversa do contexto" do
        other = create(:chat, organization: organization)

        run("#{api}.setItem('a', 1);")

        expect(other.reload.public_send(field)).to be_empty
      end

      it "sem conversa, diz isso" do
        expect { run_script("#{api}.setItem('a', 1);", organization: organization) }
          .to raise_error(MiniRacer::RuntimeError, /No chat in context/)
      end
    end
  end

  describe "tela" do
    # Os campos personalizados aparecem na lista de conversas; o `contactStorage` não.
    it "avisa a lista quando muda campo personalizado" do
      chat
      allow(ActionCable.server).to receive(:broadcast).and_call_original

      run("contactAttribute.setItem('cor', 'azul');")

      expect(ActionCable.server).to have_received(:broadcast)
        .with(a_string_matching(/chat-list/), hash_including(action: :upsert, event: hash_including(customAttributes: { "cor" => "azul" })))
        .at_least(:once)
    end

    it "não avisa por causa do contactStorage" do
      chat
      allow(ActionCable.server).to receive(:broadcast).and_call_original

      run("contactStorage.setItem('cor', 'azul');")

      expect(ActionCable.server).not_to have_received(:broadcast)
    end
  end

  describe "enableAutomation e disableAutomation" do
    it "liga e desliga a automação da conversa" do
      run("disableAutomation();")
      expect(chat.reload.automation_enabled).to be(false)

      run("enableAutomation();", on_chat: chat.reload)
      expect(chat.reload.automation_enabled).to be(true)
    end

    it "deixa a nota no histórico, como mudar pela tela" do
      expect { run("disableAutomation();") }
        .to change { ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").count }.by(1)
    end

    it "sem conversa, diz isso" do
      expect { run_script("enableAutomation();", organization: organization) }
        .to raise_error(MiniRacer::RuntimeError, /No chat in context/)
    end
  end
end

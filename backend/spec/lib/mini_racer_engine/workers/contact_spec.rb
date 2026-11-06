# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Contact do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, external_id: "5531999990000@whatsapp", user_name: "Maria Souza") }

  def run(code)
    run_script(code, organization: organization, chat: chat)
  end

  describe "getContactInfo" do
    it "devolve quem é o contato da conversa, sem o sufixo do provedor" do
      expect(run("return getContactInfo();")).to eq(
        "id" => chat.id.to_s, "name" => "Maria Souza", "external_id" => "5531999990000", "phone_number" => "5531999990000"
      )
    end

    it "sem conversa, diz isso" do
      expect { run_script("return getContactInfo();", organization: organization) }
        .to raise_error(MiniRacer::RuntimeError, /No chat in context/)
    end

    it "só enxerga a conversa do contexto" do
      other = create(:chat, organization: organization, user_name: "Outra Pessoa")

      expect(run("return getContactInfo('#{other.id}').name;")).to eq("Maria Souza")
    end
  end

  # Mexiam em follow-up e etapa do assistente, que não existem aqui.
  describe "setFupEnabled e setStepperStage" do
    it "continuam existindo, dizem que não fazem nada e não derrubam o script" do
      result = run("return [setFupEnabled(false), setStepperStage(2)];")

      expect(result).to all(include("success" => false, "error" => /Not supported/))
    end

    it "não mexem na conversa" do
      attributes = chat.reload.attributes.except("updated_at")

      run("setFupEnabled(true); setStepperStage(3);")

      expect(chat.reload.attributes.except("updated_at")).to eq(attributes)
    end
  end
end

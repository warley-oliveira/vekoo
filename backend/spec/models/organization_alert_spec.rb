require "rails_helper"

RSpec.describe OrganizationAlert, type: :model do
  let(:organization) { create(:organization) }

  def raise_alert(**overrides)
    described_class.raise_alert!(
      organization,
      **{ category: "connectors", origin_type: "Connector", origin_id: "1", code: "connector_disconnected" }.merge(overrides)
    )
  end

  describe "validações" do
    it { is_expected.to validate_presence_of(:category) }
    it { is_expected.to validate_presence_of(:origin_type) }
    it { is_expected.to validate_presence_of(:origin_id) }
    it { is_expected.to validate_presence_of(:code) }
    it { is_expected.to validate_inclusion_of(:severity).in_array(%w[error warning info]) }
  end

  describe ".raise_alert!" do
    it "cria o alerta com severidade de erro por padrão" do
      alert = raise_alert(origin_name: "WhatsApp da loja", metadata: { motivo: "sessão caiu" })

      expect(alert).to be_persisted
      expect(alert).to have_attributes(severity: "error", origin_name: "WhatsApp da loja", resolved_at: nil)
      expect(alert.metadata).to eq("motivo" => "sessão caiu")
    end

    it "guarda o id de origem como texto: aceita BSON e UUID" do
      expect(raise_alert(origin_id: 123).origin_id).to eq("123")
    end

    it "não duplica: mesma origem e código atualizam o alerta ativo" do
      first = raise_alert(message: "Primeira")

      expect { raise_alert(message: "Segunda", severity: "warning") }.not_to change(described_class, :count)

      expect(first.reload).to have_attributes(message: "Segunda", severity: "warning")
    end

    it "cria outro quando o anterior já foi resolvido" do
      first = raise_alert
      described_class.resolve!(organization, origin_type: "Connector", origin_id: "1")

      second = raise_alert

      expect(second.id).not_to eq(first.id)
      expect(described_class.count).to eq(2)
    end

    it "separa por código e por origem" do
      raise_alert
      raise_alert(code: "low_quality")
      raise_alert(origin_id: "2")

      expect(described_class.count).to eq(3)
    end

    it "separa por organização" do
      raise_alert
      described_class.raise_alert!(
        create(:organization), category: "connectors", origin_type: "Connector", origin_id: "1", code: "connector_disconnected"
      )

      expect(described_class.count).to eq(2)
    end

    # Dois jobs vendo o mesmo erro ao mesmo tempo: a validação não vê o outro, o índice vê.
    it "o banco recusa dois alertas ativos iguais" do
      alert = raise_alert

      expect {
        described_class.insert_all!([ alert.attributes.except("id") ])
      }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    # O outro processo grava entre a nossa leitura e o nosso INSERT: a colisão é de verdade,
    # no índice, e o savepoint é o que mantém viva a transação de quem chamou.
    it "quem perde a corrida acha a linha do outro e atualiza, sem erro" do
      competing = true
      allow_any_instance_of(described_class).to receive(:save!).and_wrap_original do |save, *args|
        if competing
          competing = false
          described_class.insert_all!([ {
            organization_id: organization.id, category: "connectors", origin_type: "Connector",
            origin_id: "1", code: "connector_disconnected", message: "Do outro processo"
          } ])
        end
        save.call(*args)
      end

      expect { raise_alert(message: "Nosso") }.not_to raise_error

      expect(described_class.sole.message).to eq("Nosso")
    end

    it "transmite os badges novos" do
      expect { raise_alert }
        .to have_broadcasted_to("org:#{organization.id}:alerts").with(badges: { "connectors" => 1 })
    end

    it "não falha se o tempo real estiver fora do ar" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)
      allow(Rails.logger).to receive(:error)

      expect { raise_alert }.to change(described_class, :count).by(1)
      expect(Rails.logger).to have_received(:error).with(/badges/)
    end
  end

  describe ".resolve!" do
    before do
      raise_alert
      raise_alert(code: "low_quality")
      raise_alert(origin_id: "2")
    end

    it "resolve só o código pedido" do
      expect(described_class.resolve!(organization, origin_type: "Connector", origin_id: "1", code: "low_quality")).to eq(1)
      expect(described_class.active.count).to eq(2)
    end

    it "sem código, resolve tudo que vem da origem" do
      expect(described_class.resolve!(organization, origin_type: "Connector", origin_id: "1")).to eq(2)
      expect(described_class.active.pluck(:origin_id)).to eq([ "2" ])
    end

    it "aceita o id em qualquer tipo" do
      expect(described_class.resolve!(organization, origin_type: "Connector", origin_id: 2)).to eq(1)
    end

    it "não alcança outra organização" do
      expect(described_class.resolve!(create(:organization), origin_type: "Connector", origin_id: "1")).to eq(0)
      expect(described_class.active.count).to eq(3)
    end

    it "só transmite quando algo mudou" do
      expect {
        described_class.resolve!(organization, origin_type: "Connector", origin_id: "nao-existe")
      }.not_to have_broadcasted_to("org:#{organization.id}:alerts")
    end
  end

  describe ".resolve_category!" do
    it "resolve a categoria inteira" do
      raise_alert
      raise_alert(origin_id: "2")
      raise_alert(category: "webhooks", origin_type: "Hook")

      expect(described_class.resolve_category!(organization, "connectors")).to eq(2)
      expect(described_class.active_counts_by_category(organization)).to eq("webhooks" => 1)
    end
  end

  describe ".active_counts_by_category" do
    it "conta só os ativos da organização" do
      raise_alert
      raise_alert(origin_id: "2")
      raise_alert(category: "webhooks", origin_type: "Hook")
      raise_alert(origin_id: "3").update!(resolved_at: Time.current)
      create(:organization_alert, organization: create(:organization))

      expect(described_class.active_counts_by_category(organization)).to eq("connectors" => 2, "webhooks" => 1)
    end
  end

  describe "#display_message" do
    let(:alert) { build(:organization_alert, organization: organization, origin_name: "WhatsApp da loja") }

    it "traduz a frase padrão do código no idioma corrente" do
      expect(alert.display_message).to eq("A integração \"WhatsApp da loja\" foi desconectada.")
      expect(I18n.with_locale(:en) { alert.display_message }).to eq("The integration \"WhatsApp da loja\" was disconnected.")
    end

    it "prefere o texto próprio de quem levantou" do
      alert.message = "Template rejeitado pela Meta"

      expect(alert.display_message).to eq("Template rejeitado pela Meta")
    end

    it "fica nulo para código sem frase padrão" do
      alert.code = "codigo_sem_traducao"

      expect(alert.display_message).to be_nil
    end
  end
end

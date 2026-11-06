require "rails_helper"

RSpec.describe Agenda::Calendar do
  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }

  describe "fuso" do
    it "nasce no fuso da organização" do
      organization.update!(timezone: "America/Manaus")

      expect(described_class.create!(organization_id: organization.id, name: "A").time_zone).to eq("America/Manaus")
    end

    it "aceita nome IANA, e recusa o deslocamento inteiro da origem" do
      expect(build(:agenda_calendar, organization: organization, time_zone: "Europe/Lisbon")).to be_valid
      expect(build(:agenda_calendar, organization: organization, time_zone: "-3")).not_to be_valid
      expect(build(:agenda_calendar, organization: organization, time_zone: "Marte/Olympus")).not_to be_valid
    end
  end

  describe "#professional_event_rule" do
    it "resolve o padrão quando nada foi configurado" do
      expect(calendar.professional_event_rule("created")).to include("push" => true, "whatsapp" => true)
    end

    it "nasce com o push da remarcação desligado" do
      expect(calendar.professional_event_rule("rescheduled")).to include("push" => false, "whatsapp" => true)
    end

    it "sobrepõe só o que foi configurado" do
      calendar.professional_event_notifications = [ { "event" => "created", "push" => false } ]

      rule = calendar.professional_event_rule("created")
      expect(rule["push"]).to be(false)
      expect(rule["whatsapp"]).to be(true)
      expect(rule["message"]).to include("{{nome}}")
    end

    it "valor nulo volta ao padrão, em vez de virar mensagem vazia" do
      calendar.professional_event_notifications = [ { "event" => "canceled", "message" => nil } ]

      expect(calendar.professional_event_rule("canceled")["message"]).to be_present
    end

    it "não deixa chave estranha entrar na regra" do
      calendar.professional_event_notifications = [ { "event" => "created", "outra" => "x" } ]

      expect(calendar.professional_event_rule("created").keys).to contain_exactly("push", "whatsapp", "message")
    end

    it "aceita símbolo" do
      expect(calendar.professional_event_rule(:created)).to include("push" => true)
    end
  end

  describe "#professional_event_rules" do
    it "resolve os três eventos, em ordem, com a chave do evento" do
      expect(calendar.professional_event_rules.map { |rule| rule["event"] }).to eq(%w[created canceled rescheduled])
    end
  end

  describe "#professional_whatsapp_connector" do
    it "é nil sem canal escolhido" do
      expect(calendar.professional_whatsapp_connector).to be_nil
    end

    it "devolve o canal não oficial ativo" do
      connector = create(:connector_whatsapp_web, organization: organization)
      calendar.professional_whatsapp_connector_id = connector.id.to_s

      expect(calendar.professional_whatsapp_connector).to eq(connector)
    end

    it "recusa a API oficial, mesmo salva" do
      connector = create(:connector_whatsapp_cloud, organization: organization)
      calendar.professional_whatsapp_connector_id = connector.id.to_s

      expect(calendar.professional_whatsapp_connector).to be_nil
    end

    it "recusa canal inativo" do
      connector = create(:connector_whatsapp_web, organization: organization, status: :paused)
      calendar.professional_whatsapp_connector_id = connector.id.to_s

      expect(calendar.professional_whatsapp_connector).to be_nil
    end

    it "recusa canal de outra organização" do
      connector = create(:connector_whatsapp_web)
      calendar.professional_whatsapp_connector_id = connector.id.to_s

      expect(calendar.professional_whatsapp_connector).to be_nil
    end
  end

  describe "regras" do
    it "recusa lembrete sem tempo ou sem texto" do
      calendar.scheduling_notification_config = [ { "interval" => 0, "period" => "hours", "message" => "x" } ]
      expect(calendar).not_to be_valid

      calendar.scheduling_notification_config = [ { "interval" => 1, "period" => "hours" } ]
      expect(calendar).not_to be_valid

      calendar.scheduling_notification_config = [ { "interval" => 1, "period" => "anos", "message" => "x" } ]
      expect(calendar).not_to be_valid
    end

    it "aceita lembrete só com instrução para a IA" do
      calendar.scheduling_notification_config = [ { "interval" => 1, "period" => "days", "ai_prompt" => "Lembre com carinho" } ]

      expect(calendar).to be_valid
    end
  end

  describe "sequências" do
    def sequence(**attributes)
      {
        "id" => "s", "name" => "Pós", "trigger" => "show",
        "steps" => [ { "id" => "1", "message" => "Oi", "run_after" => 1, "run_after_unit" => "hours" } ]
      }.merge(attributes.stringify_keys)
    end

    it "aceita a forma completa" do
      calendar.attendance_sequences = [ sequence ]

      expect(calendar).to be_valid
    end

    {
      "sem nome" => { name: "" },
      "com gatilho que não existe" => { trigger: "talvez" },
      "com âncora que não existe" => { auto_enroll_anchors: [ "ontem" ] }
    }.each do |description, attributes|
      it "recusa sequência #{description}" do
        calendar.attendance_sequences = [ sequence(**attributes) ]

        expect(calendar).not_to be_valid
        expect(calendar.errors[:attendance_sequences]).to be_present
      end
    end

    {
      "sem texto" => { "message" => "", "run_after" => 1, "run_after_unit" => "hours" },
      "com unidade inválida" => { "message" => "Oi", "run_after" => 1, "run_after_unit" => "anos" },
      "com espera negativa" => { "message" => "Oi", "run_after" => -1, "run_after_unit" => "hours" },
      "com início depois do fim" => { "message" => "Oi", "run_after" => 1, "run_after_unit" => "hours", "time_from" => 18, "time_at" => 8 }
    }.each do |description, step|
      it "recusa passo #{description}" do
        calendar.attendance_sequences = [ sequence(steps: [ step ]) ]

        expect(calendar).not_to be_valid
      end
    end

    it "ignora o horário do passo que vale o dia inteiro" do
      calendar.attendance_sequences = [ sequence(steps: [ { "message" => "Oi", "run_after" => 1, "run_after_unit" => "hours", "time_from" => 18, "time_at" => 8, "all_day" => true } ]) ]

      expect(calendar).to be_valid
    end
  end

  describe ".default_for" do
    it "é o mais antigo de profissionais, da própria organização" do
      create(:agenda_calendar, :class_group, organization: organization)
      older = create(:agenda_calendar, organization: organization, created_at: 2.days.ago)
      create(:agenda_calendar, organization: organization, created_at: 1.day.ago)
      create(:agenda_calendar, created_at: 3.days.ago)

      expect(described_class.default_for(organization.id)).to eq(older)
    end
  end
end

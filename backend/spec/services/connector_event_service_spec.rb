require "rails_helper"

# `Agenda::*` e `CustomField` são de outros domínios, e aqui só importa a forma deles: o
# serviço escolhe o mapa de variáveis pelo nome da classe. Por isso as classes de mentira têm
# o nome de verdade.
RSpec.describe ConnectorEventService do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization_id: organization.id, external_id: "5531971810932@s.whatsapp.net", user_name: "Maria Souza") }
  let(:url) { "https://erp.exemplo.com.br/hook" }

  subject(:service) { described_class.new(organization, chat) }

  let(:professional_class) { stub_const("Agenda::Professional", Struct.new(:id, :name, :email, :external_id, keyword_init: true)) }
  let(:offering_class) { stub_const("Agenda::Offering", Struct.new(:id, :name, :external_id, keyword_init: true)) }
  let(:booking_class) do
    klass = Class.new do
      attr_accessor :id, :external_id, :professional, :service, :start, :end, :chat

      def initialize(**attributes)
        attributes.each { |key, value| public_send("#{key}=", value) }
      end

      def update(attributes)
        self.external_id = attributes[:external_id]
      end
    end
    stub_const("Agenda::Booking", klass)
  end

  let(:professional) { professional_class.new(id: "P1", name: "Dra. Ana", email: "ana@exemplo.com.br", external_id: "ERP-P1") }
  let(:offering) { offering_class.new(id: "S1", name: "Limpeza", external_id: "ERP-S1") }
  let(:booking) do
    booking_class.new(
      id: "B1", external_id: nil, professional: professional, service: offering,
      start: Time.utc(2026, 11, 10, 14, 0), end: Time.utc(2026, 11, 10, 15, 0), chat: chat
    )
  end

  def create_event(event_name, parameters_json, method: "post", organization_id: organization.id, **attributes)
    create(:connector_event, organization_id: organization_id, event_name: event_name, parameters_json: parameters_json, method: method, url: url, **attributes)
  end

  # Com variável de `CustomField` a validação recusa quando ele não existe, então o corpo já
  # interpretado entra direto, como estaria num evento salvo antes.
  def saved_event(parsed_json, event_name: "create_employee", **attributes)
    build(:connector_event, organization_id: organization.id, event_name: event_name, url: url, parsed_json: parsed_json, parameters_json: "{}", **attributes).tap do |event|
      event.save!(validate: false)
      event.set(parsed_json: parsed_json)
    end
  end

  def sent_body
    body = nil
    expect(a_request(:post, url).with { |request| body = request.body }).to have_been_made.at_least_once
    JSON.parse(body)
  end

  describe "variáveis do profissional" do
    before { stub_request(:post, url).to_return(json_reply({})) }

    %i[create_employee update_employee].each do |event_name|
      it "#{event_name} manda id, nome e e-mail" do
        create_event(event_name.to_s, '{"id": {employee.id}, "nome": {employee.name}, "email": {employee.email}}')

        service.public_send("#{event_name}_connector_call", professional)

        expect(sent_body).to eq("id" => "P1", "nome" => "Dra. Ana", "email" => "ana@exemplo.com.br")
      end
    end

    it "delete_employee manda o id" do
      create_event("delete_employee", '{"id": {employee.id}}')

      service.delete_employee_connector_call(professional)

      expect(sent_body).to eq("id" => "P1")
    end
  end

  describe "variáveis do serviço" do
    before { stub_request(:post, url).to_return(json_reply({})) }

    %i[create_service update_service].each do |event_name|
      it "#{event_name} manda id e nome" do
        create_event(event_name.to_s, '{"id": {service.id}, "nome": {service.name}}')

        service.public_send("#{event_name}_connector_call", offering)

        expect(sent_body).to eq("id" => "S1", "nome" => "Limpeza")
      end
    end

    it "delete_service manda o id" do
      create_event("delete_service", '{"id": {service.id}}')

      service.delete_service_connector_call(offering)

      expect(sent_body).to eq("id" => "S1")
    end
  end

  describe "variáveis do agendamento" do
    let(:body) do
      <<~JSON
        {
          "id": {booking.id}, "profissional": {booking.employee_name}, "servico": {booking.service_name},
          "inicio": {booking.start_time}, "fim": {booking.end_time},
          "servico_id": {service.id}, "servico_externo": {service.external_id}, "servico_nome": {service.name},
          "pro_id": {employee.id}, "pro_externo": {employee.external_id}, "pro_nome": {employee.name},
          "cliente": {customer.name}, "telefone": {customer.number}
        }
      JSON
    end

    it "manda tudo que veio do agendamento, do serviço, do profissional e do contato" do
      stub_request(:post, url).to_return(json_reply({}))
      create_event("create_booking", body)

      service.create_booking_connector_call(booking)

      expect(sent_body).to eq(
        "id" => "B1", "profissional" => "Dra. Ana", "servico" => "Limpeza",
        "inicio" => "2026-11-10T14:00", "fim" => "2026-11-10T15:00",
        "servico_id" => "S1", "servico_externo" => "ERP-S1", "servico_nome" => "Limpeza",
        "pro_id" => "P1", "pro_externo" => "ERP-P1", "pro_nome" => "Dra. Ana",
        "cliente" => "Maria Souza", "telefone" => "5531971810932"
      )
    end

    it "guarda no agendamento o id que o sistema de fora devolveu" do
      stub_request(:post, url).to_return(json_reply({ id: "ERP-B1" }, status: 201))
      create_event("create_booking", '{"id": {booking.id}}')

      service.create_booking_connector_call(booking)

      expect(booking.external_id).to eq("ERP-B1")
    end

    it "não mexe no agendamento em outros eventos" do
      stub_request(:post, url).to_return(json_reply({ id: "ERP-B1" }))
      create_event("delete_booking", '{"id": {booking.id}}')

      service.delete_booking_connector_call(booking)

      expect(booking.external_id).to be_nil
    end

    it "não mexe no agendamento com resposta de erro" do
      stub_request(:post, url).to_return(json_reply({ id: "ERP-B1" }, status: 500))
      create_event("create_booking", '{"id": {booking.id}}')

      service.create_booking_connector_call(booking)

      expect(booking.external_id).to be_nil
    end
  end

  describe "quais eventos rodam" do
    before { stub_request(:post, url).to_return(json_reply({})) }

    it "todos os da organização para aquele nome" do
      2.times { create_event("create_employee", '{"id": {employee.id}}') }

      service.create_employee_connector_call(professional)

      expect(a_request(:post, url)).to have_been_made.twice
    end

    it "não os de outra organização" do
      create_event("create_employee", '{"id": {employee.id}}', organization_id: create(:organization).id)

      service.create_employee_connector_call(professional)

      expect(a_request(:post, url)).not_to have_been_made
    end

    it "não os de outro nome" do
      create_event("delete_employee", '{"id": {employee.id}}')

      service.create_employee_connector_call(professional)

      expect(a_request(:post, url)).not_to have_been_made
    end
  end

  describe "falhas" do
    it "um evento que falha não impede os outros nem derruba quem chamou" do
      other = "https://outro.exemplo.com.br/hook"
      stub_request(:post, url).to_timeout
      request = stub_request(:post, other).to_return(json_reply({}))
      create_event("create_employee", '{"id": {employee.id}}')
      create(:connector_event, organization_id: organization.id, event_name: "create_employee", url: other)

      expect { service.create_employee_connector_call(professional) }.not_to raise_error

      expect(request).to have_been_requested
    end

    it "registra a falha no log" do
      stub_request(:post, url).to_timeout
      create_event("create_employee", '{"id": {employee.id}}')

      expect(captured_log { service.create_employee_connector_call(professional) }).to include("create_employee failed with error")
    end

    it "evento sem corpo interpretado não derruba quem chamou" do
      saved_event(nil)

      expect { service.create_employee_connector_call(professional) }.not_to raise_error
    end
  end

  # Contra o `CustomField` de verdade: com dublês, esta parte passava enquanto o código lia um
  # atributo que o modelo não tem.
  describe "campos personalizados" do
    let(:field) { create(:custom_field, organization_id: organization.id, name: "Cidade", default_value: "Padrão") }

    before { stub_request(:post, url).to_return(json_reply({ data: [ { cidade: "BH" } ] })) }

    describe "lendo a variável para o corpo" do
      it "de usuário, usa o valor da conversa" do
        chat.update(custom_attributes: { field.key => "Recife" })
        saved_event(%({"a": {user.#{field.id}}}))

        service.create_employee_connector_call(professional)

        expect(sent_body).to eq("a" => "Recife")
      end

      it "de usuário, cai no valor padrão quando a conversa não tem" do
        saved_event(%({"a": {user.#{field.id}}}))

        service.create_employee_connector_call(professional)

        expect(sent_body).to eq("a" => "Padrão")
      end

      it "de sistema, usa o valor padrão, mesmo com valor na conversa" do
        chat.update(custom_attributes: { field.key => "Recife" })
        saved_event(%({"a": {system.#{field.id}}}))

        service.create_employee_connector_call(professional)

        expect(sent_body).to eq("a" => "Padrão")
      end

      it "vira null quando o campo não existe" do
        saved_event('{"a": {user.nao-existe}}'.sub("nao-existe", "abc123"))

        service.create_employee_connector_call(professional)

        expect(sent_body).to eq("a" => nil)
      end

      it "não alcança campo de outra organização" do
        foreign = create(:custom_field, organization_id: create(:organization).id, default_value: "Alheio")
        saved_event(%({"a": {user.#{foreign.id}}}))

        service.create_employee_connector_call(professional)

        expect(sent_body).to eq("a" => nil)
      end
    end

    describe "guardando o que a resposta trouxe" do
      def event_saving(field_id, path = "data.0.cidade")
        saved_event('{"id": {employee.id}}', variables_path: { field_id.to_s => path }).tap(&:save!)
      end

      it "grava no campo da conversa, seguindo o caminho com índice, sem apagar os outros" do
        chat.update(custom_attributes: { "outro" => "fica" })
        event_saving(field.id)

        service.create_employee_connector_call(professional)

        expect(chat.reload.custom_attributes).to eq("outro" => "fica", field.key => "BH")
      end

      it "não guarda nada com resposta de erro" do
        stub_request(:post, url).to_return(json_reply({ data: [ { cidade: "BH" } ] }, status: 500))
        event_saving(field.id)

        service.create_employee_connector_call(professional)

        expect(chat.reload.custom_attributes).to eq({})
      end

      it "resposta que não é JSON não derruba quem chamou" do
        stub_request(:post, url).to_return(status: 200, body: "ok", headers: { "Content-Type" => "text/plain" })
        event_saving(field.id)

        expect { service.create_employee_connector_call(professional) }.not_to raise_error
        expect(chat.reload.custom_attributes).to eq({})
      end

      it "um campo que sumiu não impede os outros" do
        event = saved_event('{"id": {employee.id}}', variables_path: { "abc123" => "data.0.cidade", field.id.to_s => "data.0.cidade" })
        event.save!

        expect { service.create_employee_connector_call(professional) }.not_to raise_error
        expect(chat.reload.custom_attributes).to eq(field.key => "BH")
      end
    end
  end
end

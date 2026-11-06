# frozen_string_literal: true

require "rails_helper"

RSpec.describe Copilot::Tools do
  describe ".definitions" do
    it "todas têm nome, descrição e esquema, e a entrada vem em fluxo" do
      expect(described_class.definitions).to all(include(:name, :description, :input_schema, eager_input_streaming: true))
    end

    it "toda ferramenta declarada tem quem a execute, com a atividade traduzida" do
      expect(described_class.names).to match_array(Copilot::ToolExecutor::ACTIVITIES.keys)

      executor_methods = Copilot::ToolExecutor.private_instance_methods(false)
      described_class.names.each do |name|
        expect(executor_methods).to include(:"tool_#{name}")
        expect(I18n.exists?("inbox.copilot.activities.#{name}", :"pt-BR")).to be(true), "sem texto em pt-BR: #{name}"
        expect(I18n.exists?("inbox.copilot.activities.#{name}", :en)).to be(true), "sem texto em en: #{name}"
      end
    end

    # O que depende de outro domínio entra quando ele estiver aqui.
    it "não oferece o que ainda não tem base" do
      expect(described_class.names).not_to include(
        "list_appointments", "get_appointment_details", "cancel_appointment", "reschedule_appointment",
        "qualify_appointments", "get_appointment_stats", "get_chat_funnel", "get_token_usage"
      )
    end
  end

  describe ".validation_error" do
    it "aceita a entrada certa" do
      expect(described_class.validation_error("assign_tag", { "chat_id" => "1", "tag_name" => "vip" })).to be_nil
    end

    it "aceita ferramenta sem parâmetros" do
      expect(described_class.validation_error("list_tags", {})).to be_nil
    end

    it "recusa ferramenta que não existe" do
      expect(described_class.validation_error("drop_database", {})).to be_present
    end

    # O SDK deixa o texto cru no lugar quando o JSON veio quebrado.
    it "recusa entrada que não é objeto" do
      expect(described_class.validation_error("assign_tag", '{"chat_id": "1", "tag_na')).to be_present
    end

    it "recusa quando falta campo obrigatório" do
      expect(described_class.validation_error("assign_tag", { "chat_id" => "1" })).to include("tag_name")
    end

    it "recusa tipo errado" do
      expect(described_class.validation_error("toggle_automation", { "chat_id" => "1", "enabled" => "sim" })).to include("enabled")
      expect(described_class.validation_error("search_chats", { "limit" => "muitos" })).to include("limit")
    end

    it "recusa valor fora da lista" do
      expect(described_class.validation_error("search_chats", { "status" => "arquivada" })).to include("status")
    end

    it "confere dentro das listas" do
      input = { "messages" => [ { "chat_id" => "1", "message" => "oi" }, { "chat_id" => "2" } ] }

      expect(described_class.validation_error("send_messages", input)).to include("message")
    end

    it "recusa lista no lugar de objeto" do
      expect(described_class.validation_error("send_messages", { "messages" => "oi" })).to include("messages")
    end
  end
end

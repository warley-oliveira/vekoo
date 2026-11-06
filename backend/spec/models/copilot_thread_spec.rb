# frozen_string_literal: true

require "rails_helper"

RSpec.describe CopilotThread do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:thread) { described_class.find_or_create_for(account_id: account.id, organization_id: organization.id) }

  it "é uma por pessoa" do
    thread

    expect(described_class.find_or_create_for(account_id: account.id, organization_id: organization.id)).to eq(thread)
    expect(described_class.count).to eq(1)
  end

  it "exige o que a identifica" do
    expect(described_class.new).not_to be_valid
  end

  it "exige conteúdo na mensagem da pessoa, mas não na do copiloto" do
    expect { thread.add_user_message("") }.to raise_error(Mongoid::Errors::Validations)
    expect { thread.add_assistant_message("") }.not_to raise_error
  end

  it "recusa papel que não existe" do
    expect(CopilotThread::Message.new(role: "system", content: "x")).not_to be_valid
  end

  it "guarda as mensagens em ordem" do
    thread.add_user_message("Oi")
    thread.add_assistant_message("Olá", changes_applied: [ { "action" => "x" } ], tool_activities: [ { "toolName" => "y" } ], content_segments: [ { "type" => "text" } ])

    saved = described_class.find(thread.id).ordered_messages
    expect(saved.map(&:role)).to eq(%w[user assistant])
    expect(saved.last).to have_attributes(changes_applied: [ { "action" => "x" } ], tool_calls: [ { "action" => "x" } ], tool_activities: [ { "toolName" => "y" } ])
  end

  it "não cresce além do teto, e sai o mais antigo" do
    stub_const("#{described_class}::MAX_MESSAGES", 2)

    %w[a b c].each { |text| thread.add_user_message(text) }

    expect(described_class.find(thread.id).ordered_messages.map(&:content)).to eq(%w[b c])
  end

  describe "#history_for_llm" do
    it "só o texto, sem as mensagens vazias" do
      thread.add_user_message("Oi")
      thread.add_assistant_message("", changes_applied: [ { "action" => "x" } ])
      thread.add_assistant_message("Pronto", tool_activities: [ { "toolName" => "y" } ])

      expect(thread.history_for_llm).to eq([ { role: "user", content: "Oi" }, { role: "assistant", content: "Pronto" } ])
    end
  end

  describe "#messages_for_api" do
    it "em camelCase, com a data em milissegundos" do
      thread.add_assistant_message("Olá", changes_applied: [ { "action" => "x" } ], content_segments: [ { "type" => "text", "content" => "Olá" } ])

      entry = thread.messages_for_api.first

      expect(entry).to include(role: "assistant", content: "Olá", changesApplied: [ { "action" => "x" } ], contentSegments: [ { "type" => "text", "content" => "Olá" } ])
      expect(entry[:id]).to be_a(String)
      expect(entry[:timestamp]).to be_a(Integer)
    end
  end

  it "limpa" do
    thread.add_user_message("Oi")

    thread.clear_messages!

    expect(described_class.find(thread.id).messages).to be_empty
  end
end

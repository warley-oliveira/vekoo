require "rails_helper"

# Ainda é um stub, implementado pelo domínio automation. O que vale aqui é o contrato: é a
# assinatura que `Chats::InboundDelivery` chama.
RSpec.describe Flows::InboundDispatcher do
  let(:chat) { create(:chat) }

  it "aceita a conversa, o texto, o evento e o id da mensagem" do
    expect { described_class.call(chat: chat, text: "Oi", event: "first_message", message_id: "wamid.1") }.not_to raise_error
  end

  it "o evento e o id são opcionais" do
    expect { described_class.call(chat: chat, text: "Oi") }.not_to raise_error
  end

  it "exige a conversa e o texto" do
    expect { described_class.call(text: "Oi") }.to raise_error(ArgumentError)
    expect { described_class.call(chat: chat) }.to raise_error(ArgumentError)
  end
end

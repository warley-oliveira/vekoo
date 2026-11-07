require "rails_helper"

# As ações do Action Cable dividem um pool de 4 threads por processo, o mesmo que aceita conexões e entrega os eventos de
# todas as organizações. Com o provedor mudo, cinco envios seguravam esse pool por 60 s: medido com Puma, Sidekiq e WebSocket
# de verdade, outra aba levou 58,8 s para receber o `welcome`. Por isso nada aqui pode falar com o provedor na thread do canal.
RSpec.describe ChatChannel, type: :channel do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }

  before do
    stub_connection current_account: account
    subscribe(chatId: chat.id.to_s)
  end

  it "send_message só enfileira: nada fala com o provedor nem grava a mensagem na thread do canal" do
    expect { perform :send_message, "chatId" => chat.id.to_s, "message" => "Oi" }
      .to have_enqueued_job(Chats::OperatorActionJob).on_queue("critical")

    expect(a_request(:any, /evolution\.test/)).not_to have_been_made
    expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).count).to eq(0)
  end

  it "send_reaction só enfileira" do
    target = create(:chat_text_message, chat: chat, message_id: "EXT-1")

    expect { perform :send_reaction, "chatId" => chat.id.to_s, "messageId" => target.id.to_s, "emoji" => "👍" }
      .to have_enqueued_job(Chats::OperatorActionJob).on_queue("critical")

    expect(a_request(:any, /evolution\.test/)).not_to have_been_made
  end

  it "send_template_message só enfileira" do
    expect { perform :send_template_message, "chatId" => chat.id.to_s, "templateId" => "tpl-1", "components" => [] }
      .to have_enqueued_job(Chats::OperatorActionJob).on_queue("critical")
  end

  it "conversa que a pessoa não enxerga não enfileira nada" do
    foreign = create(:chat, connector: create(:connector_whatsapp_web))

    expect { perform :send_message, "chatId" => foreign.id.to_s, "message" => "Oi" }
      .not_to have_enqueued_job(Chats::OperatorActionJob)
  end
end

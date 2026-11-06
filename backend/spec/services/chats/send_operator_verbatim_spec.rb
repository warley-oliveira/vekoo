require "rails_helper"

# O que uma pessoa escreve chega ao cliente como foi escrito. A limpeza de `MessageHandling`
# existe para texto gerado por IA, e aplicada aqui mudava a mensagem sem ninguém ver: a tela
# mostrava o texto digitado, e o cliente recebia outro.
RSpec.describe Chats::SendOperatorMessage do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    @sent = []
    stub_request(:post, send_url).to_return do |request|
      @sent << JSON.parse(request.body)["text"]
      { status: 201, body: { key: { id: "OUT-#{@sent.size}" } }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def deliver(text)
    described_class.call(chat: chat, account: account, text: text)
  end

  it "não tira aspas, til, colchetes nem sinais do texto" do
    text = %(Copo d'água, "gelado" ~riscado~ `código` [ver] <aqui> **forte**)

    deliver(text)

    expect(@sent).to eq([ text ])
  end

  it "não transforma um link em markdown" do
    deliver("Veja [o site](https://exemplo.com.br) depois")

    expect(@sent).to eq([ "Veja [o site](https://exemplo.com.br) depois" ])
  end

  it "não trata palavra parecida com referência de anexo como anexo" do
    deliver("Mandei o attachment_final.pdf ontem")

    expect(@sent).to eq([ "Mandei o attachment_final.pdf ontem" ])
  end

  it "guarda na conversa o mesmo texto que o cliente recebe" do
    message = deliver("Copo d'água")

    expect(message.content).to eq(@sent.first)
  end

  context "com anexo citado que não existe mais" do
    let(:gone) { "attachment_id_#{SecureRandom.uuid}" }

    it "não vaza o código para o cliente e envia o resto" do
      deliver("Segue o catálogo #{gone} qualquer dúvida me chame")

      expect(@sent.join(" ")).not_to include("attachment_id_")
      expect(@sent.join(" ")).to include("Segue o catálogo", "qualquer dúvida me chame")
    end

    it "marca como falha quando a mensagem era só o anexo" do
      message = deliver(gone)

      expect(@sent).to be_empty
      expect(message.reload).to have_attributes(status: "failed")
      expect(message.status_message).to be_present
    end
  end
end

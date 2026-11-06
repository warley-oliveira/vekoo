require "rails_helper"

RSpec.describe Chats::AudioTranscriber do
  include InboundHelpers

  let(:organization) { create(:organization, credits_total: 50, credits_used: 0) }
  let(:chat) { create(:chat, organization: organization, automation_enabled: true) }
  let(:endpoint) { "https://api.openai.com/v1/audio/transcriptions" }
  let(:audio) do
    Tempfile.create([ "audio", ".ogg" ]).tap do |file|
      file.write("bytes-do-audio")
      file.close
    end
  end

  before { stub_env("OPENAI_ACCESS_TOKEN" => "sk-teste") }

  after { File.delete(audio.path) if File.exist?(audio.path) }

  def transcribe(path = audio.path)
    described_class.call(path, chat)
  end

  def stub_whisper(status: 200, body: { text: "Bom dia" }.to_json)
    stub_request(:post, endpoint).to_return(status: status, headers: InboundHelpers::JSON_HEADERS, body: body)
  end

  it "devolve o texto transcrito" do
    stub_whisper

    expect(transcribe).to eq("Bom dia")
  end

  it "manda o modelo, o arquivo e o token" do
    whisper = stub_whisper

    transcribe

    expect(whisper.with(headers: { "Authorization" => "Bearer sk-teste" }) { |request|
      request.body.include?("whisper-1") && request.body.include?("bytes-do-audio") && request.headers["Content-Type"].start_with?("multipart/form-data")
    }).to have_been_requested
  end

  it "aceita Pathname" do
    stub_whisper

    expect(transcribe(Pathname.new(audio.path))).to eq("Bom dia")
  end

  describe "quando não roda" do
    let!(:whisper) { stub_whisper }

    after { expect(whisper).not_to have_been_requested }

    it "sem token" do
      stub_env("OPENAI_ACCESS_TOKEN" => "")

      expect(transcribe).to be_nil
    end

    it "com a automação da conversa desligada" do
      chat.set(automation_enabled: false)

      expect(transcribe).to be_nil
    end

    it "sem crédito na organização" do
      organization.update!(credits_used: 50)

      expect(transcribe).to be_nil
    end
  end

  it "não debita crédito" do
    stub_whisper

    expect { transcribe }.not_to(change { organization.reload.credits_used })
  end

  describe "quando falha, a mensagem nunca se perde" do
    it "resposta de erro devolve nil, com log" do
      stub_whisper(status: 400, body: { error: { message: "Invalid file format" } }.to_json)
      allow(Rails.logger).to receive(:error)

      expect(transcribe).to be_nil
      expect(Rails.logger).to have_received(:error).with(a_string_including("Whisper HTTP 400"))
    end

    it "falha de rede devolve nil" do
      stub_request(:post, endpoint).to_timeout

      expect(transcribe).to be_nil
    end

    it "arquivo que sumiu devolve nil" do
      stub_whisper

      expect(transcribe("/tmp/nao-existe-#{SecureRandom.hex}.ogg")).to be_nil
    end
  end
end

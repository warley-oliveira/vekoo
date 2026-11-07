require "rails_helper"

# O ffmpeg escolhe o que fazer olhando o conteúdo do arquivo. Sem shell não há injeção de comando, mas um
# "áudio" que é na verdade uma playlist HLS manda ele abrir outro arquivo do servidor, e o que sai vira
# uma mensagem que a pessoa ouve na conversa. Roda o ffmpeg de verdade: é o comportamento dele que importa.
RSpec.describe "Arquivo enviado ao ffmpeg", type: :request do
  include ConnectorHelpers

  before { skip "ffmpeg não instalado" unless system("which ffmpeg > /dev/null 2>&1") }

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization, instance_name: "wt31", base_url: "http://evolution.test") }
  let(:chat) { create(:chat, organization_id: organization.id.to_s, connector: connector) }
  let(:work_dir) { Pathname.new(Dir.mktmpdir("ffmpeg-input")) }

  # O áudio de outra pessoa, no disco do servidor.
  let(:secret_audio) do
    path = work_dir.join("segredo.ogg")
    system("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=880:duration=1", "-c:a", "libopus", path.to_s, exception: true)
    path
  end

  after { FileUtils.rm_rf(work_dir) }

  def playlist(name, target)
    path = work_dir.join(name)
    path.write("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TARGETDURATION:10\n#EXTINF:1.0,\n#{target}\n#EXT-X-ENDLIST\n")
    path
  end

  def upload(path, type = "audio/ogg")
    post "/chats/#{chat.id}/messages/audio",
      params: { audio: Rack::Test::UploadedFile.new(path.to_s, type) }, headers: auth_headers(owner)
  end

  before { stub_request(:post, %r{/message/sendWhatsAppAudio/}).to_return(json_reply({ key: { id: "EVO-AUD" } }, status: 201)) }

  {
    "com a extensão de playlist" => "evil.m3u8",
    "disfarçada de ogg" => "evil.ogg",
    "sem extensão conhecida" => "evil.bin"
  }.each do |description, name|
    it "playlist #{description} não lê outro arquivo do servidor" do
      expect {
        upload(playlist(name, "file://#{secret_audio}"))
      }.not_to change(ActiveStorage::Blob, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("audioConversionFailed")
      expect(a_request(:post, %r{/message/sendWhatsAppAudio/})).not_to have_been_made
    end
  end

  it "lista do demuxer concat também não" do
    path = work_dir.join("evil.ffconcat")
    path.write("ffconcat version 1.0\nfile '#{secret_audio}'\n")

    upload(path)

    expect(response).to have_http_status(:unprocessable_content)
  end

  # O que uma tela de gravação de verdade manda.
  it "áudio de verdade continua sendo convertido e enviado" do
    upload(secret_audio)

    expect(response).to have_http_status(:created)
    expect(a_request(:post, %r{/message/sendWhatsAppAudio/})).to have_been_made
  end

  %w[webm mp4 mp3 wav flac].each do |format|
    it "#{format} continua aceito" do
      codec = { "webm" => %w[-c:a libopus], "mp4" => %w[-c:a aac], "mp3" => %w[-c:a libmp3lame], "wav" => [], "flac" => [] }.fetch(format)
      path = work_dir.join("gravacao.#{format}")
      system("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", *codec, path.to_s, exception: true)

      upload(path, "audio/#{format}")

      expect(response).to have_http_status(:created)
    end
  end

  # Quem recebe da Meta o áudio que um contato mandou roda o mesmo programa.
  describe "áudio recebido na WABA" do
    let(:cloud) { create(:connector_whatsapp_cloud, organization: organization) }

    it "uma playlist não vira a mensagem de outro arquivo: fica o original" do
      downloaded = playlist("recebido.ogg", "file://#{secret_audio}")
      allow(cloud).to receive(:download_media).and_return(downloaded)

      result = cloud.retrieve_audio_message("MEDIA-1")

      expect(result).to eq(downloaded)
      expect(File.exist?("#{downloaded}.mp3")).to be(false)
    end
  end
end

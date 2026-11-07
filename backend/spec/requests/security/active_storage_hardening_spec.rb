require "rails_helper"

# O que `config/initializers/active_storage_hardening.rb` fecha sem subir a versão do Rails.
RSpec.describe "Active Storage, arquivo enviado por qualquer pessoa" do
  let(:initializer) { Rails.root.join("config/initializers/active_storage_hardening.rb") }

  describe "ffprobe e prévia de vídeo" do
    it "anexar arquivo não roda o ffprobe" do
      expect(ActiveStorage.analyzers).not_to include(ActiveStorage::Analyzer::VideoAnalyzer, ActiveStorage::Analyzer::AudioAnalyzer)
    end

    it "nenhuma prévia chama o ffmpeg" do
      expect(ActiveStorage.previewers).not_to include(ActiveStorage::Previewer::VideoPreviewer)
    end

    it "imagem continua sendo medida" do
      expect(ActiveStorage.analyzers).to include(ActiveStorage::Analyzer::ImageAnalyzer::Vips)
    end

    it "uma playlist enviada como áudio não é analisada" do
      blob = ActiveStorage::Blob.create_and_upload!(
        io: StringIO.new("#EXTM3U\n#EXTINF:1.0,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n"),
        filename: "voz.ogg", content_type: "audio/ogg", identify: false
      )

      expect(IO).not_to receive(:popen)

      blob.analyze

      expect(blob.reload.metadata.keys).not_to include("duration")
    end
  end

  # CVE-2026-66066. O libvips daqui do desenvolvimento pode ser velho demais para ter a função: o que
  # importa é o que o initializer faz com cada um dos dois casos.
  describe "leitores não testados do libvips" do
    def with_block_untrusted
      calls = []
      original = Vips.method(:block_untrusted) if Vips.respond_to?(:block_untrusted)
      Vips.define_singleton_method(:block_untrusted) { |state| calls << state }
      yield calls
    ensure
      Vips.singleton_class.send(:remove_method, :block_untrusted)
      Vips.define_singleton_method(:block_untrusted, original) if original
    end

    it "desliga quando a biblioteca deixa" do
      with_block_untrusted do |calls|
        load initializer

        expect(calls).to eq([ true ])
      end
    end

    context "com uma biblioteca velha demais" do
      around do |example|
        next example.run unless Vips.respond_to?(:block_untrusted)

        original = Vips.method(:block_untrusted)
        Vips.singleton_class.send(:remove_method, :block_untrusted)
        example.run
      ensure
        Vips.define_singleton_method(:block_untrusted, original) if original
      end

      it "em produção, não sobe" do
        allow(Rails.env).to receive(:production?).and_return(true)

        expect { load initializer }.to raise_error(/libvips 8\.13/)
      end

      it "em desenvolvimento, segue" do
        expect { load initializer }.not_to raise_error
      end
    end
  end
end

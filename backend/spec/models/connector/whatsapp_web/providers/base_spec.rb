require "rails_helper"

RSpec.describe Connector::WhatsappWeb::Providers::Base do
  before { allow(described_class).to receive(:sleep) }

  describe ".with_retry" do
    it "devolve o resultado na primeira tentativa, sem esperar" do
      expect(described_class.with_retry(label: "x") { "ok" }).to eq("ok")
      expect(described_class).not_to have_received(:sleep)
    end

    it "tenta de novo depois de uma falha e devolve o que deu certo" do
      attempts = 0

      result = described_class.with_retry(label: "x") do
        attempts += 1
        raise "falhou" if attempts == 1

        "ok"
      end

      expect(result).to eq("ok")
      expect(attempts).to eq(2)
    end

    it "faz no máximo 3 tentativas e levanta o último erro" do
      attempts = 0

      expect {
        described_class.with_retry(label: "x") do
          attempts += 1
          raise "falha #{attempts}"
        end
      }.to raise_error("falha 3")

      expect(attempts).to eq(3)
    end

    it "espera o intervalo pedido entre as tentativas" do
      expect { described_class.with_retry(label: "x", wait_seconds: 7) { raise "falhou" } }.to raise_error("falhou")

      expect(described_class).to have_received(:sleep).with(7).at_least(:twice)
    end

    it "respeita max_retries" do
      attempts = 0

      expect {
        described_class.with_retry(label: "x", max_retries: 0) do
          attempts += 1
          raise "falhou"
        end
      }.to raise_error("falhou")

      expect(attempts).to eq(1)
    end

    it "não repete número que não existe: repetir não muda o resultado" do
      attempts = 0

      expect {
        described_class.with_retry(label: "x") do
          attempts += 1
          raise WhatsappNumberNotFoundError
        end
      }.to raise_error(WhatsappNumberNotFoundError, "Número não existe no WhatsApp")

      expect(attempts).to eq(1)
      expect(described_class).not_to have_received(:sleep)
    end

    it "não divide o limite de tentativas entre chamadas" do
      2.times do
        attempts = 0
        expect {
          described_class.with_retry(label: "x") do
            attempts += 1
            raise "falhou"
          end
        }.to raise_error("falhou")
        expect(attempts).to eq(3)
      end
    end
  end

  describe ".file_extension_for" do
    { mp3: "mp3", audio: "ogg", image: "jpg", video: "bin", nil => "bin" }.each do |type, extension|
      it "#{type.inspect} vira .#{extension}" do
        expect(described_class.file_extension_for(type)).to eq(extension)
      end
    end
  end

  describe "contrato abstrato" do
    it "obriga o provedor a implementar as operações" do
      expect { described_class.send_text_message(nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.send_media_message(nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.send_audio_message_by_url(nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.mark_read_message(nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.send_reaction(nil, nil, nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.send_presence(nil, nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.retriever_media_message(nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.check_whatsapp_numbers(nil, nil) }.to raise_error(NotImplementedError)
      expect { described_class.activate(nil) }.to raise_error(NotImplementedError)
    end
  end
end

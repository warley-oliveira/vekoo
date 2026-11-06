require "rails_helper"

RSpec.describe MessageHandling do
  include AttachmentHelpers

  subject(:handling) { described_class.new(organization) }

  let(:organization) { create(:organization) }

  def perform(text, **options)
    described_class.new(organization, **options).perform(text)
  end

  describe "#perform" do
    it "devolve o texto como uma parte só" do
      expect(perform("Bom dia, Maria")).to eq([ "Bom dia, Maria" ])
    end

    it "não mexe no texto recebido" do
      text = +"Veja **isto**"

      perform(text)

      expect(text).to eq("Veja **isto**")
    end

    describe "quebras de linha" do
      it "por padrão, duas quebras separam partes" do
        expect(perform("Olá\n\nTudo bem?")).to eq([ "Olá", "Tudo bem?" ])
      end

      it "uma quebra só não separa" do
        expect(perform("Olá\nTudo bem?")).to eq([ "Olá\nTudo bem?" ])
      end

      it "com min_line_breaks: 10, é o que vale para quem escreve na tela" do
        expect(perform("Olá\n\nTudo bem?", min_line_breaks: 10)).to eq([ "Olá\n\nTudo bem?" ])
        expect(perform("Olá#{"\n" * 10}Tudo bem?", min_line_breaks: 10)).to eq([ "Olá", "Tudo bem?" ])
      end

      it "mais quebras que o mínimo também separam" do
        expect(perform("Olá#{"\n" * 5}Tudo bem?")).to eq([ "Olá", "Tudo bem?" ])
      end

      it "o mínimo nunca fica abaixo de 2" do
        expect(perform("Olá\nTudo bem?", min_line_breaks: 1)).to eq([ "Olá\nTudo bem?" ])
      end

      it "ignora o \\r do Windows" do
        expect(perform("Olá\r\n\r\nTudo bem?")).to eq([ "Olá", "Tudo bem?" ])
      end
    end

    describe "partes" do
      it "joga fora as em branco" do
        expect(perform("Olá\n\n   \n\nTudo bem?")).to eq([ "Olá", "Tudo bem?" ])
      end

      it "repetidas viram uma" do
        expect(perform("Olá\n\nOlá")).to eq([ "Olá" ])
      end

      it "texto todo em branco não gera parte nenhuma" do
        expect(perform("   ")).to eq([])
        expect(perform("")).to eq([])
      end
    end

    describe "limpeza do texto" do
      it "troca ** por *" do
        expect(perform("Veja **isto**")).to eq([ "Veja *isto*" ])
      end

      it "tira colchetes, sinais de maior e menor, crases e aspas" do
        expect(perform(%(Oi [Maria] <você> `aqui` "ok" 'sim' ~nada~))).to eq([ "Oi Maria você aqui ok sim nada" ])
      end

      it "mantém o apóstrofo dentro da palavra" do
        expect(perform(%(Um copo d'água em Sant'Ana, 'gelado'))).to eq([ "Um copo d'água em Sant'Ana, gelado" ])
      end

      it "tira a nota de score" do
        expect(perform("Olá [score:0.92]")).to eq([ "Olá" ])
      end

      it "fica com o endereço de um link em markdown" do
        expect(perform("Veja [o site](https://exemplo.com)", split_links: false)).to eq([ "Veja https://exemplo.com" ])
      end

      it "fica com o endereço de uma imagem em markdown" do
        expect(perform("![foto](https://exemplo.com/foto.jpg)").first).to have_attributes(media_type: "image", media_url: "https://exemplo.com/foto.jpg")
      end

      it "tira os colchetes em volta de um link" do
        expect(perform("Veja [https://exemplo.com]", split_links: false)).to eq([ "Veja https://exemplo.com" ])
      end
    end

    describe "links" do
      it "por padrão, cada link vira uma parte" do
        expect(perform("Veja https://exemplo.com agora")).to eq([ "Veja", "https://exemplo.com", "agora" ])
      end

      it "tira o ponto final do link" do
        expect(perform("Veja https://exemplo.com.")).to eq([ "Veja", "https://exemplo.com" ])
      end

      it "com split_links: false, o link fica no meio do texto" do
        expect(perform("Veja https://exemplo.com agora", split_links: false)).to eq([ "Veja https://exemplo.com agora" ])
      end

      %w[jpg jpeg gif png bmp tiff tif svg webp].each do |extension|
        it "link de .#{extension} vira imagem" do
          part = perform("https://exemplo.com/foto.#{extension}").first

          expect(part).to be_a(MediaMessageDto)
          expect(part).to have_attributes(media_type: "image", media_url: "https://exemplo.com/foto.#{extension}")
        end
      end

      it "link de outro tipo fica como texto" do
        expect(perform("https://exemplo.com/video.mp4")).to eq([ "https://exemplo.com/video.mp4" ])
      end

      it "com split_links: false, um link de imagem sozinho ainda vira imagem" do
        expect(perform("https://exemplo.com/foto.jpg", split_links: false).first).to have_attributes(media_type: "image")
      end

      # Era o que a tela mandava: a frase inteira virava a URL de uma imagem, e nada chegava.
      it "com split_links: false, uma frase que começa com link de imagem segue como texto" do
        expect(perform("https://exemplo.com/foto.jpg olha essa foto", split_links: false)).to eq([ "https://exemplo.com/foto.jpg olha essa foto" ])
      end

      it "com split_links: false, uma frase que começa com link mantém o ponto final" do
        expect(perform("https://exemplo.com é o nosso site.", split_links: false)).to eq([ "https://exemplo.com é o nosso site." ])
      end
    end

    describe "marcas de áudio" do
      it "o texto entre as marcas segue como texto" do
        expect(perform("<audio>Olá, tudo bem?</audio>")).to eq([ "Olá, tudo bem?" ])
      end

      it "separa do texto em volta" do
        expect(perform("Antes <audio>No meio</audio> Depois")).to eq([ "Antes", "No meio", "Depois" ])
      end
    end

    describe "anexo citado pelo id" do
      let!(:attachment) { stub_attachment(filename: "cardapio.pdf", url: "https://cdn.exemplo.com/cardapio.pdf") }

      it "vira uma mídia, com a URL do arquivo" do
        part = perform("attachment_id_#{attachment.id}").first

        expect(part).to be_a(MediaMessageDto)
        expect(part).to have_attributes(media_type: "document", attachment_id: attachment.id, media_url: "https://cdn.exemplo.com/cardapio.pdf")
      end

      it "separa do texto em volta" do
        parts = perform("Segue o cardápio attachment_id_#{attachment.id} bom apetite")

        expect(parts.first).to eq("Segue o cardápio")
        expect(parts.second).to be_a(MediaMessageDto)
        expect(parts.third).to eq("bom apetite")
      end

      it "busca na organização" do
        perform("attachment_id_#{attachment.id}")

        expect(::Attachment).to have_received(:where).with(organization_id: organization.id)
      end

      it "aceita o id com ponto final, como quem escreve uma frase" do
        expect(perform("attachment_id_#{attachment.id}.").first).to be_a(MediaMessageDto)
      end

      it "baixa o arquivo para enviar por quem manda multipart" do
        part = perform("attachment_id_#{attachment.id}").first

        expect(File.binread(part.attachment)).to eq("bytes do anexo")
      end

      {
        "foto.PNG" => "image",
        "foto.webp" => "image",
        "video.mp4" => "video",
        "video.mkv" => "video",
        "recado.mp3" => "audio",
        "recado.ogg" => "audio",
        "planilha.xlsx" => "document"
      }.each do |filename, media_type|
        it "#{filename} vira #{media_type}" do
          file = stub_attachment(filename: filename, url: "https://cdn.exemplo.com/#{filename}")

          expect(perform("attachment_id_#{file.id}").first.media_type).to eq(media_type)
        end
      end

      it "áudio não baixa nada: vai por URL" do
        voice = stub_attachment(filename: "recado.ogg", url: "https://cdn.exemplo.com/recado.ogg")

        expect(perform("attachment_id_#{voice.id}").first.attachment).to be_nil
      end

      it "com attachment_record_only, devolve só o id" do
        part = perform("attachment_id_#{attachment.id}", attachment_record_only: true).first

        expect(part).to have_attributes(attachment_id: attachment.id, media_type: nil)
      end

      it "levanta quando o arquivo está em branco" do
        empty = stub_attachment(blank: true)

        expect { perform("attachment_id_#{empty.id}") }.to raise_error(AttachmentNotFoundException, /em branco/)
      end

      it "levanta quando o anexo não existe" do
        expect { perform("attachment_id_nao-existe") }.to raise_error(AttachmentNotFoundException, /nao-existe/)
      end
    end

    describe "anexo citado pelo nome" do
      let!(:attachment) { stub_attachment(name: "Cardápio de Natal", filename: "cardapio_natal.pdf", url: "https://cdn.exemplo.com/cardapio.pdf") }

      it "acha pelo nome do arquivo" do
        part = perform("attachment_cardapio_natal.pdf").first

        expect(part).to be_a(MediaMessageDto)
        expect(part).to have_attributes(attachment_id: attachment.id, file_name: "cardapio_natal.pdf")
      end

      it "acha pelo nome do anexo em forma de slug" do
        expect(perform("attachment_cardapio_de_natal").first).to have_attributes(attachment_id: attachment.id)
      end

      it "aceita pequena diferença de nome" do
        expect(perform("attachment_cardapio_natal2.pdf").first).to have_attributes(attachment_id: attachment.id)
      end

      it "levanta quando nada é parecido o bastante" do
        expect { perform("attachment_tabela_de_precos") }.to raise_error(AttachmentNotFoundException, /tabela_de_precos/)
      end
    end

    # Enquanto o domínio inbox não existe, anexo citado não resolve e quem chama decide.
    describe "sem o modelo de anexo" do
      it "levanta pelo id" do
        expect { perform("attachment_id_123") }.to raise_error(AttachmentNotFoundException)
      end

      it "levanta pelo nome" do
        expect { perform("attachment_cardapio") }.to raise_error(AttachmentNotFoundException)
      end
    end

    it "a mensagem de erro sai no idioma pedido" do
      I18n.with_locale(:en) do
        expect { perform("attachment_id_123") }.to raise_error(AttachmentNotFoundException, I18n.t("connectors.messages.attachment_not_found", name: "123", locale: :en))
      end
    end
  end
end

require "rails_helper"

RSpec.describe WhatsappTemplate do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization, access_token: "token-da-meta", waba_id: 555_666_777) }
  let(:templates_url) { "https://graph.facebook.com/v19.0/555666777/message_templates" }

  # URL assinada do CDN interno da Meta, como ela volta em `example.header_handle` depois do
  # sync. Abre no browser logado, mas dá 403 no downloader da Meta (erro 131053).
  let(:meta_cdn_url) { "https://scontent.whatsapp.net/v/t61.29466-34/596415028_2098566691544694.jpg?ccb=1-7&oh=01_Q5Aa5&oe=6AA411FB" }
  let(:attachment_url) { "https://arquivos.vekoo.app/kjh2l3kj4h23" }

  def header(example)
    { "type" => "HEADER", "format" => "IMAGE", "example" => example }
  end

  def build_template(components)
    described_class.new(connector: connector, name: "promo_fds", language: "pt_BR", components: components)
  end

  # `Attachment` é do domínio inbox: enquanto ele não existe, `Media::AttachmentLookup` não
  # resolve nada. Aqui ele aparece com a interface que o lookup espera.
  def stub_attachments(by_id: {}, by_url: {})
    attachments = double("Attachment")
    allow(attachments).to receive(:find_by) { |id:| by_id[id] }
    allow(attachments).to receive(:from_file_url) { |url| by_url[url] }
    stub_const("Attachment", attachments)
  end

  describe "criação" do
    let(:components) { [ { "type" => "BODY", "text" => "Olá {{1}}" } ] }

    def new_template(**attributes)
      described_class.new(connector: connector, name: "promo", language: "pt_BR", category: "MARKETING", components: components, **attributes)
    end

    context "sem status: quem cria é a Meta" do
      let!(:meta) do
        stub_request(:post, templates_url)
          .with(headers: { "Authorization" => "Bearer token-da-meta" })
          .to_return(json_reply({ id: "tpl-777", status: "PENDING", category: "MARKETING" }))
      end

      it "cria na Meta durante a validação, guarda o id e fica pendente" do
        template = new_template

        expect(template.save).to be(true)

        expect(meta).to have_been_requested
        expect(template.reload).to have_attributes(template_id: "tpl-777", status_cd: "pending")
      end

      it "manda nome, idioma, categoria, componentes e deixa a Meta recategorizar" do
        new_template.save

        expect(a_request(:post, templates_url).with(body: hash_including(
          "name" => "promo", "language" => "pt_BR", "category" => "MARKETING",
          "components" => [ { "type" => "BODY", "text" => "Olá {{1}}" } ], "allow_category_change" => true
        ))).to have_been_made
      end

      it "normaliza o nome antes de mandar" do
        template = new_template(name: "Promoção Fim de Semana")

        template.save

        expect(template.name).to eq("promocao_fim_de_semana")
        expect(a_request(:post, templates_url).with(body: hash_including("name" => "promocao_fim_de_semana"))).to have_been_made
      end

      it "usa o business_id sem WABA" do
        fallback = create(:connector_whatsapp_cloud, organization: organization, waba_id: nil, business_id: 42)
        request = stub_request(:post, "https://graph.facebook.com/v19.0/42/message_templates").to_return(json_reply({ id: "1" }))

        expect(new_template(connector: fallback).save).to be(true)
        expect(request).to have_been_requested
      end

      it "não chama a Meta quando já há erro de validação" do
        create(:whatsapp_template, connector: connector, name: "promo", language: "pt_BR")
        template = new_template

        expect(template.save).to be(false)
        expect(template.errors[:name]).to be_present
        expect(meta).not_to have_been_requested
      end

      it "devolve a mensagem da Meta para a pessoa quando ela recusa" do
        stub_request(:post, templates_url).to_return(json_reply({ error: { code: 100, message: "técnica", error_user_msg: "Nome já existe" } }, status: 400))
        template = new_template

        expect(template.save).to be(false)
        expect(template.errors[:base]).to include("Nome já existe")
      end

      it "cai na mensagem técnica quando a Meta não traz a amigável" do
        stub_request(:post, templates_url).to_return(json_reply({ error: { code: 100, message: "técnica" } }, status: 400))
        template = new_template

        expect(template.save).to be(false)
        expect(template.errors[:base]).to include("técnica")
      end

      it "não fica no banco quando a Meta recusa" do
        stub_request(:post, templates_url).to_return(json_reply({ error: { code: 100, message: "técnica" } }, status: 400))

        expect { new_template.save }.not_to(change { described_class.count })
      end

      # O SDK recusa antes de chamar a Meta. Quem chama (`ConnectorTemplatesController`)
      # transforma a exceção em erro de provedor.
      it "levanta com categoria que o SDK não conhece, sem chamar a Meta" do
        expect { new_template(category: "INVENTADA").save }.to raise_error(WhatsappSdk::Api::Templates::InvalidCategoryError)
        expect(meta).not_to have_been_requested
      end

      it "levanta com idioma que o SDK não conhece, sem chamar a Meta" do
        expect { new_template(language: "xx_XX").save }.to raise_error(WhatsappSdk::Resource::Errors::InvalidLanguageError)
        expect(meta).not_to have_been_requested
      end
    end

    context "com status já preenchido: o documento só espelha o que existe na Meta" do
      it "não chama a Meta" do
        template = described_class.create!(connector: connector, name: "ativo", template_id: "1", language: "pt_BR", status: :approved)

        expect(template).to be_persisted
        expect(a_request(:any, /graph\.facebook\.com/)).not_to have_been_made
      end

      it "preserva o status informado" do
        expect(create(:whatsapp_template, connector: connector, status: :removed).reload.status_cd).to eq("removed")
      end
    end

    context "com mídia no cabeçalho" do
      let(:session_url) { "https://graph.facebook.com/v22.0/APP/uploads" }

      around { |example| with_env("META_APP_ID" => "APP") { example.run } }

      before do
        stub_request(:post, templates_url).to_return(json_reply({ id: "tpl-1" }))
        stub_request(:get, attachment_url).to_return(status: 200, body: "BYTES", headers: { "Content-Type" => "image/jpeg" })
      end

      it "sobe a mídia e troca header_url por header_handle no que vai para a Meta" do
        stub_request(:post, session_url).with(query: hash_including({})).to_return(json_reply({ id: "upload:S" }))
        stub_request(:post, "https://graph.facebook.com/v22.0/upload:S").to_return(json_reply({ h: "HANDLE-1" }))

        build_template([ header("header_url" => [ attachment_url ]) ]).tap { |t| t.category = "MARKETING" }.save

        expect(a_request(:post, templates_url).with(body: hash_including(
          "components" => [ { "type" => "HEADER", "format" => "IMAGE", "example" => { "header_handle" => [ "HANDLE-1" ] } } ]
        ))).to have_been_made
      end

      it "mantém a URL de origem no documento: ela sobrevive ao sync" do
        stub_request(:post, session_url).with(query: hash_including({})).to_return(json_reply({ id: "upload:S" }))
        stub_request(:post, "https://graph.facebook.com/v22.0/upload:S").to_return(json_reply({ h: "HANDLE-1" }))

        template = build_template([ header("header_url" => [ attachment_url ]) ]).tap { |t| t.category = "MARKETING" }
        template.save

        expect(template.reload.header_media_url).to eq(attachment_url)
      end

      it "manda a URL original quando o upload falha" do
        stub_request(:post, session_url).with(query: hash_including({})).to_return(json_reply({ error: { message: "x" } }, status: 400))

        build_template([ header("header_url" => [ attachment_url ]) ]).tap { |t| t.category = "MARKETING" }.save

        expect(a_request(:post, templates_url).with(body: hash_including(
          "components" => [ { "type" => "HEADER", "format" => "IMAGE", "example" => { "header_url" => [ attachment_url ] } } ]
        ))).to have_been_made
      end

      it "não sobe de novo quando já tem handle" do
        build_template([ header("header_url" => [ attachment_url ], "header_handle" => [ "JA-TEM" ]) ]).tap { |t| t.category = "MARKETING" }.save

        expect(a_request(:post, session_url).with(query: hash_including({}))).not_to have_been_made
      end
    end
  end

  describe "validações" do
    it "exige o nome" do
      template = described_class.new(connector: connector, name: "", status: :approved)

      expect(template).not_to be_valid
      expect(template.errors[:name]).to be_present
    end

    it "exige o conector" do
      template = described_class.new(name: "sem_conector", status: :approved)

      expect(template).not_to be_valid
      expect(template.errors[:connector]).to be_present
    end

    it "não repete nome e idioma no mesmo conector" do
      create(:whatsapp_template, connector: connector, name: "promo", language: "pt_BR")

      expect(build(:whatsapp_template, connector: connector, name: "promo", language: "pt_BR")).not_to be_valid
    end

    it "aceita o mesmo nome em outro idioma" do
      create(:whatsapp_template, connector: connector, name: "promo", language: "pt_BR")

      expect(build(:whatsapp_template, connector: connector, name: "promo", language: "en_US")).to be_valid
    end

    it "aceita o mesmo nome em outro conector" do
      create(:whatsapp_template, connector: connector, name: "promo", language: "pt_BR")

      expect(build(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: organization), name: "promo", language: "pt_BR")).to be_valid
    end
  end

  describe "ao atualizar" do
    let(:template) { create(:whatsapp_template, connector: connector, template_id: "tpl-1") }
    let(:components) { [ { "type" => "BODY", "text" => "Novo" } ] }

    it "só propaga para a Meta com sync_update" do
      template.update!(components: components)

      expect(a_request(:post, "https://graph.facebook.com/v19.0/tpl-1")).not_to have_been_made
    end

    it "manda os componentes novos com sync_update" do
      request = stub_request(:post, "https://graph.facebook.com/v19.0/tpl-1")
        .with(body: { components: components }.to_json)
        .to_return(json_reply({ success: true }))
      template.sync_update = true

      template.update!(components: components)

      expect(request).to have_been_requested
    end
  end

  describe "#assign_meta_attributes" do
    subject(:template) { described_class.new(connector: connector) }

    it "diz se algo mudou" do
      payload = { "name" => "promo", "language" => "pt_BR", "status" => "APPROVED" }

      expect(template.assign_meta_attributes(payload)).to be(true)
      template.save!(validate: false)
      expect(template.assign_meta_attributes(payload)).to be(false)
    end

    it "limpa a marca de removido quando o template reaparece" do
      template.removed_at = 1.day.ago
      template.status = :removed

      template.assign_meta_attributes("name" => "promo", "status" => "APPROVED")

      expect(template.removed_at).to be_nil
      expect(template.status_cd).to eq("approved")
    end

    it "mantém o nome e o idioma atuais quando a Meta manda em branco" do
      template.name = "promo"
      template.language = "pt_BR"

      template.assign_meta_attributes("status" => "APPROVED")

      expect(template).to have_attributes(name: "promo", language: "pt_BR")
    end

    it "limpa o que a Meta não manda mais" do
      template.assign_meta_attributes("name" => "promo", "rejected_reason" => "SPAM", "quality_score" => { "score" => "RED" }, "components" => [ { "type" => "BODY" } ])

      template.assign_meta_attributes("name" => "promo")

      expect(template).to have_attributes(rejected_reason: nil, quality_score: {}, components: [])
    end
  end

  describe "#assign_meta_status" do
    subject(:template) { described_class.new(connector: connector) }

    it "traduz os status da Meta" do
      template.assign_meta_status("IN_APPEAL")

      expect(template.status_cd).to eq("in_appeal")
    end

    described_class::STATUSES.each do |status|
      it "conhece #{status}" do
        template.assign_meta_status(status)

        expect(template.status_cd).to eq(status.downcase)
      end
    end

    it "status desconhecido vira paused, nunca nil: nil mascarava template inutilizável" do
      template.assign_meta_status("SOMETHING_NEW")

      expect(template.status_cd).to eq("paused")
    end

    it "ignora status em branco" do
      template.status = :approved

      template.assign_meta_status(nil)

      expect(template.status_cd).to eq("approved")
    end
  end

  describe "#mark_as_removed!" do
    subject(:template) { create(:whatsapp_template, connector: connector, template_id: "100", name: "promo") }

    it "marca o documento sem apagar" do
      expect(template.mark_as_removed!).to be(true)

      template.reload
      expect(template.status_cd).to eq("removed")
      expect(template.removed_at).to be_present
      expect(described_class.find(template.id)).to eq(template)
    end

    it "é idempotente" do
      template.mark_as_removed!

      expect(template.reload.mark_as_removed!).to be(false)
    end

    it "não dispara a atualização na Meta" do
      template.sync_update = true

      template.mark_as_removed!

      expect(a_request(:post, /graph\.facebook\.com/)).not_to have_been_made
    end
  end

  describe "escopos" do
    let!(:live) { create(:whatsapp_template, connector: connector, template_id: "1", name: "ativo") }
    let!(:gone) { create(:whatsapp_template, connector: connector, template_id: "2", name: "sumiu", status: :removed) }

    it ".available deixa de fora os removidos" do
      expect(described_class.available.to_a).to eq([ live ])
    end

    it ".removed lista só os removidos" do
      expect(described_class.removed.to_a).to eq([ gone ])
    end
  end

  describe "formato do cabeçalho" do
    def with_header(format)
      described_class.new(components: [ { "type" => "header", "format" => format } ])
    end

    it "é TEXT sem cabeçalho" do
      expect(described_class.new.header_format).to eq("TEXT")
    end

    it "lê o formato sem ligar para maiúsculas" do
      expect(with_header("image").header_format).to eq("IMAGE")
    end

    %w[IMAGE VIDEO DOCUMENT].each do |format|
      it "#{format} é cabeçalho de mídia" do
        expect(with_header(format).has_media_header?).to be(true)
        expect(with_header(format).has_location_header?).to be(false)
      end
    end

    it "TEXT não é mídia" do
      expect(with_header("TEXT").has_media_header?).to be(false)
    end

    it "LOCATION é localização, não mídia" do
      expect(with_header("LOCATION").has_location_header?).to be(true)
      expect(with_header("LOCATION").has_media_header?).to be(false)
    end
  end

  describe "#has_parameters?" do
    it "reconhece variáveis numeradas e nomeadas" do
      expect(described_class.new(components: [ { "type" => "BODY", "text" => "Oi {{1}}" } ]).has_parameters?).to be(true)
      expect(described_class.new(components: [ { "type" => "BODY", "text" => "Oi {{nome}}" } ]).has_parameters?).to be(true)
    end

    it "fica falso sem variável ou sem componentes" do
      expect(described_class.new(components: [ { "type" => "BODY", "text" => "Oi" } ]).has_parameters?).to be(false)
      expect(described_class.new.has_parameters?).to be(false)
    end
  end

  describe "#buttons" do
    it "lê os botões do componente" do
      buttons = [ { "type" => "URL", "text" => "Abrir" } ]

      expect(described_class.new(components: [ { "type" => "BUTTONS", "buttons" => buttons } ]).buttons).to eq(buttons)
    end

    it "é vazio sem botões" do
      expect(described_class.new.buttons).to eq([])
    end
  end

  describe "#render_message_text" do
    let(:template) do
      described_class.new(components: [
        { "type" => "HEADER", "format" => "TEXT", "text" => "Aviso" },
        { "type" => "BODY", "text" => "Olá {{1}}, sua consulta é {{2}}" },
        { "type" => "FOOTER", "text" => "Clínica Vida" },
        { "type" => "BUTTONS", "buttons" => [
          { "type" => "PHONE_NUMBER", "text" => "Ligar" },
          { "type" => "URL", "text" => "Abrir" },
          { "type" => "QUICK_REPLY", "text" => "Sim" },
          { "type" => "COPY_CODE", "text" => "Copiar" },
          { "type" => "OUTRO", "text" => "Outro" }
        ] }
      ])
    end

    it "monta cabeçalho, corpo, rodapé e botões" do
      expect(template.render_message_text).to eq(
        "*Aviso*\n\nOlá {{1}}, sua consulta é {{2}}\n\nClínica Vida\n\n📞 Ligar | 🔗 Abrir | 💬 Sim | 📋 Copiar | Outro"
      )
    end

    it "preenche as variáveis numeradas com os parâmetros da tela" do
      params = [ { "type" => "body", "parameters" => [ { "text" => "Maria" }, { "text" => "amanhã" } ] } ]

      expect(template.render_message_text(params)).to include("Olá Maria, sua consulta é amanhã")
    end

    it "preenche as variáveis nomeadas" do
      named = described_class.new(components: [ { "type" => "BODY", "text" => "Oi {{nome}}" } ])
      params = [ { "type" => "BODY", "parameters" => [ { "param_name" => "nome", "text" => "Maria" } ] } ]

      expect(named.render_message_text(params)).to eq("Oi Maria")
    end

    it "deixa como está sem parâmetros de corpo" do
      expect(template.render_message_text([ { "type" => "header" } ])).to include("Olá {{1}}")
    end

    it "é vazio sem componentes" do
      expect(described_class.new.render_message_text).to eq("")
    end

    it "cabeçalho de mídia não vira texto" do
      media = described_class.new(components: [ { "type" => "HEADER", "format" => "IMAGE" }, { "type" => "BODY", "text" => "Oi" } ])

      expect(media.render_message_text).to eq("Oi")
    end
  end

  describe "#resolved_header_media_url" do
    it "prefere a URL do anexo vinculado" do
      stub_attachments(by_id: { "42" => double(file_url: attachment_url) })
      template = build_template([ header("header_handle" => [ meta_cdn_url ]) ])
      template.header_attachment_id = "42"

      expect(template.resolved_header_media_url).to eq(attachment_url)
    end

    it "cai na URL capturada quando o template foi criado" do
      template = build_template([ header("header_handle" => [ meta_cdn_url ]) ])
      template.header_media_url = attachment_url

      expect(template.resolved_header_media_url).to eq(attachment_url)
    end

    it "lê header_url direto dos componentes antes do primeiro sync" do
      expect(build_template([ header("header_url" => [ attachment_url ]) ]).resolved_header_media_url).to eq(attachment_url)
    end

    it "recusa a URL do CDN da Meta" do
      expect(build_template([ header("header_handle" => [ meta_cdn_url ]) ]).resolved_header_media_url).to be_nil
    end

    it "recusa o CDN da Meta também em header_media_url" do
      template = build_template([])
      template.header_media_url = meta_cdn_url

      expect(template.resolved_header_media_url).to be_nil
    end

    it "recusa o CDN da Meta mesmo vindo do anexo" do
      stub_attachments(by_id: { "42" => double(file_url: meta_cdn_url) })
      template = build_template([])
      template.header_attachment_id = "42"

      expect(template.resolved_header_media_url).to be_nil
    end

    it "decodifica o & escapado que a Meta manda no handle" do
      escaped = 'https://arquivos.vekoo.app/abc?a=1\\u0026b=2'

      expect(build_template([ header("header_url" => [ escaped ]) ]).resolved_header_media_url).to eq("https://arquivos.vekoo.app/abc?a=1&b=2")
    end

    it "devolve nil sem cabeçalho nenhum" do
      expect(build_template([]).resolved_header_media_url).to be_nil
    end

    it "reconstrói a URL canônica a partir do anexo por trás de uma URL velha" do
      stale = "http://localhost:3000/rails/active_storage/blobs/redirect/abc/banner.jpg"
      stub_attachments(by_url: { stale => double(file_url: attachment_url) })
      template = build_template([])
      template.header_media_url = stale

      expect(template.resolved_header_media_url).to eq(attachment_url)
    end

    it "sem o domínio de anexos, usa a URL que tem" do
      template = build_template([])
      template.header_media_url = attachment_url
      template.header_attachment_id = "42"

      expect(template.resolved_header_media_url).to eq(attachment_url)
    end
  end

  describe "captura da origem da mídia ao salvar" do
    subject(:template) { build_template([ header("header_url" => [ attachment_url ]) ]) }

    before { stub_attachments(by_url: { attachment_url => double(id: "99") }) }

    it "guarda a URL pública fora de components" do
      template.save!(validate: false)

      expect(template.header_media_url).to eq(attachment_url)
    end

    it "vincula o anexo por trás da URL" do
      template.save!(validate: false)

      expect(template.header_attachment_id).to eq("99")
    end

    it "sobrevive a um sync que troca components pelo payload da Meta" do
      template.save!(validate: false)

      template.assign_meta_attributes(
        "name" => "promo_fds",
        "status" => "APPROVED",
        "components" => [ header("header_handle" => [ meta_cdn_url ]) ]
      )
      template.save!(validate: false)

      expect(template.reload.header_media_url).to eq(attachment_url)
    end

    it "resolve o anexo de novo quando a mídia muda" do
      template.save!(validate: false)
      other_url = "https://arquivos.vekoo.app/outra-imagem"

      template.components = [ header("header_url" => [ other_url ]) ]
      template.save!(validate: false)

      expect(template.reload).to have_attributes(header_media_url: other_url, header_attachment_id: nil)
    end

    it "nunca captura o CDN da Meta" do
      cdn = build_template([ header("header_handle" => [ meta_cdn_url ]) ])

      cdn.save!(validate: false)

      expect(cdn.header_media_url).to be_nil
    end
  end

  describe "ao apagar o conector" do
    it "leva os templates junto" do
      template = create(:whatsapp_template, connector: connector)

      connector.destroy

      expect(described_class.where(id: template.id).exists?).to be(false)
    end
  end
end

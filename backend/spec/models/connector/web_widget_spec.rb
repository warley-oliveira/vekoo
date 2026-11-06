require "rails_helper"

RSpec.describe Connector::WebWidget do
  include ConnectorHelpers
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }

  def build_widget(attributes = {})
    described_class.new({ organization_id: organization.id, status: :active }.merge(attributes))
  end

  subject(:widget) { build_widget }

  let(:chat) { create(:chat, organization_id: organization.id, connector: create(:connector_web_widget, organization: organization), external_id: "visitor-1") }

  describe "credenciais" do
    it "gera o token público com o prefixo pk_widget_" do
      widget.valid?

      expect(widget.public_token).to start_with("pk_widget_")
      expect(widget.public_token.length).to be > "pk_widget_".length
    end

    it "gera o segredo de assinatura com 64 caracteres hex" do
      widget.valid?

      expect(widget.signing_secret).to match(/\A[a-f0-9]{64}\z/)
    end

    it "preserva credenciais informadas" do
      explicit = build_widget(public_token: "pk_widget_explicit_xyz", signing_secret: "a" * 64)

      explicit.valid?

      expect(explicit.public_token).to eq("pk_widget_explicit_xyz")
      expect(explicit.signing_secret).to eq("a" * 64)
    end

    it "nunca repete o token público" do
      create(:connector_web_widget, organization: organization, public_token: "pk_widget_unico")

      duplicate = build_widget(public_token: "pk_widget_unico")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:public_token]).to be_present
    end

    it "não troca as credenciais em outras gravações" do
      widget.save!
      token = widget.public_token

      widget.update!(primary_color: "#000000")

      expect(widget.reload.public_token).to eq(token)
    end
  end

  describe "#regenerate_credentials!" do
    before { widget.save! }

    it "troca o token e o segredo e grava" do
      token = widget.public_token
      secret = widget.signing_secret

      widget.regenerate_credentials!

      widget.reload
      expect(widget.public_token).to start_with("pk_widget_")
      expect(widget.public_token).not_to eq(token)
      expect(widget.signing_secret).to match(/\A[a-f0-9]{64}\z/)
      expect(widget.signing_secret).not_to eq(secret)
    end

    it "derruba as sessões abertas: o JWT antigo deixa de valer" do
      jwt = widget.issue_visitor_jwt("visitante-1")

      widget.regenerate_credentials!

      expect(widget.decode_visitor_jwt(jwt)).to be_nil
    end
  end

  describe "validações" do
    it "recusa posição desconhecida" do
      widget.position = "middle-center"

      expect(widget).not_to be_valid
      expect(widget.errors[:position]).to be_present
    end

    it "aceita bottom-right e bottom-left" do
      %w[bottom-right bottom-left].each do |position|
        expect(build_widget(position: position)).to be_valid, "esperava #{position} válido"
      end
    end

    it "limita rate_limit_per_min" do
      widget.rate_limit_per_min = 0
      expect(widget).not_to be_valid

      widget.rate_limit_per_min = 1001
      expect(widget).not_to be_valid

      widget.rate_limit_per_min = 50
      expect(widget).to be_valid
    end

    it "limita os tetos diários, com zero valendo ilimitado" do
      widget.daily_message_cap = 0
      widget.daily_visitor_cap = 1_000_000
      expect(widget).to be_valid

      widget.daily_message_cap = -1
      expect(widget).not_to be_valid

      widget.daily_message_cap = 0
      widget.daily_visitor_cap = 1_000_001
      expect(widget).not_to be_valid
    end

    it "recusa pre_chat_fields desconhecido" do
      widget.pre_chat_fields = "qualquer"

      expect(widget).not_to be_valid
      expect(widget.errors[:pre_chat_fields]).to be_present
    end

    it "aceita os pre_chat_fields conhecidos" do
      described_class::PRE_CHAT_FIELDS.each do |value|
        expect(build_widget(pre_chat_fields: value)).to be_valid, "esperava #{value} válido"
      end
    end

    describe "cores" do
      described_class::COLOR_FIELDS.each do |field|
        it "#{field} aceita #RRGGBB" do
          expect(build_widget(field => "#A1b2C3")).to be_valid
        end

        it "#{field} aceita vazio: o widget usa o padrão" do
          expect(build_widget(field => "")).to be_valid
          expect(build_widget(field => nil)).to be_valid
        end

        [ "red", "#FFF", "#GGGGGG", "#12345678", "#123456;background:url(x)" ].each do |bad|
          it "#{field} recusa #{bad}" do
            candidate = build_widget(field => bad)

            expect(candidate).not_to be_valid
            expect(candidate.errors[field]).to be_present
          end
        end
      end

      it "não deixa uma cor em várias linhas passar pela âncora" do
        expect(build_widget(primary_color: "#123456\n</style>")).not_to be_valid
      end
    end

    describe "aparência" do
      { launcher_size: [ 40, 96, 39, 97 ], bubble_radius: [ 0, 32, -1, 33 ], panel_radius: [ 8, 32, 7, 33 ] }.each do |field, (min, max, below, above)|
        it "#{field} aceita de #{min} a #{max}" do
          expect(build_widget(field => min)).to be_valid
          expect(build_widget(field => max)).to be_valid
        end

        it "#{field} recusa #{below} e #{above}" do
          expect(build_widget(field => below)).not_to be_valid
          expect(build_widget(field => above)).not_to be_valid
        end
      end

      it "aceita só as famílias de fonte da lista" do
        described_class::FONT_FAMILIES.each { |font| expect(build_widget(font_family: font)).to be_valid }

        candidate = build_widget(font_family: "comic-sans")
        expect(candidate).not_to be_valid
        expect(candidate.errors[:font_family]).to be_present
      end
    end

    describe "CSS personalizado" do
      it "aceita até o limite" do
        expect(build_widget(custom_css: "a" * described_class::MAX_CUSTOM_CSS)).to be_valid
      end

      it "recusa acima do limite" do
        candidate = build_widget(custom_css: "a" * (described_class::MAX_CUSTOM_CSS + 1))

        expect(candidate).not_to be_valid
        expect(candidate.errors[:custom_css]).to be_present
      end
    end

    describe "entrega do bundle" do
      it "por padrão é rolling, sem versão" do
        expect(widget).to be_valid
        expect(widget.delivery_mode).to eq("rolling")
        expect(widget).not_to be_pinned
      end

      it "recusa modo desconhecido" do
        candidate = build_widget(delivery_mode: "canary")

        expect(candidate).not_to be_valid
        expect(candidate.errors[:delivery_mode]).to be_present
      end

      it "fixado exige a versão" do
        candidate = build_widget(delivery_mode: "pinned")

        expect(candidate).not_to be_valid
        expect(candidate.errors[:pinned_version].join).to include("obrigatório")
      end

      it "fixado recusa versão sem SRI revisado" do
        candidate = build_widget(delivery_mode: "pinned", pinned_version: "9.9.9")

        expect(candidate).not_to be_valid
        expect(candidate.errors[:pinned_version].join).to include("versão desconhecida: 9.9.9")
      end

      it "fixado aceita versão do catálogo" do
        candidate = build_widget(delivery_mode: "pinned", pinned_version: Widget::ReleaseRegistry.stable_version)

        expect(candidate).to be_valid
        expect(candidate).to be_pinned
      end

      it "rolling ignora a versão" do
        expect(build_widget(delivery_mode: "rolling", pinned_version: "9.9.9")).to be_valid
      end
    end
  end

  describe "#instance_name" do
    it "usa o nome do atendente" do
      expect(build_widget(bot_display_name: "Atendente do Site").instance_name).to eq("Atendente do Site")
    end

    it "cai no id sem nome" do
      nameless = build_widget(bot_display_name: "")

      expect(nameless.instance_name).to eq(nameless.id.to_s)
    end
  end

  describe "ciclo de vida" do
    it "#activate liga" do
      widget.status = :inactive
      widget.save!

      widget.activate

      expect(widget.reload).to be_active
    end

    it "#deactivate e #logout_instance fecham" do
      widget.save!

      widget.deactivate
      expect(widget.reload).to be_closed

      widget.update!(status: :active)
      widget.logout_instance
      expect(widget.reload).to be_closed
    end

    it "#reload_instance e #mark_read_message não têm o que fazer" do
      expect(widget.reload_instance).to be(true)
      expect(widget.mark_read_message("x", "y")).to be(true)
    end
  end

  describe "streams" do
    it "a chave é o visitante, conhecida já ao conectar" do
      expect(widget.visitor_stream("v1")).to eq("widget_visitor_#{widget.id}_v1")
    end

    it "o stream da conversa é o do visitante dela" do
      expect(widget.chat_stream(chat)).to eq(widget.visitor_stream("visitor-1"))
    end
  end

  describe "#send_text_message" do
    it "transmite no stream do visitante e devolve um uuid" do
      result = nil

      expect { result = widget.send_text_message("ignorado", "olá", chat) }
        .to have_broadcasted_to(widget.visitor_stream("visitor-1")).with { |data|
          expect(data).to include("type" => "message", "role" => "assistant", "content" => "olá", "sender_name" => widget.bot_display_name)
          expect(data["message_id"]).to match(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/)
        }

      expect(result).to match(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/)
    end

    it "devolve nil sem conversa e não transmite" do
      expect { expect(widget.send_text_message("x", "oi", nil)).to be_nil }.not_to have_broadcasted_to(widget.visitor_stream("x"))
    end
  end

  describe "#send_media_message" do
    it "transmite a mídia e devolve um uuid" do
      result = nil

      expect { result = widget.send_media_message("to", media_dto("image", "img.png", caption: "foto", url: "https://cdn/img.png"), chat) }
        .to have_broadcasted_to(widget.visitor_stream("visitor-1")).with { |data|
          expect(data).to include("type" => "message", "role" => "assistant", "media_type" => "image", "media_url" => "https://cdn/img.png", "content" => "foto")
        }

      expect(result).to match(/\A[0-9a-f-]{36}\z/)
    end

    it "devolve nil sem conversa ou sem DTO" do
      expect(widget.send_media_message("to", nil, chat)).to be_nil
      expect(widget.send_media_message("to", media_dto, nil)).to be_nil
    end

    it "devolve nil sem URL de mídia" do
      expect(widget.send_media_message("to", media_dto(url: nil), chat)).to be_nil
    end

    it "acha a conversa pelo visitante quando ela não vem" do
      widget.save!
      own_chat = create(:chat, connector: widget, external_id: "visitante-2")

      expect(widget.send_media_message("visitante-2", media_dto, nil)).to be_present
      expect(own_chat).to be_persisted
    end
  end

  describe "#send_audio_message_by_url" do
    it "transmite como áudio com a URL informada" do
      result = nil

      expect { result = widget.send_audio_message_by_url("qualquer", "https://cdn/audio.ogg", chat) }
        .to have_broadcasted_to(widget.visitor_stream("visitor-1")).with { |data|
          expect(data).to include("type" => "message", "role" => "assistant", "media_type" => "audio", "media_url" => "https://cdn/audio.ogg")
        }

      expect(result).to match(/\A[0-9a-f-]{36}\z/)
    end

    it "devolve nil sem URL" do
      expect(widget.send_audio_message_by_url("x", "", chat)).to be_nil
      expect(widget.send_audio_message_by_url("x", nil, chat)).to be_nil
    end

    it "acha a conversa pelo visitante quando ela não vem" do
      widget.save!
      create(:chat, connector: widget, external_id: "visitante-audio")

      expect { widget.send_audio_message_by_url("visitante-audio", "https://cdn/op.ogg") }
        .to have_broadcasted_to(widget.visitor_stream("visitante-audio")).with { |data| expect(data).to include("media_type" => "audio") }
    end

    it "não alcança conversa de outro conector" do
      widget.save!
      create(:chat, connector: create(:connector_web_widget, organization: organization), external_id: "de-outro")

      expect(widget.send_audio_message_by_url("de-outro", "https://cdn/op.ogg")).to be_nil
    end

    it "devolve nil sem visitante" do
      expect(widget.send_audio_message_by_url("", "https://cdn/op.ogg")).to be_nil
    end
  end

  describe "#send_presence" do
    %w[composing paused].each do |presence|
      it "transmite #{presence}" do
        expect { expect(widget.send_presence("x", presence, chat)).to be(true) }
          .to have_broadcasted_to(widget.visitor_stream("visitor-1")).with(type: "presence", value: presence)
      end
    end

    it "ignora os outros valores, sem transmitir" do
      expect { expect(widget.send_presence("x", "available", chat)).to be(true) }.not_to have_broadcasted_to(widget.visitor_stream("visitor-1"))
    end

    it "sem conversa não transmite" do
      expect(widget.send_presence("x", "composing")).to be(true)
    end
  end

  describe "JWT do visitante" do
    let(:signed) { build_widget(signing_secret: "a" * 64).tap(&:valid?) }

    it "leva e traz o visitante e o conector" do
      decoded = signed.decode_visitor_jwt(signed.issue_visitor_jwt("visitor-uuid-1"))

      expect(decoded).to include("visitor_id" => "visitor-uuid-1", "connector_id" => signed.id.to_s)
    end

    it "assina em HS256 com o segredo do próprio widget" do
      jwt = signed.issue_visitor_jwt("v")

      expect(JWT.decode(jwt, "a" * 64, true, algorithm: "HS256").last).to include("alg" => "HS256")
    end

    it "recusa JWT assinado por outro widget" do
      other = build_widget(signing_secret: "b" * 64).tap(&:valid?)

      expect(signed.decode_visitor_jwt(other.issue_visitor_jwt("visitor-uuid-2"))).to be_nil
    end

    it "vence em 24 horas por padrão" do
      jwt = signed.issue_visitor_jwt("v")

      travel(23.hours) { expect(signed.decode_visitor_jwt(jwt)).to be_present }
      travel(25.hours) { expect(signed.decode_visitor_jwt(jwt)).to be_nil }
    end

    it "recusa JWT vencido" do
      expect(signed.decode_visitor_jwt(signed.issue_visitor_jwt("visitor-uuid-3", ttl: -1.second))).to be_nil
    end

    it "recusa JWT adulterado" do
      jwt = signed.issue_visitor_jwt("v")
      header, _payload, signature = jwt.split(".")
      forged = [ header, Base64.urlsafe_encode64({ visitor_id: "outro" }.to_json, padding: false), signature ].join(".")

      expect(signed.decode_visitor_jwt(forged)).to be_nil
    end

    it "recusa JWT sem assinatura (alg none)" do
      unsigned = JWT.encode({ visitor_id: "v" }, nil, "none")

      expect(signed.decode_visitor_jwt(unsigned)).to be_nil
    end

    it "recusa lixo" do
      expect(signed.decode_visitor_jwt("nao.e.jwt")).to be_nil
    end

    it "devolve nil para entrada em branco" do
      expect(signed.decode_visitor_jwt(nil)).to be_nil
      expect(signed.decode_visitor_jwt("")).to be_nil
    end

    it "devolve nil sem segredo" do
      expect(described_class.new.decode_visitor_jwt("x")).to be_nil
    end
  end

  describe "#origin_allowed?" do
    it "libera qualquer origem com a lista vazia" do
      widget.allowed_origins = []

      expect(widget.origin_allowed?("https://qualquer.com")).to be(true)
      expect(widget.origin_allowed?(nil)).to be(true)
    end

    it "só libera as origens listadas" do
      widget.allowed_origins = [ "https://loja.exemplo.com" ]

      expect(widget.origin_allowed?("https://loja.exemplo.com")).to be(true)
      expect(widget.origin_allowed?("https://ataque.exemplo.com")).to be(false)
      expect(widget.origin_allowed?(nil)).to be(false)
      expect(widget.origin_allowed?("")).to be(false)
    end

    it "compara a origem inteira, sem aceitar pedaço" do
      widget.allowed_origins = [ "https://loja.exemplo.com" ]

      expect(widget.origin_allowed?("https://loja.exemplo.com.ataque.com")).to be(false)
      expect(widget.origin_allowed?("http://loja.exemplo.com")).to be(false)
    end
  end
end

require "rails_helper"

RSpec.describe InstagramGraph::Client do
  around { |example| with_instagram_env { example.run } }

  def client(responses)
    transport, @calls = ig_transport(responses)
    described_class.new(transport: transport)
  end

  def error_for(response)
    client("padoca" => response).discover("padoca")
    nil
  rescue described_class::Error => e
    e
  end

  describe "#discover" do
    let(:carousel) { ig_media("3", type: "CAROUSEL_ALBUM", media_url: nil, children: [ ig_child("31"), ig_child("32", type: "VIDEO") ]) }

    it "lê a conta e os posts, com os filhos do carrossel e a legenda só na memória" do
      discovery = client("padoca" => ig_discovery("padoca", [ ig_media("1"), carousel ])).discover("@Padoca")

      expect(discovery.account).to have_attributes(username: "padoca", name: "Padoca Exemplo", followers_count: 12_000)
      expect(discovery.media.map(&:id)).to eq(%w[1 3])
      expect(discovery.media.first).to have_attributes(like_count: 100, comments_count: 10, permalink: "https://www.instagram.com/p/1/")
      expect(discovery.media.first.caption).to start_with("Legenda do post 1")
      expect(discovery.media.last.children.map(&:id)).to eq(%w[31 32])
      expect(discovery.media.last.children.last).to be_video
    end

    it "manda o token no cabeçalho, nunca na URL, e pede os campos certos" do
      client("padoca" => ig_discovery("padoca", [])).discover("padoca")

      call = @calls.sole
      expect(call[:headers]).to eq("Authorization" => "Bearer token-de-teste")
      expect(call[:uri].to_s).not_to include("token-de-teste")
      expect(call[:uri].path).to eq("/17841400000000000")
      fields = URI.decode_www_form(call[:uri].query).to_h["fields"]
      expect(fields).to include("business_discovery.username(padoca)", "media.limit(50)", "like_count", "comments_count",
        "permalink", "media_url", "children{id,media_type,media_url,thumbnail_url}")
    end

    it "usa a versão da Graph API quando configurada" do
      with_instagram_env("META_GRAPH_VERSION" => "v25.0") do
        client("padoca" => ig_discovery("padoca", [])).discover("padoca")
      end

      expect(@calls.sole[:uri].path).to eq("/v25.0/17841400000000000")
    end

    it "pagina pelo cursor até o limite" do
      pages = ->(fields) {
        fields.include?(".after(") ? ig_discovery("padoca", [ ig_media("3") ]) : ig_discovery("padoca", [ ig_media("1"), ig_media("2") ], after: "QVFIUjEz")
      }
      discovery = client("padoca" => pages).discover("padoca", limit: 3)

      expect(discovery.media.map(&:id)).to eq(%w[1 2 3])
      expect(@calls.length).to eq(2)
      expect(URI.decode_www_form(@calls.last[:uri].query).to_h["fields"]).to include("media.limit(1).after(QVFIUjEz)")
    end

    describe "consulta pesada demais (código 1)" do
      let(:heavy) { ig_error(1, message: "Please reduce the amount of data you're asking for, then retry your request", status: 500) }

      def page_params
        @calls.map { |call| URI.decode_www_form(call[:uri].query).to_h["fields"][/media\.limit\(\d+\)(\.after\(\w+\))?/] }
      end

      it "a página cai pela metade e o cursor segue de onde parou" do
        pages = ->(fields) {
          next heavy if fields[/media\.limit\((\d+)\)/, 1].to_i > 25

          fields.include?(".after(") ? ig_discovery("padoca", [ ig_media("3") ]) : ig_discovery("padoca", [ ig_media("1"), ig_media("2") ], after: "QVFIUjEz")
        }
        discovery = client("padoca" => pages).discover("padoca")

        expect(discovery.media.map(&:id)).to eq(%w[1 2 3])
        expect(page_params).to eq([ "media.limit(50)", "media.limit(25)", "media.limit(25).after(QVFIUjEz)" ])
      end

      it "no piso, desiste com o erro do Meta" do
        expect(error_for(heavy).code).to eq("failed")
        expect(page_params).to eq(%w[media.limit(50) media.limit(25) media.limit(12) media.limit(10)])
      end
    end

    it "recusa o que não é @ de Instagram sem chamar o Meta" do
      expect { client({}).discover("padoca){id}") }.to raise_error(described_class::Error) { |e| expect(e.code).to eq("accountUnavailable") }
      expect(@calls).to be_empty
    end

    it "sem configuração, não chama" do
      with_instagram_env("META_ACCESS_TOKEN" => nil) do
        expect { client({}).discover("padoca") }.to raise_error(described_class::Error) { |e| expect(e.code).to eq("notConfigured") }
      end
    end
  end

  describe "erros do Meta" do
    it "traduz cada erro no código que a tela conhece" do
      expect(error_for(ig_error(190, message: "Error validating access token: Session has expired")).code).to eq("tokenInvalid")
      expect(error_for(ig_error(10, message: "Application does not have permission for this action")).code).to eq("permissionDenied")
      expect(error_for(ig_error(110, message: "Invalid user id")).code).to eq("accountUnavailable")
      expect(error_for(ig_error(100, message: "Cannot find User with username padoca")).code).to eq("accountUnavailable")
      expect(error_for(ig_error(1, message: "An unknown error occurred", status: 500)).code).to eq("failed")
      expect(error_for([ 502, {}, "<html>bad gateway</html>" ]).code).to eq("failed")
    end

    it "no limite de taxa, diz quando tentar de novo" do
      usage = JSON.generate("17841400000000000" => [ { "type" => "instagram", "estimated_time_to_regain_access" => 25 } ])
      limited = error_for(ig_error(80002, headers: { "x-business-use-case-usage" => usage }))

      expect(limited).to have_attributes(code: "rateLimited", retry_after: 25)
      expect(error_for(ig_error(4)).retry_after).to eq(described_class::DEFAULT_RETRY_MINUTES)
    end

    it "nunca leva o token na mensagem de erro" do
      expect(error_for(ig_error(190)).message).not_to include("token-de-teste")
    end
  end

  describe "#debug_token" do
    it "confere o token com o token do app no cabeçalho" do
      instance = client(debug_token: { "data" => { "is_valid" => true, "expires_at" => 0 } })

      expect(instance.debug_token).to include("is_valid" => true)
      expect(@calls.sole[:headers]["Authorization"]).to eq("Bearer 1234|segredo")
      expect(@calls.sole[:uri].path).to eq("/debug_token")
    end
  end
end

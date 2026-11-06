require "rails_helper"

RSpec.describe WidgetCable::Connection, type: :channel do
  let(:connector) { create(:connector_web_widget) }

  def jwt_for(payload, secret: connector.signing_secret, algorithm: "HS256")
    JWT.encode(payload, secret, algorithm)
  end

  it "recusa sem token" do
    expect { connect "/widget-cable" }.to have_rejected_connection
  end

  it "recusa token malformado" do
    expect { connect "/widget-cable?token=garbage" }.to have_rejected_connection
  end

  it "recusa conector desligado" do
    connector.set(status_cd: "inactive")
    token = connector.issue_visitor_jwt("visitor-1")

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa conector pausado" do
    connector.set(status_cd: "paused")
    token = connector.issue_visitor_jwt("visitor-1")

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa conector que não existe" do
    token = jwt_for({ visitor_id: "visitor-1", connector_id: BSON::ObjectId.new.to_s, exp: 1.hour.from_now.to_i })

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa token assinado com o segredo de outro conector" do
    other = create(:connector_web_widget)
    fake = jwt_for({ visitor_id: "visitor-1", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, secret: other.signing_secret)

    expect { connect "/widget-cable?token=#{fake}" }.to have_rejected_connection
  end

  it "recusa token vencido" do
    token = connector.issue_visitor_jwt("visitor-1", ttl: -1.second)

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa token sem assinatura (alg none)" do
    token = JWT.encode({ visitor_id: "visitor-1", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, nil, "none")

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa token sem visitante" do
    token = jwt_for({ connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i })

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa visitante com identificador fora do formato" do
    token = jwt_for({ visitor_id: "../etc/passwd", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i })

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa token cujo conteúdo não é um mapa" do
    token = jwt_for([ "qualquer", "coisa" ])

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "recusa token com operador do Mongo no lugar do id do conector" do
    token = jwt_for({ visitor_id: "visitor-1", connector_id: { "$foo" => 1 }, exp: 1.hour.from_now.to_i })

    expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
  end

  it "conecta com token válido e expõe o visitante e o conector" do
    token = connector.issue_visitor_jwt("visitor-uuid-123")

    connect "/widget-cable?token=#{token}"

    expect(connection.visitor_id).to eq("visitor-uuid-123")
    expect(connection.web_widget_connector_id).to eq(connector.id.to_s)
  end

  describe "origem" do
    before { connector.update!(allowed_origins: [ "https://shop.example.com" ]) }

    it "recusa origem fora da lista" do
      token = connector.issue_visitor_jwt("visitor-1")

      expect {
        connect "/widget-cable?token=#{token}", headers: { "HTTP_ORIGIN" => "https://evil.com" }
      }.to have_rejected_connection
    end

    it "recusa conexão sem origem quando há lista" do
      token = connector.issue_visitor_jwt("visitor-1")

      expect { connect "/widget-cable?token=#{token}" }.to have_rejected_connection
    end

    it "conecta com origem da lista" do
      token = connector.issue_visitor_jwt("visitor-2")

      connect "/widget-cable?token=#{token}", headers: { "HTTP_ORIGIN" => "https://shop.example.com" }

      expect(connection.visitor_id).to eq("visitor-2")
    end
  end

  it "conecta de qualquer origem quando não há lista" do
    token = connector.issue_visitor_jwt("visitor-3")

    connect "/widget-cable?token=#{token}", headers: { "HTTP_ORIGIN" => "https://qualquer.example.com" }

    expect(connection.visitor_id).to eq("visitor-3")
  end

  describe "limite de conexões por IP" do
    around do |example|
      ENV["WIDGET_THROTTLE_TESTS"] = "1"
      example.run
    ensure
      ENV.delete("WIDGET_THROTTLE_TESTS")
    end

    let(:token) { connector.issue_visitor_jwt("visitor-1") }

    def connect_from(ip)
      connect "/widget-cable?token=#{token}", headers: { "HTTP_X_FORWARDED_FOR" => ip }
    end

    it "recusa a partir da 61ª tentativa no minuto" do
      described_class::CONNECT_LIMIT_PER_MINUTE.times { connect_from("203.0.113.9") }

      expect { connect_from("203.0.113.9") }.to have_rejected_connection
    end

    it "conta cada IP separado" do
      described_class::CONNECT_LIMIT_PER_MINUTE.times { connect_from("203.0.113.9") }

      connect_from("203.0.113.10")

      expect(connection.visitor_id).to eq("visitor-1")
    end

    it "deixa conectar quando o cache não conta" do
      allow(Rails.cache).to receive(:increment).and_return(nil)

      (described_class::CONNECT_LIMIT_PER_MINUTE + 1).times { connect_from("203.0.113.9") }

      expect(connection.visitor_id).to eq("visitor-1")
    end
  end
end

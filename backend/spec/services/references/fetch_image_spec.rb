require "rails_helper"

# A única chamada de rede para um endereço digitado. Nada aqui toca a rede:
# o resolvedor e o transporte são dublês.
RSpec.describe References::FetchImage do
  let(:png) { file_fixture("foto.png").binread }

  def resolver(map)
    double(getaddresses: nil).tap do |r|
      map.each { |host, ips| allow(r).to receive(:getaddresses).with(host).and_return(ips) }
    end
  end

  def fetch(url, ips: { "cdn.exemplo.com" => [ "93.184.216.34" ] }, &transport)
    described_class.call(url, resolver: resolver(ips), transport: transport || ->(_uri, _ip) { [ 200, { "content-type" => "image/png" }, png ] })
  end

  def refused(url, **options, &transport)
    fetch(url, **options, &transport)
    nil
  rescue described_class::Refused => e
    e.code
  end

  it "baixa a imagem, conectando no IP conferido" do
    connected = nil
    result = fetch("https://cdn.exemplo.com/post.png") { |uri, ip| connected = [ uri.host, ip ]; [ 200, { "content-type" => "image/png; charset=binary" }, png ] }

    expect(result).to have_attributes(content_type: "image/png", filename: "post.png")
    expect(result.data).to eq(png)
    expect(connected).to eq([ "cdn.exemplo.com", "93.184.216.34" ])
  end

  it "só aceita https, sem usuário na URL" do
    expect(refused("http://cdn.exemplo.com/a.png")).to eq("urlRefused")
    expect(refused("https://user:senha@cdn.exemplo.com/a.png")).to eq("urlRefused")
    expect(refused("ftp://cdn.exemplo.com/a.png")).to eq("urlRefused")
    expect(refused("não é url")).to eq("urlRefused")
  end

  it "recusa host que resolve para rede interna — basta um endereço" do
    {
      "interno" => [ "10.0.0.5" ], "loop" => [ "127.0.0.1" ], "meta" => [ "169.254.169.254" ],
      "cgnat" => [ "100.64.1.1" ], "v6" => [ "::1" ], "ula" => [ "fd00::1" ], "misto" => [ "93.184.216.34", "192.168.0.1" ],
      "mapeado" => [ "::ffff:10.0.0.1" ], "vazio" => []
    }.each do |host, ips|
      expect(refused("https://#{host}/a.png", ips: { host => ips })).to eq("urlRefused"), host
    end
    expect(refused("https://127.0.0.1/a.png")).to eq("urlRefused")
    expect(refused("https://[::1]/a.png")).to eq("urlRefused")
  end

  it "confere de novo cada redirecionamento" do
    ips = { "cdn.exemplo.com" => [ "93.184.216.34" ], "interno.exemplo.com" => [ "10.1.2.3" ] }
    code = refused("https://cdn.exemplo.com/a.png", ips: ips) { |uri, _| uri.host == "cdn.exemplo.com" ? [ 302, { "location" => "https://interno.exemplo.com/x.png" }, "" ] : [ 200, { "content-type" => "image/png" }, png ] }

    expect(code).to eq("urlRefused")
  end

  it "recusa página que não é imagem e resposta de erro" do
    expect(refused("https://cdn.exemplo.com/p") { [ 200, { "content-type" => "text/html" }, "<html>" ] }).to eq("urlNotImage")
    expect(refused("https://cdn.exemplo.com/p") { [ 404, {}, "" ] }).to eq("urlFailed")
  end

  it "para depois de redirecionamentos demais" do
    loop_back = ->(_uri, _ip) { [ 301, { "location" => "https://cdn.exemplo.com/de-novo.png" }, "" ] }

    expect(refused("https://cdn.exemplo.com/a.png", &loop_back)).to eq("urlFailed")
  end
end

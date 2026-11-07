require "rails_helper"

# O engine do Active Storage desenha rotas sem sessão. As de leitura são por link assinado, e a tela
# depende delas. A de upload direto não: nada aqui a usa, e ela guardaria arquivo de qualquer pessoa no
# disco do servidor, sem conta.
RSpec.describe "Rotas do Active Storage", type: :request do
  # Em teste a proteção contra CSRF vem desligada. Liga para valer como em produção: numa aplicação
  # só de API não há sessão, e o `protect_from_forgery` do engine não barra ninguém.
  around do |example|
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    example.run
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  let(:blob_params) do
    { blob: { filename: "malware.exe", byte_size: 1024, checksum: Base64.strict_encode64("0" * 16), content_type: "image/png" } }
  end

  it "não aceita upload direto de quem não tem sessão" do
    expect {
      post "/rails/active_storage/direct_uploads", params: blob_params, as: :json
    }.not_to change(ActiveStorage::Blob, :count)

    expect(response).to have_http_status(:not_found)
  end

  it "não aceita upload direto nem de quem tem sessão" do
    account = create(:account, organization: create(:organization))

    expect {
      post "/rails/active_storage/direct_uploads", params: blob_params, headers: auth_headers(account), as: :json
    }.not_to change(ActiveStorage::Blob, :count)

    expect(response).to have_http_status(:not_found)
  end

  it "continua servindo o arquivo pelo link assinado" do
    blob = ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("conteudo"), filename: "nota.txt", content_type: "text/plain", identify: false
    )

    get Media::Storage.path_for(blob)

    expect(response).to have_http_status(:ok)
  end

  # O que o navegador não pode abrir como página: é o que protege de HTML e SVG enviados como anexo.
  it "entrega HTML e SVG como download, nunca como página" do
    html = ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("<script>alert(1)</script>"), filename: "x.html", content_type: "text/html", identify: false
    )
    svg = ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("<svg onload='alert(1)'/>"), filename: "x.svg", content_type: "image/svg+xml", identify: false
    )

    [ html, svg ].each do |blob|
      get Rails.application.routes.url_helpers.rails_storage_proxy_url(blob, only_path: true, disposition: "inline")

      expect(response.headers["Content-Type"]).to start_with("application/octet-stream")
      expect(response.headers["Content-Disposition"]).to start_with("attachment")
      expect(response.headers["X-Content-Type-Options"]).to eq("nosniff")
    end
  end
end

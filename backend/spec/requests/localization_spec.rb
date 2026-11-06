require "rails_helper"

# Erro levantado dentro da ação cai no `rescue_from`, que roda depois de a ação
# terminar. Se o idioma fosse trocado só em volta da ação, a mensagem de erro
# sairia sempre em pt-BR, mesmo pedindo inglês.
RSpec.describe "Idioma das respostas de erro", type: :request do
  let(:account) { create(:account) }
  let(:headers) { auth_headers(account) }

  it "responde 404 no idioma pedido pelo cabeçalho" do
    patch "/folders/#{SecureRandom.uuid}", params: { folder: { name: "x" } }, headers: headers.merge("Accept-Language" => "en"), as: :json

    expect(response).to have_http_status(:not_found)
    expect(json["error"]["message"]).to eq(I18n.t("errors.not_found", locale: :en))
  end

  it "responde parâmetro faltando no idioma pedido" do
    post "/folders", params: {}, headers: headers.merge("Accept-Language" => "en"), as: :json

    expect(response).to have_http_status(:bad_request)
    expect(json["error"]["message"]).to eq(I18n.t("errors.parameter_missing", param: "folder", locale: :en))
  end

  it "mantém pt-BR como padrão" do
    patch "/folders/#{SecureRandom.uuid}", params: { folder: { name: "x" } }, headers: headers, as: :json

    expect(json["error"]["message"]).to eq(I18n.t("errors.not_found", locale: :"pt-BR"))
  end

  it "não vaza o idioma para a requisição seguinte" do
    patch "/folders/#{SecureRandom.uuid}", params: { folder: { name: "x" } }, headers: headers.merge("Accept-Language" => "en"), as: :json

    expect(I18n.locale).to eq(I18n.default_locale)
  end
end

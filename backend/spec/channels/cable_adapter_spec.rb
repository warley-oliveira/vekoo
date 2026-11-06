require "rails_helper"

# As specs rodam com o adaptador `test`, então nenhuma delas carrega o adaptador
# Redis, que é o de desenvolvimento e produção. Ele declara a própria faixa aceita
# da gem `redis`, e subir a gem para fora dela só estoura em tempo de execução, na
# primeira transmissão, com um Gem::LoadError que passa por `rescue StandardError`.
RSpec.describe "Adaptador Redis do Action Cable" do
  it "é compatível com a gem redis instalada" do
    expect { require "action_cable/subscription_adapter/redis" }.not_to raise_error
  end
end

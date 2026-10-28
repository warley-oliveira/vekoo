require "rails_helper"

# Dev usa `async` e as specs usam `test`: só produção carrega o adaptador do
# `config/cable.yml`. Uma gem `redis` fora da faixa que o adaptador aceita
# (o Action Cable 8.1 pede `< 6`) só aparecia lá — e todo broadcast levantava
# `Gem::LoadError`, que nenhum `rescue StandardError` segura.
RSpec.describe "Adaptador do Action Cable em produção" do
  it "carrega com as gems do bundle" do
    adapter = Rails.application.config_for(:cable, env: "production").fetch(:adapter)

    expect { require "action_cable/subscription_adapter/#{adapter}" }.not_to raise_error
  end
end

require "rails_helper"

# As specs rodam com o adaptador `test`, então nenhuma delas carrega o adaptador
# Redis, que é o de desenvolvimento e produção. Ele declara a própria faixa aceita
# da gem `redis`, e subir a gem para fora dela só estoura em tempo de execução, na
# primeira transmissão, com um Gem::LoadError que passa por `rescue StandardError`.
RSpec.describe "Adaptador Redis do Action Cable" do
  it "é compatível com a gem redis instalada" do
    expect { require "action_cable/subscription_adapter/redis" }.not_to raise_error
  end

  # Ao perder o Redis, o Listener tenta de novo `reconnect_attempts` vezes e depois desiste sem avisar: a thread morre, e o processo
  # nunca mais recebe evento nem confirma assinatura, com os WebSockets abertos, até reiniciar. O padrão é uma tentativa imediata,
  # então qualquer reinício do Redis derrubava o tempo real de todo mundo. Visto com Puma e Redis de verdade.
  describe "ao perder o Redis" do
    %w[development production].each do |environment|
      it "em #{environment}, o Listener insiste por um dia" do
        attempts = Rails.application.config_for(:cable, env: environment)[:reconnect_attempts]

        expect(attempts).to be_an(Array)
        expect(attempts.sum).to be >= 1.day.to_i
        expect(attempts.max).to be <= 5
      end
    end

    it "a insistência é só do Listener: quem transmite não fica preso esperando o Redis voltar" do
      require "action_cable/subscription_adapter/redis"
      allow(Redis).to receive(:new)

      ActionCable::SubscriptionAdapter::Redis.redis_connector.call(
        adapter: "redis", url: "redis://localhost:6379/1", channel_prefix: "vekoo", id: "ActionCable-PID-1", reconnect_attempts: [ 5, 5 ]
      )

      expect(Redis).to have_received(:new).with({ url: "redis://localhost:6379/1", id: "ActionCable-PID-1" })
    end
  end
end

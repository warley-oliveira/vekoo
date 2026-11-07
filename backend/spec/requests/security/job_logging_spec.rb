require "rails_helper"

# O ActiveJob escreve os argumentos no log ao enfileirar, e `filter_parameters` não vale ali. O corpo inteiro de
# um webhook, com mensagem e telefone do contato, ia parar no log de produção.
RSpec.describe "Argumentos de job no log" do
  include ActiveJob::TestHelper

  it "o corpo de um webhook não vai para o log" do
    output = StringIO.new
    original = ActiveJob::Base.logger
    ActiveJob::Base.logger = ActiveSupport::TaggedLogging.new(ActiveSupport::Logger.new(output))

    Inbound::ProcessWebhookJob.perform_later("zapi", { phone: "5531971810932", text: { message: "meu CPF é 123" } }.to_json, "ID", "on_message_received")

    expect(output.string).to include("Inbound::ProcessWebhookJob")
    expect(output.string).not_to include("5531971810932")
    expect(output.string).not_to include("meu CPF")
  ensure
    ActiveJob::Base.logger = original
  end
end

# Atalhos das specs do motor de scripts. Tudo roda em V8 de verdade, sem dublê do `mini_racer`.
module ScriptEngineHelpers
  PUBLIC_IP = "93.184.216.34".freeze

  # O `fetch` resolve o host antes de conectar: sem isto, as specs dependeriam de DNS.
  def stub_public_dns(*hosts, ip: PUBLIC_IP)
    allow(SafeHttp).to receive(:resolve).and_call_original
    hosts.each { |host| allow(SafeHttp).to receive(:resolve).with(host).and_return([ ip ]) }
  end

  # Para as specs de mídia recebida: o host é detalhe delas, e sem isto dependeriam de DNS de verdade.
  def stub_every_host_as_public(ip: PUBLIC_IP)
    allow(SafeHttp).to receive(:resolve).and_return([ ip ])
  end

  def script_session(organization: nil, chat: nil)
    MiniRacerEngine::SessionContext.new.tap do |context|
      context.set(:organization, organization)
      context.set(:chat, chat)
    end
  end

  # Roda o script e devolve `result`.
  def run_script(code, params = {}, organization: nil, chat: nil, **options)
    MiniRacerEngine::Worker.new(script_session(organization: organization, chat: chat))
                           .perform(code, params, **options).result
  end

  def elapsed_seconds
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  end
end

RSpec.configure do |config|
  config.include ScriptEngineHelpers
end

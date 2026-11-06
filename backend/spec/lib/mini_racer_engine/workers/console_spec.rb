# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Console do
  let(:worker) { MiniRacerEngine::Worker.new(script_session) }
  let(:events) { [] }

  before do
    allow(Rails.logger).to receive(:info).and_call_original
    worker.on_event { |name, payload| events << [ name, payload ] }
  end

  it "manda para o log e devolve o que recebeu" do
    expect(worker.perform("return console.log('oi', { a: 1 });").result).to eq([ "oi", { "a" => 1 } ])
    expect(Rails.logger).to have_received(:info).with('[script] ["oi",{"a":1}]')
  end

  it "marca warn e error" do
    worker.perform("console.warn('a'); console.error('b');")

    expect(Rails.logger).to have_received(:info).with(/Warning: .*"a"/)
    expect(Rails.logger).to have_received(:info).with(/Error: .*"b"/)
  end

  it "emite um evento por chamada, com o nome que a tela conhece" do
    worker.perform("console.log('a'); console.warn('b'); console.error('c');")

    expect(events.map(&:first)).to eq(%i[console_log console_warn console_error])
    expect(events.first.last).to include(input: [ "a" ], output: [ "a" ])
  end

  it "info e debug existem, e não fazem nada" do
    expect(worker.perform("console.info('x'); console.debug('y'); return 1;").result).to eq(1)
    expect(events).to be_empty
  end

  it "corta a linha longa" do
    worker.perform("console.log('x'.repeat(100000));")

    expect(Rails.logger).to have_received(:info).with(satisfy { |line| line.length <= MiniRacerEngine::Limits::MAX_CONSOLE_CHARS })
  end

  it "texto em bytes inválidos não derruba o log" do
    expect(worker.perform("console.log('\\uD83D', 'ok'); return 1;").result).to eq(1)
    expect(events.first.last[:input].last).to eq("ok")
  end

  it "recusa argumento gigante antes de copiar para o Ruby" do
    expect { worker.perform("console.log('x'.repeat(2 ** 25));") }.to raise_error(MiniRacer::RuntimeError, /too large/)
  end

  it "para de logar no teto, em silêncio, sem derrubar o script" do
    stub_const("MiniRacerEngine::Limits::MAX_CONSOLE_LINES", 3)

    result = worker.perform("for (let i = 0; i < 50; i++) console.log(i); return 'fim';").result

    expect(result).to eq("fim")
    expect(events.size).to eq(3)
    expect(Rails.logger).to have_received(:info).with(/\[script\]/).exactly(3).times
  end

  it "não gasta a cota de chamadas de quem só está logando" do
    stub_const("MiniRacerEngine::Limits::MAX_CALLS", 2)

    expect(worker.perform("for (let i = 0; i < 10; i++) console.log(i); return 'fim';").result).to eq("fim")
  end
end

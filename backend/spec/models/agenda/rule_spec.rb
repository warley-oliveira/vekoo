require "rails_helper"

RSpec.describe Agenda::Rule do
  let(:professional) { create(:agenda_professional) }

  def days(*windows, enabled: true, day: 1)
    [ { "day_of_week" => day, "enabled" => enabled, "windows" => windows.map { |start, finish| { "start" => start, "end" => finish } } } ]
  end

  it "nasce atendendo de segunda a sábado, com o domingo fechado" do
    rule = create(:agenda_rule, professional: professional)

    expect(rule.windows_on(0)).to be_empty
    expect(rule.windows_on(1)).to eq([ { "start" => "09:00", "end" => "17:00" } ])
    expect(rule.windows_on(6)).to eq([ { "start" => "09:00", "end" => "12:00" } ])
  end

  it "normaliza o que vem da tela" do
    rule = create(:agenda_rule, professional: professional, days: [ { day_of_week: "2", enabled: "true", windows: [ { start: "09:00", end: "12:00" } ] } ])

    expect(rule.reload.days.first).to include("day_of_week" => 2, "enabled" => true)
  end

  it "dia desligado não atende, mesmo com as janelas guardadas" do
    rule = create(:agenda_rule, professional: professional, days: days([ "09:00", "12:00" ], enabled: false))

    expect(rule.windows_on(1)).to be_empty
  end

  {
    "formato inválido" => [ [ "9h", "12:00" ] ],
    "hora que não existe" => [ [ "25:00", "26:00" ] ],
    "início depois do fim" => [ [ "12:00", "09:00" ] ],
    "início igual ao fim" => [ [ "09:00", "09:00" ] ],
    "faixas sobrepostas" => [ [ "09:00", "12:00" ], [ "11:00", "13:00" ] ]
  }.each do |description, windows|
    it "recusa #{description}" do
      rule = build(:agenda_rule, professional: professional, days: days(*windows))

      expect(rule).not_to be_valid
      expect(rule.errors[:days]).to be_present
    end
  end

  it "recusa dia ligado sem janela" do
    expect(build(:agenda_rule, professional: professional, days: days)).not_to be_valid
  end

  it "não confere janela de dia desligado" do
    expect(build(:agenda_rule, professional: professional, days: days([ "12:00", "09:00" ], enabled: false))).to be_valid
  end

  it "recusa dia da semana que não existe, e dia repetido" do
    expect(build(:agenda_rule, professional: professional, days: days(day: 7, enabled: false))).not_to be_valid
    expect(build(:agenda_rule, professional: professional, days: days(day: 1, enabled: false) + days(day: 1, enabled: false))).not_to be_valid
  end

  it "aceita bloqueio em hora de parede, e recusa início depois do fim" do
    expect(build(:agenda_rule, professional: professional, blocked_times: [ { "start" => "2026-11-20 14:00", "end" => "2026-11-20 16:00" } ])).to be_valid
    expect(build(:agenda_rule, professional: professional, blocked_times: [ { "start" => "2026-11-20 16:00", "end" => "2026-11-20 14:00" } ])).not_to be_valid
    expect(build(:agenda_rule, professional: professional, blocked_times: [ { "start" => "ontem", "end" => "hoje" } ])).not_to be_valid
  end
end

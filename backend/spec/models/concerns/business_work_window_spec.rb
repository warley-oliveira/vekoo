require "rails_helper"

# A janela de atendimento mora na organização, em `settings`, no fuso IANA dela.
RSpec.describe BusinessWorkWindow do
  include ActiveSupport::Testing::TimeHelpers

  subject(:organization) do
    build(
      :organization,
      timezone: timezone,
      settings: { "business_work_enabled" => enabled, "business_work" => { "days" => days } }
    )
  end

  let(:enabled) { true }
  let(:timezone) { "America/Sao_Paulo" }
  let(:business_weekdays) do
    (1..5).map do |day|
      { "day_of_week" => day.to_s, "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] }
    end
  end
  let(:days) { business_weekdays }

  # 2026-09-28 é segunda-feira.
  def at_local(string, offset = "-03:00", &block)
    travel_to(Time.new(*string.split(/[- :]/).map(&:to_i), 0, offset), &block)
  end

  describe "#business_work_enabled" do
    it "é falso sem nada configurado" do
      expect(build(:organization).business_work_enabled).to be(false)
    end

    it "lê texto vindo de formulário" do
      expect(build(:organization, settings: { "business_work_enabled" => "true" }).business_work_enabled).to be(true)
      expect(build(:organization, settings: { "business_work_enabled" => "false" }).business_work_enabled).to be(false)
    end
  end

  describe "#inside_business_window?" do
    context "com a janela desligada" do
      let(:enabled) { false }

      it "está sempre dentro" do
        at_local("2026-09-27 03:00") { expect(organization.inside_business_window?).to be(true) }
      end
    end

    it "está dentro durante uma janela habilitada" do
      at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(true) }
    end

    it "inclui a abertura" do
      at_local("2026-09-28 09:00") { expect(organization.inside_business_window?).to be(true) }
    end

    it "inclui o fechamento" do
      at_local("2026-09-28 18:00") { expect(organization.inside_business_window?).to be(true) }
    end

    it "está fora antes da janela" do
      at_local("2026-09-28 08:59") { expect(organization.inside_business_window?).to be(false) }
    end

    it "está fora depois da janela" do
      at_local("2026-09-28 18:01") { expect(organization.inside_business_window?).to be(false) }
    end

    it "está fora num dia não habilitado" do
      at_local("2026-09-27 10:00") { expect(organization.inside_business_window?).to be(false) }
    end

    context "com um dia que tem janelas mas está desabilitado" do
      let(:days) { [ { "day_of_week" => "1", "enabled" => "false", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] } ] }

      it "está fora" do
        at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(false) }
      end
    end

    context "com mais de uma janela no dia" do
      let(:days) do
        [ {
          "day_of_week" => "1",
          "enabled" => "true",
          "windows" => [ { "start" => "09:00", "end" => "12:00" }, { "start" => "13:00", "end" => "18:00" } ]
        } ]
      end

      it "está fora no intervalo" do
        at_local("2026-09-28 12:30") { expect(organization.inside_business_window?).to be(false) }
      end

      it "está dentro da segunda janela" do
        at_local("2026-09-28 15:00") { expect(organization.inside_business_window?).to be(true) }
      end
    end

    context "com o fuso em UTC-5 (Bogotá)" do
      let(:timezone) { "America/Bogota" }

      it "avalia a janela no fuso da organização" do
        # 10:30 em Brasília são 08:30 em Bogotá, antes da abertura.
        at_local("2026-09-28 10:30") { expect(organization.inside_business_window?).to be(false) }
      end

      it "abre às 9h de Bogotá, 11h em Brasília" do
        at_local("2026-09-28 11:00") { expect(organization.inside_business_window?).to be(true) }
      end

      context "com janela só no domingo à noite" do
        let(:days) { [ { "day_of_week" => "0", "enabled" => "true", "windows" => [ { "start" => "22:00", "end" => "23:30" } ] } ] }

        it "usa o dia da semana do fuso da organização" do
          # Segunda 01:00 em Brasília ainda é domingo 23:00 em Bogotá.
          at_local("2026-09-28 01:00") { expect(organization.inside_business_window?).to be(true) }
        end
      end
    end

    context "com um fuso de horário de verão (Nova York)" do
      let(:timezone) { "America/New_York" }

      it "abre às 9h com o relógio de verão" do
        # 13:30 UTC em julho são 09:30 em Nova York (UTC-4).
        travel_to(Time.utc(2026, 7, 6, 13, 30)) { expect(organization.inside_business_window?).to be(true) }
      end

      it "o mesmo horário UTC ainda não abriu no inverno" do
        # 13:30 UTC em janeiro são 08:30 em Nova York (UTC-5).
        travel_to(Time.utc(2026, 1, 5, 13, 30)) { expect(organization.inside_business_window?).to be(false) }
      end
    end

    context "com um fuso que não existe" do
      let(:timezone) { "Marte/Olympus" }

      it "cai no padrão, São Paulo, em vez de quebrar" do
        at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(true) }
      end
    end

    context "sem os dias configurados" do
      subject(:organization) { build(:organization, settings: { "business_work_enabled" => true, "business_work" => {} }) }

      it "não quebra e está fora" do
        at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(false) }
      end
    end

    context "com business_work que não é um mapa" do
      subject(:organization) { build(:organization, settings: { "business_work_enabled" => true, "business_work" => "lixo" }) }

      it "não quebra e está fora" do
        at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(false) }
      end
    end

    context "com um horário gravado errado" do
      let(:days) { [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "abc", "end" => "18:00" } ] } ] }

      it "não considera a janela" do
        at_local("2026-09-28 10:00") { expect(organization.inside_business_window?).to be(false) }
      end
    end
  end

  describe "#next_business_window" do
    it "devolve a próxima abertura no mesmo dia" do
      at_local("2026-09-28 07:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 9, 28, 9, 0, 0, "-03:00"))
      end
    end

    it "pula o fim de semana" do
      at_local("2026-10-02 19:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 10, 5, 9, 0, 0, "-03:00"))
      end
    end

    it "atravessa o fim do mês sem quebrar" do
      # 2026-01-30 é sexta-feira; a próxima abertura é segunda, 2026-02-02.
      at_local("2026-01-30 20:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 2, 2, 9, 0, 0, "-03:00"))
      end
    end

    it "acha o mesmo dia da semana uma semana depois" do
      organization.settings["business_work"]["days"] = [ business_weekdays.first ]

      at_local("2026-09-28 19:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 10, 5, 9, 0, 0, "-03:00"))
      end
    end

    it "só considera abertura estritamente futura" do
      at_local("2026-09-28 09:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 9, 29, 9, 0, 0, "-03:00"))
      end
    end

    it "devolve no fuso da organização" do
      organization.timezone = "America/Bogota"

      at_local("2026-09-28 07:00") do
        expect(organization.next_business_window).to eq(Time.new(2026, 9, 28, 9, 0, 0, "-05:00"))
      end
    end

    context "com a janela desligada" do
      let(:enabled) { false }

      it "devolve nil" do
        at_local("2026-09-28 07:00") { expect(organization.next_business_window).to be_nil }
      end
    end

    context "com as janelas fora de ordem" do
      let(:days) do
        [ {
          "day_of_week" => "1",
          "enabled" => "true",
          "windows" => [ { "start" => "14:00", "end" => "18:00" }, { "start" => "08:00", "end" => "12:00" } ]
        } ]
      end

      it "devolve a abertura futura mais cedo" do
        at_local("2026-09-28 06:00") do
          expect(organization.next_business_window).to eq(Time.new(2026, 9, 28, 8, 0, 0, "-03:00"))
        end
      end

      it "pega a segunda janela do dia quando a primeira já passou" do
        at_local("2026-09-28 13:00") do
          expect(organization.next_business_window).to eq(Time.new(2026, 9, 28, 14, 0, 0, "-03:00"))
        end
      end
    end

    context "sem nenhum dia habilitado" do
      let(:days) { [] }

      it "devolve nil" do
        at_local("2026-09-28 06:00") { expect(organization.next_business_window).to be_nil }
      end
    end
  end

  describe "normalização" do
    it "preenche enabled ausente como falso e converte os campos para texto" do
      windows = [ { start: "09:00", end: "10:00" }, { start: "" } ]
      organization.settings["business_work"] = { days: [ { day_of_week: 2, windows: windows } ] }

      organization.valid?

      expect(organization.business_work["days"]).to eq(
        [ { "day_of_week" => "2", "enabled" => "false", "windows" => [ { "start" => "09:00", "end" => "10:00" } ] } ]
      )
    end

    it "transforma enabled booleano em texto" do
      organization.settings["business_work"] = { "days" => [ { "day_of_week" => "1", "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "10:00" } ] } ] }

      organization.valid?

      expect(organization.business_work["days"].first["enabled"]).to eq("true")
    end

    it "aceita dias e janelas como mapa, como chega de formulário" do
      organization.settings["business_work"] = {
        "days" => { "0" => { "day_of_week" => "1", "enabled" => "true", "windows" => { "0" => { "start" => " 09:00 ", "end" => "10:00" } } } }
      }

      organization.valid?

      expect(organization.business_work["days"]).to eq(
        [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "10:00" } ] } ]
      )
    end

    it "descarta dia sem day_of_week" do
      organization.settings["business_work"] = { "days" => [ { "enabled" => "true" }, business_weekdays.first ] }

      organization.valid?

      expect(organization.business_work["days"].map { |day| day["day_of_week"] }).to eq([ "1" ])
    end

    it "persiste o formato normalizado" do
      organization.settings["business_work"] = { days: [ { day_of_week: 1, enabled: true, windows: [ { start: "09:00", end: "18:00" } ] } ] }

      organization.save!

      expect(organization.reload.settings["business_work"]["days"]).to eq(
        [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] } ]
      )
    end

    describe BusinessWorkWindow::Normalizer do
      it "aceita os parâmetros do controlador" do
        params = ActionController::Parameters.new(days: [ { day_of_week: "1", enabled: "true", windows: [ { start: "09:00", end: "18:00" } ] } ])

        expect(described_class.call(params)).to eq(
          "days" => [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] } ]
        )
      end

      it "devolve como veio o que não é um mapa" do
        expect(described_class.call("lixo")).to eq("lixo")
        expect(described_class.call(nil)).to be_nil
      end

      it "sem dias, não inventa a chave" do
        expect(described_class.call({ "outro" => 1 })).to eq("outro" => 1)
      end

      it "descarta dia e janela que não são mapas" do
        expect(described_class.days([ "lixo", { "day_of_week" => "2", "windows" => [ "lixo", { "start" => "09:00", "end" => "10:00" } ] } ])).to eq(
          [ { "day_of_week" => "2", "enabled" => "false", "windows" => [ { "start" => "09:00", "end" => "10:00" } ] } ]
        )
      end
    end
  end

  describe "validação" do
    def errors_for(days)
      organization.settings["business_work"] = { "days" => days }
      organization.valid?
      organization.errors[:settings]
    end

    def day(windows, enabled: "true")
      { "day_of_week" => "1", "enabled" => enabled, "windows" => windows }
    end

    it "aceita uma agenda válida" do
      expect(errors_for(business_weekdays)).to be_empty
    end

    it "aceita janelas encostadas" do
      windows = [ { "start" => "09:00", "end" => "12:00" }, { "start" => "12:00", "end" => "13:00" } ]

      expect(errors_for([ day(windows) ])).to be_empty
    end

    it "aceita horário sem zero à esquerda" do
      expect(errors_for([ day([ { "start" => "9:00", "end" => "18:00" } ]) ])).to be_empty
    end

    it "recusa janela que termina antes de começar" do
      expect(errors_for([ day([ { "start" => "18:00", "end" => "09:00" } ]) ]))
        .to include(a_string_matching(/início deve ser anterior ao fim/))
    end

    it "recusa janela de duração zero" do
      expect(errors_for([ day([ { "start" => "09:00", "end" => "09:00" } ]) ]))
        .to include(a_string_matching(/início deve ser anterior ao fim/))
    end

    it "recusa janelas sobrepostas" do
      windows = [ { "start" => "09:00", "end" => "12:00" }, { "start" => "11:00", "end" => "13:00" } ]

      expect(errors_for([ day(windows) ])).to include(a_string_matching(/sobrepostos/))
    end

    it "acha a sobreposição com as janelas fora de ordem" do
      windows = [ { "start" => "11:00", "end" => "13:00" }, { "start" => "09:00", "end" => "12:00" } ]

      expect(errors_for([ day(windows) ])).to include(a_string_matching(/sobrepostos/))
    end

    it "recusa horário inválido" do
      expect(errors_for([ day([ { "start" => "25:00", "end" => "26:00" } ]) ])).to include(a_string_matching(/HH:MM/))
    end

    it "recusa dia habilitado sem intervalos" do
      expect(errors_for([ day([]) ])).to include(a_string_matching(/ao menos um intervalo/))
    end

    it "nomeia o dia com problema" do
      expect(errors_for([ day([]) ])).to include(a_string_matching(/segunda-feira/))
    end

    it "ignora janela inválida em dia desabilitado" do
      disabled = day([ { "start" => "18:00", "end" => "09:00" } ], enabled: "false")

      expect(errors_for([ disabled, *business_weekdays.drop(1) ])).to be_empty
    end

    it "exige um dia habilitado com a janela ligada" do
      expect(errors_for([])).to include(a_string_matching(/habilite ao menos um dia/))
    end

    context "com a janela desligada" do
      let(:enabled) { false }

      it "aceita nenhum dia habilitado" do
        expect(errors_for([])).to be_empty
      end
    end

    it "bloqueia o save com janela inválida" do
      organization.settings["business_work"] = { "days" => [ day([]) ] }

      expect(organization.save).to be(false)
    end

    it "não valida de novo quando a janela não mudou" do
      saved = create(:organization)
      saved.update_column(:settings, { "business_work_enabled" => true, "business_work" => { "days" => [] } })
      saved.reload

      saved.settings = saved.settings.merge("automation_pause_period" => "hours")

      expect(saved).to be_valid
    end

    it "valida ao ligar a janela sobre uma agenda que já estava gravada" do
      saved = create(:organization, settings: { "business_work_enabled" => false, "business_work" => { "days" => [] } })

      saved.settings = saved.settings.merge("business_work_enabled" => true)

      expect(saved).not_to be_valid
      expect(saved.errors[:settings]).to include(a_string_matching(/habilite ao menos um dia/))
    end

    it "sai no idioma pedido" do
      organization.settings["business_work"] = { "days" => [] }

      I18n.with_locale(:en) do
        organization.valid?

        expect(organization.errors[:settings]).to eq([ I18n.t("connectors.business_work.no_days", locale: :en) ])
      end
    end
  end
end

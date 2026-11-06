require "rails_helper"

RSpec.describe Outreach::SendWindow do
  subject(:window) { described_class.new(campaign) }

  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:hours) { { send_start_hour: 9, send_end_hour: 18 } }
  # Segunda a sexta.
  let(:campaign) { build(:outreach_campaign, send_days: [ 1, 2, 3, 4, 5 ], **hours) }

  # 2026-11-09 é uma segunda-feira.
  def monday(hour, minute = 0)
    zone.local(2026, 11, 9, hour, minute)
  end

  describe "#advance" do
    it "dentro da janela, é o próprio horário" do
      expect(window.advance(monday(10, 30))).to eq(monday(10, 30))
    end

    it "antes da janela, vai para o início" do
      expect(window.advance(monday(7, 15))).to eq(monday(9))
    end

    it "depois da janela, vai para o início do próximo dia" do
      expect(window.advance(monday(18, 0))).to eq(monday(9) + 1.day)
    end

    it "na sexta à noite, pula o fim de semana" do
      friday_night = monday(20) + 4.days

      expect(window.advance(friday_night)).to eq(monday(9) + 7.days)
    end

    it "no sábado, vai para segunda" do
      saturday = monday(12) + 5.days

      expect(window.advance(saturday)).to eq(monday(9) + 7.days)
    end

    it "respeita o fuso da campanha" do
      campaign.timezone = "America/Manaus"

      # 10h em São Paulo são 9h em Manaus: a janela de Manaus acabou de abrir.
      expect(window.advance(monday(10)).hour).to eq(9)
    end

    context "com fim menor ou igual ao início" do
      let(:hours) { { send_start_hour: 9, send_end_hour: 9 } }

      # Janela de 24 horas, como na origem.
      it "não restringe a hora" do
        expect(window.advance(monday(3))).to eq(monday(3))
        expect(window.advance(monday(23))).to eq(monday(23))
      end

      it "continua respeitando o dia" do
        expect(window.advance(monday(3) + 5.days).wday).to eq(1)
      end
    end
  end

  describe "#next_day_start" do
    it "vai para o início do dia seguinte" do
      expect(window.next_day_start(monday(10))).to eq(monday(9) + 1.day)
    end

    it "pula os dias não permitidos" do
      expect(window.next_day_start(monday(10) + 4.days)).to eq(monday(9) + 7.days)
    end

    # Na origem isto era um `loop` sem saída, que prendia a thread para sempre.
    it "levanta em vez de ficar procurando um dia que não existe" do
      campaign.send_days = []

      expect { window.next_day_start(monday(10)) }.to raise_error(ArgumentError, /sem dia de envio/)
    end
  end

  describe "#day_key" do
    it "conta o dia no fuso da campanha" do
      # 1h da manhã em UTC ainda é o dia anterior em São Paulo.
      expect(window.day_key(Time.utc(2026, 11, 10, 1))).to eq("2026-11-09")
    end
  end

  describe "#estimate_completion" do
    let(:campaign) do
      build(:outreach_campaign, send_days: [ 1, 2, 3, 4, 5 ], buffer_min_seconds: 60, buffer_max_seconds: 60, daily_limit_per_connector: 100, **hours)
    end

    it "nada para enviar, nada para estimar" do
      expect(window.estimate_completion(0, from: monday(10))).to be_nil
    end

    it "uma mensagem sai na hora" do
      expect(window.estimate_completion(1, from: monday(10))).to eq(monday(10))
    end

    it "soma os intervalos" do
      expect(window.estimate_completion(11, from: monday(10))).to eq(monday(10, 10))
    end

    it "começa quando a janela abre" do
      expect(window.estimate_completion(2, from: monday(7))).to eq(monday(9, 1))
    end

    it "passa para o dia seguinte quando a janela acaba" do
      # Às 17h50 cabem 11 mensagens (uma por minuto até as 18h).
      expect(window.estimate_completion(12, from: monday(17, 50))).to eq(monday(9) + 1.day)
    end

    it "passa para o dia seguinte quando o limite do dia acaba" do
      expect(window.estimate_completion(101, from: monday(9))).to eq(monday(9) + 1.day)
    end

    it "conta o que o canal já enviou hoje" do
      expect(window.estimate_completion(1, from: monday(9), used_today: 100)).to eq(monday(9) + 1.day)
    end

    it "pula o fim de semana" do
      friday = monday(9) + 4.days

      expect(window.estimate_completion(101, from: friday)).to eq(monday(9) + 7.days)
    end

    # A origem andava destinatário a destinatário, dentro da requisição.
    it "para listas grandes, responde sem andar um por um" do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      result = window.estimate_completion(50_000, from: monday(9))

      expect(Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).to be < 0.5
      expect(result).to be > monday(9) + 400.days
    end
  end
end

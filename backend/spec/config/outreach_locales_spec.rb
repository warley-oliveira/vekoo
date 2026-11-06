require "rails_helper"

# O código é o contrato de máquina; a mensagem vem daqui. Sem a tradução, a pessoa veria a mensagem
# genérica de "confira os campos" para uma recusa que não tem campo nenhum.
RSpec.describe "Traduções do domínio outreach" do
  sources = Rails.root.glob("app/{services/outreach,jobs/outreach}/**/*.rb") +
            Rails.root.glob("app/controllers/{campaign,place_extraction}*.rb")
  # `connectorsSkipped` é aviso, e a mensagem dele sai pronta da resposta do lançamento.
  error_codes = sources.flat_map { |file| file.read.scan(/(?:code: |RefusedError(?:, |\.new\()|ApifyError(?:\.new\()?,? ?|Error, )"([a-z]+[A-Z]\w*)"/).flatten }.uniq - %w[connectorsSkipped]
  apify_codes = %w[apifyNotConfigured apifyInvalidToken apifyQuotaExceeded apifyTimeout apifyFailed interrupted]
  recipient_codes = Outreach::SendRecipientService.constants
                                                  .map { |name| Outreach::SendRecipientService.const_get(name) }
                                                  .select { |value| value.is_a?(String) } + [ Outreach::StuckRecipients::INTERRUPTED ]

  %i[pt-BR en].each do |locale|
    context "em #{locale}" do
      (error_codes + apify_codes).uniq.each do |code|
        it "o erro #{code} tem mensagem" do
          expect(I18n.exists?("errors.#{code.underscore}", locale)).to be(true)
        end
      end

      recipient_codes.uniq.each do |code|
        it "a falha #{code} do destinatário tem mensagem" do
          expect(I18n.exists?("outreach.recipient_errors.#{code.underscore}", locale)).to be(true)
        end
      end

      %i[paused launch_failed].each do |kind|
        it "o aviso #{kind} tem título e descrição" do
          expect(I18n.exists?("outreach.notices.#{kind}.title", locale)).to be(true)
          expect(I18n.exists?("outreach.notices.#{kind}.description", locale)).to be(true)
        end
      end

      %w[scheduled paused_no_active_connectors launch_failed channel_stopped_connector_inactive channel_stopped_connector_missing channel_resumed time_format].each do |key|
        it "a atividade #{key} tem frase" do
          expect(I18n.exists?("outreach.activity.#{key}", locale)).to be(true)
        end
      end
    end
  end

  it "achou os códigos no código-fonte" do
    expect(error_codes).to include("campaignNotLaunchable", "noActiveConnectors", "googleSheetEmpty", "tooManyContacts")
  end
end

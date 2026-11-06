module Outreach
  # Avisa quem criou a campanha quando a própria plataforma mudou o rumo dela, em um horário em que
  # ninguém está olhando o monitor (pausou sem canal, não conseguiu lançar a agendada).
  module CreatorNotice
    module_function

    # @param kind [Symbol] :paused, :launch_failed
    def call(campaign, kind)
      account = Account.find_by(id: campaign.created_by_account_id, organization_id: campaign.organization_id)
      return unless account

      I18n.with_locale(account.locale.presence || I18n.default_locale) do
        AccountNotice.create!(
          account_id: account.id,
          organization_id: campaign.organization_id,
          title: I18n.t("outreach.notices.#{kind}.title", name: campaign.name.truncate(120)),
          description: I18n.t("outreach.notices.#{kind}.description"),
          url: "/campaigns/#{campaign.id}",
          category: "system"
        )
      end
    rescue StandardError => e
      # O aviso é um extra: a mudança já está feita e já aparece na tela.
      Rails.logger.error("[Outreach::CreatorNotice] #{kind} #{campaign.id}: #{e.class}: #{e.message}")
    end
  end
end

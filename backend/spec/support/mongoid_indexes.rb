# As agregações do dashboard, dos funis e dos dashboards personalizados dizem o índice por `hint`, e
# `hint` de índice que não existe é erro (ver `Insights::ChatIndexes`). Nenhum destes tem índice único,
# então criá-los não muda o comportamento de nenhuma outra spec. Depois de spec/support/mongoid.rb, que
# apaga as coleções; `truncate!` só apaga os documentos.
RSpec.configure do |config|
  config.before(:suite) do
    [ Chat, ChatMessage::Base, Agenda::Booking, Outreach::Campaign, HookLog ].each(&:create_indexes)
  end
end

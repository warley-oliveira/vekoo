module Agenda
  # A foto dos profissionais ligados a uma conta. A foto é um anexo da `Account`, no Postgres:
  # uma listagem inteira resolve em uma consulta só, em vez de uma por profissional.
  module ProfessionalDirectory
    module_function

    # @return [Hash] { account_id => caminho da foto, ou nil }
    def avatars(professionals)
      ids = professionals.filter_map(&:account_id).uniq
      return {} if ids.empty?

      Account.where(id: ids).with_attached_avatar.to_h do |account|
        [ account.id, StoredImagePath.for(account.avatar, :thumb) ]
      end
    end
  end
end

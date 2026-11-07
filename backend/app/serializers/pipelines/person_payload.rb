module Pipelines
  # A pessoa como aparece dentro de card, comentário e atividade: o bastante para mostrar o avatar.
  module PersonPayload
    module_function

    def json(account)
      return nil if account.nil?

      {
        id: account.id,
        name: account.name,
        email: account.email,
        avatarUrl: StoredImagePath.for(account.avatar, :thumb)
      }
    end

    # Para `includes` de quem lista muitas pessoas: é o que evita duas consultas por avatar.
    def preload
      { user: { avatar_attachment: :blob } }
    end
  end
end

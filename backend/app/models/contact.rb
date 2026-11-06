# Contato sem coleção própria: é a visão de uma conversa como pessoa.
#
# Na origem `Contact` era um stub apontando para o banco externo do codechat, que
# ninguém mais escreve, e o único campo lido (a foto) só aparecia num fallback
# comentado. O que sobrou de uso real é `chat.contact` nos fluxos, para saber nome e
# identificador de quem conversa, e isso a própria conversa já tem.
#
# A listagem de contatos (`/contacts`) é agregação sobre `Chat`, do domínio inbox.
class Contact
  attr_reader :id, :external_id, :name, :phone, :profile_picture_url

  def self.from_chat(chat)
    new(
      id: chat.external_id,
      external_id: chat.external_id,
      name: chat.display_name.presence || chat.user_name,
      phone: chat.phone_number,
      profile_picture_url: chat.profile_picture_url
    )
  end

  def initialize(id:, external_id:, name:, phone:, profile_picture_url:)
    @id = id
    @external_id = external_id
    @name = name
    @phone = phone
    @profile_picture_url = profile_picture_url
  end
end

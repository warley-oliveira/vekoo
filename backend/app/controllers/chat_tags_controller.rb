# Etiquetas: cadastro e aplicar ou remover de uma conversa. O modelo `ChatTag` é do núcleo.
#
# Ler é aberto a qualquer sessão: campanhas, fluxos e pipelines filtram e marcam por etiqueta, e o
# nome de uma etiqueta não é dado de ninguém. Quem atende cuida do resto, porque é no chat que elas
# nascem. Contar as conversas de uma etiqueta passa também por quem cuida de contatos.
class ChatTagsController < PlatformController
  include InboxAccess

  require_any_permission :chat, :contacts, only: :assigns
  # Campanhas criam etiqueta na hora de montar o público, como na origem.
  require_any_permission :chat, :campaigns, only: :create
  require_permission :chat, except: %i[index show assigns create]

  before_action :set_tag, except: %i[index create]
  before_action :set_chat, only: %i[apply remove]

  def index
    records, meta = paginate(
      ChatTag.where(organization_id: current_organization.id.to_s).order_by(name: :asc, _id: :asc),
      per_page: Paginated::MAX_PER_PAGE
    )

    render json: { chatTags: ChatTagSerializer.many(records), meta: meta }
  end

  def show
    render json: { chatTag: ChatTagSerializer.one(@tag) }
  end

  def create
    tag = ChatTag.new(tag_params.merge(organization_id: current_organization.id.to_s))
    return render_name_taken if name_taken?(tag)

    if tag.save
      render json: { chatTag: ChatTagSerializer.one(tag) }, status: :created
    else
      render_invalid(tag)
    end
  end

  def update
    @tag.assign_attributes(tag_params)
    return render_name_taken if @tag.name_changed? && name_taken?(@tag)

    if @tag.save
      render json: { chatTag: ChatTagSerializer.one(@tag) }
    else
      render_invalid(@tag)
    end
  end

  # Tira a etiqueta de todas as conversas (ver ChatTag#detach_from_chats). A tela pergunta
  # antes quantas são, em `assigns`.
  def destroy
    @tag.destroy
    head :no_content
  end

  # Quantas conversas usam a etiqueta, para a tela avisar antes de apagar.
  def assigns
    render json: { count: @tag.chats.count }
  end

  # PUT /chat-tags/:id/chats/:chat_id. Atômico, sem passar pelos callbacks de Chat: não
  # sobrescreve edição concorrente e não cria nota no histórico.
  def apply
    @chat.add_to_set(chat_tag_ids: @tag.id)
    render_chat_tags
  end

  # DELETE /chat-tags/:id/chats/:chat_id
  def remove
    @chat.pull(chat_tag_ids: @tag.id)
    render_chat_tags
  end

  private

  def set_tag
    @tag = ChatTag.where(organization_id: current_organization.id.to_s, id: params[:id]).take
    render_not_found unless @tag
  end

  def set_chat
    @chat = find_visible_chat(params[:chat_id])
    render_not_found unless @chat
  end

  # `add_to_set` e `pull` não disparam after_update: a lista conectada precisa saber.
  def render_chat_tags
    @chat.dispatch_event!

    render json: { tagIds: Array(@chat.chat_tag_ids).map(&:to_s) }
  end

  def tag_params
    params.expect(chat_tag: %i[name description color]).to_h
  end

  # O nome é gravado em forma de slug: "VIP" e "vip" são a mesma etiqueta. Duas com o mesmo nome
  # confundiriam a tela e quem procura por nome, como fluxos e a remoção automática de
  # "aguardando-operador".
  def name_taken?(tag)
    slug = tag.name.to_s.parameterize.dasherize
    return false if slug.blank?

    ChatTag.where(organization_id: current_organization.id.to_s, name: slug).where(:_id.ne => tag.id).exists?
  end

  def render_name_taken
    render_error(status: :unprocessable_content, code: "tagNameTaken", field: "name")
  end
end

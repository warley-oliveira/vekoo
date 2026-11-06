# A lista de contatos: filtros, ações em lote e exportação (origem: v1/contacts). Contato aqui é a
# conversa (ver `Contact`), então a lista respeita `chat_list_to`. Tudo fora disso responde como se
# não existisse.
class ContactsController < PlatformController
  include InboxAccess

  SORTABLE = %w[last_message_at created_at user_name status unread_messages].freeze
  # A rota síncrona segura uma thread do Puma. Acima disto, vai pelo canal, em segundo plano.
  MAX_SYNC_EXPORT = 5_000

  # `download_export` é aberto pelo navegador num link: quem autoriza é o token assinado.
  skip_before_action :require_session, only: :download_export
  skip_before_action :set_current_context, only: :download_export

  require_permission :contacts, except: :download_export

  # GET /contacts?q=&tagIds[]=&connectorIds[]=&assignedUser=&status=&automationEnabled=&hasSession=
  #               &dateFrom=&dateTo=&sortBy=&sortDir=&page=&perPage=
  def index
    records, meta = paginate(
      Contacts::Query.new(account: current_account, filters: params, time_zone: organization_time_zone)
                     .criteria.only(*ContactSerializer::FIELDS).order_by(sort_column => sort_direction)
    )
    rows = records.to_a
    connectors = connectors_by_id(rows)

    render json: {
      contacts: rows.map { |chat| ContactSerializer.one(chat, connector: connectors[chat.connector_id]) },
      meta: meta
    }
  end

  # GET /contacts/filters: as opções dos filtros da tela.
  def filters
    render json: {
      connectors: ConnectorSerializer.many(
        Connector::Base.where(organization_id: current_organization.id.to_s, :_type.in => ChatsController::CHAT_CONNECTOR_TYPES).order_by(created_at: :asc)
      ),
      tags: ChatTagSerializer.many(ChatTag.where(organization_id: current_organization.id.to_s).order_by(name: :asc)),
      users: current_organization.accounts.active.order(:name, :id).pluck(:id, :name).map { |id, name| { id: id, name: name } },
      teams: current_organization.teams.order(:name, :id).pluck(:id, :name).map { |id, name| { id: id, name: name } }
    }
  end

  # POST /contacts/bulk-add-tags { selectAll, filters, excludedIds | chatIds, tagIds }
  def bulk_add_tags
    with_tags_and_selection do |tag_ids, chats|
      chats.update_all("$addToSet" => { chat_tag_ids: { "$each" => tag_ids } })
    end
  end

  # POST /contacts/bulk-remove-tags. Etiqueta de outra organização nem chega a sair.
  def bulk_remove_tags
    with_tags_and_selection do |tag_ids, chats|
      chats.update_all("$pullAll" => { chat_tag_ids: tag_ids })
    end
  end

  # POST /contacts/bulk-assign-user { ..., accountId } (nulo tira a atribuição).
  #
  # Direto no banco, como na origem: sem nota no histórico nem evento por conversa, porque um lote
  # pode ter milhares. A tela recarrega a lista depois.
  def bulk_assign_user
    account_id = params[:account_id].presence
    if account_id && !Chats::Assignment.assignable?(current_organization, account_id)
      return render_error(status: :unprocessable_content, code: "invalidAssignee", field: "accountId")
    end

    with_selection { |chats| chats.update_all(assigned_account_id: account_id) }
  end

  # POST /contacts/bulk-update-status { ..., status }
  def bulk_update_status
    status = params[:status].to_s
    return render_error(status: :unprocessable_content, code: "invalidStatus", field: "status") unless Chat::STATUSES.include?(status)

    with_selection { |chats| chats.update_all(status: status) }
  end

  # POST /contacts/bulk-toggle-automation { ..., automationEnabled }. Invalida o religamento agendado,
  # como a mudança à mão em uma conversa.
  def bulk_toggle_automation
    enabled = ActiveModel::Type::Boolean.new.cast(params[:automation_enabled])
    return render_error(status: :unprocessable_content, code: "unprocessable", field: "automationEnabled") if enabled.nil?

    with_selection { |chats| chats.update_all(automation_enabled: enabled, active_job_id: nil, automation_resume_at: nil) }
  end

  # GET /contacts/export: a exportação na hora, em CSV. Serve a listas pequenas; acima de
  # MAX_SYNC_EXPORT, use `export` em ContactsExportChannel.
  def export
    # Por link não há corpo: os filtros vêm soltos na query.
    scope = selection(filters: params[:filters].presence || params).criteria_or_filtered
    return render_error(status: :unprocessable_content, code: "exportTooLarge") if scope.count > MAX_SYNC_EXPORT

    send_data Contacts::CsvExport.new(current_organization, scope).to_csv,
              filename: "contatos-#{Date.current.iso8601}.csv",
              type: "text/csv",
              disposition: "attachment"
  rescue Contacts::Selection::TooMany
    render_error(status: :unprocessable_content, code: "tooManyRecipients", field: "chatIds")
  end

  # GET /contacts/download-export?token=
  #
  # Redireciona para o proxy do Active Storage, que entrega em fluxo, sem carregar o arquivo inteiro
  # na memória. O link leva a quem pediu, enquanto a pessoa tiver acesso a contatos.
  def download_export
    return render_error(status: :bad_request, code: "exportTokenMissing", field: "token") if params[:token].blank?

    data = Contacts::ExportToken.verify(params[:token])
    account = Account.active.find_by(id: data[:account_id], organization_id: data[:organization_id])
    return render_error(status: :forbidden, code: "exportTokenInvalid") unless account&.can?(:contacts)

    blob = ActiveStorage::Blob.find_by(id: data[:blob_id])
    return render_error(status: :not_found, code: "exportNotFound") unless blob

    redirect_to rails_storage_proxy_path(blob, disposition: "attachment"), allow_other_host: false
  rescue Contacts::ExportToken::Expired
    render_error(status: :gone, code: "exportExpired")
  rescue Contacts::ExportToken::Invalid
    render_error(status: :forbidden, code: "exportTokenInvalid")
  end

  private

  def sort_column
    SORTABLE.include?(params[:sort_by].to_s) ? params[:sort_by].to_s : "last_message_at"
  end

  def sort_direction
    params[:sort_dir].to_s == "asc" ? :asc : :desc
  end

  def connectors_by_id(chats)
    ids = chats.map(&:connector_id).compact.uniq
    return {} if ids.empty?

    Connector::Base.where(organization_id: current_organization.id.to_s, :_id.in => ids).index_by(&:id)
  end

  # Na ação em lote os filtros vêm num objeto próprio: soltos no corpo estão `status` e `tagIds`,
  # que ali são o que a ação vai gravar, e não o recorte.
  def selection(filters: params[:filters].presence || {})
    Contacts::Selection.new(
      account: current_account,
      select_all: params[:select_all],
      chat_ids: params[:chat_ids],
      excluded_ids: params[:excluded_ids],
      filters: filters,
      time_zone: organization_time_zone
    )
  end

  # O total alterado sai do `modified_count`: conversa que já estava assim não conta.
  def with_selection
    chats = selection.criteria
    return render_error(status: :unprocessable_content, code: "noChatsSelected", field: "chatIds") if chats.nil?

    render json: { updatedCount: yield(chats).modified_count }
  rescue Contacts::Selection::TooMany
    render_error(status: :unprocessable_content, code: "tooManyRecipients", field: "chatIds")
  end

  def with_tags_and_selection
    requested = Array(params[:tag_ids]).filter_map { |id| Chats::Filters.cast_object_id(id) }
    return render_error(status: :unprocessable_content, code: "noTagsSelected", field: "tagIds") if requested.empty?

    tag_ids = ChatTag.where(organization_id: current_organization.id.to_s, :_id.in => requested).pluck(:id)
    return render_error(status: :unprocessable_content, code: "invalidTags", field: "tagIds") if tag_ids.empty?

    with_selection { |chats| yield(tag_ids, chats) }
  end
end

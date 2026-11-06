module Notifications
  # A lista de avisos que a pessoa vê: os do produto (`Notification`, Postgres, da
  # organização) e os dela (`AccountNotice`, Mongo). As duas fontes moram em bancos
  # diferentes, então a ordenação conjunta acontece aqui.
  class Feed
    DEFAULT_PER_PAGE = 20
    MAX_PER_PAGE = 50

    def self.unread_count(account)
      Notification.where(organization_id: account.organization_id).unread.count +
        AccountNotice.for_account(account).visible.unread.count
    end

    # filtros: `category`, `unread`, `read`, `archived`.
    def initialize(account, filters = {})
      @account = account
      @filters = filters
    end

    # Para achar a página N da lista unificada, basta olhar as N primeiras páginas de cada
    # fonte: nada além disso pode entrar nela. O custo cresce com a profundidade, e aviso
    # não costuma ser lido muito além do começo.
    def page(page: nil, per_page: nil)
      page = [ page.to_i, 1 ].max
      size = (per_page.presence || DEFAULT_PER_PAGE).to_i.clamp(1, MAX_PER_PAGE)
      window = page * size

      merged = (products.limit(window).to_a + notices.limit(window).to_a)
        .sort_by { |record| [ -record.notified_at.to_f, record.id.to_s ] }
      total = products.count + notices.count

      [
        merged.drop((page - 1) * size).first(size),
        { page: page, perPage: size, total: total, totalPages: (total.to_f / size).ceil, hasMore: window < total }
      ]
    end

    def unread_count
      self.class.unread_count(@account)
    end

    # O id já diz a fonte: BSON no Mongo, UUID no Postgres. Nos dois casos a busca parte de
    # quem está pedindo, e o aviso de outra pessoa é simplesmente "não encontrado".
    def find(id)
      return AccountNotice.for_account(@account).find(id) if BSON::ObjectId.legal?(id.to_s)

      @account.organization.notifications.find(id)
    end

    def read_all!
      now = Time.current
      @account.organization.notifications.unread.update_all(read: true, updated_at: now)
      AccountNotice.for_account(@account).visible.unread.update_all(read_at: now, updated_at: now)
    end

    private

    # Aviso do produto conta como `system` e nunca fica arquivado: sair da lista é sair.
    def products
      scope = @account.organization.notifications.recent_first
      return scope.none if truthy?(:archived)
      return scope.none if @filters[:category].present? && @filters[:category] != "system"

      scope = scope.unread if truthy?(:unread)
      scope = scope.already_read if truthy?(:read)
      scope
    end

    def notices
      scope = AccountNotice.for_account(@account).recent
      scope = truthy?(:archived) ? scope.archived : scope.visible
      scope = scope.by_category(@filters[:category]) if @filters[:category].present?
      scope = scope.unread if truthy?(:unread)
      scope = scope.already_read if truthy?(:read)
      scope
    end

    def truthy?(key)
      ActiveModel::Type::Boolean.new.cast(@filters[key])
    end
  end
end

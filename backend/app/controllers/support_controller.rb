# A área do suporte do Vekoo (`User#master`): achar uma organização e entrar nela.
#
#   GET  /support/organizations?q=&cursor=&perPage=
#                                          todas as organizações do sistema, por nome, de página em
#                                          página (cursor); `q` busca por nome da organização ou
#                                          e-mail/nome de quem participa
#   POST /support/organizations/:id/enter  o vínculo de suporte daquela organização (criado na primeira
#                                          vez) e o registro da entrada
#
# Para quem não é suporte, as duas respondem `404 notFound`: a rota não existe para essa pessoa.
# `master` nunca muda por aqui (nem por rota nenhuma): só por `bin/rails support:grant`.
class SupportController < AuthenticatedController
  include CamelParams

  DEFAULT_PER_PAGE = 30
  MAX_PER_PAGE = 100

  skip_account_requirement
  before_action :require_master

  # Cursor e não página: com milhares de organizações, `OFFSET` fica mais lento a cada página, e uma
  # organização criada no meio da rolagem empurraria a lista (repetindo ou pulando uma).
  def organizations
    scope = Organization.order(:name, :id)
    scope = matching(scope, params[:q]) if params[:q].present?
    total = scope.count if params[:cursor].blank?

    after = decode_cursor(params[:cursor])
    return render_error(status: :bad_request, code: "invalidCursor", field: "cursor") if after == :invalid

    size = (params[:per_page].presence || DEFAULT_PER_PAGE).to_i.clamp(1, MAX_PER_PAGE)
    page = scope.includes(logo_attachment: :blob)
    page = page.where("(organizations.name, organizations.id) > (?, ?)", *after) if after
    records = page.limit(size + 1).to_a
    more = records.size > size
    records = records.first(size)

    render json: {
      organizations: organization_entries(records),
      meta: { perPage: size, hasMore: more, nextCursor: more ? encode_cursor(records.last) : nil, total: total }
    }
  end

  def enter
    organization = Organization.find_by(id: params[:id].to_s)
    return render_not_found unless organization

    account = Support::Entry.call(user: current_user, organization: organization,
      ip_address: request.remote_ip, user_agent: request.user_agent)

    render json: AccountSerializer.summary(account), status: :created
  end

  private

  def require_master
    render_not_found unless current_user.master?
  end

  # Sem acento dos dois lados: "clinica" acha "Clínica". `translate`, e não a extensão `unaccent`,
  # para não pedir nada novo ao Postgres de produção.
  ORGANIZATION_MATCH = <<~SQL.squish.freeze
    translate(lower(organizations.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') LIKE :pattern
  SQL
  PERSON_MATCH = <<~SQL.squish.freeze
    translate(lower(users.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') LIKE :pattern
    OR lower(users.email) LIKE :pattern
  SQL

  def matching(scope, term)
    pattern = "%#{Organization.sanitize_sql_like(I18n.transliterate(term.to_s.strip).downcase)}%"
    people = Account.members.joins(:user).where(PERSON_MATCH, pattern: pattern)
    scope.where(ORGANIZATION_MATCH, pattern: pattern).or(scope.where(id: people.select(:organization_id)))
  end

  def encode_cursor(organization)
    Base64.urlsafe_encode64([ organization.name, organization.id ].to_json, padding: false)
  end

  # `nil` sem cursor; `:invalid` para o que não veio daqui.
  def decode_cursor(value)
    return nil if value.blank?

    name, id = JSON.parse(Base64.urlsafe_decode64(value.to_s))
    name.is_a?(String) && id.is_a?(String) ? [ name, id ] : :invalid
  rescue ArgumentError, JSON::ParserError, TypeError
    :invalid
  end

  def organization_entries(records)
    ids = records.map(&:id)
    owners = Account.members.where(organization_id: ids, role: "owner").includes(:user)
                    .order(:created_at).group_by(&:organization_id).transform_values(&:first)
    counts = Account.members.active.where(organization_id: ids).group(:organization_id).count

    records.map do |organization|
      owner = owners[organization.id]
      {
        id: organization.id,
        name: organization.name,
        logoUrl: StoredImagePath.for(organization.logo, :display),
        plan: organization.plan,
        creditsLeft: organization.credits_left,
        createdAt: epoch_ms(organization.created_at),
        membersCount: counts[organization.id] || 0,
        owner: owner && { name: owner.name, email: owner.email }
      }
    end
  end

  def epoch_ms(time)
    time && (time.to_f * 1000).round
  end
end

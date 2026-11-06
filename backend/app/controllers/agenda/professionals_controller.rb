module Agenda
  # Quem atende em um calendário, com os horários. Sem calendário na rota, lista os da organização
  # (a origem tinha essa listagem por assistente).
  class ProfessionalsController < BaseController
    before_action :set_calendar, except: :all
    before_action :set_professional, only: %i[show update destroy]

    def index
      records, meta = paginate(@calendar.professionals.order_by(name: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { professionals: ProfessionalSerializer.many(records), meta: meta }
    end

    def all
      records, meta = paginate(current_organization.agenda_professionals.order_by(name: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { professionals: ProfessionalSerializer.many(records), meta: meta }
    end

    def show
      render json: ProfessionalSerializer.one(@professional)
    end

    def create
      professional = @calendar.professionals.new(professional_attributes.merge(organization_id: current_organization.id))

      save(professional, status: :created)
    end

    def update
      @professional.assign_attributes(professional_attributes)

      save(@professional, status: :ok)
    end

    def destroy
      @professional.destroy!

      head :no_content
    end

    private

    def set_professional
      @professional = @calendar.professionals.where(id: params[:id]).take
      render_not_found unless @professional
    end

    def save(professional, status:)
      form = ProfessionalForm.new(professional, rule_attributes)

      if form.save
        render json: ProfessionalSerializer.one(professional), status: status
      else
        render_invalid(form.invalid_record)
      end
    end

    def professional_attributes
      permitted = envelope(:professional).permit(:name, :email, :phone, :external_id, :color, :account_id).to_h
      permitted["account_id"] = nil if permitted.key?("account_id") && permitted["account_id"].blank?
      permitted
    end

    def rule_attributes
      rule = envelope(:professional)[:rule]
      return nil unless rule.respond_to?(:permit)

      rule.permit(days: [ :enabled, :day_of_week, { windows: %i[start end] } ], blocked_times: %i[start end]).to_h
    end
  end
end

module Agenda
  # Os serviços de um calendário. Na URL é `services`, a palavra da tela: `Offering` é só o nome da
  # classe (ver `Agenda::Offering`).
  class OfferingsController < BaseController
    self.opaque_params += %w[distribution]

    before_action :set_calendar, except: :all
    before_action :set_offering, only: %i[show update destroy]

    def index
      records, meta = paginate(@calendar.services.order_by(name: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { services: OfferingSerializer.many(records), meta: meta }
    end

    def all
      records, meta = paginate(current_organization.agenda_services.order_by(name: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { services: OfferingSerializer.many(records), meta: meta }
    end

    def show
      render json: OfferingSerializer.one(@offering)
    end

    def create
      offering = @calendar.services.new(offering_params.merge(organization_id: current_organization.id))

      if offering.save
        render json: OfferingSerializer.one(offering), status: :created
      else
        render_invalid(offering)
      end
    end

    def update
      if @offering.update(offering_params)
        render json: OfferingSerializer.one(@offering)
      else
        render_invalid(@offering)
      end
    end

    def destroy
      @offering.destroy!

      head :no_content
    end

    private

    def set_offering
      @offering = @calendar.services.where(id: params[:id]).take
      render_not_found unless @offering
    end

    def offering_params
      envelope(:service).permit(
        :name, :duration, :buffer_before, :buffer_after, :time_increment_interval, :description,
        :external_id, :success_message, :guest_limit, distribution: {}
      ).to_h
    end
  end
end

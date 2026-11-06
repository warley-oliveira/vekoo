module Agenda
  # Um serviço da agenda (origem: `Scheduling::Service`). A classe se chama `Offering` para não
  # confundir com service object; a associação e a API continuam dizendo `service`, a palavra
  # que a tela usa.
  class Offering
    include Mongoid::Document
    include Mongoid::Timestamps

    field :organization_id, type: String
    field :name, type: String
    field :duration, type: Integer
    field :description, type: String
    field :buffer_before, type: Integer, default: 0
    field :buffer_after, type: Integer, default: 0
    field :time_increment_interval, type: Integer, default: 15 # minutos
    field :external_id, type: String
    field :success_message, type: String
    # { professional_id => porcentagem }. Soma 100.
    field :distribution, type: Hash, default: {}
    field :guest_limit, type: Integer, default: 1

    belongs_to :calendar, class_name: "Agenda::Calendar", inverse_of: :services
    # A origem apagava os agendamentos junto com o serviço. Tirar um serviço do cardápio não
    # pode apagar o histórico nem desmarcar quem já tem hora.
    has_many :bookings, class_name: "Agenda::Booking", inverse_of: :service, dependent: :nullify

    index({ organization_id: 1, calendar_id: 1 })
    index({ calendar_id: 1, name: 1 })

    before_validation :normalize_distribution

    validates :organization_id, presence: true
    validates :name, presence: true, length: { maximum: 120 }
    validates :duration, numericality: { only_integer: true, greater_than: 0 }
    validates :time_increment_interval, numericality: { only_integer: true, greater_than: 0 }
    validates :buffer_before, :buffer_after, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
    validates :guest_limit, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
    validate :distribution_sums_100
    validate :distribution_is_of_this_calendar

    after_save :save_distribution
    after_destroy :leave_professionals

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    # O profissional da vez, pela distribuição e pelo que cada um já atendeu no período.
    #
    # @param date [ActiveSupport::TimeWithZone, nil] com `period`, conta só aquele dia, semana ou mês
    # @param period [String, nil] day, week ou outro (mês)
    # @return [String, nil] id do profissional
    def scheduler_balancer(date: nil, period: nil)
      return nil if distribution.blank?

      SchedulerBalancer.new(distribution, nil, assignments_in(date, period)).professional_to_assign
    end

    private

    def normalize_distribution
      self.distribution = distribution.to_h.transform_keys(&:to_s).transform_values(&:to_i)
    end

    def distribution_sums_100
      sum = distribution.values.sum
      errors.add(:distribution, I18n.t("agenda.validations.distribution_sum", sum: sum)) unless sum == 100
    end

    # Sem isto, um id de outra organização entraria na distribuição e o serviço passaria a
    # escrever no profissional dela.
    def distribution_is_of_this_calendar
      return if distribution.blank? || calendar_id.blank?

      known = Professional.where(calendar_id: calendar_id, :id.in => distribution.keys).pluck(:id).map(&:to_s)
      errors.add(:distribution, I18n.t("agenda.validations.unknown_professional")) if (distribution.keys - known).any?
    end

    # Porcentagem zero também tira o profissional do serviço.
    def save_distribution
      return unless previous_changes.key?("distribution") || previously_new_record?

      Professional.where(calendar_id: calendar_id, :id.in => distribution.keys).each do |professional|
        if distribution[professional.id.to_s].to_i.zero?
          professional.pull(service_ids: id)
        else
          professional.add_to_set(service_ids: id)
        end
      end
    end

    def leave_professionals
      Professional.where(calendar_id: calendar_id, service_ids: id).pull(service_ids: id)
    end

    def assignments_in(date, period)
      scope = bookings.active
      scope = scope.where(:start.gte => period_start(date, period), :start.lte => period_end(date, period)) if date && period
      known = distribution.keys

      Booking.collection.aggregate([
        { "$match" => scope.selector },
        { "$group" => { "_id" => "$professional_id", "count" => { "$sum" => 1 } } }
      ]).each_with_object(Hash.new(0)) do |row, count|
        count[row["_id"].to_s] = row["count"] if known.include?(row["_id"].to_s)
      end
    end

    def period_start(date, period)
      case period
      when "day" then date.beginning_of_day
      when "week" then date.beginning_of_week
      else date.beginning_of_month
      end
    end

    def period_end(date, period)
      case period
      when "day" then date.end_of_day
      when "week" then date.end_of_week
      else date.end_of_month
      end
    end
  end
end

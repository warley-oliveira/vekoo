module Pipelines
  # Resolve tokens de data relativa ('this_week', 'more_than_n_months_ago') em intervalos ou pontos no
  # tempo, no fuso corrente. Quem atende requisição já está em `Time.use_zone` com o fuso da organização
  # (`Pipelines::BaseController`).
  class RelativeDate
    class InvalidToken < StandardError; end

    # Tokens que resolvem para um intervalo (usados por within/not_within).
    RANGE_TOKENS = %w[
      today yesterday this_week last_week this_month last_month
      this_quarter this_year last_year last_n_days
    ].freeze

    # Tokens que resolvem para um instante (usados por before/after).
    POINT_TOKENS = %w[today yesterday now more_than_n_months_ago last_n_days].freeze

    # Tokens que exigem `n` (inteiro positivo).
    PARAMETERIZED_TOKENS = %w[last_n_days more_than_n_months_ago].freeze

    class << self
      # @return [Range<ActiveSupport::TimeWithZone>]
      def range(token, amount: nil, zone: default_zone)
        now = zone.now
        case token.to_s
        when "today" then now.beginning_of_day..now.end_of_day
        when "yesterday" then (now - 1.day).beginning_of_day..(now - 1.day).end_of_day
        when "this_week" then now.beginning_of_week..now.end_of_week
        when "last_week" then (now - 1.week).beginning_of_week..(now - 1.week).end_of_week
        when "this_month" then now.beginning_of_month..now.end_of_month
        when "last_month" then (now - 1.month).beginning_of_month..(now - 1.month).end_of_month
        when "this_quarter" then now.beginning_of_quarter..now.end_of_quarter
        when "this_year" then now.beginning_of_year..now.end_of_year
        when "last_year" then (now - 1.year).beginning_of_year..(now - 1.year).end_of_year
        when "last_n_days" then (now - integer(amount).days).beginning_of_day..now.end_of_day
        else raise InvalidToken, "unknown range token: #{token}"
        end
      end

      # @return [ActiveSupport::TimeWithZone]
      def point(token, amount: nil, zone: default_zone)
        now = zone.now
        case token.to_s
        when "now" then now
        when "today" then now.beginning_of_day
        when "yesterday" then (now - 1.day).beginning_of_day
        when "last_n_days" then (now - integer(amount).days).beginning_of_day
        when "more_than_n_months_ago" then now - integer(amount).months
        else raise InvalidToken, "unknown point token: #{token}"
        end
      end

      def range_token?(token)
        RANGE_TOKENS.include?(token.to_s)
      end

      def point_token?(token)
        POINT_TOKENS.include?(token.to_s)
      end

      def parameterized?(token)
        PARAMETERIZED_TOKENS.include?(token.to_s)
      end

      private

      def integer(amount)
        value = Integer(amount, exception: false)
        raise InvalidToken, "token requires a positive integer n, got: #{amount.inspect}" if value.nil? || value <= 0

        value
      end

      def default_zone
        Time.zone || ActiveSupport::TimeZone["UTC"]
      end
    end
  end
end

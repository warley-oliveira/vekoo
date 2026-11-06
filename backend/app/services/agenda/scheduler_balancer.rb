module Agenda
  # Reparte os atendimentos de um serviço pela porcentagem de cada profissional: escolhe quem
  # está mais abaixo da sua parte.
  #
  #   SchedulerBalancer.new({ "ana" => 70, "bia" => 30 }).assign_client
  class SchedulerBalancer
    attr_reader :distribution, :assignments, :total_clients

    def initialize(distribution, total_clients = 0, assignments = Hash.new(0))
      @total_clients = total_clients
      @distribution = distribution
      @assignments = assignments
    end

    def assign_client
      rebalance if @total_clients >= 100

      chosen = choose(@total_clients)
      @assignments[chosen] += 1
      @total_clients += 1
      chosen
    end

    # O próximo a atender, pelo que já foi atendido. Nil se ninguém recebe nada.
    def professional_to_assign
      return nil if @distribution.blank?

      chosen = choose(@assignments.values.sum)
      @assignments[chosen] += 1
      chosen
    end

    private

    def choose(total)
      @distribution.max_by do |professional, percentage|
        share = @assignments[professional].to_f / total
        percentage - (share.nan? ? 0 : share) * 100
      end.first
    end

    def rebalance
      @assignments.clear
      @total_clients = 0
    end
  end
end

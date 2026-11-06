module Agenda
  # Grava o profissional junto com os horários dele. Todo profissional tem regra (sem ela não há o
  # que oferecer): quem não manda horários fica com o padrão.
  #
  # Valida os dois antes de gravar qualquer um, para não sobrar profissional sem horário.
  class ProfessionalForm
    attr_reader :invalid_record

    # @param rule_attributes [Hash, nil] days, blocked_times. Nil não muda a regra que já existe.
    def initialize(professional, rule_attributes)
      @professional = professional
      @rule = professional.rule || Rule.new(professional: professional)
      @rule.assign_attributes(rule_attributes) if rule_attributes
    end

    def save
      @invalid_record = [ @professional, @rule ].find(&:invalid?)
      return false if @invalid_record

      @professional.save!
      @rule.organization_id = @professional.organization_id
      @rule.save!
      true
    end
  end
end

# Resolve os campos `ref` no momento da geração, lendo os fatos da versão
# publicada. Fato pendente barra a geração aqui, nomeando o fato — é o
# "portão dos pendentes" do Brandcore aplicado à peça. O resultado vira a
# proveniência da peça: qual fato, com que valor, entrou na imagem.
module Engines
  class Refs
    Resolved = Struct.new(:field, :fact_id, :kind, :label, :value, :status, keyword_init: true) do
      def to_h
        { "field" => field, "factId" => fact_id, "kind" => kind, "label" => label, "value" => value, "status" => status }
      end
    end

    # As peças são obra em pt-BR (ver CLAUDE.md): os dias saem abreviados
    # como a marca escreveria no post.
    DAY_NAMES = { "mon" => "Seg", "tue" => "Ter", "wed" => "Qua", "thu" => "Qui", "fri" => "Sex", "sat" => "Sáb", "sun" => "Dom" }.freeze

    def self.resolve(manifest, values, tokens)
      manifest.ref_fields.each_with_object({}) do |field, acc|
        fact_id = values[field.id]
        next if fact_id.blank?

        fact = tokens.fact(fact_id)
        raise GenerationError.new("refMissing", nil, field: field.id, factId: fact_id) unless fact
        if fact["status"] == "pending"
          raise GenerationError.new("refPending", nil, field: field.id, factId: fact_id, factLabel: fact["label"])
        end

        acc[field.id] = Resolved.new(
          field: field.id, fact_id: fact_id, kind: fact["kind"], label: fact["label"],
          value: format_fact(fact), status: fact["status"]
        )
      end
    end

    # O valor de um fato como texto pronto para a peça.
    def self.format_fact(fact)
      return fact["value"].to_s unless fact["kind"] == "hours"

      hours = fact["hours"] || {}
      groups = []
      BrandCore::Schema::WEEKDAYS.each do |day|
        value = hours[day].presence
        next if value.nil?

        if groups.last && groups.last[:value] == value && groups.last[:last_index] == BrandCore::Schema::WEEKDAYS.index(day) - 1
          groups.last[:to] = day
          groups.last[:last_index] = BrandCore::Schema::WEEKDAYS.index(day)
        else
          groups << { from: day, to: day, value: value, last_index: BrandCore::Schema::WEEKDAYS.index(day) }
        end
      end
      groups.map { |g|
        days = g[:from] == g[:to] ? DAY_NAMES[g[:from]] : "#{DAY_NAMES[g[:from]]}–#{DAY_NAMES[g[:to]]}"
        "#{days} #{g[:value]}"
      }.join(" · ")
    end
  end
end

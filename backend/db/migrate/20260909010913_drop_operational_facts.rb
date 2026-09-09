# Fatos operacionais e refs saem de cena.
#
# O que era uma lista de fatos com status (e o portão que barrava geração)
# vira uma anotação de texto livre na marca; o que era uma ref na peça vira o
# texto que já estava impresso na imagem — a proveniência guardou o valor, então
# nada se perde.
#
# Só dados: nenhuma coluna muda de forma (tudo mora em jsonb).
class DropOperationalFacts < ActiveRecord::Migration[8.1]
  DAYS = {
    "mon" => "Seg", "tue" => "Ter", "wed" => "Qua", "thu" => "Qui",
    "fri" => "Sex", "sat" => "Sáb", "sun" => "Dom"
  }.freeze
  ORDER = DAYS.keys.freeze

  def up
    say_with_time "fatos da marca → anotações" do
      BrandCore.reset_column_information
      BrandCore.find_each do |brand|
        brand.update_columns(
          document: convert(brand.document),
          published_document: brand.published_document && convert(brand.published_document)
        )
      end
      BrandCoreVersion.find_each { |version| version.update_column(:snapshot, convert(version.snapshot)) }
      BrandCore.count
    end

    say_with_time "refs da peça → texto" do
      Piece.find_each do |piece|
        refs = Array(piece.provenance["refs"])
        next if refs.empty?

        values = piece.values.merge(refs.to_h { |ref| [ ref["field"], ref["value"].to_s ] })
        piece.update_columns(values: values, provenance: piece.provenance.except("refs"))
      end
      Piece.count
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end

  private

  def convert(document)
    document = (document || {}).deep_dup
    facts = document.delete("facts")
    text = document.dig("notes", "text").presence || notes_from(facts&.dig("items"))
    document.merge("notes" => { "text" => text.to_s })
  end

  # "Combo do almoço: R$ 39" / "Loja: Seg–Sex 9h–18h · Sáb 9h–13h"
  def notes_from(items)
    Array(items).filter_map { |fact|
      label = fact["label"].to_s.strip
      value = fact["kind"] == "hours" ? hours_line(fact["hours"]) : fact["value"].to_s.strip
      line = [ label, value ].reject(&:empty?).join(": ")
      line.presence
    }.join("\n")
  end

  def hours_line(hours)
    hours = (hours || {}).compact
    groups = []
    ORDER.each_with_index do |day, index|
      value = hours[day].presence
      next if value.nil?

      last = groups.last
      if last && last[:value] == value && last[:index] == index - 1
        last.merge!(to: day, index: index)
      else
        groups << { from: day, to: day, value: value, index: index }
      end
    end
    groups.map { |group|
      days = group[:from] == group[:to] ? DAYS[group[:from]] : "#{DAYS[group[:from]]}–#{DAYS[group[:to]]}"
      "#{days} #{group[:value]}"
    }.join(" · ")
  end
end

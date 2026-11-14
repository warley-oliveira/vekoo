namespace :pieces do
  desc "Converte as peças feitas por motor em documento (as que têm layout equivalente). DRY_RUN=1 só relata."
  task to_documents: :environment do
    dry = ENV["DRY_RUN"].present?
    converted = 0
    kept = Hash.new(0)

    Piece.where(current_version_id: nil).where.not(engine_id: nil).find_each do |piece|
      unless PieceDocument::Legacy.convertible?(piece.engine_id)
        kept[piece.engine_id] += 1
        next
      end

      document = PieceDocument::Legacy.call(piece)
      check = PieceDocument::Validator.call(document, brand_core: piece.brand_core)
      unless check.valid?
        puts "  #{piece.id} (#{piece.engine_id}): #{check.errors.map { |path, code| "#{path} #{code}" }.join(', ')}"
        kept[piece.engine_id] += 1
        next
      end

      converted += 1
      next if dry

      Piece.transaction do
        piece.update_columns(format: document["format"], status: "draft")
        piece.record_version!(document, source: "migration", summary: "convertida do motor #{piece.engine_id}")
      end
    end

    puts "#{dry ? '[ensaio] ' : ''}#{converted} convertidas; ficam legadas: #{kept.map { |id, n| "#{id} #{n}" }.join(', ').presence || 'nenhuma'}"
  end
end

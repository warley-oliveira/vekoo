# Todas as famílias do Google Fonts, com categoria e pesos publicados.
#
# O `FontCatalog` é a vitrine curta — de onde o "cria pra mim" escolhe e o
# que a tela mostra primeiro. Este índice é o que a marca **pode usar**: quem
# já tem "Libre Caslon Text" no manual não precisa ouvir que ela não existe,
# porque ela existe, é aberta e o `BrandFonts` baixa do mesmo lugar. Fora
# daqui (Gotham, Interstate, fonte paga) não há arquivo que o servidor
# consiga obter, e aí o caminho é o arquivo da marca ou uma que chegue perto.
#
# Gerado por `bin/rails fonts:directory`, que escreve também o espelho do
# front (`frontend/src/lib/google-fonts.json`); a spec compara os dois.
module BrandCore::FontDirectory
  PATH = Rails.root.join("config/google_fonts.json")

  # As categorias do Google viram as quatro da Vekoo: manuscrita é display —
  # é título, nunca texto corrido.
  CATEGORIES = {
    "Sans Serif" => "sans", "Serif" => "serif", "Display" => "display",
    "Handwriting" => "display", "Monospace" => "mono"
  }.freeze

  module_function

  def find(family)
    index[key(family)]
  end

  def exists?(family)
    index.key?(key(family))
  end

  def size
    index.size
  end

  def index
    @index ||= JSON.parse(File.read(PATH)).to_h do |row|
      font = BrandCore::FontCatalog::Font.new(family: row["family"], category: row["category"], weights: row["weights"])
      [ key(font.family), font ]
    end.freeze
  end

  def key(family)
    family.to_s.squish.downcase
  end

  # Do `metadata/fonts` do Google para as linhas do índice. Só o que escreve
  # português (subconjunto latin) e tem ao menos um peso reto.
  def from_metadata(families)
    families.filter_map do |meta|
      next unless Array(meta["subsets"]).include?("latin")

      weights = meta["fonts"].keys.grep(/\A\d+\z/).map(&:to_i).sort
      next if weights.empty?

      { "family" => meta["family"], "category" => CATEGORIES.fetch(meta["category"], "sans"), "weights" => weights }
    end.sort_by { |row| row["family"] }
  end

  # Uma família por linha: o diff de uma regeração mostra só o que mudou.
  def dump(rows)
    "[\n#{rows.map { |row| "  #{row.to_json}" }.join(",\n")}\n]\n"
  end
end

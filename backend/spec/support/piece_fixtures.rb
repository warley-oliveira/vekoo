# Documentos fixos para conferir a biblioteca de layouts sem tela: cada
# layout em cada formato que declara, com título curto e longo, corpo vazio
# e cheio, com e sem logo, sobre foto clara e escura — e um título passando
# do limite, para ver o corte. Usado pelas specs e por
# `bin/rails pieces:render_fixtures` (a prancha para olhar).
module PieceFixtures
  SHORT = { "title" => "Pão quente", "body" => "", "badge" => "", "price" => "R$ 6" }.freeze
  LONG = {
    "title" => "Fornada de pão de queijo saindo agora, quentinho no balcão",
    "body" => "Feito com polvilho azedo e queijo canastra. Sai a cada 40 minutos, das 6h às 11h, enquanto durar a massa do dia.",
    "badge" => "Saindo agora",
    "price" => "R$ 6 a unidade"
  }.freeze
  OVERFLOW = "Um título comprido demais para caber nas três linhas que o layout reserva para ele, de propósito"

  Case = Struct.new(:name, :document, keyword_init: true)

  module_function

  # `photos`: { light: id, dark: id } — fotos da marca para os slots de imagem.
  def cases(brand_core, photos:)
    Layouts::Registry.all.values.flat_map { |contract|
      contract.formats.reject { |format| format == "carousel" && contract.position.nil? && contract.id != "carousel-body" }.flat_map { |format|
        variants(contract).map { |variant, content, photo, logo|
          slide = slide_for(contract, content, photos[photo], logo)
          slides = format == "carousel" ? carousel_around(contract, slide, photos) : [ slide ]
          Case.new(name: "#{contract.id}--#{format}--#{variant}", document: build(brand_core, format, slides))
        }
      }
    }
  end

  def variants(contract)
    list = [
      [ "curto", SHORT, :dark, true ],
      [ "longo", LONG, :light, true ],
      [ "sem-logo", LONG.merge("body" => ""), :dark, false ]
    ]
    list << [ "estouro", LONG.merge("title" => OVERFLOW), :light, true ] if contract.id == "hero-image-title-bottom"
    list
  end

  def slide_for(contract, content, photo, logo)
    values = contract.slots.values.to_h { |slot|
      value =
        case slot.type
        when "text" then fit(content[slot.id].to_s, slot, content["title"] == OVERFLOW)
        when "image" then photo
        when "logo" then logo
        end
      [ slot.id, value ]
    }
    { "layout" => contract.id, "content" => values }
  end

  # O texto no limite do slot, cortado na última palavra inteira — o caso
  # "longo" é o máximo que o layout promete aguentar. O estouro passa direto.
  def fit(text, slot, overflow)
    return text if overflow && slot.id == "title"
    return text if slot.max_chars.nil? || text.length <= slot.max_chars

    text.first(slot.max_chars + 1).sub(/\s+\S*\z/, "").sub(/[,;:]\z/, "")
  end

  # O layout de carrossel no lugar dele: capa primeiro, chamada no fim.
  def carousel_around(contract, slide, photos)
    cover = slide_for(Layouts::Registry.find("carousel-cover"), SHORT, photos[:dark], true)
    body = slide_for(Layouts::Registry.find("carousel-body"), LONG, nil, false)
    cta = slide_for(Layouts::Registry.find("carousel-last-cta"), SHORT.merge("title" => "Salva pra lembrar"), nil, true)
    case contract.position
    when "first" then [ slide, body, cta ]
    when "last" then [ cover, body, slide ]
    else [ cover, slide, cta ]
    end
  end

  def build(brand_core, format, slides)
    PieceDocument::Build.from_agent({ "format" => format, "slides" => slides }, brand_core: brand_core)
  end

  # Duas fotos sintéticas (um degradê claro e um escuro) para quando a marca
  # não tem foto: o que se testa é o contraste, não a fotografia.
  def synthetic_photos(brand_core)
    { light: [ 236, 224, 200 ], dark: [ 44, 30, 22 ] }.to_h { |key, rgb|
      x = Vips::Image.xyz(1600, 1200)
      # Diagonal, para o ponto focal mudar o recorte nos dois eixos.
      shade = (x[0] / 1600.0 * 40) + (x[1] / 1200.0 * 30) - 35
      bands = rgb.map { |c| (shade + c).cast(:uchar) }
      jpg = bands.first.bandjoin(bands.drop(1)).copy(interpretation: :srgb).write_to_buffer(".jpg[Q=85]")
      asset = brand_core.assets.new(organization: brand_core.organization, kind: "photo",
        filename: "foto-#{key}.jpg", content_type: "image/jpeg", byte_size: jpg.bytesize)
      asset.file.attach(io: StringIO.new(jpg), filename: asset.filename, content_type: "image/jpeg")
      asset.save!
      AnalyzeBrandAsset.call(asset, StringIO.new(jpg))
      [ key, asset.id ]
    }
  end
end

# Olha dentro de um PNG sem depender de libvips: dimensões e se há
# transparência **de verdade** (algum pixel com alfa abaixo de 255).
#
# A regra do produto é que logo e glifo entram com fundo transparente. Um PNG
# pode ter canal alfa e ainda assim ser todo opaco — é esse o caso que a tela
# precisa alertar, e para descobrir é preciso descomprimir e desfiltrar as
# linhas. Entrelaçado (Adam7) é raro em logo e sai como "não sei" (nil).
class PngInspector
  SIGNATURE = "\x89PNG\r\n\x1a\n".b
  Result = Struct.new(:width, :height, :transparent, keyword_init: true)

  # Acima disso o custo de descomprimir não compensa: devolve as dimensões e
  # deixa a transparência em aberto.
  MAX_PIXELS = 30_000_000

  def self.call(io)
    new(io).call
  rescue StandardError
    nil
  end

  def initialize(io)
    @io = io
  end

  def call
    @io.rewind
    return nil unless @io.read(8).to_s.b == SIGNATURE

    header = nil
    palette_alpha = nil
    idat = +"".b

    while (chunk = read_chunk)
      type, data = chunk
      case type
      when "IHDR" then header = parse_header(data)
      when "tRNS" then palette_alpha = data
      when "IDAT" then idat << data
      when "IEND" then break
      end
    end
    return nil unless header

    Result.new(
      width: header[:width],
      height: header[:height],
      transparent: transparent?(header, palette_alpha, idat)
    )
  ensure
    @io.rewind
  end

  private

  def read_chunk
    length_bytes = @io.read(4)
    return nil if length_bytes.nil? || length_bytes.bytesize < 4

    length = length_bytes.unpack1("N")
    type = @io.read(4).to_s
    data = length.zero? ? "".b : @io.read(length).to_s.b
    @io.read(4) # CRC
    [ type, data ]
  end

  def parse_header(data)
    width, height, depth, color_type, _compression, _filter, interlace = data.unpack("NNCCCCC")
    { width: width, height: height, depth: depth, color_type: color_type, interlace: interlace }
  end

  # Tipos de cor: 0 cinza, 2 RGB, 3 paleta, 4 cinza+alfa, 6 RGB+alfa.
  def transparent?(header, palette_alpha, idat)
    case header[:color_type]
    when 0, 2 then palette_alpha.present? # tRNS em cinza/RGB marca uma cor como transparente
    when 3 then palette_alpha.to_s.bytes.any? { |b| b < 255 }
    when 4, 6 then alpha_below_max?(header, idat)
    end
  end

  def alpha_below_max?(header, idat)
    return nil if header[:interlace] != 0
    return nil if header[:width] * header[:height] > MAX_PIXELS

    bytes_per_sample = header[:depth] == 16 ? 2 : 1
    channels = header[:color_type] == 6 ? 4 : 2
    bpp = channels * bytes_per_sample
    stride = header[:width] * bpp
    raw = Zlib::Inflate.inflate(idat)

    previous = "\0".b * stride
    offset = 0
    header[:height].times do
      filter = raw.getbyte(offset)
      line = raw.byteslice(offset + 1, stride)
      offset += stride + 1
      line = unfilter(filter, line, previous, bpp)
      return true if alpha_in_line?(line, bpp, bytes_per_sample)

      previous = line
    end
    false
  end

  def alpha_in_line?(line, bpp, bytes_per_sample)
    alpha_at = bpp - bytes_per_sample
    index = alpha_at
    while index < line.bytesize
      return true if line.getbyte(index) < 255

      index += bpp
    end
    false
  end

  # Os cinco filtros do PNG, desfeitos byte a byte.
  def unfilter(filter, line, previous, bpp)
    out = line.dup
    size = out.bytesize
    case filter
    when 0 then out
    when 1
      bpp.upto(size - 1) { |i| out.setbyte(i, (out.getbyte(i) + out.getbyte(i - bpp)) & 0xff) }
      out
    when 2
      0.upto(size - 1) { |i| out.setbyte(i, (out.getbyte(i) + previous.getbyte(i)) & 0xff) }
      out
    when 3
      0.upto(size - 1) do |i|
        left = i >= bpp ? out.getbyte(i - bpp) : 0
        out.setbyte(i, (out.getbyte(i) + ((left + previous.getbyte(i)) >> 1)) & 0xff)
      end
      out
    when 4
      0.upto(size - 1) do |i|
        left = i >= bpp ? out.getbyte(i - bpp) : 0
        up = previous.getbyte(i)
        up_left = i >= bpp ? previous.getbyte(i - bpp) : 0
        out.setbyte(i, (out.getbyte(i) + paeth(left, up, up_left)) & 0xff)
      end
      out
    else
      raise ArgumentError, "filtro PNG desconhecido: #{filter}"
    end
  end

  def paeth(a, b, c)
    p = a + b - c
    pa = (p - a).abs
    pb = (p - b).abs
    pc = (p - c).abs
    if pa <= pb && pa <= pc then a
    elsif pb <= pc then b
    else c
    end
  end
end

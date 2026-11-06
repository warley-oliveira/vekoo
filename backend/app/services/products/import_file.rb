require "csv"

module Products
  # Lê a planilha que o cliente enviou: CSV ou TSV, UTF-8 com ou sem BOM (Excel) ou
  # Windows-1252 (exportação de ERP e o "CSV" do Excel no Brasil), com o delimitador
  # que vier.
  #
  # Dois momentos, com custos diferentes:
  #
  #  - `.sniff`, na thread do Puma: só os primeiros KB, para mostrar cabeçalho e amostra
  #    na tela de mapeamento. Nunca o arquivo inteiro.
  #  - `#each_row`, no job: o arquivo inteiro, em streaming.
  class ImportFile
    # Quando o arquivo não dá para ler como texto tabular.
    class Unreadable < StandardError; end

    Sample = Struct.new(:headers, :rows, :delimiter, keyword_init: true)

    DELIMITERS = [ ",", ";", "\t", "|" ].freeze
    SNIFF_BYTES = 64.kilobytes
    SNIFF_ROWS = 20
    LEGACY_ENCODING = "Windows-1252"
    UTF8_BOM = "\xEF\xBB\xBF".b.freeze
    # NUL em célula quebra o INSERT ("string contains null byte") por causa de um byte.
    STRIP_NUL = ->(field) { field&.delete("\u0000") }

    class << self
      def sniff(io)
        bytes = io.read(SNIFF_BYTES).to_s.b
        io.rewind
        # NUL é a assinatura de binário: planilha .xlsx, PDF, CSV em UTF-16.
        raise Unreadable, "binário" if bytes.empty? || bytes.include?("\x00".b)

        text = decode(complete_lines(bytes))
        delimiter = detect_delimiter(text)
        table = CSV.parse(text, headers: true, col_sep: delimiter, skip_blanks: true)
        headers = table.headers.compact
        raise Unreadable, "sem cabeçalho" if headers.empty?

        Sample.new(headers: headers, rows: sample_rows(table), delimiter: delimiter)
      rescue CSV::MalformedCSVError => e
        raise Unreadable, e.message
      end

      private

      # A última linha do trecho pode estar cortada ao meio (até no meio de um caractere
      # de vários bytes). Só existe corte quando o trecho veio cheio; em arquivo pequeno,
      # a última linha é dado de verdade.
      def complete_lines(bytes)
        return bytes if bytes.bytesize < SNIFF_BYTES

        lines = bytes.lines
        lines.size > 1 ? lines[0..-2].join : bytes
      end

      def decode(bytes)
        text = bytes.delete_prefix(UTF8_BOM).force_encoding(Encoding::UTF_8)
        return text if text.valid_encoding?

        text.force_encoding(LEGACY_ENCODING).encode(Encoding::UTF_8, invalid: :replace, undef: :replace)
      end

      # O delimitador vencedor é o que mais aparece na primeira linha.
      def detect_delimiter(text)
        first_line = text.lines.first.to_s
        DELIMITERS.max_by { |delimiter| first_line.count(delimiter) }
      end

      # Coluna sem nome vira chave nula, que não chega inteira ao JSON.
      def sample_rows(table)
        table.select { |row| row.fields.any?(&:present?) }
          .first(SNIFF_ROWS)
          .map { |row| row.to_h.except(nil) }
      end
    end

    def initialize(path, delimiter: nil)
      @path = path
      @delimiter = delimiter.presence || ","
    end

    # Uma passada barata antes de processar, porque as duas respostas só saem de ler até
    # o fim: um byte inválido na linha 40 mil exigiria recomeçar o parse no meio da
    # importação, com metade dos contadores já somados.
    def estimated_rows
      [ physical_lines - 1, 0 ].max
    end

    # Entrega a linha e o número dela na planilha (o cabeçalho é a 1), o mesmo que a
    # pessoa vê no Excel: célula com quebra de linha conta como uma só.
    def each_row
      options = { headers: true, col_sep: @delimiter, converters: [ STRIP_NUL ], encoding: file_encoding }
      options.merge!(invalid: :replace, undef: :replace) unless utf8?

      CSV.open(@path, "r", **options) do |csv|
        csv.each do |row|
          # Linha toda vazia não é erro, é rodapé: Excel exporta ";;;;" até o fim da aba.
          # Filtrada aqui, e não por `skip_blanks`, para `lineno` continuar contando-a.
          yield row, csv.lineno if row.fields.any?(&:present?)
        end
      end
    end

    private

    def file_encoding
      utf8? ? "bom|utf-8" : "#{LEGACY_ENCODING}:utf-8"
    end

    def utf8?
      scan
      @utf8
    end

    def physical_lines
      scan
      @physical_lines
    end

    def scan
      return if defined?(@physical_lines)

      lines = 0
      utf8 = true
      File.foreach(@path, mode: "rb") do |line|
        lines += 1
        utf8 &&= line.force_encoding(Encoding::UTF_8).valid_encoding?
      end
      @physical_lines = lines
      @utf8 = utf8
    end
  end
end

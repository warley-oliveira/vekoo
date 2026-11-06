require "rails_helper"

RSpec.describe Products::ImportFile do
  def rows_of(content, delimiter: ",")
    described_class.new(csv_tempfile(content).path, delimiter: delimiter).enum_for(:each_row).to_a
  end

  describe ".sniff" do
    def sniff(content) = described_class.sniff(StringIO.new(content.b))

    it "lê cabeçalho, amostra e delimitador" do
      sample = sniff("sku,nome\nA1,Camiseta\nA2,Vestido\n")

      expect(sample.headers).to eq(%w[sku nome])
      expect(sample.rows).to eq([ { "sku" => "A1", "nome" => "Camiseta" }, { "sku" => "A2", "nome" => "Vestido" } ])
      expect(sample.delimiter).to eq(",")
    end

    it "detecta cada delimitador aceito" do
      expect(sniff("sku;nome\nA1;Camiseta\n").delimiter).to eq(";")
      expect(sniff("sku\tnome\nA1\tCamiseta\n").delimiter).to eq("\t")
      expect(sniff("sku|nome\nA1|Camiseta\n").delimiter).to eq("|")
    end

    # O Excel grava BOM, e ele grudaria no nome da primeira coluna.
    it "tira o BOM do cabeçalho" do
      expect(sniff("\xEF\xBB\xBFsku,nome\nA1,x\n").headers).to eq(%w[sku nome])
    end

    it "devolve texto em UTF-8, que chega inteiro ao JSON" do
      sample = sniff("Descrição;Preço\nCamisão;10\n")

      expect(sample.headers).to eq(%w[Descrição Preço])
      expect(sample.headers.first.encoding).to eq(Encoding::UTF_8)
      expect { sample.to_h.to_json }.not_to raise_error
    end

    it "lê exportação em Windows-1252, a do Excel e dos ERPs no Brasil" do
      sample = sniff("Descri\xE7\xE3o;Pre\xE7o\nCamis\xE3o \x96 azul;10\n")

      expect(sample.headers).to eq(%w[Descrição Preço])
      expect(sample.rows.first["Descrição"]).to eq("Camisão – azul")
    end

    it "mantém a última linha de arquivo pequeno, que não foi cortada" do
      expect(sniff("sku,nome\nA1,Camiseta\n").rows.size).to eq(1)
      expect(sniff("sku,nome\nA1,Camiseta").rows.size).to eq(1)
    end

    it "descarta a última linha quando o trecho veio cortado" do
      stub_const("#{described_class}::SNIFF_BYTES", 30)

      # O corte cai no meio do "ç": sem descartar a linha, o trecho inteiro pareceria
      # outra codificação e o cabeçalho sairia torto.
      sample = sniff("sku,nome\nA1,Camiseta\nA2,Calça comprida\n")

      expect(sample.headers).to eq(%w[sku nome])
      expect(sample.rows).to eq([ { "sku" => "A1", "nome" => "Camiseta" } ])
    end

    it "limita a amostra" do
      content = "sku\n" + Array.new(described_class::SNIFF_ROWS + 5) { |i| "A#{i}\n" }.join

      expect(sniff(content).rows.size).to eq(described_class::SNIFF_ROWS)
    end

    it "aceita arquivo só com cabeçalho" do
      sample = sniff("sku,nome\n")

      expect(sample.headers).to eq(%w[sku nome])
      expect(sample.rows).to eq([])
    end

    it "pula linha vazia e rodapé do Excel na amostra" do
      expect(sniff("sku;nome\n\nA1;Camiseta\n;;\n").rows).to eq([ { "sku" => "A1", "nome" => "Camiseta" } ])
    end

    it "coluna sem nome não vira chave nula" do
      sample = sniff("sku,,nome\nA1,x,Camiseta\n")

      expect(sample.headers).to eq(%w[sku nome])
      expect(sample.rows.first.keys).to eq(%w[sku nome])
    end

    it "volta o arquivo ao começo: quem chama ainda vai anexá-lo inteiro" do
      io = StringIO.new("sku\nA1\n".b)

      described_class.sniff(io)

      expect(io.read).to start_with("sku")
    end

    it "recusa arquivo vazio" do
      expect { sniff("") }.to raise_error(described_class::Unreadable)
    end

    it "recusa binário: planilha .xlsx, PDF, CSV em UTF-16" do
      expect { sniff("PK\x03\x04\x00\x00\x08\x00") }.to raise_error(described_class::Unreadable)
      expect { sniff("s\x00k\x00u\x00\n\x00") }.to raise_error(described_class::Unreadable)
    end

    it "recusa CSV malformado no trecho lido" do
      expect { sniff("sku,\"nome\nA1,x\n") }.to raise_error(described_class::Unreadable)
    end
  end

  describe "#each_row" do
    it "entrega cada linha com o número dela na planilha" do
      rows = rows_of("sku,nome\nA1,Camiseta\nA2,Vestido\n")

      expect(rows.map { |row, line| [ row["sku"], line ] }).to eq([ [ "A1", 2 ], [ "A2", 3 ] ])
    end

    it "usa o delimitador informado" do
      rows = rows_of("sku;nome\nA1;Camiseta\n", delimiter: ";")

      expect(rows.first.first["nome"]).to eq("Camiseta")
    end

    it "tira o BOM da primeira coluna" do
      expect(rows_of("\xEF\xBB\xBFsku,nome\nA1,x\n").first.first["sku"]).to eq("A1")
    end

    it "lê Windows-1252 de ponta a ponta, mesmo com o byte estranho só no fim" do
      rows = rows_of("nome;marca\ncamisa;boa\nmesa;Pre\xE7o \x96 baixo\n", delimiter: ";")

      expect(rows.map { |row, _| row["marca"] }).to eq([ "boa", "Preço – baixo" ])
      expect(rows.last.first["marca"].encoding).to eq(Encoding::UTF_8)
    end

    # Regressão da origem: ao topar com o byte inválido ela recomeçava o parse no meio
    # do bloco, somando as linhas já lidas duas vezes.
    it "lê cada linha uma vez só, sem recomeçar" do
      rows = rows_of("nome\nprimeira\nsegunda\nter\xE7a\n", delimiter: ",")

      expect(rows.map { |row, _| row["nome"] }).to eq(%w[primeira segunda terça])
      expect(rows.map(&:last)).to eq([ 2, 3, 4 ])
    end

    it "não trata byte sem correspondência como erro" do
      expect { rows_of("nome\ncamis\x81a\n") }.not_to raise_error
    end

    it "não conta linha vazia nem rodapé como dado, mas mantém a numeração" do
      rows = rows_of("sku;nome\nA1;x\n\n;;\nA2;y\n\n", delimiter: ";")

      expect(rows.map { |row, line| [ row["sku"], line ] }).to eq([ [ "A1", 2 ], [ "A2", 5 ] ])
    end

    it "célula com quebra de linha conta como uma linha, como no Excel" do
      rows = rows_of(%(sku,nome\nA1,"linha 1\nlinha 2"\nA2,y\n))

      expect(rows.map { |row, line| [ row["sku"], line ] }).to eq([ [ "A1", 2 ], [ "A2", 3 ] ])
      expect(rows.first.first["nome"]).to eq("linha 1\nlinha 2")
    end

    it "tira byte NUL do valor, que derrubaria o INSERT" do
      expect(rows_of("sku,nome\nA1,Cam\u0000isa\n").first.first["nome"]).to eq("Camisa")
    end

    it "levanta com o número da linha em CSV malformado" do
      file = described_class.new(csv_tempfile("sku,nome\nA1,x\nA2,\"y\nA3,z\n").path)

      expect { file.each_row { nil } }.to raise_error(CSV::MalformedCSVError)
    end
  end

  describe "#estimated_rows" do
    it "conta as linhas físicas menos o cabeçalho" do
      expect(described_class.new(csv_tempfile("sku\nA1\nA2\n").path).estimated_rows).to eq(2)
      expect(described_class.new(csv_tempfile("sku\n").path).estimated_rows).to eq(0)
      expect(described_class.new(csv_tempfile("").path).estimated_rows).to eq(0)
    end
  end
end

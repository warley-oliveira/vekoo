require "rails_helper"

RSpec.describe Products::Embedder do
  context "sem chave" do
    around { |example| with_openai_key(nil) { example.run } }

    it "não está disponível, e chave em branco conta como sem chave" do
      expect(described_class).not_to be_available
      with_openai_key("") { expect(described_class).not_to be_available }
    end

    it "não gera nada, sem chamar a API nem levantar" do
      expect(described_class.for_query("cadeira")).to be_nil
      expect(described_class.embed([ "cadeira" ])).to eq([])
      expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
    end
  end

  context "com chave" do
    around { |example| with_openai_key("sk-teste") { example.run } }

    describe ".embed" do
      before { stub_openai_embeddings }

      it "manda o modelo e as dimensões, autenticado pela chave" do
        vectors = described_class.embed([ "cadeira" ])

        expect(vectors.first.size).to eq(described_class::DIMENSIONS)
        expect(
          a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)
            .with(
              headers: { "Authorization" => "Bearer sk-teste" },
              body: { model: described_class::MODEL, input: [ "cadeira" ], dimensions: described_class::DIMENSIONS }
            )
        ).to have_been_made.once
      end

      it "divide em lotes o que passa do limite da API" do
        stub_const("#{described_class}::BATCH_SIZE", 2)

        expect(described_class.embed(%w[a b c]).size).to eq(3)
        expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)).to have_been_made.twice
      end

      it "descarta texto vazio e não chama a API sem nada para enviar" do
        expect(described_class.embed([ "", "   " ])).to eq([])
        expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
      end

      # A API não promete a ordem das entradas, e o job associa vetor a item por posição.
      it "devolve na ordem do `index`, não na da resposta" do
        stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(
          status: 200,
          headers: { "Content-Type" => "application/json" },
          body: { data: [ { index: 1, embedding: [ 2.0 ] }, { index: 0, embedding: [ 1.0 ] } ] }.to_json
        )

        expect(described_class.embed(%w[a b])).to eq([ [ 1.0 ], [ 2.0 ] ])
      end
    end

    it "deixa a falha da API subir em .embed: quem chama é job, e job tem retry" do
      stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}")

      expect { described_class.embed([ "a" ]) }.to raise_error(Faraday::Error)
    end

    describe ".for_query" do
      it "normaliza e cacheia: a mesma frase não paga duas vezes" do
        stub_openai_embeddings

        first = described_class.for_query("  Cadeira   GAMER ")
        second = described_class.for_query("cadeira gamer")

        expect(first.size).to eq(described_class::DIMENSIONS)
        expect(second).to eq(first)
        expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)).to have_been_made.once
      end

      it "busca em branco não chama a API" do
        expect(described_class.for_query("   ")).to be_nil
        expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
      end

      it "engole falha e demora: quem chama degrada para o texto" do
        stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}")
        expect(described_class.for_query("cadeira")).to be_nil

        stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_timeout
        expect(described_class.for_query("mesa")).to be_nil
      end

      it "não cacheia a falha" do
        stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}")
        described_class.for_query("cadeira")

        stub_openai_embeddings
        expect(described_class.for_query("cadeira")).to be_present
      end
    end
  end

  describe ".source_hash" do
    it "muda com o texto e é estável" do
      expect(described_class.source_hash("a")).to eq(described_class.source_hash("a"))
      expect(described_class.source_hash("a")).not_to eq(described_class.source_hash("b"))
    end
  end

  describe ".to_sql_literal" do
    it "gera o literal que o pgvector aceita" do
      expect(described_class.to_sql_literal([ 1, 0.5 ])).to eq("[1.0,0.5]")
    end
  end
end

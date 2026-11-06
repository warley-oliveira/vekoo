require "rails_helper"

RSpec.describe Products::SearchService do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }

  let!(:chair) do
    create(:product_item, organization: organization, title: "Cadeira Gamer Pró", summary: "Conforto máximo",
      external_id: "SKU-1", tags: %w[gamer], custom_fields: { "preco" => 900 })
  end
  let!(:desk) do
    create(:product_item, organization: organization, title: "Mesa de Escritório", summary: "Tampo de vidro",
      external_id: "SKU-2", tags: %w[home-office], custom_fields: { "preco" => 300 })
  end

  def search(query = nil, **options)
    described_class.new(organization.id, query: query, **options).call
  end

  context "sem chave da OpenAI" do
    around { |example| with_openai_key(nil) { example.run } }

    it "nunca chama a API" do
      search("cadeira")

      expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
    end

    it "casa o plural com o singular pelo stemming" do
      result = search("cadeiras")

      expect(result.strategy).to eq("lexical")
      expect(result.items.map(&:title)).to eq([ "Cadeira Gamer Pró" ])
    end

    it "ignora acento do lado da busca" do
      expect(search("escritorio").items.map(&:title)).to eq([ "Mesa de Escritório" ])
    end

    # websearch_to_tsquery liga os termos com AND: sem o relaxamento para OR, uma frase
    # natural em que nenhum item casa TODOS os termos devolve vazio.
    it "ainda encontra quando só parte da frase casa" do
      expect(search("cadeira confortavel para trabalhar").items).to include(chair)
    end

    it "põe primeiro o item que casa todos os termos" do
      create(:product_item, organization: organization, title: "Mesa Gamer", external_id: "SKU-9")

      expect(search("cadeira gamer").items.first).to eq(chair)
    end

    # Com exclusão o tsquery tem `!`, e relaxar para OR daria "a OU não-b".
    it "respeita a exclusão em vez de relaxá-la para OR" do
      plain = create(:product_item, organization: organization, title: "Cadeira Simples", external_id: "SKU-8")

      expect(search("cadeira -gamer").items).to eq([ plain ])
    end

    context "quando o tsvector não casa" do
      it "cai no texto (ILIKE) para pedaço de palavra, sem erro" do
        result = search("cade")

        expect(result.strategy).to eq("text")
        expect(result.items).to eq([ chair ])
        expect(result.total).to eq(1)
      end

      it "ignora acento e caixa também no ILIKE" do
        expect(search("ESCRITÓ").items).to eq([ desk ])
      end

      it "põe quem casa pelo título antes de quem casa só no resto" do
        by_summary = create(:product_item, organization: organization, title: "Apoio", summary: "Para cadeiral alto")
        by_title = create(:product_item, organization: organization, title: "Cadeirão")

        items = search("cadei").items

        expect(items.first(2)).to contain_exactly(by_title, chair)
        expect(items.last).to eq(by_summary)
      end

      it "não trata % como curinga" do
        result = search("%")

        expect(result.items).to be_empty
        expect(result.strategy).to eq("text")
      end

      it "aplica os filtros" do
        expect(search("cade", filters: { tags: %w[home-office] }).items).to be_empty
      end

      it "não vaza outra organização" do
        create(:product_item, organization: other_organization, title: "Cadeira Alheia")

        expect(search("cade").items).to eq([ chair ])
      end

      it "devolve vazio quando nada casa" do
        result = search("xyzzy")

        expect(result.items).to be_empty
        expect(result.total).to eq(0)
      end
    end
  end

  context "com chave da OpenAI" do
    around { |example| with_openai_key("sk-teste") { example.run } }

    let(:query_body) { hash_including("model" => Products::Embedder::MODEL, "dimensions" => Products::Embedder::DIMENSIONS) }

    # Sofá não tem nenhuma palavra em comum com a busca: só o vetor o traz.
    let!(:sofa) { create(:product_item, organization: organization, title: "Sofá Retrátil", external_id: "SKU-3") }

    before do
      create(:product_embedding, item: sofa, vector: embedding_vector(0))
      create(:product_embedding, item: desk, vector: embedding_vector(1))
      stub_openai_embeddings(axis: 0)
    end

    it "funde vetor e texto na busca híbrida" do
      result = search("algo para relaxar na sala")

      expect(result.strategy).to eq("hybrid")
      expect(result.items.first).to eq(sofa)
      expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).with(body: query_body)).to have_been_made.once
    end

    it "soma os dois rankings: quem casa no texto também aparece" do
      result = search("cadeira")

      expect(result.strategy).to eq("hybrid")
      expect(result.items).to include(chair, sofa)
    end

    it "cacheia o embedding da busca" do
      2.times { search("algo para relaxar") }

      expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)).to have_been_made.once
    end

    it "aplica os filtros dentro do braço vetorial" do
      result = search("algo para relaxar", filters: { tags: %w[home-office] })

      expect(result.items).to eq([ desk ])
    end

    it "não enxerga vetores de outra organização" do
      foreign = create(:product_item, organization: other_organization, title: "Sofá Alheio")
      create(:product_embedding, item: foreign, vector: embedding_vector(0))

      expect(search("algo para relaxar").items).not_to include(foreign)
    end

    it "não traz item inativo pelo vetor" do
      sofa.update!(active: false)

      expect(search("algo para relaxar").items).not_to include(sofa)
    end

    it "volta a responder pelo texto quando a API falha" do
      stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}")

      result = search("cadeira")

      expect(result.strategy).to eq("lexical")
      expect(result.items).to eq([ chair ])
    end

    it "volta a responder pelo texto quando a API demora" do
      stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_timeout

      expect(search("cadeira").strategy).to eq("lexical")
    end

    it "cai no texto se nem vetor nem tsvector trazem nada" do
      Products::Embedding.delete_all

      result = search("cade")

      expect(result.strategy).to eq("text")
      expect(result.items).to eq([ chair ])
    end
  end

  describe "SKU exato" do
    around { |example| with_openai_key("sk-teste") { example.run } }

    # Um identificador exato num ranking só enterraria o resultado certo, e é caro à toa.
    it "resolve antes de qualquer ranking, sem chamar a API" do
      result = search("SKU-2")

      expect(result.strategy).to eq("exact")
      expect(result.items).to eq([ desk ])
      expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
    end

    it "respeita os filtros" do
      desk.update!(active: false)
      stub_openai_embeddings

      expect(search("SKU-2").strategy).not_to eq("exact")
    end
  end

  describe "isolamento e padrões" do
    around { |example| with_openai_key(nil) { example.run } }

    it "nunca devolve item de outra organização" do
      create(:product_item, organization: other_organization, title: "Cadeira Alheia", external_id: "SKU-OUTRA")

      expect(search("cadeira").items.map(&:organization_id).uniq).to eq([ organization.id ])
      expect(search("SKU-OUTRA").items).to be_empty
    end

    it "sem organização, falha fechada" do
      result = described_class.new(nil, query: "cadeira").call

      expect(result.strategy).to eq("none")
      expect(result.items).to be_empty
    end

    it "deixa os inativos de fora por padrão" do
      chair.update!(active: false)

      expect(search("cadeira").items).to be_empty
      expect(search("cadeira", filters: { include_inactive: true }).items).to eq([ chair ])
      expect(search("cadeira", filters: { active: false }).items).to eq([ chair ])
      expect(search("cadeira", filters: { active: true }).items).to eq([])
    end

    it "não carrega as colunas pesadas de índice" do
      expect(search("cadeira").items.first.attributes.keys).not_to include(*Products::Item::INDEX_COLUMNS)
      expect(search("SKU-1").items.first.attributes.keys).not_to include(*Products::Item::INDEX_COLUMNS)
      expect(search.items.first.attributes.keys).not_to include(*Products::Item::INDEX_COLUMNS)
    end

    it "limita o tamanho do resultado" do
      expect(described_class.new(organization.id, query: "x", limit: 999).send(:limit)).to eq(described_class::MAX_LIMIT)
      expect(described_class.new(organization.id, query: "x", limit: 0).send(:limit)).to eq(1)
    end

    it "sem termo, navega em vez de buscar, com o total inteiro" do
      result = search(limit: 1)

      expect(result.strategy).to eq("browse")
      expect(result.total).to eq(2)
      expect(result.items.size).to eq(1)
    end
  end

  describe "filtros" do
    around { |example| with_openai_key(nil) { example.run } }

    it "restringe por tag" do
      expect(search("cadeira", filters: { tags: %w[gamer] }).items).to eq([ chair ])
    end

    # Regressão do bug de filtrar DEPOIS da fusão.
    it "aplica o filtro dentro do arm, não depois da fusão" do
      expect(search("cadeira", filters: { tags: %w[home-office] }).items).to be_empty
    end

    it "restringe por faixa numérica em campo personalizado" do
      expect(search(filters: { custom: { "preco" => { "max" => 500 } } }).items).to eq([ desk ])
      expect(search(filters: { custom: { "preco" => { "min" => 500 } } }).items).to eq([ chair ])
      expect(search(filters: { custom: { preco: { min: 100, max: 500 } } }).items).to eq([ desk ])
    end

    # Sem a proteção o cast derrubaria a busca inteira por causa de um valor torto.
    it "ignora valor não numérico na faixa, sem erro" do
      create(:product_item, organization: organization, title: "Sob consulta", custom_fields: { "preco" => "a combinar" })
      create(:product_item, organization: organization, title: "Com pontos", custom_fields: { "preco" => "1.2.3" })

      expect(search(filters: { custom: { "preco" => { "min" => 100 } } }).items).to contain_exactly(chair, desk)
    end

    it "não quebra com caractere especial na chave do campo" do
      expect(search(filters: { custom: { "a?b:c'd" => { "min" => 1 } } }).items).to be_empty
      expect(search(filters: { custom: { "a?b:c'd" => "x" } }).items).to be_empty
    end

    it "filtra por igualdade em texto" do
      create(:product_field_definition, organization: organization, name: "Cor")
      azul = create(:product_item, organization: organization, title: "Azul", custom_fields: { "cor" => "Azul" })

      expect(search(filters: { custom: { "cor" => "Azul" } }).items).to eq([ azul ])
    end

    # A query string só traz texto, e o jsonb guarda número e booleano com tipo.
    it "converte o valor da igualdade para o tipo do campo" do
      create(:product_field_definition, organization: organization, name: "Garantia", value_type: "checkbox")
      create(:product_field_definition, organization: organization, name: "Tamanho", value_type: "number")
      item = create(:product_item, organization: organization, title: "Com garantia",
        custom_fields: { "garantia" => "true", "tamanho" => "42" })

      expect(search(filters: { custom: { "garantia" => "true" } }).items).to eq([ item ])
      expect(search(filters: { custom: { "tamanho" => "42" } }).items).to eq([ item ])
    end

    context "por categoria" do
      let(:parent) { create(:product_category, organization: organization, name: "Móveis") }
      let(:child) { create(:product_category, organization: organization, name: "Cadeiras", parent: parent) }

      before { chair.sync_categories([ child.id ]) }

      it "inclui a subárvore inteira ao filtrar pelo pai" do
        expect(search("cadeira", filters: { categories: [ "moveis" ] }).items).to eq([ chair ])
        expect(search(filters: { categories: [ "moveis/cadeiras" ] }).items).to eq([ chair ])
      end

      it "aceita mais de um caminho" do
        expect(search(filters: { categories: [ "moveis", "outra" ] }).items).to eq([ chair ])
      end

      it "caminho que não existe não casa nada, sem erro" do
        expect(search("cadeira", filters: { categories: [ "nao-existe" ] }).items).to be_empty
        expect(search(filters: { categories: [ "nao-existe" ] }).total).to eq(0)
      end

      it "não enxerga a categoria de mesmo caminho em outra organização" do
        foreign = create(:product_category, organization: other_organization, name: "Móveis")
        create(:product_item, organization: other_organization).sync_categories([ foreign.id ])

        expect(search(filters: { categories: [ "moveis" ] }).items).to eq([ chair ])
      end

      # O índice reúne os nomes da categoria, e é o SaveItem que o mantém em dia.
      it "encontra o item pelo nome da categoria depois de reindexado" do
        chair.refresh_index_text!

        expect(search("moveis").items).to eq([ chair ])
      end
    end
  end

  describe "#listing" do
    around { |example| with_openai_key(nil) { example.run } }

    def listing(query = nil, **options)
      described_class.new(organization.id, query: query, **options).listing
    end

    it "é uma relation que aceita ordenar e paginar" do
      expect(listing.order(:title).limit(1).to_a).to eq([ chair ])
      expect(listing.count).to eq(2)
    end

    it "filtra pelo termo: plural, frase e pedaço de palavra" do
      expect(listing("cadeiras")).to contain_exactly(chair)
      expect(listing("cade")).to contain_exactly(chair)
      expect(listing("mesa vidro")).to contain_exactly(desk)
      expect(listing("xyzzy")).to be_empty
    end

    it "sem termo, aplica só os filtros" do
      expect(listing(filters: { tags: %w[gamer] })).to contain_exactly(chair)
    end

    it "combina termo, filtro e organização" do
      create(:product_item, organization: other_organization, title: "Cadeira Alheia")

      expect(listing("cadeira", filters: { tags: %w[home-office] })).to be_empty
      expect(listing("cadeira")).to contain_exactly(chair)
    end

    it "sem organização, não devolve nada" do
      expect(described_class.new(nil).listing).to be_empty
    end
  end
end

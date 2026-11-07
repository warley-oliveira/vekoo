require "rails_helper"

# A semente é o conteúdo de demonstração do produto: se ela quebrar, ninguém
# consegue abrir o Vekoo com dados de verdade para olhar. Estes exemplos rodam
# `db/seeds.rb` de ponta a ponta no banco de teste.
RSpec.describe "db/seeds.rb" do
  # Uma vez só para o arquivo inteiro — semear é caro e o resultado é o mesmo.
  before(:all) do
    self.use_transactional_tests = false
    self.class.clean_database

    silence_stream { load Rails.root.join("db/seeds.rb") }
  end

  after(:all) do
    self.class.clean_database
    self.use_transactional_tests = true
  end

  # Fora da transação nada se desfaz sozinho, e cada domínio semeia as próprias tabelas: uma
  # lista fixa aqui deixaria dados vazando para os exemplos seguintes, e a falha apareceria
  # longe da causa. Limpa tudo, no Postgres e no Mongo.
  def self.clean_database
    connection = ActiveRecord::Base.connection
    tables = connection.tables - %w[schema_migrations ar_internal_metadata]
    connection.execute("TRUNCATE #{tables.map { |table| connection.quote_table_name(table) }.join(', ')} CASCADE")
    Mongoid.truncate!
  end

  def self.silence_stream
    original = $stdout
    $stdout = StringIO.new
    yield
  ensure
    $stdout = original
  end

  def silence_stream(&) = self.class.silence_stream(&)

  describe "semente de exemplo dos domínios" do
    # Só o trecho final do arquivo interessa: `db:prepare` roda a semente em banco
    # vazio em produção, e os domínios criam pessoas com senha conhecida.
    def domain_seeds_loaded_in(environment, env_flag: nil)
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new(environment))
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("SEED_DEMO_DATA").and_return(env_flag)
      loaded = []
      allow(Rails.root).to receive(:glob).and_call_original
      allow(Rails.root).to receive(:glob).with("db/seeds/*.rb") { loaded << :glob; [] }
      silence_stream { load Rails.root.join("db/seeds.rb") }
      loaded.any?
    end

    it "não carrega em produção" do
      expect(domain_seeds_loaded_in("production")).to be(false)
    end

    it "carrega em produção só com SEED_DEMO_DATA=1" do
      expect(domain_seeds_loaded_in("production", env_flag: "1")).to be(true)
    end

    it "carrega em desenvolvimento" do
      expect(domain_seeds_loaded_in("development")).to be(true)
    end
  end

  describe "conta de demonstração, que tem senha pública" do
    before { allow(ENV).to receive(:[]).and_call_original }

    def with_environment(environment, env_flag: nil)
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new(environment))
      allow(ENV).to receive(:[]).with("SEED_DEMO_DATA").and_return(env_flag)
      yield
    end

    it "não nasce em produção" do
      with_environment("production") { expect(VekooSeeds.demo?).to be(false) }
    end

    it "nasce em produção só com SEED_DEMO_DATA=1" do
      with_environment("production", env_flag: "1") { expect(VekooSeeds.demo?).to be(true) }
    end

    it "nasce em desenvolvimento" do
      with_environment("development") { expect(VekooSeeds.demo?).to be(true) }
    end
  end

  let(:organization) { Organization.first }

  it "traz o acervo da ferramenta inteiro" do
    expect(ThemePreset.count).to eq(8)
    expect(ThemePreset.ordered.pluck(:key))
      .to eq(%w[paper midnight forest clay ocean solar plum linen])
    expect(LibraryImage.count).to eq(12)
    expect(LibraryImage.ordered.first.key).to eq("amanhecer")
    expect(PaletteColor.in_group("folder").pluck(:key))
      .to eq(%w[cinza violeta azul verde amarelo vermelho])
    expect(PaletteColor.in_group("accent").count).to eq(8)
    expect(PaletteColor.in_group("extended").count).to eq(12)
  end

  it "traz a organização de demonstração com os créditos gastos pela metade" do
    expect(organization.name).to eq("Marina Duarte Conteúdo")
    expect(organization.plan).to eq("free")
    expect(organization.credits_total).to eq(50)
    expect(organization.credits_used).to eq(14)
  end

  it "deixa a conta de demonstração pronta para entrar" do
    # A semente do domínio "access" põe outras pessoas na organização: a dona é achada pelo
    # e-mail, e continua sendo uma só.
    account = organization.accounts.find_by!(email: "marina.duarte@exemplo.com.br")

    expect(organization.accounts.where(role: "owner")).to contain_exactly(account)
    expect(account.role).to eq("owner")
    expect(account.authenticate("carrossel123")).to be_truthy
    # A senha nunca fica em texto puro, nem na semente.
    expect(account.password_digest).not_to include("carrossel123")
  end

  it "traz os 14 carrosséis — 12 na biblioteca e 2 na lixeira" do
    expect(organization.carousels.count).to eq(14)
    expect(organization.carousels.active.count).to eq(12)
    expect(organization.carousels.trashed.count).to eq(2)
    expect(organization.carousels.where(favorite: true).count).to eq(3)
    expect(organization.carousels.pluck(:format).tally).to eq("4:5" => 11, "1:1" => 3)
  end

  it "traz os 84 cards, todos com documento bem formado" do
    cards = organization.carousels.flat_map(&:cards)
    expect(cards.length).to eq(84)

    cards.each do |card|
      expect(card.keys).to include("id", "layout", "bg", "align", "image", "blocks")
      expect(card["layout"]).to be_in(%w[image-full image-top image-left image-right no-image])
      expect(card["align"]).to be_in(%w[top center bottom])
      card["blocks"].each do |block|
        expect(block["id"]).to start_with("#{card['id']}-b")
        expect(block["type"]).to be_in(%w[text image list steps stat quote testimonial badge divider table button])
      end
    end
  end

  it "escreve o texto em trechos com marcas, como o editor espera" do
    carousel = organization.carousels.find_by(title: "5 trocas simples para comer melhor")
    title = carousel.cards.first["blocks"].find { |b| b["role"] == "title" }

    expect(title["spans"]).to eq([ { "text" => "5 trocas simples para comer melhor" } ])
  end

  it "dá tema completo a todo carrossel" do
    organization.carousels.each do |carousel|
      expect(carousel.theme.keys).to match_array(Carousel::THEME_KEYS)
      expect(carousel.theme.values).to all(start_with("oklch("))
    end
  end

  it "traz os avisos guardando só a chave de tradução" do
    expect(organization.notifications.recent_first.pluck(:key)).to eq(%w[folders welcome])
    expect(organization.notifications.unread.count).to eq(1)
  end

  it "começa sem pastas — é assim que a tela convida a criar a primeira" do
    expect(organization.folders.count).to eq(0)
  end

  it "é idempotente: rodar de novo atualiza em vez de duplicar" do
    expect { silence_stream { load Rails.root.join("db/seeds.rb") } }
      .to not_change(Carousel, :count)
      .and not_change(Organization, :count)
      .and not_change(Account, :count)
      .and not_change(ThemePreset, :count)
      .and not_change(PaletteColor, :count)
  end
end

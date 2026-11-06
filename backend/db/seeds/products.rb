# Semente do catálogo: a loja fictícia que já aparece nos carrosséis da Marina (Doma
# Store), com categorias em árvore, campos personalizados e imagens.
#
# Idempotente: cada registro é achado pela chave natural (caminho, chave do campo, SKU),
# então rodar de novo atualiza em vez de duplicar. É conteúdo de demonstração, pt-BR mesmo
# quando a API responde em inglês.
#
# Sem rede: as imagens são só URLs públicas de exemplo, gravadas como externas. Nada é
# baixado e nenhum embedding é gerado aqui; com OPENAI_API_KEY, quem alcança estes itens é
# o Products::BackfillEmbeddingsJob recorrente.
#
#   bin/rails runner 'load "db/seeds/products.rb"'
organization = Account.find_by(email: "marina.duarte@exemplo.com.br")&.organization

if organization.nil?
  puts "Catálogo: conta de demonstração não encontrada. Rode db/seeds.rb inteiro."
else
  store_url = "https://domastore.exemplo.com.br"
  image_url = ->(seed) { "https://picsum.photos/seed/doma-#{seed}/800/800" }

  # --- campos personalizados -------------------------------------------------
  [
    { name: "Preço", value_type: "number", required: true, searchable: false,
      description: "Preço de venda em reais." },
    { name: "Preço promocional", value_type: "number", searchable: false,
      description: "Preço durante a promoção. Em branco, vale o preço normal." },
    { name: "Cor", value_type: "list", default_value: "Preto",
      option_values: [ "Preto", "Branco", "Areia", "Terracota", "Azul-marinho", "Verde-oliva", "Vinho", "Mostarda" ] },
    { name: "Tamanhos", value_type: "text", description: "Tamanhos disponíveis, como P, M, G." },
    { name: "Material", value_type: "text" },
    { name: "Em estoque", value_type: "checkbox", searchable: false },
    { name: "Lançamento", value_type: "date", searchable: false, description: "Quando a peça chegou à loja." },
    { name: "Guia de medidas", value_type: "url", searchable: false }
  ].each_with_index do |attributes, position|
    field = Products::FieldDefinition.find_or_initialize_by(
      organization: organization, key: attributes[:name].parameterize.underscore
    )
    field.update!(attributes.merge(position: position))
  end

  # --- categorias -------------------------------------------------------------
  ensure_category = lambda do |name, parent = nil, position = 0|
    path = [ parent&.path, name.parameterize ].compact.join(Products::Category::PATH_SEPARATOR)
    category = Products::Category.find_or_initialize_by(organization: organization, path: path)
    category.update!(name: name, parent: parent, position: position)
    category
  end

  moda = ensure_category.call("Moda", nil, 0)
  feminino = ensure_category.call("Feminino", moda, 0)
  masculino = ensure_category.call("Masculino", moda, 1)
  acessorios = ensure_category.call("Acessórios", nil, 1)
  casa = ensure_category.call("Casa", nil, 2)

  categories = {
    vestidos: ensure_category.call("Vestidos", feminino, 0),
    blusas: ensure_category.call("Blusas", feminino, 1),
    camisetas: ensure_category.call("Camisetas", masculino, 0),
    bolsas: ensure_category.call("Bolsas", acessorios, 0),
    lencos: ensure_category.call("Lenços", acessorios, 1),
    cozinha: ensure_category.call("Cozinha", casa, 0),
    decoracao: ensure_category.call("Decoração", casa, 1),
    presentes: ensure_category.call("Presentes", nil, 3)
  }

  # --- itens -------------------------------------------------------------------
  # `images` é a quantidade de fotos: de nenhuma (estado vazio) a três (galeria).
  items = [
    { sku: "DOM-VES-001", title: "Vestido Midi de Linho", slug: "vestido-midi-linho", images: 3, categories: %i[vestidos],
      summary: "Vestido midi de linho puro, com botões de coco na frente e bolsos laterais.",
      description: "Corte evasê que veste bem do P ao GG. O linho é lavado, então não encolhe depois da primeira " \
                   "lavagem. Lavar à mão ou em ciclo delicado e secar à sombra.",
      tags: %w[linho lançamento], fields: { "preco" => 289.9, "cor" => "Terracota", "tamanhos" => "P, M, G, GG", "material" => "Linho", "em_estoque" => true, "lancamento" => "2026-09-15", "guia_de_medidas" => "#{store_url}/medidas/vestidos" } },
    { sku: "DOM-VES-002", title: "Vestido Chemise Listrado", slug: "vestido-chemise-listrado", images: 2, categories: %i[vestidos],
      summary: "Chemise de algodão com listras finas e cinto de amarrar do mesmo tecido.",
      description: "Abre inteira na frente, então também funciona como sobreposição. Tecido fresco para o verão.",
      tags: %w[algodão promoção], fields: { "preco" => 249.9, "preco_promocional" => 199.9, "cor" => "Azul-marinho", "tamanhos" => "P, M, G", "material" => "Algodão", "em_estoque" => true } },
    { sku: "DOM-VES-003", title: "Vestido Longo Estampa Floral", slug: "vestido-longo-floral", images: 1, categories: %i[vestidos], active: false,
      summary: "Da coleção passada: longo fluido com estampa de flores do cerrado.",
      description: "Peça fora de linha, mantida no catálogo para consulta de quem já comprou.",
      tags: %w[viscose], fields: { "preco" => 329.9, "cor" => "Vinho", "tamanhos" => "M, G", "material" => "Viscose", "em_estoque" => false } },
    { sku: "DOM-BLU-001", title: "Blusa de Viscose com Amarração", slug: "blusa-viscose-amarracao", images: 2, categories: %i[blusas],
      summary: "Blusa leve, com amarração na cintura que ajusta o caimento.",
      description: "Combina com jeans no dia a dia e com alfaiataria no trabalho.",
      tags: %w[viscose trabalho], fields: { "preco" => 149.9, "cor" => "Areia", "tamanhos" => "P, M, G", "material" => "Viscose", "em_estoque" => true } },
    { sku: "DOM-BLU-002", title: "Camisa de Algodão Oversized", slug: "camisa-algodao-oversized", images: 2, categories: %i[blusas],
      summary: "Camisa ampla de algodão egípcio, com punho dobrável.",
      description: "Modelagem larga de propósito. Quem prefere mais ajustada pode escolher um número abaixo.",
      tags: %w[algodão básico], fields: { "preco" => 179.9, "cor" => "Branco", "tamanhos" => "P, M, G", "material" => "Algodão egípcio", "em_estoque" => true } },
    { sku: "DOM-BLU-003", title: "Regata Canelada Básica", slug: "regata-canelada", images: 1, categories: %i[blusas],
      summary: "A regata que vai com tudo: canelada, justa e de alça larga.",
      tags: %w[básico], fields: { "preco" => 69.9, "cor" => "Preto", "tamanhos" => "PP, P, M, G", "material" => "Algodão com elastano", "em_estoque" => true } },
    { sku: "DOM-CAM-001", title: "Camiseta de Algodão Pima", slug: "camiseta-pima", images: 3, categories: %i[camisetas],
      summary: "Camiseta de algodão pima peruano, de toque macio e gola reforçada.",
      description: "Fio longo que quase não forma bolinha. Vem pré-encolhida.",
      tags: %w[algodão básico], fields: { "preco" => 119.9, "cor" => "Preto", "tamanhos" => "P, M, G, GG", "material" => "Algodão pima", "em_estoque" => true, "guia_de_medidas" => "#{store_url}/medidas/camisetas" } },
    { sku: "DOM-CAM-002", title: "Camiseta Estampada Caju", slug: "camiseta-caju", images: 1, categories: %i[camisetas],
      summary: "Estampa de caju em serigrafia à base d'água, feita em Recife.",
      tags: %w[estampa verão], fields: { "preco" => 99.9, "cor" => "Branco", "tamanhos" => "P, M, G", "material" => "Algodão", "em_estoque" => true, "lancamento" => "2026-10-02" } },
    { sku: "DOM-CAM-003", title: "Polo de Piquet", slug: "polo-piquet", images: 2, categories: %i[camisetas],
      summary: "Polo clássica de piquet, com botões de madrepérola.",
      tags: %w[trabalho], fields: { "preco" => 169.9, "cor" => "Verde-oliva", "tamanhos" => "M, G, GG", "material" => "Piquet de algodão", "em_estoque" => true } },
    { sku: "DOM-CAM-004", title: "Camiseta Básica Gola V", slug: "camiseta-gola-v", images: 0, categories: %i[camisetas], active: false,
      summary: "Aguardando fotos da nova remessa.",
      tags: %w[básico], fields: { "preco" => 89.9, "cor" => "Branco", "tamanhos" => "P, M, G", "material" => "Algodão", "em_estoque" => false } },
    { sku: "DOM-BOL-001", title: "Bolsa de Palha Tramada", slug: "bolsa-palha", images: 2, categories: %i[bolsas],
      summary: "Bolsa de palha de buriti, trançada à mão por artesãs do Maranhão.",
      description: "Cada peça é única e pode variar levemente de tom. Alças de couro e forro de algodão.",
      tags: %w[artesanal verão], fields: { "preco" => 199.9, "cor" => "Areia", "material" => "Palha de buriti", "em_estoque" => true } },
    { sku: "DOM-BOL-002", title: "Mochila de Couro Legítimo", slug: "mochila-couro", images: 3, categories: %i[bolsas],
      summary: "Mochila de couro curtido ao vegetal, com divisória para notebook de 14 polegadas.",
      description: "O couro ganha marcas do uso com o tempo, e é assim que ele fica bonito. Garantia de um ano na costura.",
      tags: %w[couro trabalho], fields: { "preco" => 459.9, "cor" => "Preto", "material" => "Couro", "em_estoque" => true } },
    { sku: "DOM-BOL-003", title: "Ecobag de Algodão Cru", slug: "ecobag", images: 1, categories: %i[bolsas presentes],
      summary: "Ecobag resistente, que aguenta a feira da semana inteira.",
      tags: %w[presente sustentável], fields: { "preco" => 49.9, "cor" => "Areia", "material" => "Algodão cru", "em_estoque" => true } },
    { sku: "DOM-LEN-001", title: "Lenço de Seda Estampado", slug: "lenco-seda", images: 2, categories: %i[lencos presentes],
      summary: "Lenço quadrado de seda pura, com estampa exclusiva de folhagens.",
      tags: %w[seda presente], fields: { "preco" => 129.9, "preco_promocional" => 99.9, "cor" => "Vinho", "material" => "Seda", "em_estoque" => true } },
    { sku: "DOM-LEN-002", title: "Lenço de Algodão Tie-Dye", slug: "lenco-tie-dye", images: 1, categories: %i[lencos],
      summary: "Tingido à mão em pequenos lotes, nenhum sai igual ao outro.",
      tags: %w[artesanal], fields: { "preco" => 69.9, "cor" => "Mostarda", "material" => "Algodão", "em_estoque" => true } },
    { sku: "DOM-COZ-001", title: "Caneca de Cerâmica Artesanal", slug: "caneca-ceramica", images: 2, categories: %i[cozinha presentes],
      summary: "Caneca de 350 ml, torneada à mão em ateliê de Cunha (SP).",
      description: "Pode ir ao micro-ondas e à lava-louças. O esmalte varia um pouco de peça para peça.",
      tags: %w[artesanal presente], fields: { "preco" => 59.9, "cor" => "Terracota", "material" => "Cerâmica", "em_estoque" => true } },
    { sku: "DOM-COZ-002", title: "Jogo de Xícaras de Café (6 peças)", slug: "xicaras-cafe", images: 2, categories: %i[cozinha],
      summary: "Seis xícaras de porcelana com pires, para o cafezinho depois do almoço.",
      tags: %w[café], fields: { "preco" => 189.9, "cor" => "Branco", "material" => "Porcelana", "em_estoque" => true } },
    { sku: "DOM-COZ-003", title: "Tábua de Frios em Madeira", slug: "tabua-frios", images: 1, categories: %i[cozinha presentes],
      summary: "Tábua de madeira de reflorestamento, acabada com óleo mineral.",
      tags: %w[presente sustentável], fields: { "preco" => 139.9, "material" => "Madeira de reflorestamento", "em_estoque" => false } },
    { sku: "DOM-COZ-004", title: "Avental de Linho", slug: "avental-linho", images: 1, categories: %i[cozinha],
      summary: "Avental de linho com bolso frontal e alça cruzada nas costas.",
      tags: %w[linho], fields: { "preco" => 89.9, "cor" => "Verde-oliva", "material" => "Linho", "em_estoque" => true } },
    { sku: "DOM-DEC-001", title: "Almofada de Algodão Bordada", slug: "almofada-bordada", images: 2, categories: %i[decoracao],
      summary: "Capa de almofada de 45 cm, bordada à mão em ponto cruz.",
      tags: %w[artesanal], fields: { "preco" => 109.9, "cor" => "Mostarda", "material" => "Algodão", "em_estoque" => true } },
    { sku: "DOM-DEC-002", title: "Vaso de Barro Pintado à Mão", slug: "vaso-barro", images: 3, categories: %i[decoracao],
      summary: "Vaso de barro do Vale do Jequitinhonha, pintado com pigmentos naturais.",
      description: "Peça decorativa, não vai água direto: use com um vaso interno para flores frescas.",
      tags: %w[artesanal], fields: { "preco" => 159.9, "cor" => "Terracota", "material" => "Barro", "em_estoque" => true, "lancamento" => "2026-08-20" } },
    { sku: "DOM-DEC-003", title: "Manta de Tricô para Sofá", slug: "manta-trico", images: 2, categories: %i[decoracao],
      summary: "Manta de tricô grosso, de 1,30 m por 1,70 m, para as noites frias.",
      tags: %w[inverno], fields: { "preco" => 269.9, "cor" => "Areia", "material" => "Algodão", "em_estoque" => true } },
    { sku: "DOM-DEC-004", title: "Vela Aromática de Capim-Limão", slug: "vela-capim-limao", images: 1, categories: %i[decoracao presentes],
      summary: "Vela de cera de soja com óleo essencial, 40 horas de queima.",
      tags: %w[presente aromas], fields: { "preco" => 54.9, "material" => "Cera de soja", "em_estoque" => true } },
    { sku: "DOM-PRE-001", title: "Kit Café da Manhã", slug: "kit-cafe-manha", images: 2, categories: %i[presentes cozinha],
      summary: "Duas canecas, um pano de prato e um pacote de café especial de Minas.",
      description: "Já vem na caixa de presente, com um cartão escrito à mão se você pedir.",
      tags: %w[presente café], fields: { "preco" => 249.9, "preco_promocional" => 219.9, "em_estoque" => true } },
    { sku: "DOM-PRE-002", title: "Nécessaire Personalizada", slug: "necessaire", images: 1, categories: %i[presentes],
      summary: "Nécessaire de lona encerada, com bordado das iniciais incluso.",
      tags: %w[presente], fields: { "preco" => 79.9, "cor" => "Verde-oliva", "material" => "Lona encerada", "em_estoque" => true } },
    # Sem SKU e sem foto, para a tela mostrar os dois vazios.
    { sku: nil, title: "Vale-presente Doma Store", slug: "vale-presente", images: 0, categories: %i[presentes],
      tags: %w[presente], fields: { "preco" => 100.0 } }
  ]

  items.each_with_index do |entry, index|
    natural_key = entry[:sku] ? { external_id: entry[:sku] } : { title: entry[:title] }
    item = Products::Item.find_or_initialize_by(organization: organization, **natural_key)

    # Datas espalhadas para as ordenações terem o que mostrar. Só na criação: rodar de
    # novo não pode mudar nada.
    if item.new_record?
      item.created_at = (index * 3 + 1).days.ago
      item.updated_at = item.created_at
    end

    item.assign_attributes(
      title: entry[:title],
      summary: entry[:summary],
      description: entry[:description],
      url: "#{store_url}/produtos/#{entry[:slug]}",
      active: entry.fetch(:active, true),
      tags: entry[:tags],
      custom_fields: entry[:fields]
    )
    item.save!

    item.sync_categories(entry[:categories].map { |key| categories.fetch(key).id })
    item.refresh_index_text!

    entry[:images].times do |number|
      image = item.images.find_or_initialize_by(source_url: image_url.call("#{entry[:slug]}-#{number + 1}"))
      image.update!(position: number, alt: "#{entry[:title]}, foto #{number + 1}")
    end
  end

  catalog = organization.product_items
  puts "  Catálogo    #{catalog.count} itens (#{catalog.where(active: false).count} inativos) · " \
       "#{organization.product_categories.count} categorias · " \
       "#{organization.product_field_definitions.count} campos · " \
       "#{Products::Image.where(item: catalog).count} imagens"
end

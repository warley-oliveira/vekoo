# Semente do Vekoo — o que antes vivia em `frontend/src/lib/mock-data.ts`,
# `lib/doc.ts`, `lib/image-library.ts` e `lib/auth.tsx`.
#
# Duas naturezas bem diferentes moram aqui:
#
#   1. **Acervo da ferramenta** (temas prontos, biblioteca de imagens, paletas)
#      — igual para todas as organizações, servido em `GET /catalog`.
#   2. **Conteúdo de demonstração** — a organização da Marina, com carrosséis
#      escritos em pt-BR de nichos variados. É *obra do usuário* fictício, não
#      interface: fica em pt-BR mesmo quando a API responde em inglês.
#
# Idempotente: os ids são UUIDv5 derivados do apelido de cada registro
# (`car-nutricao` → sempre o mesmo UUID), então rodar de novo atualiza em vez
# de duplicar.
#
#   bin/rails db:seed

require "active_support/core_ext/digest/uuid"

# Semear duas vezes no mesmo processo é normal (a spec de idempotência faz
# isso); sem esta linha, a segunda vez enche o log de "already initialized
# constant".
Object.send(:remove_const, :VekooSeeds) if defined?(VekooSeeds)

module VekooSeeds
  # Namespace próprio para os ids determinísticos da semente.
  NAMESPACE = Digest::UUID.uuid_v5(Digest::UUID::DNS_NAMESPACE, "seeds.vekoo.app")

  module_function

  def id_for(slug)
    Digest::UUID.uuid_v5(NAMESPACE, slug)
  end

  # -------------------------------------------------------------------------
  # Documento do carrossel — as mesmas funções de `lib/doc.ts`, em Ruby.

  # As marcas do texto moram em `lib/doc/spans.rb` — o mesmo código que o
  # compilador de cards da IA usa, para semente e geração produzirem
  # exatamente o mesmo documento.
  def normalize_spans(spans) = Doc::Spans.normalize(spans)
  def spans(text) = Doc::Spans.from_markdown(text)

  # Arte desenhada por especificação, com enquadramento neutro: a mesma semente
  # desenha sempre a mesma geometria, nas cores do tema.
  def art_image(style, seed, tint = "accent")
    {
      "source" => { "kind" => "art", "style" => style, "seed" => seed, "tint" => tint },
      "focus" => { "x" => 0.5, "y" => 0.5 },
      "zoom" => 1
    }
  end

  # Fábrica de blocos com ids determinísticos (`<cardId>-b1`, `-b2`…), para a
  # arte ser estável entre recargas e as animações terem chaves fixas.
  class Blocks
    def initialize(card_id)
      @card_id = card_id
      @count = 0
    end

    def text(role, value, align = "start", color = "ink")
      {
        "id" => next_id,
        "type" => "text",
        "role" => role,
        "spans" => VekooSeeds.spans(value),
        "align" => align,
        "color" => color
      }
    end

    def title(value, align = "start") = text("title", value, align, "ink")
    def subtitle(value, align = "start") = text("subtitle", value, align, "ink")
    def body(value, align = "start", color = "muted") = text("body", value, align, color)
    def caption(value, color = "muted", align = "start") = text("caption", value, align, color)

    def list(style, items)
      {
        "id" => next_id,
        "type" => "list",
        "style" => style,
        "items" => items.map { |item| VekooSeeds.spans(item) },
        "color" => "ink"
      }
    end

    def stat(value, label, align = "start")
      {
        "id" => next_id,
        "type" => "stat",
        "value" => value,
        "label" => label,
        "align" => align,
        "color" => "accent"
      }
    end

    def quote(value, attribution = nil)
      block = {
        "id" => next_id,
        "type" => "quote",
        "spans" => VekooSeeds.spans(value),
        "color" => "ink"
      }
      block["attribution"] = attribution if attribution
      block
    end

    def divider(style = "line")
      { "id" => next_id, "type" => "divider", "style" => style }
    end

    def table(rows)
      { "id" => next_id, "type" => "table", "rows" => rows }
    end

    def button(label, variant = "solid", align = "start")
      { "id" => next_id, "type" => "button", "label" => label, "variant" => variant, "align" => align }
    end

    private

    def next_id
      @count += 1
      "#{@card_id}-b#{@count}"
    end
  end

  def card(card_id, layout: nil, align: "top", image: nil, bg: nil)
    {
      "id" => card_id,
      "layout" => layout || (image ? "image-top" : "no-image"),
      "bg" => bg,
      "align" => align,
      "image" => image,
      "blocks" => yield(Blocks.new(card_id))
    }
  end

  # Card comum de conteúdo: título + corpo.
  def simple_card(card_id, title, body)
    card(card_id) { |b| [ b.title(title), b.body(body) ] }
  end

  # As quatro personalidades de capa. O card 1 é a capa: é ele que a biblioteca
  # renderiza na grade.

  # "poster": tudo ancorado embaixo, barra de acento no topo.
  def poster_cover(card_id, kicker: nil, title:, footer: nil, image: nil)
    card(card_id, align: "bottom", image: image, layout: image ? "image-full" : "no-image") do |b|
      [
        b.divider("accent"),
        (b.caption(kicker, "ink") if kicker),
        b.title(title),
        (b.caption(footer, "muted") if footer)
      ].compact
    end
  end

  # "editorial": filetes acima e abaixo, título ao centro.
  def editorial_cover(card_id, kicker: nil, title:, footer: nil)
    card(card_id, align: "center") do |b|
      [
        (b.caption(kicker, "ink") if kicker),
        b.divider("line"),
        b.title(title),
        b.divider("line"),
        (b.caption(footer, "muted") if footer)
      ].compact
    end
  end

  # "split": faixa de imagem no topo, kicker em acento.
  def split_cover(card_id, kicker: nil, title:, footer: nil, seed:)
    card(card_id, layout: "image-top", image: art_image("beams", seed)) do |b|
      [
        (b.caption(kicker, "accent") if kicker),
        b.title(title),
        (b.caption(footer, "muted") if footer)
      ].compact
    end
  end

  # "badge": selo no topo, tudo centralizado.
  def badge_cover(card_id, kicker: nil, title:, footer: nil)
    card(card_id, align: "center") do |b|
      [
        (b.button(kicker, "outline", "center") if kicker),
        b.title(title, "center"),
        b.divider("accent"),
        (b.caption(footer, "muted", "center") if footer)
      ].compact
    end
  end

  # -------------------------------------------------------------------------
  # Acervo da ferramenta

  # Paletas prontas do carrossel — `key` é a chave de tradução do nome visível.
  THEME_PRESETS = [
    [ "paper", {
      "bg" => "oklch(0.97 0.005 90)", "surface" => "oklch(0.93 0.008 90)",
      "ink" => "oklch(0.2 0.01 285)", "accent" => "oklch(0.5 0.2 292)",
      "accentInk" => "oklch(0.98 0.005 292)"
    } ],
    [ "midnight", {
      "bg" => "oklch(0.2 0.01 285)", "surface" => "oklch(0.26 0.015 285)",
      "ink" => "oklch(0.98 0 0)", "accent" => "oklch(0.88 0.2 125)",
      "accentInk" => "oklch(0.2 0.01 285)"
    } ],
    [ "forest", {
      "bg" => "oklch(0.46 0.13 155)", "surface" => "oklch(0.4 0.12 155)",
      "ink" => "oklch(0.97 0.02 110)", "accent" => "oklch(0.88 0.17 110)",
      "accentInk" => "oklch(0.3 0.09 155)"
    } ],
    [ "clay", {
      "bg" => "oklch(0.42 0.14 20)", "surface" => "oklch(0.37 0.13 20)",
      "ink" => "oklch(0.96 0.02 80)", "accent" => "oklch(0.85 0.15 85)",
      "accentInk" => "oklch(0.35 0.12 20)"
    } ],
    [ "ocean", {
      "bg" => "oklch(0.32 0.1 260)", "surface" => "oklch(0.28 0.09 260)",
      "ink" => "oklch(0.97 0.005 260)", "accent" => "oklch(0.85 0.15 85)",
      "accentInk" => "oklch(0.28 0.09 260)"
    } ],
    [ "solar", {
      "bg" => "oklch(0.85 0.16 95)", "surface" => "oklch(0.8 0.15 95)",
      "ink" => "oklch(0.2 0.02 95)", "accent" => "oklch(0.4 0.14 25)",
      "accentInk" => "oklch(0.85 0.16 95)"
    } ],
    [ "plum", {
      "bg" => "oklch(0.3 0.09 320)", "surface" => "oklch(0.26 0.08 320)",
      "ink" => "oklch(0.97 0.01 320)", "accent" => "oklch(0.83 0.14 350)",
      "accentInk" => "oklch(0.3 0.09 320)"
    } ],
    [ "linen", {
      "bg" => "oklch(0.94 0.02 85)", "surface" => "oklch(0.89 0.03 85)",
      "ink" => "oklch(0.28 0.03 40)", "accent" => "oklch(0.52 0.14 30)",
      "accentInk" => "oklch(0.96 0.02 85)"
    } ]
  ].freeze

  # Biblioteca de imagens: não são fotos, são fundos desenhados (cor de base +
  # camadas de gradiente radial pintadas por cima, na ordem).
  LIBRARY_IMAGES = [
    [ "amanhecer", "oklch(0.88 0.09 70)", [
      { "color" => "oklch(0.82 0.16 45)", "x" => 25, "y" => 20, "size" => 70 },
      { "color" => "oklch(0.92 0.11 95)", "x" => 80, "y" => 75, "size" => 65 }
    ] ],
    [ "orvalho", "oklch(0.9 0.05 175)", [
      { "color" => "oklch(0.84 0.11 190)", "x" => 75, "y" => 25, "size" => 70 },
      { "color" => "oklch(0.95 0.05 140)", "x" => 20, "y" => 80, "size" => 60 }
    ] ],
    [ "mare", "oklch(0.4 0.11 245)", [
      { "color" => "oklch(0.55 0.15 230)", "x" => 30, "y" => 70, "size" => 80 },
      { "color" => "oklch(0.3 0.1 265)", "x" => 80, "y" => 20, "size" => 65 }
    ] ],
    [ "cerrado", "oklch(0.55 0.11 130)", [
      { "color" => "oklch(0.72 0.14 115)", "x" => 70, "y" => 30, "size" => 75 },
      { "color" => "oklch(0.42 0.09 150)", "x" => 20, "y" => 80, "size" => 70 }
    ] ],
    [ "brasa", "oklch(0.45 0.16 30)", [
      { "color" => "oklch(0.65 0.2 45)", "x" => 30, "y" => 30, "size" => 70 },
      { "color" => "oklch(0.3 0.12 20)", "x" => 75, "y" => 80, "size" => 70 }
    ] ],
    [ "algodao", "oklch(0.95 0.01 285)", [
      { "color" => "oklch(0.9 0.04 300)", "x" => 25, "y" => 25, "size" => 70 },
      { "color" => "oklch(0.92 0.03 240)", "x" => 80, "y" => 70, "size" => 70 }
    ] ],
    [ "ametista", "oklch(0.38 0.13 305)", [
      { "color" => "oklch(0.55 0.18 300)", "x" => 70, "y" => 25, "size" => 75 },
      { "color" => "oklch(0.28 0.1 320)", "x" => 25, "y" => 80, "size" => 65 }
    ] ],
    [ "grafite", "oklch(0.26 0.01 285)", [
      { "color" => "oklch(0.36 0.02 260)", "x" => 30, "y" => 25, "size" => 75 },
      { "color" => "oklch(0.2 0.01 285)", "x" => 80, "y" => 80, "size" => 70 }
    ] ],
    [ "goiaba", "oklch(0.72 0.15 15)", [
      { "color" => "oklch(0.85 0.13 40)", "x" => 75, "y" => 25, "size" => 70 },
      { "color" => "oklch(0.58 0.16 5)", "x" => 25, "y" => 78, "size" => 68 }
    ] ],
    [ "menta", "oklch(0.86 0.08 155)", [
      { "color" => "oklch(0.93 0.07 130)", "x" => 30, "y" => 25, "size" => 70 },
      { "color" => "oklch(0.75 0.11 175)", "x" => 78, "y" => 78, "size" => 68 }
    ] ],
    [ "areia", "oklch(0.9 0.04 80)", [
      { "color" => "oklch(0.84 0.07 60)", "x" => 70, "y" => 30, "size" => 72 },
      { "color" => "oklch(0.95 0.02 90)", "x" => 25, "y" => 75, "size" => 65 }
    ] ],
    [ "meianoite", "oklch(0.22 0.05 275)", [
      { "color" => "oklch(0.34 0.12 285)", "x" => 30, "y" => 70, "size" => 78 },
      { "color" => "oklch(0.45 0.14 255)", "x" => 78, "y" => 22, "size" => 60 }
    ] ]
  ].freeze

  # Cores de pasta — suaves de propósito (a interface é quieta). A chave é
  # também a chave de tradução em `folders.colors.<key>`.
  FOLDER_COLORS = [
    [ "cinza", "oklch(0.65 0.01 285)" ],
    [ "violeta", "oklch(0.62 0.12 292)" ],
    [ "azul", "oklch(0.62 0.1 245)" ],
    [ "verde", "oklch(0.62 0.1 155)" ],
    [ "amarelo", "oklch(0.75 0.12 90)" ],
    [ "vermelho", "oklch(0.62 0.12 25)" ]
  ].freeze

  # Acentos do carrossel — o único saturado da obra além da arte.
  ACCENT_CHOICES = [
    "oklch(0.5 0.2 292)", "oklch(0.55 0.19 250)", "oklch(0.6 0.16 195)",
    "oklch(0.62 0.17 150)", "oklch(0.82 0.17 95)", "oklch(0.68 0.19 45)",
    "oklch(0.58 0.2 25)", "oklch(0.6 0.19 350)"
  ].freeze

  # Paleta ampla do "Mais cores" — tons quietos, além dos do tema.
  EXTENDED_PALETTE = [
    "oklch(0.97 0.005 285)", "oklch(0.92 0.02 85)", "oklch(0.9 0.04 25)",
    "oklch(0.88 0.05 145)", "oklch(0.9 0.04 240)", "oklch(0.88 0.05 300)",
    "oklch(0.45 0.03 285)", "oklch(0.35 0.06 260)", "oklch(0.4 0.08 155)",
    "oklch(0.42 0.09 25)", "oklch(0.3 0.04 300)", "oklch(0.22 0.01 285)"
  ].freeze

  def seed_catalog!
    THEME_PRESETS.each_with_index do |(key, theme), index|
      preset = ThemePreset.find_or_initialize_by(key: key)
      preset.update!(theme: theme, position: index)
    end

    LIBRARY_IMAGES.each_with_index do |(key, base, layers), index|
      image = LibraryImage.find_or_initialize_by(key: key)
      image.update!(base: base, layers: layers, position: index)
    end

    seed_palette!("folder", FOLDER_COLORS.map { |key, value| [ key, value ] })
    seed_palette!("accent", ACCENT_CHOICES.map { |value| [ nil, value ] })
    seed_palette!("extended", EXTENDED_PALETTE.map { |value| [ nil, value ] })
  end

  def seed_palette!(group, entries)
    entries.each_with_index do |(key, value), index|
      color = PaletteColor.find_or_initialize_by(group: group, value: value)
      color.update!(key: key, position: index)
    end
  end

  # -------------------------------------------------------------------------
  # Conta de demonstração

  DEMO_EMAIL = "marina.duarte@exemplo.com.br"
  DEMO_PASSWORD = "carrossel123"

  def seed_demo_account!
    organization = Organization.find_or_initialize_by(id: id_for("org-marina"))
    organization.assign_attributes(
      name: "Marina Duarte Conteúdo",
      plan: "free",
      credits_total: 50,
      credits_used: 14,
      created_at: 30.days.ago
    )
    organization.save!

    account = Account.find_or_initialize_by(id: id_for("conta-marina"))
    account.assign_attributes(
      organization: organization,
      name: "Marina Duarte",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      role: "owner",
      created_at: organization.created_at
    )
    account.save!

    organization
  end

  def seed_notifications!(organization)
    [
      [ "not-templates", "templates", 5.hours.ago, false ],
      [ "not-folders", "folders", 2.days.ago, false ],
      [ "not-welcome", "welcome", 6.days.ago, true ]
    ].each do |slug, key, at, read|
      notification = Notification.find_or_initialize_by(id: id_for(slug))
      notification.update!(organization: organization, key: key, notified_at: at, read: read)
    end
  end

  def carousel!(organization, slug, attributes)
    carousel = Carousel.find_or_initialize_by(id: id_for(slug))
    carousel.assign_attributes(attributes.merge(organization: organization, folder: nil))
    carousel.save!
    carousel
  end

  # -------------------------------------------------------------------------
  # Os carrosséis da Marina. Conteúdo em pt-BR de nichos variados, sem lorem
  # ipsum: é a obra do usuário fictício, não interface.

  def seed_carousels!(organization)
    carousel!(organization, "car-nutricao",
      title: "5 trocas simples para comer melhor",
      format: "4:5",
      favorite: true,
      edited_at: 2.hours.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.46 0.13 155)", "surface" => "oklch(0.4 0.12 155)",
        "ink" => "oklch(0.97 0.02 110)", "accent" => "oklch(0.88 0.17 110)",
        "accentInk" => "oklch(0.3 0.09 155)"
      },
      cards: [
        poster_cover("card-nutricao-1",
          kicker: "Nutrição sem neura",
          title: "5 trocas simples para comer melhor",
          footer: "@nutricarolribeiro"),
        card("card-nutricao-2", layout: "image-right", align: "center", image: art_image("blob", 21)) { |b|
          [
            b.title("Refrigerante → água com gás e limão"),
            b.body("Mata a vontade do gelado com bolha e corta o açúcar do dia.")
          ]
        },
        simple_card("card-nutricao-3",
          "Pão branco → pão de fermentação natural",
          "Mais saciedade e digestão mais leve no café da manhã."),
        card("card-nutricao-4") { |b|
          [
            b.title("Biscoito da tarde → castanhas e fruta"),
            b.list("check", [
              "Castanhas: um punhado fechado",
              "Fruta da estação, madura",
              "Água antes — sede engana fome"
            ]),
            b.body("Energia de verdade para não chegar morrendo de fome no jantar.")
          ]
        },
        card("card-nutricao-5", align: "center") { |b|
          [
            b.title("Fritura de todo dia → airfryer"),
            b.quote(
              "A mesma crocância, uma fração da gordura — e sem cheiro de óleo pela casa.",
              "Carol Ribeiro · nutricionista"
            )
          ]
        },
        card("card-nutricao-6", align: "center") { |b|
          [
            b.title("Salva esse post e começa por UMA troca", "center"),
            b.body("Consistência vale mais que perfeição. Me conta qual você escolheu!", "center"),
            b.button("Salvar este post", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-bazar",
      title: "Bazar de inverno — até 60% off",
      format: "4:5",
      favorite: false,
      edited_at: 26.hours.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.42 0.14 20)", "surface" => "oklch(0.37 0.13 20)",
        "ink" => "oklch(0.96 0.02 80)", "accent" => "oklch(0.85 0.15 85)",
        "accentInk" => "oklch(0.35 0.12 20)"
      },
      cards: [
        split_cover("card-bazar-1",
          kicker: "Só até domingo",
          title: "Bazar de inverno até 60% off",
          footer: "Doma Store · Curitiba",
          seed: 5),
        card("card-bazar-2", align: "center") { |b|
          [
            b.caption("Tricô de lã merino", "accent"),
            b.stat("R$ 129", "era R$ 259 — do P ao GG, cinco cores")
          ]
        },
        card("card-bazar-3", layout: "image-left", align: "center", image: art_image("waves", 11)) { |b|
          [
            b.title("Jaqueta corta-vento por R$ 149"),
            b.body("Impermeável, forro em fleece, perfeita pro vento de Curitiba.")
          ]
        },
        card("card-bazar-4") { |b|
          [
            b.title("O mapa do bazar"),
            b.table([
              [ "Peça", "Antes", "Agora" ],
              [ "Tricô merino", "R$ 259", "R$ 129" ],
              [ "Corta-vento", "R$ 279", "R$ 149" ],
              [ "Bota tratorada", "R$ 349", "R$ 199" ]
            ]),
            b.caption("Do 34 ao 40 · do P ao GG", "muted")
          ]
        },
        card("card-bazar-5", align: "center") { |b|
          [
            b.title("Frete grátis acima de R$ 250", "center"),
            b.divider("dots"),
            b.body("Para todo o Brasil, enviado em até 24h.", "center")
          ]
        },
        card("card-bazar-6", align: "center") { |b|
          [
            b.title("Corre que é só até domingo", "center"),
            b.body("Loja no Batel ou pelo site — link na bio.", "center"),
            b.button("Ver as ofertas", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-financiamento",
      title: "Financiamento: o que ninguém te explica",
      format: "4:5",
      favorite: false,
      edited_at: 3.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.32 0.1 260)", "surface" => "oklch(0.28 0.09 260)",
        "ink" => "oklch(0.97 0.005 260)", "accent" => "oklch(0.85 0.15 85)",
        "accentInk" => "oklch(0.28 0.09 260)"
      },
      cards: [
        poster_cover("card-financiamento-1",
          kicker: "Guia do primeiro imóvel",
          title: "Financiamento: o que ninguém te explica",
          footer: "Viva Imóveis"),
        simple_card("card-financiamento-2",
          "Entrada não é só a entrada",
          "ITBI e cartório somam 4 a 5% do valor do imóvel. Coloque na conta."),
        simple_card("card-financiamento-3",
          "SAC ou Price?",
          "SAC começa com parcela maior e cai todo mês. Price é fixa — e mais cara no total."),
        simple_card("card-financiamento-4",
          "Use o FGTS a seu favor",
          "Vale para entrada e para amortizar a cada 2 anos."),
        simple_card("card-financiamento-5",
          "A taxa é negociável",
          "Leve a proposta de um banco para o outro. Funciona."),
        simple_card("card-financiamento-6",
          "Simule antes de visitar",
          "Saber seu teto evita se apaixonar pelo imóvel errado."),
        card("card-financiamento-7", align: "center") { |b|
          [
            b.title("Quer uma simulação sem compromisso?", "center"),
            b.body("Chama a gente no direct ou no WhatsApp da bio.", "center"),
            b.button("Pedir simulação", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-enem",
      title: "Revolução Industrial em 8 cards",
      format: "4:5",
      favorite: false,
      edited_at: 4.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.85 0.16 95)", "surface" => "oklch(0.8 0.15 95)",
        "ink" => "oklch(0.2 0.02 95)", "accent" => "oklch(0.4 0.14 25)",
        "accentInk" => "oklch(0.85 0.16 95)"
      },
      cards: [
        editorial_cover("card-enem-1",
          kicker: "Revisão ENEM · História",
          title: "Revolução Industrial em 8 cards",
          footer: "Prof. Henrique Sales"),
        simple_card("card-enem-2",
          "Onde e quando",
          "Inglaterra, segunda metade do século XVIII. Carvão, ferro e capital acumulado."),
        simple_card("card-enem-3",
          "Por que a Inglaterra?",
          "Cercamentos, mão de obra livre, colônias e uma burguesia forte."),
        simple_card("card-enem-4",
          "1ª fase: vapor e têxtil",
          "Máquina a vapor de Watt, tear mecânico e as primeiras fábricas."),
        simple_card("card-enem-5",
          "2ª fase: aço, eletricidade e petróleo",
          "Século XIX: ferrovias, telégrafo e produção em massa."),
        simple_card("card-enem-6",
          "Condições de trabalho",
          "Jornadas de 14h, trabalho infantil — daí nascem ludismo e cartismo."),
        simple_card("card-enem-7",
          "O que o ENEM cobra",
          "Relação técnica–sociedade e crítica às condições operárias, não decoreba de datas."),
        card("card-enem-8", align: "center") { |b|
          [
            b.title("Quer o mapa mental completo?", "center"),
            b.body("Comenta REVISA que eu mando no direct.", "center"),
            b.button("Comentar REVISA", "outline", "center")
          ]
        }
      ])

    carousel!(organization, "car-treino",
      title: "Treino de 20 minutos sem desculpa",
      format: "4:5",
      favorite: false,
      edited_at: 6.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.2 0.01 285)", "surface" => "oklch(0.26 0.015 285)",
        "ink" => "oklch(0.98 0 0)", "accent" => "oklch(0.88 0.2 125)",
        "accentInk" => "oklch(0.2 0.01 285)"
      },
      cards: [
        poster_cover("card-treino-1",
          kicker: "Sem equipamento",
          title: "20 minutos e acabou a desculpa",
          footer: "@felipetreina",
          image: art_image("beams", 7)),
        card("card-treino-2") { |b|
          [
            b.title("Aquecimento — 3 min"),
            b.list("number", [
              "Polichinelo — 40s",
              "Agachamento livre — 40s",
              "Mobilidade de quadril — 40s"
            ]),
            b.caption("Repete o circuito 2×", "accent")
          ]
        },
        card("card-treino-3") { |b|
          [
            b.title("Bloco 1 — pernas e glúteo"),
            b.list("number", [
              "Agachamento — 45s",
              "Afundo alternado — 45s",
              "Descanso — 30s"
            ]),
            b.caption("3 rodadas", "accent")
          ]
        },
        card("card-treino-4") { |b|
          [
            b.title("Bloco 2 — peito e core"),
            b.list("number", [
              "Flexão (vale joelho) — 45s",
              "Prancha — 45s",
              "Descanso — 30s"
            ]),
            b.caption("3 rodadas", "accent")
          ]
        },
        card("card-treino-5", align: "center") { |b|
          [
            b.caption("Finalizador", "accent"),
            b.stat("2 min", "burpee no seu ritmo — anota quantos fez"),
            b.body("Semana que vem a meta é bater o seu número.")
          ]
        },
        card("card-treino-6", align: "center") { |b|
          [
            b.title("Faz 3× por semana", "center"),
            b.body("Salva o post e me marca no story treinando!", "center"),
            b.button("Salvar o treino", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-v60",
      title: "V60 em casa: o passo a passo",
      format: "1:1",
      favorite: false,
      edited_at: 8.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.93 0.03 85)", "surface" => "oklch(0.89 0.04 85)",
        "ink" => "oklch(0.3 0.05 55)", "accent" => "oklch(0.55 0.12 45)",
        "accentInk" => "oklch(0.96 0.02 85)"
      },
      cards: [
        editorial_cover("card-v60-1",
          kicker: "Métodos · nº 3",
          title: "V60 em casa: o passo a passo",
          footer: "Café do Alto"),
        card("card-v60-2", align: "center") { |b|
          [
            b.caption("A receita base", "accent"),
            b.stat("15 g", "de café para 250 ml de água a 92–94 °C"),
            b.body("Moagem média, como açúcar cristal.")
          ]
        },
        simple_card("card-v60-3",
          "Escalde o filtro",
          "Tira o gosto de papel e aquece o porta-filtro. Descarte a água."),
        simple_card("card-v60-4",
          "Pré-infusão — 30s",
          "Despeje 50ml em círculos e espere o café 'florescer'."),
        simple_card("card-v60-5",
          "Despeje em 3 etapas",
          "Círculos lentos de dentro pra fora. Total: 2min30 a 3min."),
        card("card-v60-6", layout: "image-top", image: art_image("dots", 33)) { |b|
          [
            b.title("Prove antes de adoçar"),
            b.body("Nosso grão da semana tem notas de rapadura e laranja. Vem provar.")
          ]
        }
      ])

    carousel!(organization, "car-ansiedade",
      title: "Ansiedade: 6 sinais que o corpo dá",
      format: "4:5",
      favorite: true,
      edited_at: 9.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.72 0.09 300)", "surface" => "oklch(0.68 0.09 300)",
        "ink" => "oklch(0.22 0.05 300)", "accent" => "oklch(0.97 0.01 300)",
        "accentInk" => "oklch(0.22 0.05 300)"
      },
      cards: [
        badge_cover("card-ansiedade-1",
          kicker: "Saúde mental",
          title: "Ansiedade: 6 sinais que o corpo dá",
          footer: "Dra. Luiza Prado · CRP 06/98432"),
        simple_card("card-ansiedade-2",
          "1. Aperto no peito",
          "Sensação de sufoco sem causa física aparente."),
        simple_card("card-ansiedade-3",
          "2. Estômago embrulhado",
          "O intestino é muito sensível ao estresse — não é frescura."),
        simple_card("card-ansiedade-4",
          "3. Mandíbula travada",
          "Bruxismo e dor de cabeça tensional ao acordar."),
        simple_card("card-ansiedade-5",
          "4. Sono que não descansa",
          "Dormir 8 horas e acordar exausta é um sinal, não preguiça."),
        simple_card("card-ansiedade-6",
          "5. Irritação com tudo",
          "Pavio curto pode ser o corpo pedindo pausa."),
        simple_card("card-ansiedade-7",
          "6. Coração acelerado à toa",
          "Taquicardia em repouso merece atenção — médica e psicológica."),
        card("card-ansiedade-8", align: "center") { |b|
          [
            b.title("Sentiu que era sobre você?", "center"),
            b.body("Terapia é cuidado, não luxo. Atendo online — agenda na bio.", "center"),
            b.button("Agendar uma conversa", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-tosa",
      title: "Banho e tosa: mitos e verdades",
      format: "4:5",
      favorite: false,
      edited_at: 12.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.68 0.16 55)", "surface" => "oklch(0.63 0.15 55)",
        "ink" => "oklch(0.99 0.01 85)", "accent" => "oklch(0.25 0.05 55)",
        "accentInk" => "oklch(0.99 0.01 85)"
      },
      cards: [
        badge_cover("card-tosa-1",
          kicker: "Papo de tutor",
          title: "Banho e tosa: mitos e verdades",
          footer: "AuQmia Pet · Vila Mariana"),
        simple_card("card-tosa-2",
          '"Tosar no verão refresca" — MITO',
          "O pelo protege do calor e do sol. Tosa máquina zero pode causar queimadura."),
        simple_card("card-tosa-3",
          '"Banho toda semana faz mal" — DEPENDE',
          "Com produto certo e secagem completa, semanal é tranquilo."),
        simple_card("card-tosa-4",
          '"Tosa higiênica é frescura" — MITO',
          "Evita infecção e desconforto. É saúde, não estética."),
        simple_card("card-tosa-5",
          '"Perfume de pet é seguro" — VERDADE',
          "Desde que específico veterinário. Nunca use o seu."),
        card("card-tosa-6", align: "center") { |b|
          [
            b.title("Agende pelo WhatsApp", "center"),
            b.body("Leva e traz grátis na Vila Mariana e região.", "center"),
            b.button("Chamar no WhatsApp", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-justa-causa",
      title: "Demitido sem justa causa? Seus direitos",
      format: "4:5",
      favorite: true,
      edited_at: 15.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.27 0.01 285)", "surface" => "oklch(0.32 0.012 285)",
        "ink" => "oklch(0.96 0.01 85)", "accent" => "oklch(0.8 0.12 85)",
        "accentInk" => "oklch(0.27 0.01 285)"
      },
      cards: [
        editorial_cover("card-justa-causa-1",
          kicker: "Direito do trabalho",
          title: "Demitido sem justa causa? Seus direitos",
          footer: "Renata Campos Advocacia"),
        simple_card("card-justa-causa-2",
          "Saldo de salário e aviso prévio",
          "Dias trabalhados no mês + 30 dias de aviso (mais 3 por ano de casa)."),
        simple_card("card-justa-causa-3",
          "Multa de 40% do FGTS",
          "Sobre TODO o saldo depositado, não só o do último emprego."),
        simple_card("card-justa-causa-4",
          "Férias e 13º proporcionais",
          "Inclusive férias vencidas com 1/3, se houver."),
        simple_card("card-justa-causa-5",
          "Seguro-desemprego",
          "De 3 a 5 parcelas, conforme o tempo trabalhado."),
        simple_card("card-justa-causa-6",
          "Prazo para pagar: 10 dias",
          "Passou disso, a empresa deve multa de um salário seu."),
        card("card-justa-causa-7", align: "center") { |b|
          [
            b.title("Recebeu errado?", "center"),
            b.body("Você tem até 2 anos para reclamar.", "center"),
            b.button("Avaliação gratuita do caso", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-bolos",
      title: "Quanto cobrar por um bolo caseiro",
      format: "4:5",
      favorite: false,
      edited_at: 18.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.87 0.06 10)", "surface" => "oklch(0.83 0.06 10)",
        "ink" => "oklch(0.32 0.08 30)", "accent" => "oklch(0.5 0.18 15)",
        "accentInk" => "oklch(0.95 0.03 10)"
      },
      cards: [
        split_cover("card-bolos-1",
          kicker: "Confeitaria lucrativa",
          title: "Quanto cobrar pelo seu bolo",
          footer: "Doce da Bia · encomendas",
          seed: 13),
        simple_card("card-bolos-2",
          "Custo dos ingredientes",
          "Pese TUDO, até a pitada de sal. Planilha simples resolve."),
        simple_card("card-bolos-3",
          "Seu tempo vale dinheiro",
          "Defina sua hora (ex.: R$ 25) e multiplique pelas horas de produção."),
        simple_card("card-bolos-4",
          "Gás, luz e embalagem",
          "Some 10 a 15% do custo como despesa indireta."),
        card("card-bolos-5", align: "center") { |b|
          [
            b.caption("A fórmula", "accent"),
            b.stat("× 2", "ingredientes + tempo + despesas = seu preço mínimo")
          ]
        },
        card("card-bolos-6", align: "center") { |b|
          [
            b.title('"Mas o mercado cobra menos"', "center"),
            b.quote("Bolo caseiro de verdade não compete com bolo de esquina. Posicione-se.")
          ]
        },
        card("card-bolos-7", align: "center") { |b|
          [
            b.title("Baixe a planilha pronta", "center"),
            b.body("Manda PREÇO no direct que eu envio de graça.", "center"),
            b.button("Quero a planilha", "solid", "center")
          ]
        }
      ])

    carousel!(organization, "car-ganchos",
      title: "7 ganchos que seguram o dedo",
      format: "1:1",
      favorite: false,
      edited_at: 22.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.88 0.2 125)", "surface" => "oklch(0.84 0.19 125)",
        "ink" => "oklch(0.2 0.02 145)", "accent" => "oklch(0.2 0.02 145)",
        "accentInk" => "oklch(0.88 0.2 125)"
      },
      cards: [
        poster_cover("card-ganchos-1",
          kicker: "Copy pra feed",
          title: "7 ganchos que seguram o dedo",
          footer: "@almeidadoconteudo"),
        card("card-ganchos-2", align: "center") { |b|
          [ b.title("1. O erro"), b.quote("O erro que 9 em cada 10 lojas cometem no Instagram.") ]
        },
        card("card-ganchos-3", align: "center") { |b|
          [ b.title("2. O contraste"), b.quote("Postei todo dia por 30 dias. Vendi menos que no mês anterior.") ]
        },
        card("card-ganchos-4", align: "center") { |b|
          [ b.title("3. A pergunta proibida"), b.quote("Por que ninguém te contou isso sobre tráfego pago?") ]
        },
        card("card-ganchos-5", align: "center") { |b|
          [ b.title("4. O número específico"), b.quote("R$ 4.372 em vendas com um carrossel. A estrutura:") ]
        },
        card("card-ganchos-6", align: "center") { |b|
          [ b.title("5. A confissão"), b.quote("Eu cobrava barato porque tinha medo. Isso mudou quando...") ]
        },
        card("card-ganchos-7", align: "center") { |b|
          [ b.title("6. O antes e depois"), b.body("Mostre o resultado no card 1 e o caminho nos seguintes.") ]
        },
        card("card-ganchos-8", align: "center") { |b|
          [ b.title("7. A lista incompleta"), b.quote("5 ferramentas gratuitas — a 4ª quase ninguém conhece.") ]
        }
      ])

    carousel!(organization, "car-homeoffice",
      title: "Home office sem dor nas costas",
      format: "4:5",
      favorite: false,
      edited_at: 30.days.ago,
      trashed_at: nil,
      theme: {
        "bg" => "oklch(0.48 0.09 200)", "surface" => "oklch(0.43 0.08 200)",
        "ink" => "oklch(0.97 0.01 200)", "accent" => "oklch(0.9 0.06 90)",
        "accentInk" => "oklch(0.35 0.07 200)"
      },
      cards: [
        badge_cover("card-homeoffice-1",
          kicker: "Fisio no dia a dia",
          title: "Home office sem dor nas costas",
          footer: "Movimente Fisioterapia"),
        simple_card("card-homeoffice-2",
          "Tela na altura dos olhos",
          "Suporte ou pilha de livros: o topo do monitor na linha do olhar."),
        simple_card("card-homeoffice-3",
          "Pés apoiados, sempre",
          "Se não alcançam o chão, use um apoio. Joelho a 90 graus."),
        simple_card("card-homeoffice-4",
          "O lombar precisa de apoio",
          "Almofada na curvatura da lombar já muda o seu dia."),
        simple_card("card-homeoffice-5",
          "Levante a cada 50 minutos",
          "Timer no celular. Dois minutos andando valem mais que alongar 20."),
        card("card-homeoffice-6", align: "center") { |b|
          [
            b.title("Dor que passa de 2 semanas", "center"),
            b.body("Não é normal. Avaliação presencial ou por vídeo — link na bio.", "center"),
            b.button("Agendar avaliação", "outline", "center")
          ]
        }
      ])

    # --- na lixeira ---------------------------------------------------------

    carousel!(organization, "car-teste-lixeira",
      title: "Teste — promoção dia das mães",
      format: "4:5",
      favorite: false,
      edited_at: 40.days.ago,
      trashed_at: 9.days.ago,
      theme: {
        "bg" => "oklch(0.6 0.15 350)", "surface" => "oklch(0.55 0.14 350)",
        "ink" => "oklch(0.98 0.01 350)", "accent" => "oklch(0.9 0.1 90)",
        "accentInk" => "oklch(0.45 0.13 350)"
      },
      cards: [
        split_cover("card-teste-lixeira-1",
          kicker: "Rascunho",
          title: "Dia das Mães com 30% off",
          footer: "Doma Store",
          seed: 17),
        simple_card("card-teste-lixeira-2",
          "Presentes até R$ 99",
          "Lenços, nécessaires e canecas personalizadas.")
      ])

    carousel!(organization, "car-velho-lixeira",
      title: "Ideias soltas (apagar depois)",
      format: "1:1",
      favorite: false,
      edited_at: 60.days.ago,
      trashed_at: 25.days.ago,
      theme: {
        "bg" => "oklch(0.9 0.02 90)", "surface" => "oklch(0.86 0.025 90)",
        "ink" => "oklch(0.35 0.02 90)", "accent" => "oklch(0.6 0.1 55)",
        "accentInk" => "oklch(0.97 0.01 90)"
      },
      cards: [
        editorial_cover("card-velho-lixeira-1",
          kicker: "Notas",
          title: "Ideias soltas de conteúdo",
          footer: "rascunho")
      ])
  end

  def call
    seed_catalog!
    organization = seed_demo_account!
    seed_notifications!(organization)
    seed_carousels!(organization)
    # Nenhuma pasta de propósito: a conta de demonstração começa sem pastas,
    # é assim que a tela mostra o convite a criar a primeira (e o aviso
    # "organize com pastas" faz sentido).
    organization
  end
end

organization = VekooSeeds.call

puts <<~REPORT
  Semente aplicada.

    Acervo      #{ThemePreset.count} temas · #{LibraryImage.count} imagens · #{PaletteColor.count} cores
    Organização #{organization.name} (#{organization.plan}) · #{organization.credits_used}/#{organization.credits_total} créditos
    Contas      #{organization.accounts.count} (#{VekooSeeds::DEMO_EMAIL} / #{VekooSeeds::DEMO_PASSWORD})
    Carrosséis  #{organization.carousels.active.count} ativos · #{organization.carousels.trashed.count} na lixeira
    Cards       #{organization.carousels.sum { |c| c.cards.length }}
    Pastas      #{organization.folders.count}
    Avisos      #{organization.notifications.count} (#{organization.notifications.unread.count} não lidos)
REPORT

# Motores — como criar um

Um motor transforma o Brandcore **publicado** em imagens. Cada um é um
diretório aqui dentro com dois arquivos, e nada mais no sistema muda quando
um motor novo entra: o registry (`app/models/engines/registry.rb`) varre
`engines/*/` no primeiro uso, valida cada manifesto e monta o catálogo que
`GET /engines` devolve e que a tela usa para desenhar o formulário.

```
engines/
└── meu_motor/
    ├── manifest.yml   # a ficha técnica (declarativa)
    └── render.rb      # a composição (código)
```

## 1. `manifest.yml`

```yaml
id: meu_motor                     # = nome do diretório, snake_case
name: { pt-BR: "Meu motor", en: "My engine" }
description: { pt-BR: "…", en: "…" }
formats: [post, story]            # post = 1080×1350, story = 1080×1920
series: false                     # true quando a peça pode ter vários quadros
fields:
  - id: title
    type: text                    # text | textList | number | choice | image
    required: true
    label: { pt-BR: "Título", en: "Title" }
    hint: { pt-BR: "Até duas linhas.", en: "Up to two lines." }
    constraints: { maxLines: 2, maxCharsPerLine: 24 }
  - id: price
    type: text
    required: true
    label: { pt-BR: "Preço", en: "Price" }
    hint: { pt-BR: "Ex.: R$ 18", en: "E.g. $18" }
    constraints: { maxLines: 1, maxChars: 24 }
  - id: background
    type: choice
    source: palette.backgrounds   # opções derivadas do Brandcore do cliente
    label: { pt-BR: "Fundo", en: "Background" }
  - id: mode
    type: choice
    options:                      # ou opções fixas
      - { id: big, label: { pt-BR: "Grande", en: "Big" } }
    default: big
  - id: photo
    type: image                   # um ativo da marca (Marca → Ativos)
    kinds: [photo]
```

Restrições por tipo: `text` aceita `maxLines`, `maxCharsPerLine`, `maxChars`;
`textList` aceita `maxItems` e `maxChars` (por item); `number` aceita `min` e
`max`. `choice` precisa de `options` **ou** `source` (`palette.backgrounds`,
`palette.accents`, `palette.colors`); `image` aceita `kinds` (`photo`, `logo`,
`glyph`).

Textos visíveis aceitam string ou `{ pt-BR:, en: }` — a API devolve no
idioma da requisição. Um manifesto inválido derruba o boot com a razão.

## 2. `render.rb`

Define `Engines::<IdCamelizado>` herdando de `Engines::Base` e implementa
`render(canvas, values)`. É uma função pura de composição: só lê `tokens`
(o Brandcore publicado, por papéis), `values` (já validados e normalizados)
e `format`.

```ruby
module Engines
  class MeuMotor < Base
    def render(canvas, values)
      s = surface(values)                 # fundo escolhido + tinta, acento, apoio
      paint_background(canvas, s)

      y = safe_top
      _, h = canvas.text(values["title"], x: margin, y: y, width: content_width(canvas),
        style: "title", color: s.ink, max_lines: 2)
      y += h + 32
      canvas.text(values["price"], x: margin, y: y, width: content_width(canvas),
        style: "number", color: s.accent, max_lines: 1)

      draw_footer(canvas, s)              # @ da marca e logo da versão certa
    end
  end
end
```

Regras:

- **Só papéis.** Cores vêm de `surface`/`tokens.color("accent")`; fontes e
  tamanhos vêm dos estilos da hierarquia (`style: "title"`, `"kicker"`,
  `"lede"`, `"body"`, `"number"`, `"item"`, `"footer"`). Nenhum hex ou
  família de fonte no código do motor.
- **Série.** Sobrescreva `frames` para devolver um conjunto de valores por
  quadro (ver `contagem/render.rb`). Cada quadro vira uma imagem numerada.
- **Formato.** `story?`, `safe_top` e `safe_bottom` cuidam da área que a
  interface do Instagram cobre.

O `Canvas` (`app/models/engines/canvas.rb`) desenha por camadas no libvips:
`fill`, `rect` (com raio e opacidade), `circle`, `text` (com encolhimento
automático até caber em `max_lines`), `measure`, `image` (`:contain`/`:cover`).

## 3. Testar

`spec/engines/engines_spec.rb` roda para **todo** motor do catálogo: gera nas
dimensões que o manifesto declara e persiste a proveniência (de que versão da
marca a peça saiu). Um motor novo entra nesses exemplos sozinho; para valores
de exemplo específicos, acrescente-os em `spec/support/engine_examples.rb`.

Para ver a peça: `POST /engines/<id>/preview` devolve o PNG do primeiro
quadro com os valores em edição — é a prévia do formulário.

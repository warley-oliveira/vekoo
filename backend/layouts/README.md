# Layouts — o método do estúdio em forma de contrato

Um layout é um template de slide: quais **slots** existem, o que cada um
aceita e em que formatos ele funciona. O arquivo aqui é o **contrato**; o
desenho mora nos renderizadores (React no front, libvips no servidor), que
recebem o mesmo documento e respeitam o mesmo contrato.

```yaml
id: hero-image-title-bottom          # = nome do arquivo, kebab-case
name: { pt-BR: "…", en: "…" }
description: { pt-BR: "quando usar", en: "…" }
formats: [feed_square, feed_portrait, story, carousel]
position: first | last               # só carrossel: capa e CTA têm lugar fixo
background_options: [color]          # image | color (o que o fundo aceita)
background_default: { type: color, color_token: primary }
align_options: [left, center]        # ausente = só o alinhamento do layout
slots:
  title: { type: text, role_default: display, max_chars: 60, max_lines: 3, required: true }
  image: { type: image, required: true }
  logo:  { type: logo, default_visible: true }
```

Slots usam nomes canônicos (`title`, `body`, `badge`, `price`, `image`,
`logo`) para a troca de layout casar os blocos: o título de um layout é o
título do outro. Tipos: `text`, `image`, `logo`. Papéis de texto
(`role_default`): `display`, `headline`, `body`, `label`, `caption`.

A foto de um layout de imagem cheia mora no slot `image` (que nesse layout
ocupa a peça toda); o fundo é a cor de reserva por trás dela. Uma fonte só
para a foto: trocar a imagem é trocar o slot.

Layout novo = arquivo novo aqui + o componente nos dois renderizadores.

## Geometria — o desenho como dado

`geometry` diz **onde** cada coisa fica, por formato (`default` vale para
os formatos sem bloco próprio). Os dois renderizadores — React (preview e
export pelo Chromium) e libvips — são **intérpretes** desta lista, não
reimplementações do layout: mudar um layout é mudar este arquivo.

Coordenadas em px do canvas (1080 de largura) ou `"NN%"` do eixo.

```yaml
geometry:
  default:
    - { kind: fill, box: full }                       # a cor de fundo do slide
    - { kind: image, slot: image, box: full }         # foto em cover, no ponto focal
    - { kind: scrim, box: { bottom: 0, height: "68%" }, from: bottom, opacity: 0.62 }
    - { kind: logo, slot: logo, box: { left: 80, top: 80 }, height: 64 }
    - kind: stack                                     # pilha de textos
      box: { left: 80, right: 80, bottom: 96 }        # sem top: cresce para cima
      anchor: bottom                                  # top | bottom | center
      inset: [ 72, 0, 0, 0 ]                          # respiro dentro da caixa
      gap: 24
      ink: image                                      # image | background | auto
      items: [ { slot: title, size: 84 }, { slot: body, size: 38, gap: 28 } ]
```

- `box`: `full`, ou bordas `left/right/top/bottom` com `width/height`.
- `image` com `optional: true` não desenha espaço reservado; `when: image`
  só desenha a camada se a foto existir.
- `scrim`: alfa = t^`curve` × `opacity`, da borda `from` para dentro da
  caixa; `curve` (padrão 1.4) menor escurece mais cedo — é o que segura o
  texto branco em foto movimentada.
- `stack.ink` decide a tinta do texto: sobre foto (clara, com escurecimento)
  ou sobre o fundo (a tinta que o token pede); `auto` é foto se houver.
- `size` é o tamanho do papel **neste layout**, em px; o `sizeStep` do
  bloco anda em degraus de ×1,15. Fonte, peso e caixa vêm do Brandcore.
- Texto que passa de `max_lines` é cortado na última linha com esmaecimento.
- Adornos: `quote_mark` (aspas na cor de acento), `swipe_hint` (o texto
  de `text`, em papel `label`) e `slide_number` ("02/05").

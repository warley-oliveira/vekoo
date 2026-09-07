import type { CarouselCard, CarouselFormat, CarouselTheme } from "@/lib/doc"

// A vitrine das telas de entrada.
//
// Não é dado fictício de domínio: é peça de marketing. Quem está em /login não
// tem sessão, então não há carrossel de verdade para mostrar — e mesmo que
// houvesse, a vitrine precisa pintar no primeiro frame, sem esperar rede.
//
// Só o card 1 de cada, que é tudo o que `CardArt` desenha. O conteúdo é
// pt-BR de propósito: é obra do usuário fictício, não interface.

export type ShowcaseCarousel = {
  id: string
  title: string
  format: CarouselFormat
  theme: CarouselTheme
  cards: CarouselCard[]
}

export const SHOWCASE_CAROUSELS: ShowcaseCarousel[] = [
  {
    "id": "car-nutricao",
    "title": "5 trocas simples para comer melhor",
    "format": "4:5",
    "theme": {
      "bg": "oklch(0.46 0.13 155)",
      "surface": "oklch(0.4 0.12 155)",
      "ink": "oklch(0.97 0.02 110)",
      "accent": "oklch(0.88 0.17 110)",
      "accentInk": "oklch(0.3 0.09 155)"
    },
    "cards": [
      {
        "id": "card-nutricao-1",
        "layout": "no-image",
        "bg": null,
        "align": "bottom",
        "image": null,
        "blocks": [
          {
            "id": "card-nutricao-1-b1",
            "type": "divider",
            "style": "accent"
          },
          {
            "id": "card-nutricao-1-b2",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "Nutrição sem neura"
              }
            ],
            "align": "start",
            "color": "ink"
          },
          {
            "id": "card-nutricao-1-b3",
            "type": "text",
            "role": "title",
            "spans": [
              {
                "text": "5 trocas simples para comer melhor"
              }
            ],
            "align": "start",
            "color": "ink"
          },
          {
            "id": "card-nutricao-1-b4",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "@nutricarolribeiro"
              }
            ],
            "align": "start",
            "color": "muted"
          }
        ]
      }
    ]
  },
  {
    "id": "car-bazar",
    "title": "Bazar de inverno — até 60% off",
    "format": "4:5",
    "theme": {
      "bg": "oklch(0.42 0.14 20)",
      "surface": "oklch(0.37 0.13 20)",
      "ink": "oklch(0.96 0.02 80)",
      "accent": "oklch(0.85 0.15 85)",
      "accentInk": "oklch(0.35 0.12 20)"
    },
    "cards": [
      {
        "id": "card-bazar-1",
        "layout": "image-top",
        "bg": null,
        "align": "top",
        "image": {
          "source": {
            "kind": "art",
            "style": "beams",
            "seed": 5,
            "tint": "accent"
          },
          "focus": {
            "x": 0.5,
            "y": 0.5
          },
          "zoom": 1
        },
        "blocks": [
          {
            "id": "card-bazar-1-b1",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "Só até domingo"
              }
            ],
            "align": "start",
            "color": "accent"
          },
          {
            "id": "card-bazar-1-b2",
            "type": "text",
            "role": "title",
            "spans": [
              {
                "text": "Bazar de inverno até 60% off"
              }
            ],
            "align": "start",
            "color": "ink"
          },
          {
            "id": "card-bazar-1-b3",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "Doma Store · Curitiba"
              }
            ],
            "align": "start",
            "color": "muted"
          }
        ]
      }
    ]
  },
  {
    "id": "car-financiamento",
    "title": "Financiamento: o que ninguém te explica",
    "format": "4:5",
    "theme": {
      "bg": "oklch(0.32 0.1 260)",
      "surface": "oklch(0.28 0.09 260)",
      "ink": "oklch(0.97 0.005 260)",
      "accent": "oklch(0.85 0.15 85)",
      "accentInk": "oklch(0.28 0.09 260)"
    },
    "cards": [
      {
        "id": "card-financiamento-1",
        "layout": "no-image",
        "bg": null,
        "align": "bottom",
        "image": null,
        "blocks": [
          {
            "id": "card-financiamento-1-b1",
            "type": "divider",
            "style": "accent"
          },
          {
            "id": "card-financiamento-1-b2",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "Guia do primeiro imóvel"
              }
            ],
            "align": "start",
            "color": "ink"
          },
          {
            "id": "card-financiamento-1-b3",
            "type": "text",
            "role": "title",
            "spans": [
              {
                "text": "Financiamento: o que ninguém te explica"
              }
            ],
            "align": "start",
            "color": "ink"
          },
          {
            "id": "card-financiamento-1-b4",
            "type": "text",
            "role": "caption",
            "spans": [
              {
                "text": "Viva Imóveis"
              }
            ],
            "align": "start",
            "color": "muted"
          }
        ]
      }
    ]
  }
]

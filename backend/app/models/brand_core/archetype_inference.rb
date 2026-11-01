# O estilo deduzido do que a marca publicou — para a marca que ainda não tem
# `identity.archetypes` (publicada antes do campo). É o par do
# `NicheInference`: lido na hora, nunca gravado no rascunho por conta própria;
# a tela pede para a pessoa confirmar (`BrandCore#archetype_suggestion`).
#
# Estilo errado dá +2 ao card errado na busca de referências; vazio só perde o
# bônus. Por isso a regra é conservadora:
#
#   1. Palavra-chave no que a marca diz de si — ramo, conceito, posicionamento
#      e essência da voz. Cada um desses textos com palavra de um estilo soma 2.
#   2. O tom da voz reforça (1 ponto) mas não decide sozinho; "caloroso" e
#      "direto" servem a estilos demais e não contam.
#   3. O principal precisa de 2 pontos e não pode empatar; o secundário, de 2
#      pontos também. Empate no topo: nenhum.
#
# Acento e caixa não importam.
module BrandCore::ArchetypeInference
  KEYWORDS = {
    "natural_artisanal" => [
      /\bartesana(l|is)\b/, /\bfermentacao natural\b/, /\borganic(o|a|os|as)\b/, /\bcasei(ro|ra|ros|ras)\b/,
      /\bfeit(o|a|os|as) a mao\b/, /\bnatura(l|is)\b/, /\bsustentave(l|is)\b/
    ],
    "traditional_heritage" => [
      /\btradica(o|oes)\b/, /\btradiciona(l|is)\b/, /\bdesde (19|20)\d\d\b/, /\b\d+ anos de (historia|tradicao|casa|mercado)\b/,
      /\bde familia\b/, /\bclassic(o|a|os|as)\b/, /\bheranca\b/, /\breceitas? da (avo|vo)\b/
    ],
    "premium_minimal" => [
      /\bpremium\b/, /\balto padrao\b/, /\bluxo\b/, /\bluxuos\w*/, /\bsofisticad\w*/, /\bexclusiv\w*/,
      /\bminimalis\w*/, /\belegan\w*/, /\bboutique\b/, /\balta gastronomia\b/
    ],
    "technical_authority" => [
      /\bespecialist\w*/, /\bespecializad\w*/, /\btecnic(o|a|os|as)\b/, /\bcientific\w*/, /\bevidencias?\b/,
      /\bprecisao\b/, /\bdiagnostic\w*/, /\bcertificad\w*/
    ],
    "caring_welcoming" => [
      /\bacolh\w*/, /\bcuidado\b/, /\bcarinho\w*/, /\bhumaniza\w*/, /\bafet(o|ivo|iva)\b/, /\bempati\w*/
    ],
    "popular_warm" => [
      /\bpreco justo\b/, /\bbarat(o|a|os|as)\b/, /\bpopular(es)?\b/, /\bacessive(l|is)\b/, /\bpara todos\b/,
      /\bpreco baixo\b/, /\beconomi(a|zar)\b/
    ],
    "young_irreverent" => [
      /\bdivertid\w*/, /\birreverent\w*/, /\bdescolad\w*/, /\bjove(m|ns)\b/, /\bhumor\b/, /\bzoeira\b/, /\bbem humorad\w*/
    ],
    "bold_energetic" => [
      /\benergia\b/, /\benergetic\w*/, /\bintens(o|a|os|as|idade)\b/, /\bousad\w*/, /\balta performance\b/,
      /\bpotencia\b/, /\bimpacto\b/, /\bexplosiv\w*/
    ]
  }.freeze

  # O tom da voz (`voice.tones`) → o estilo que ele reforça.
  TONES = {
    "playful" => "young_irreverent",
    "technical" => "technical_authority",
    "educational" => "technical_authority",
    "bold" => "bold_energetic",
    "sober" => "premium_minimal"
  }.freeze

  KEYWORD_POINTS = 2
  TONE_POINTS = 1
  MIN_POINTS = 2

  module_function

  # `{ "primary" => código | nil, "secondary" => código | nil }`.
  def call(document)
    complete = BrandCore::Schema.complete(document)
    identity = complete["identity"]
    voice = complete["voice"]
    infer(
      texts: [ identity["segment"], identity["concept"], identity["positioning"], voice["essence"] ],
      tones: voice["tones"]
    )
  end

  def infer(texts:, tones: [])
    scores = Hash.new(0)
    texts.map { |text| fold(text) }.compact_blank.each do |plain|
      KEYWORDS.each { |style, patterns| scores[style] += KEYWORD_POINTS if patterns.any? { |pattern| plain.match?(pattern) } }
    end
    Array(tones).uniq.each { |tone| scores[TONES[tone]] += TONE_POINTS if TONES.key?(tone) }

    ranked = scores.select { |_, points| points >= MIN_POINTS }.sort_by { |style, points| [ -points, Taxonomy::ARCHETYPES.index(style) ] }
    first, second, third = ranked
    return { "primary" => nil, "secondary" => nil } if first.nil? || (second && second.last == first.last)

    # O segundo também não pode empatar com o terceiro: na dúvida, só o principal.
    secondary = second && !(third && third.last == second.last) ? second.first : nil
    { "primary" => first.first, "secondary" => secondary }
  end

  def fold(text)
    BrandCore::NicheInference.fold(text)
  end
end

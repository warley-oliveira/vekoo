# O nicho deduzido do que a marca disse de si — para a marca que ainda não tem
# `identity.niche` (nasceu antes do campo, ou o onboarding leu sem modelo).
#
# Nicho errado é pior do que nenhum: na recuperação de referências ele vale +3
# para o card errado; vazio só perde o bônus. Por isso a regra é conservadora:
#
#   1. Palavra-chave no ramo (`identity.segment`) e, se ele não disser nada, no
#      conceito. Vale a que aparece primeiro.
#   2. Sem palavra, o código do ramo do onboarding (`restaurant`, `health`,
#      `education`) — os outros (`shop`, `services`, `creator`, `other`)
#      **não** têm nicho padrão: loja e serviço sem pista ficam vazios.
#   3. Código com padrão só desvia para os nichos que fazem sentido dentro dele
#      (saúde → fitness, estética). "Cursos para dentistas" é educação, não
#      saúde.
#
# Acento, caixa e plural não importam ("Imobiliária", "imobiliarias").
module BrandCore::NicheInference
  DEFAULTS = { "restaurant" => "food_beverage", "health" => "healthcare", "education" => "education" }.freeze

  # Para onde um código com padrão pode desviar. Código sem padrão aceita
  # qualquer palavra da tabela.
  DEVIATIONS = {
    "restaurant" => [],
    "health" => %w[fitness beauty_aesthetics],
    "education" => []
  }.freeze

  # Sobre o texto já sem acento e em minúsculas. As exclusões são os casos
  # conhecidos de palavra igual em outro ramo ("corretor de seguros",
  # "clínica veterinária", "academia de idiomas").
  KEYWORDS = {
    "food_beverage" => [
      /\bbar(es)?\b/, /\bbotecos?\b/, /\brestaurantes?\b/, /\bcafes?\b/, /\bcafeterias?\b/,
      /\bpadarias?\b/, /\bhamburguerias?\b/, /\blanchonetes?\b/
    ],
    "real_estate" => [
      /\bimove(l|is)\b/, /\bimobiliarias?\b/, /\bcorretor(a|as|es)?\b(?! de (seguros?|valores|investimentos?))/,
      /\bincorporadoras?\b/
    ],
    "healthcare" => [
      /\bclinicas?\b(?! (de )?(estetica|beleza|veterinaria))/, /\bconsultorios?\b/, /\bodonto\w*/, /\bdentistas?\b/
    ],
    "beauty_aesthetics" => [
      /\bsal(ao|oes)\b(?! (de )?(festas?|eventos?))/, /\bbarbearias?\b/, /\besteticas?\b/, /\bcosmeticos?\b/, /\bperfumarias?\b/
    ],
    "fitness" => [
      /\bacademias?\b(?! de (idiomas?|ingles|espanhol|letras|musica|artes?))/,
      /\bpersonal\b(?! (stylist|organizer|shopper))/, /\bpilates\b/
    ],
    "home_construction" => [
      /\bmove(l|is)\b/, /\bdecoracao\b/, /\bconstrucao\b/, /\barquitet(o|a|os|as|ura)\b/, /\breformas?\b/
    ],
    "pet" => [ /\bpets?\b/, /\bpet ?shops?\b/, /\bveterinari(a|o|as|os)\b/, /\bbanho e tosa\b/ ]
  }.freeze

  module_function

  # O nicho de um documento do Brandcore, ou nil. `segment_code` é o código
  # do onboarding (`BrandCore#onboarding_segment`).
  def call(document, segment_code: nil)
    identity = BrandCore::Schema.complete(document)["identity"]
    infer(segment: identity["segment"], concept: identity["concept"], segment_code: segment_code)
  end

  def infer(segment:, concept: nil, segment_code: nil)
    code = segment_code.to_s
    allowed = DEFAULTS.key?(code) ? DEVIATIONS.fetch(code) : KEYWORDS.keys

    [ segment, concept ].each do |text|
      found = first_keyword(text, allowed)
      return found if found
    end
    DEFAULTS[code]
  end

  # O nicho da palavra que aparece primeiro no texto, entre os permitidos.
  def first_keyword(text, allowed)
    plain = fold(text)
    return nil if plain.blank? || allowed.empty?

    allowed.filter_map { |niche|
      position = KEYWORDS.fetch(niche).filter_map { |pattern| plain.index(pattern) }.min
      [ position, niche ] if position
    }.min&.last
  end

  def fold(text)
    text.to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.squish
  end
end

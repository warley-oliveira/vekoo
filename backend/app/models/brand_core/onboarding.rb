# O onboarding por conversa: a marca montada pelo que a pessoa conta, uma
# pergunta por vez, com o agente interpretando cada resposta.
#
# É outra **porta** para o mesmo Brandcore, não outro modelo: cada tema
# escreve em campos do documento que o wizard de edição já conhece. Quem
# terminar aqui e abrir `/setup/:step` depois encontra tudo preenchido.
#
# O que não se pergunta: a hierarquia de estilos. Ninguém que abriu uma
# padaria vai responder "qual o peso do kicker" — os defaults saem da
# tipografia escolhida (`Schema.default_styles`) e o ajuste fino fica no modo
# de edição, para quem quiser.
module BrandCore::Onboarding
  # Os temas, na ordem em que o agente pergunta. Paleta e fonte são **uma**
  # pergunta para a pessoa ("cores e fonte") e dois temas aqui dentro: cada um
  # tem o próprio "cria pra mim", o próprio status gravado e pode ficar aberto
  # sem o outro.
  TOPICS = %w[brand audience differential voice banned offers logo palette fonts].freeze

  # A posição que a pessoa vê no `brandcore · n/8`.
  POSITION = {
    "brand" => 1, "audience" => 2, "differential" => 3, "voice" => 4,
    "banned" => 5, "offers" => 6, "logo" => 7, "palette" => 8, "fonts" => 8
  }.freeze
  QUESTION_COUNT = 8

  # Depois do último tema a conversa não acaba: vira o resumo, e o que a
  # pessoa escrever ali é ajuste.
  SUMMARY = "summary".freeze

  # Sem estes três não há marca: nome e o que vende, cor, fonte. Tema
  # obrigatório não fecha com resposta vaga — o agente repete a pergunta (com
  # o "cria pra mim" à mão) em vez de seguir com um buraco.
  #
  # A voz fica de fora mesmo sendo exigida para publicar (`Completeness`): se
  # a pessoa não souber dizer, o fechamento preenche uma proposta curada e
  # **mostra** no resumo antes de publicar.
  REQUIRED = %w[brand palette fonts].freeze

  # Onde existe o chip "não sei — cria pra mim". Na logo ele não propõe nada:
  # anota o pedido, e o logotipo é desenhado no fim com a fonte escolhida.
  SUGGESTIBLE = %w[voice logo palette fonts].freeze

  # Os códigos de ramo que escolhem as propostas curadas. O texto livre que a
  # pessoa usou vai para `identity.segment`; o código fica no progresso.
  SEGMENTS = %w[restaurant shop services health education creator other].freeze

  # O onboarding de telas (até out/2026) guardava os passos respondidos com
  # outros nomes. Marca que parou no meio dele retoma a conversa no primeiro
  # tema aberto — `handle` e `name` não fecham tema nenhum sozinhos.
  LEGACY_STEPS = %w[intro name what handle logo colors fonts voice offers done].freeze
  LEGACY = {
    "what" => "brand", "voice" => "voice", "offers" => "offers",
    "logo" => "logo", "colors" => "palette", "fonts" => "fonts"
  }.freeze

  module_function

  def topic?(value) = TOPICS.include?(value.to_s)

  def position(topic)
    topic.to_s == SUMMARY ? QUESTION_COUNT : POSITION.fetch(topic.to_s, 1)
  end

  def required?(topic) = REQUIRED.include?(topic.to_s)

  # O "← voltar": os temas que reabrem quando a pessoa está em `topic`. Volta
  # uma **posição** do `n/8`, não um tema — paleta e fonte são uma pergunta
  # só, e do resumo se volta para ela inteira. Da primeira, não há para onde.
  def previous(topic)
    target = topic.to_s == SUMMARY ? QUESTION_COUNT : position(topic) - 1
    TOPICS.select { |candidate| POSITION[candidate] == target }
  end

  def suggestible?(topic) = SUGGESTIBLE.include?(topic.to_s)

  def from_legacy(steps)
    Array(steps).filter_map { |step| LEGACY[step.to_s] }
  end

  # O tema tem o que precisa para fechar? Os opcionais fecham com qualquer
  # resposta que não seja vaga (ou depois do seguimento); os obrigatórios só
  # com o dado no documento.
  def satisfied?(topic, document)
    case topic.to_s
    when "brand"
      identity = document["identity"]
      %w[name concept segment].all? { |key| identity[key].present? }
    when "palette"
      BrandCore::Schema.palette_rules(document["palette"]).values.all?
    when "fonts"
      BrandCore::Schema::FONT_ROLES.all? { |role| document["typography"][role]["family"].present? }
    else
      true
    end
  end
end

# O onboarding guiado: a marca montada por perguntas, em linguagem de dono de
# negócio.
#
# É outra **porta** para o mesmo Brandcore, não outro modelo: cada pergunta
# escreve numa seção do documento que o wizard de edição já conhece. Quem
# terminar aqui e abrir `/setup/:step` depois encontra tudo preenchido.
#
# O que não se pergunta: a hierarquia de estilos. Ninguém que abriu uma
# padaria vai responder "qual o peso do kicker" — os defaults saem da
# tipografia escolhida (`Schema.default_styles`) e o ajuste fino fica no modo
# de edição, para quem quiser.
module BrandCore::Onboarding
  # `intro` explica o jogo antes de começar; `done` é o fechamento com o
  # cartão montado e a publicação da v1.
  STEPS = %w[intro name what handle logo colors fonts voice offers done].freeze

  # A seção do documento que cada pergunta escreve. As que não escrevem
  # (`intro`, `logo`, `done`) mexem em ativo ou em nada.
  SECTION = {
    "name" => "identity",
    "what" => "identity",
    "handle" => "identity",
    "colors" => "palette",
    "fonts" => "typography",
    "voice" => "voice",
    "offers" => "offers"
  }.freeze

  # O que dá para pular sem quebrar nada. Cor e tipografia não estão aqui —
  # mas as duas têm "cria pra mim", que é o jeito de não travar quem não sabe
  # responder.
  SKIPPABLE = %w[handle logo voice offers].freeze

  # Onde existe o botão "não sei / cria pra mim".
  SUGGESTIBLE = %w[colors fonts voice].freeze

  # Os chips de segmento. São **códigos**: a tela traduz e o texto que a
  # pessoa confirmar é o que vai para `identity.segment`.
  SEGMENTS = %w[restaurant shop services health education creator other].freeze

  # O mínimo para terminar e publicar a v1. Curto de propósito: nome, o que
  # faz, cor e fonte — e as duas últimas podem vir da IA.
  #
  # A voz fica de fora mesmo sendo exigida para publicar (`Completeness`): se
  # a pessoa pular, o fechamento preenche uma proposta curada e **mostra** no
  # cartão antes de publicar. Travar o cadastro numa pergunta sobre tom de voz
  # seria perder a marca inteira por causa de uma frase.
  REQUIRED_STEPS = %w[name what colors fonts].freeze

  module_function

  def first_step = STEPS.first

  def index(step) = STEPS.index(step.to_s)

  def valid?(step) = STEPS.include?(step.to_s)

  def next_step(step)
    STEPS[index(step).to_i + 1]
  end

  def previous_step(step)
    position = index(step)
    position&.positive? ? STEPS[position - 1] : nil
  end

  def skippable?(step) = SKIPPABLE.include?(step.to_s)

  def suggestible?(step) = SUGGESTIBLE.include?(step.to_s)

  # Quantas perguntas a barra de progresso conta: `intro` e `done` não são
  # perguntas, e contá-las faria a barra começar em 10%.
  def question_count = STEPS.length - 2

  def question_position(step)
    position = index(step)
    return nil if position.nil? || position.zero? || step.to_s == "done"

    position
  end
end

require "digest"

module References
  # A análise descreve o que o copy **faz** ("nomeia a etapa em duas
  # palavras"), nunca o que ele diz. Esta é a conferência.
  #
  # Na análise, o modelo também transcreve o texto visível do post; daqui sai
  # só o resumo (SHA-256 cortado) de cada janela de `WINDOW` palavras, e a
  # transcrição é descartada. Com os resumos, qualquer gravação da curadoria e
  # a publicação conferem se alguma frase do post voltou para a análise — sem
  # o texto do post ficar guardado em lugar nenhum.
  module CopyGuard
    # Seis palavras seguidas já são frase; menos que isso pega expressão comum
    # ("clique no link da bio").
    WINDOW = 6

    module_function

    def shingles(text)
      words = Text.fold(text).scan(/[a-z0-9]+/)
      words.each_cons(WINDOW).map { |window| digest(window) }.uniq
    end

    # Os caminhos da análise que repetem uma janela do post.
    def copied_paths(analysis, shingles)
      known = shingles.to_set
      return [] if known.empty?

      Text.leaves(analysis).filter_map { |path, text| path if self.shingles(text).any? { |shingle| known.include?(shingle) } }
    end

    def digest(words)
      Digest::SHA256.hexdigest(words.join(" "))[0, 16]
    end
  end
end

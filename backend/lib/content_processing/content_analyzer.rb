# Comparação aproximada de textos. Na origem vinha da gem `text`
# (Text::WhiteSimilarity); como só este cálculo é usado, ele mora aqui em vez de
# puxar uma dependência nova.
module ContentProcessing
  class ContentAnalyzer
    # Initializes a new instance of ContentAnalyzer.
    #
    # @param array [Array<Hash>] The array of content data.
    def initialize(array)
      @array = array
    end

    # Checks if the last three user contents are similar.
    #
    # @return [Boolean] Returns true if the last three user contents are similar, false otherwise.
    def last_three_user_contents_similar?
      user_contents = @array.select { _1[:role] == 'user' }.map { _1[:content] }
      last_three = user_contents.last(3)

      return false if last_three.size < 3

      similarity1 = self.class.similarity(last_three[0], last_three[1])
      similarity2 = self.class.similarity(last_three[1], last_three[2])
      similarity3 = self.class.similarity(last_three[0], last_three[2])

      [similarity1, similarity2, similarity3].min > 0.9
    end

    # Coeficiente de White: 2 × pares de letras em comum ÷ total de pares, por palavra.
    #
    # @param str1 [String] The first string.
    # @param str2 [String] The second string.
    # @return [Float] Returns the similarity score between the two strings (0.0..1.0).
    def self.similarity(str1, str2)
      return 1.0 if str1 == str2

      pairs1 = letter_pairs(str1)
      pairs2 = letter_pairs(str2)
      total = pairs1.size + pairs2.size
      return 0.0 if total.zero?

      remaining = pairs2.dup
      shared = pairs1.count do |pair|
        index = remaining.index(pair)
        remaining.delete_at(index) if index
        index
      end

      (2.0 * shared) / total
    end

    def self.letter_pairs(text)
      text.to_s.upcase.split(/\s+/).flat_map do |word|
        (0...[word.length - 1, 0].max).map { |index| word[index, 2] }
      end
    end
    private_class_method :letter_pairs
  end
end

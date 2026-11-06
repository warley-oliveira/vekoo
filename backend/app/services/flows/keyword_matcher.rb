module Flows
  # A palavra-chave do gatilho `trigger_keyword`, na mensagem: sem ligar para caixa e acento, e como palavra inteira. "pix"
  # casa com "aceita Pix?", e não com "pixel".
  module KeywordMatcher
    module_function

    def match?(text, keywords)
      normalized = normalize(text)
      return false if normalized.blank?

      Array(keywords).any? do |keyword|
        word = normalize(keyword)
        word.present? && normalized.match?(/(?<![[:alnum:]])#{Regexp.escape(word)}(?![[:alnum:]])/)
      end
    end

    def normalize(value)
      ActiveSupport::Inflector.transliterate(value.to_s).downcase.squish
    end
  end
end

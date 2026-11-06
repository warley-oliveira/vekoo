module Chats
  # A busca por texto das listas: telefone, nome do contato e nome de exibição. O telefone
  # ignora a máscara (`(31) 97181-0932`), porque na base ele está só com dígitos.
  module SearchTerm
    module_function

    # @return [Hash, nil] cláusula `$or`, pronta para consulta e para `$match`
    def clause(term)
      term = term.to_s.strip
      return nil if term.blank?

      clauses = [
        regex_clause("user_name", term.delete("+")),
        regex_clause("display_name", term.delete("+"))
      ]
      phone = term.gsub(/[()+\s-]/, "")
      # Só pontuação: um regex vazio casaria com todo mundo.
      clauses << regex_clause("external_id", phone) if phone.present?

      { "$or" => clauses }
    end

    def regex_clause(field, text)
      { field => { "$regex" => Regexp.escape(text), "$options" => "i" } }
    end
  end
end

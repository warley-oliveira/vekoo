module Products
  # Campo personalizado do catálogo, por organização.
  #
  # Espelha CustomField (os campos personalizados de contato) de propósito: os cinco
  # primeiros VALUE_TYPES são idênticos, para o front reaproveitar a mesma configuração.
  class FieldDefinition < ApplicationRecord
    VALUE_TYPES = %w[text number list checkbox date url].freeze
    # O português que chega em planilha. `ActiveModel::Type::Boolean` só conhece
    # false/f/0/off, e "Não" viraria verdadeiro.
    FALSE_WORDS = %w[nao n no false f 0 off inativo inativa indisponivel esgotado].freeze

    belongs_to :organization

    validates :name, presence: true, length: { maximum: 200 }
    validates :key, presence: true
    validates :value_type, inclusion: { in: VALUE_TYPES }
    validates :position, numericality: Products::POSITION_RANGE
    validate :key_available
    validate :list_requires_options

    before_validation :set_key_and_options

    # Só o que muda o texto indexado dos itens. Um `after_commit` só, de propósito:
    # `after_update_commit` + `after_destroy_commit` com o mesmo método fariam o segundo
    # sobrescrever o primeiro.
    after_commit :reindex_items, on: %i[update destroy], if: :affects_index_text?

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }
    scope :searchable_only, -> { where(searchable: true) }
    # `created_at` no desempate: com UUID, o `id` sozinho não preserva a ordem de criação.
    scope :ordered, -> { order(position: :asc, created_at: :asc, id: :asc) }

    def self.truthy?(raw)
      !FALSE_WORDS.include?(IndexTextBuilder.normalize(raw))
    end

    def numeric?
      value_type == "number"
    end

    # Converte o valor cru (CSV ou formulário) para o formato canônico de
    # armazenamento no jsonb. Números viram Float, checkbox vira Boolean, o resto
    # fica String — assim os filtros de faixa funcionam sem cast em SQL.
    def cast(raw)
      return nil if raw.nil? || raw.to_s.strip.empty?

      case value_type
      when "number" then parse_number(raw)
      when "checkbox" then self.class.truthy?(raw)
      when "date" then parse_date(raw)
      when "url" then Products.web_url?(raw) ? raw.to_s.strip : nil
      else raw.to_s.strip
      end
    end

    private

    def set_key_and_options
      self.name = name.to_s.strip
      self.key = name.parameterize.underscore if key.blank?
      self.option_values = Array(option_values).map { |value| value.to_s.strip }.reject(&:blank?).uniq
    end

    # A chave deriva do nome e a pessoa não a vê: quem precisa ouvir é o campo de nome.
    def key_available
      return if key.blank?

      taken = self.class.for_organization(organization_id).where(key: key).where.not(id: id).exists?
      errors.add(:name, :taken) if taken
    end

    def list_requires_options
      return unless value_type == "list" && option_values.empty?

      errors.add(:option_values, :list_without_options)
    end

    # Preço de planilha brasileira: "R$ 1.234,56". Com os dois separadores, o último é o
    # decimal. Com um só, ele é o decimal ("10,5" e "10.5"); "1.234" fica sendo 1,234
    # porque é ambíguo e o que chega de ERP sem vírgula usa ponto decimal.
    def parse_number(raw)
      return raw.to_f if raw.is_a?(Numeric)

      text = raw.to_s.gsub(/[^\d,.\-]/, "")
      normalized = if text.include?(",") && text.include?(".")
        text.rindex(",") > text.rindex(".") ? text.delete(".").tr(",", ".") : text.delete(",")
      else
        text.tr(",", ".")
      end
      Float(normalized, exception: false)
    end

    def parse_date(raw)
      Date.parse(raw.to_s).iso8601
    rescue Date::Error
      nil
    end

    def affects_index_text?
      destroyed? ? searchable? : saved_change_to_searchable?
    end

    def reindex_items
      ReindexItemsJob.perform_later(organization_id)
    end
  end
end

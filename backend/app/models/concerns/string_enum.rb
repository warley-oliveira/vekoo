# Enum de documento Mongoid guardado como texto em `<nome>_cd`.
#
#   string_enum :status, %i[draft running done], default: :draft
#
# Gera `status`, `status=`, `running?`, `running!`, o escopo `.running`,
# `.statuses` e `status_changed?`.
module StringEnum
  extend ActiveSupport::Concern

  class_methods do
    def string_enum(name, values, default: nil, prefix: nil)
      column = :"#{name}_cd"
      values = values.map(&:to_s)
      field column, type: String, default: default&.to_s

      define_singleton_method(name.to_s.pluralize) { values }

      define_method(name) { self[column]&.to_sym }
      define_method(:"#{name}=") do |value|
        value = value&.to_s
        raise ArgumentError, "#{name} inválido: #{value}" if value && !values.include?(value)

        self[column] = value
      end
      define_method(:"#{name}_changed?") { public_send(:"#{column}_changed?") }
      define_method(:"#{name}_was") { public_send(:"#{column}_was")&.to_sym }

      values.each do |value|
        method_name = prefix ? "#{prefix}_#{value}" : value
        define_method(:"#{method_name}?") { self[column] == value }
        define_method(:"#{method_name}!") { update!(column => value) }
        scope method_name.to_sym, -> { where(column => value) }
      end
    end
  end
end

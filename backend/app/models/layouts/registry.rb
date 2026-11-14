# A biblioteca de layouts. Na primeira consulta lê `layouts/*.yml` e valida
# cada contrato; layout novo é arquivo novo (mais o componente em cada
# renderizador). Mesmo esquema de cache do catálogo de motores: no
# recarregamento do Zeitwerk o módulo nasce de novo e a leitura repete.
module Layouts
  module Registry
    module_function

    def root = Rails.root.join("layouts")

    def all
      @all ||= Dir[root.join("*.yml")].sort.to_h { |path|
        contract = Contract.load(path)
        [ contract.id, contract ]
      }.freeze
    end

    def find(id) = all[id.to_s]
    def ids = all.keys
    def for_format(format) = all.values.select { |contract| contract.supports?(format) }

    def reset!
      @all = nil
    end
  end
end

module Pipelines
  # O que toda lista ordenada do domínio tem em comum: `acts_as_list` sobre uma trava da lista.
  #
  #   include Pipelines::OrderedList
  #   ordered_within :stage_id
  #
  # `acts_as_list` calcula a posição com leitura seguida de escrita: dois cards criados juntos na
  # mesma etapa ficariam com a mesma posição, e dois arrastes ao mesmo tempo embaralhariam a coluna.
  # A trava de `ListLock` serializa só as escritas daquela lista.
  #
  # `touch_on_update: false`: por padrão, a gem atualiza o `updated_at` de todo mundo que muda de
  # posição. Arrastar um card para o topo "renovaria" a coluna inteira, e o auto-arquivamento conta
  # o tempo parado por esse campo.
  module OrderedList
    extend ActiveSupport::Concern

    class_methods do
      def ordered_within(column, **options)
        before_create { ListLock.acquire(self[column]) }
        before_destroy { ListLock.acquire(self[column]) }

        acts_as_list(scope: column.to_s.delete_suffix("_id").to_sym, touch_on_update: false, **options)

        default_scope { order(position: :asc) }
      end
    end
  end
end

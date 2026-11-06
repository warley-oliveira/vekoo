module FlowRuntime
  module Nodes
    # Base dos blocos de Pipelines. As operações passam pelo KanbanGateway, com as mesmas regras das funções `kanban.*` que
    # quem escreve script usa. Os blocos que agem sobre um card escolhem de onde ele vem em `data['card_source']`:
    #
    #   { 'type' => 'node', 'node_id' => '<id do Criar card>' }   card criado por um bloco anterior
    #   { 'type' => 'chat', 'board_id' => '<quadro>' }            card mais recente da conversa no quadro
    #
    # Falhas seguem pela saída `onError`, quando ligada; sem ela, a execução para com uma mensagem legível.
    #
    # **Enquanto `KanbanGateway.available?` for falso**, todos respondem "Pipelines ainda não disponível". A lógica de
    # cada bloco veio da origem e só será exercitada quando o domínio pipelines for integrado.
    class KanbanBase < Base
      class << self
        def humanize_error(result)
          case (error = result[:error].to_s)
          when KanbanGateway::UNAVAILABLE then I18n.t("automation.flows.errors.pipelines_unavailable")
          when "no_card" then I18n.t("automation.flows.errors.pipelines_no_card")
          when "no_chat" then I18n.t("automation.flows.errors.pipelines_no_chat")
          when "checklist_incomplete" then I18n.t("automation.flows.errors.pipelines_checklist", names: names(result[:pending_items]))
          when "required_fields_incomplete" then I18n.t("automation.flows.errors.pipelines_fields", names: names(result[:pending_fields]))
          when /\Anot_found: / then I18n.t("automation.flows.errors.pipelines_not_found", what: error.delete_prefix("not_found: "))
          else I18n.t("automation.flows.errors.pipelines_other", error: error)
          end
        end

        def names(items)
          Array(items).map { |item| item.is_a?(Hash) ? item.values_at(:title, "title", :name, "name").compact.first : item }.compact.join(", ")
        end
      end

      def call
        return failed(ok: false, error: KanbanGateway::UNAVAILABLE) unless KanbanGateway.available?

        perform
      end

      protected

      def perform
        raise NotImplementedError
      end

      def gateway
        @gateway ||= KanbanGateway.new(context)
      end

      def card_refs
        @card_refs ||= CardRefs.new(context)
      end

      # Executa a operação sobre o card escolhido. O bloco recebe o id do card.
      def with_card
        card_id = resolve_card_id
        return failed(ok: false, error: "no_card") if card_id.blank?

        finish(yield(card_id), variables: { "pipeline_card_id" => card_id })
      end

      def resolve_card_id
        source = data["card_source"].to_h
        return latest_chat_card(source["board_id"]) if source["type"] == "chat"

        card_refs.fetch(source["node_id"]) if source["node_id"].present?
      end

      def finish(result, variables: {})
        return failed(result) unless result[:ok]

        continue(default_next_node_id, variables: variables, log: { input: data, output: result.except(:ok) })
      end

      def failed(result)
        message = self.class.humanize_error(result)
        log = { input: data, output: result }
        target = next_node_id(handle: "onError")
        return continue(target, variables: { "pipeline_error" => message }, log: log) if target

        NodeResult.failure(message, log: log)
      end

      def text(key)
        interpolate(data[key].to_s).presence
      end

      private

      def latest_chat_card(board_id)
        return nil if board_id.blank? || chat.nil?

        ::Pipelines::Card.active
                         .joins(stage: :board)
                         .where(pipeline_boards: { id: board_id, organization_id: organization.id })
                         .where(chat_id: chat.id.to_s)
                         .order(created_at: :desc)
                         .pick(:id)
      end
    end
  end
end

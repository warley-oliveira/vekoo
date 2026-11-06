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
    # O teste do editor não tem conversa e não mexe em quadro de verdade: o bloco avisa que não rodou, e o fluxo segue.
    class PipelineBase < Base
      # `kanban.*` fala em coluna e conversa, porque é contrato de quem escreve script. O log do bloco é público: etapa e conversa.
      PUBLIC_KEYS = { kanban_column_id: :stage_id, conversation_id: :chat_id }.freeze
      NOT_FOUND_KINDS = {
        "Board" => "board",
        "Column" => "stage",
        "Card" => "card",
        "Label" => "label",
        "Checklist item" => "checklist",
        "Checklist" => "checklist"
      }.freeze

      class << self
        def humanize_error(result)
          case (error = result[:error].to_s)
          when "no_card" then I18n.t("automation.flows.errors.pipelines_no_card")
          when "no_chat" then I18n.t("automation.flows.errors.pipelines_no_chat")
          when "internal_error" then I18n.t("automation.flows.errors.pipelines_internal")
          when "checklist_incomplete" then I18n.t("automation.flows.errors.pipelines_checklist", names: Array(result[:pending_items]).join(", "))
          when "required_fields_incomplete" then I18n.t("automation.flows.errors.pipelines_fields", names: Array(result[:pending_fields]).join(", "))
          when /\Anot_found: / then not_found_message(error)
          else I18n.t("automation.flows.errors.pipelines_other", error: error)
          end
        end

        private

        def not_found_message(error)
          kind, reference = error.match(/\Anot_found: (#{NOT_FOUND_KINDS.keys.join('|')}) '(.*?)'/)&.captures
          return I18n.t("automation.flows.errors.pipelines_other", error: error.delete_prefix("not_found: ")) unless kind

          I18n.t("automation.flows.errors.pipelines_not_found.#{NOT_FOUND_KINDS.fetch(kind)}", reference: reference)
        end
      end

      def call
        return skipped_in_test if context.playground?

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

        continue(default_next_node_id, variables: variables, log: { input: data, output: public_output(result) })
      end

      def failed(result)
        message = self.class.humanize_error(result)
        log = { input: data, output: { error: message, **result.slice(:pending_items, :pending_fields, :pending_field_keys) } }
        target = next_node_id(handle: "onError")
        return continue(target, variables: { "pipeline_error" => message }, log: log) if target

        NodeResult.failure(message, log: log)
      end

      def text(key)
        interpolate(data[key].to_s).presence
      end

      # A etapa precisa ser de um quadro desta organização: na origem, servia a de qualquer uma.
      def organization_stage(id)
        return nil if id.blank?

        ::Pipelines::Stage.joins(:board).where(pipeline_boards: { organization_id: organization.id }).find_by(id: id)
      end

      # O valor pode vir de variável. O que não é número fica de fora, em vez de virar zero no negócio.
      def numeric(key)
        value = data[key]
        return value if value.is_a?(Numeric)

        Float(interpolate(value.to_s).strip, exception: false)
      end

      private

      def skipped_in_test
        dispatcher.emit_event("pipeline_skipped", type: node["type"])
        skip("playground")
      end

      def public_output(result)
        output = result.except(:ok)
        return output unless output[:data].is_a?(Hash)

        output.merge(data: output[:data].transform_keys { |key| PUBLIC_KEYS.fetch(key, key) })
      end

      def latest_chat_card(board_id)
        return nil if board_id.blank? || chat.nil?

        ::Pipelines::Card.active
                         .joins(:stage)
                         .where(organization_id: organization.id, chat_id: chat.id.to_s, pipeline_stages: { board_id: board_id })
                         .reorder(created_at: :desc)
                         .pick(:id)
      end
    end
  end
end

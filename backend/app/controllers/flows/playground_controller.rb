module Flows
  # O teste do editor. A execução é de mentira do lado do contato (nada sai pelo canal: vira evento em `FlowPlaygroundChannel`), mas
  # as ferramentas e o modelo são de verdade, e cobram.
  class PlaygroundController < PlatformController
    require_permission :flows

    before_action :set_flow

    # POST /flows/:flowId/playground { useDraft?, variables? }
    def start
      version = resolve_version
      return render_error(status: :unprocessable_entity, code: "noVersion") unless version

      chat = playground_chat
      execution = FlowExecution.create!(
        flow: @flow,
        flow_version: version,
        organization_id: current_organization.id,
        chat_id: chat.id.to_s,
        contact_id: chat.external_id,
        status: "pending",
        context: { "variables" => initial_variables },
        playground: true,
        started_at: Time.current,
        current_node_id: version.entry_node_id
      )

      render json: {
        executionId: execution.id,
        channel: "FlowPlaygroundChannel",
        currentNodeId: execution.current_node_id,
        chatId: chat.id.to_s
      }, status: :created
    end

    # Chamado depois de assinar o canal, para os primeiros eventos não se perderem.
    def run
      execution = find_execution
      return render json: { ok: true, status: execution.status } unless execution.status == "pending"

      ResumeExecutionJob.perform_later(execution.id, current_organization.id, { "first_run" => true })
      render json: { ok: true }
    end

    # POST /flows/:flowId/playground/:executionId/message { text }
    def message
      execution = find_execution
      return render_error(status: :unprocessable_entity, code: "notWaiting") unless execution.status.in?(%w[waiting waiting_for_message])

      ResumeExecutionJob.perform_later(execution.id, current_organization.id, { "user_text" => params.require(:text).to_s })
      render json: { ok: true }
    end

    def stop
      execution = find_execution
      execution.cancel!
      ActionCable.server.broadcast(
        FlowRuntime::MessageDispatcher.playground_stream(execution),
        { kind: "stopped", at: Time.current.iso8601 }
      )
      head :no_content
    end

    private

    def set_flow
      @flow = Flow.for_organization(current_organization.id).find(params[:flow_id])
    end

    # Escopada ao fluxo, e só as do teste: um id de outro fluxo ou de outra organização não é aceito.
    def find_execution
      @flow.executions.playground_runs.find(params[:execution_id])
    end

    def resolve_version
      return @flow.draft_version if ActiveModel::Type::Boolean.new.cast(params[:use_draft])

      @flow.published_version || @flow.draft_version
    end

    # A conversa de teste ("João da Silva"): blocos que mexem em conversa precisam de uma, e ela não entra nas listas.
    def playground_chat
      scope = Chat.where(organization_id: current_organization.id.to_s, external_id: Chat::TEST_EXTERNAL_ID)
      scope.take || Chat.create!(
        organization_id: current_organization.id.to_s,
        external_id: Chat::TEST_EXTERNAL_ID,
        user_name: t("automation.flows.defaults.playground_contact"),
        ignore_events: true
      )
    end

    def initial_variables
      raw = params[:variables]
      (raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : {}).transform_keys(&:to_s)
    end
  end
end

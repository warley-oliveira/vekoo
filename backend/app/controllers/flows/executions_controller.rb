module Flows
  # O histórico de um fluxo. Só as execuções de verdade: as do teste do editor ficam de fora.
  class ExecutionsController < PlatformController
    # Teto do detalhe: uma execução pode ter passado por muitos blocos, e o resto continua na tabela.
    MAX_LOGS = 500

    require_permission :flows

    before_action :set_flow

    rescue_from FlowRuntime::Limits::TooLarge do
      render_error(status: :unprocessable_entity, code: "variablesTooLarge")
    end

    # GET /flows/:flowId/executions?status=&chatId=
    def index
      scope = @flow.executions.real_runs.order(created_at: :desc)
      scope = scope.where(status: params[:status]) if params[:status].present?
      scope = scope.where(chat_id: params[:chat_id]) if params[:chat_id].present?

      records, meta = paginate(scope)
      render json: { executions: FlowExecutionSerializer.many(records), meta: meta }
    end

    def show
      execution = @flow.executions.find(params[:id])
      logs = execution.logs.limit(MAX_LOGS)

      render json: { execution: FlowExecutionSerializer.full(execution, logs) }
    end

    # POST /flows/:flowId/executions { chatId, variables? }. É o gatilho `manual`: alguém começa o fluxo numa conversa.
    def create
      return render_error(status: :unprocessable_entity, code: "flowNotPublished") unless @flow.published?

      chat = Chat.visible_to(current_account).where(id: params.require(:chat_id).to_s).take
      return render_not_found unless chat && current_account.can?(:chat)

      StartExecutionJob.perform_later(
        @flow.id, current_organization.id, chat.id.to_s,
        { "variables_json" => variables_param.to_json, "event" => "manual" }
      )
      render json: { queued: true }, status: :accepted
    end

    private

    def set_flow
      @flow = Flow.for_organization(current_organization.id).find(params[:flow_id])
    end

    def variables_param
      raw = params[:variables]
      FlowRuntime::Limits.bound_variables(raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : {})
    end
  end
end

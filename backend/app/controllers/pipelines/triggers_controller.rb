module Pipelines
  class TriggersController < BaseController
    before_action :set_board
    before_action :set_trigger, only: %i[update destroy toggle]
    before_action :require_code_permission, only: %i[create update]

    rescue_from SecretHeaders::NeedsRetyping do |error|
      render_error(
        status: :unprocessable_content,
        code: "secretHeaderNeedsRetyping",
        field: "actions",
        message: t("errors.secret_header_needs_retyping", name: error.header)
      )
    end

    def index
      triggers = @board.triggers.ordered

      render json: { triggers: TriggerSerializer.many(triggers, viewer: current_account), meta: { total: triggers.size } }
    end

    def create
      trigger = @board.triggers.build(with_kept_secret_headers(trigger_params))

      if trigger.save
        render json: TriggerSerializer.one(trigger, viewer: current_account), status: :created
      else
        render_invalid(trigger)
      end
    end

    def update
      if @trigger.update(with_kept_secret_headers(trigger_params))
        render json: TriggerSerializer.one(@trigger, viewer: current_account)
      else
        render_invalid(@trigger)
      end
    end

    def destroy
      @trigger.destroy!
      head :no_content
    end

    def toggle
      @trigger.toggle!
      render json: TriggerSerializer.one(@trigger, viewer: current_account)
    end

    private

    def set_trigger
      @trigger = @board.triggers.find(params[:id])
    end

    # Script roda como a organização inteira: lê as coleções, chama a rede, mexe em qualquer card. Quem
    # trabalha no quadro não ganha isso junto. Escrever código é de quem tem acesso aos fluxos, onde o
    # resto dos scripts mora.
    def require_code_permission
      return if current_account.can?(:flows)
      return unless Array(envelope(:trigger)[:actions]).any? { |action| action.respond_to?(:permit) && action[:type].to_s == "run_code" }

      render_forbidden
    end

    # As ações chegam sempre inteiras e sem id. O valor guardado vem de uma ação para o mesmo destino, a da
    # mesma posição primeiro: duas ações para o mesmo servidor podem levar chaves diferentes.
    def with_kept_secret_headers(attributes)
      return attributes unless attributes[:actions]

      stored = Array(@trigger&.actions)
      attributes[:actions] = attributes[:actions].each_with_index.map do |action, position|
        next action if action[:headers].blank?

        candidates = stored.rotate(position).select do |candidate|
          candidate["type"] == "fire_webhook" && SecretHeaders.same_destination?(candidate["url"], action[:url])
        end
        known = candidates.reverse.reduce({}) { |all, candidate| all.merge(candidate["headers"].to_h) }

        action.merge(headers: SecretHeaders.restore(action[:headers].to_h, stored: known, same_destination: true))
      end
      attributes
    end

    def trigger_params
      envelope(:trigger).permit(
        :name, :event_type, :active, :stage_id,
        conditions: {},
        actions: [
          :type, :message, :stage_id, :account_id,
          :connector_id, :target, :specific_phone,
          :whatsapp_template_id, :url, :method, :body_template,
          :automation_status, :disable_period, :disable_time,
          # create_card
          :target_board_id, :target_stage_id,
          :card_title_template, :card_description_template,
          :card_priority, :card_color_label,
          :card_due_date_offset,
          :card_assigned_to_id, :card_inherit_assigned,
          :card_inherit_labels,
          :card_deal_value_template, :card_company_name_template,
          :card_contact_email_template, :card_contact_phone_template,
          # run_code
          :code, :timeout_ms,
          { account_ids: [], template_params: [], headers: {},
            card_tags: [], card_label_ids: [],
            card_custom_field_values: {} }
        ]
      )
    end
  end
end

module Pipelines
  # Executa as ações de um gatilho sobre um card.
  #
  # Sem nova tentativa: enviar mensagem e chamar webhook não são idempotentes, e o erro de cada ação já
  # fica registrado na execução. Na origem, cada ação engolia o próprio erro, e a execução aparecia como
  # sucesso mesmo com a mensagem que não saiu: aqui cada ação diz como terminou.
  class TriggerJob < ApplicationJob
    include Alertable

    queue_as :default
    sidekiq_options retry: false

    # Ação recusada por configuração (canal apagado, etapa que não existe mais).
    class ActionFailed < StandardError; end

    CARD_MODIFYING_ACTIONS = %w[move_card assign_user].freeze
    ALERT_CODE = "pipeline_trigger_failed".freeze
    MAX_STORED_ERROR = 500

    def perform(trigger_id, card_id, event_context_json)
      trigger = Trigger.find_by(id: trigger_id)
      card = Card.find_by(id: card_id)
      return if trigger.blank? || card.blank? || !trigger.active?
      # Um par de ids trocado não pode mexer em card de outro quadro, nem de outra organização.
      return if card.stage&.board_id != trigger.board_id

      event_context = JSON.parse(event_context_json).symbolize_keys
      board = trigger.board

      # Sem transmissão a cada ação e sem disparar outro gatilho: um único evento no fim.
      card.suppress_broadcast = true
      card.suppress_trigger_evaluation = true

      Time.use_zone(Pipelines.time_zone_for(board.organization)) do
        run_actions(trigger, card, board, event_context)
      end
    end

    private

    def run_actions(trigger, card, board, event_context)
      outcomes = trigger.actions.each_with_index.map do |action, index|
        run_action(action.symbolize_keys, index, card, board, event_context, trigger)
      end

      broadcast_card_final_state(card) if outcomes.any? { |outcome| CARD_MODIFYING_ACTIONS.include?(outcome[:type]) }

      finish(trigger, card, outcomes)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::TriggerJob] #{e.class}: #{e.message}")
      finish(trigger, card, [ { type: "unknown", status: "failure", error: e.message } ])
    end

    def run_action(action, index, card, board, context, trigger)
      detail = execute_action(action, index, card, board, context, trigger)
      { type: action[:type], status: "success" }.merge(detail.is_a?(Hash) ? detail : {})
    rescue StandardError => e
      Rails.logger.warn("[Pipelines::TriggerJob] #{action[:type]} no gatilho #{trigger.id}: #{e.class}: #{e.message}")
      { type: action[:type], status: "failure", error: e.message.to_s.truncate(MAX_STORED_ERROR) }
    end

    def execute_action(action, index, card, board, context, trigger)
      case action[:type]
      when "notify" then execute_notify(action, card, board)
      when "move_card" then execute_move_card(action, card, board)
      when "assign_user" then execute_assign_user(action, card, trigger, board)
      when "send_whatsapp_message" then execute_send_whatsapp_message(action, card, board)
      when "send_whatsapp_template" then execute_send_whatsapp_template(action, card, board)
      when "fire_webhook" then execute_fire_webhook(action, card, board, context)
      when "toggle_automation" then execute_toggle_automation(action, card)
      when "create_card" then execute_create_card(action, card, board)
      when "run_code" then execute_run_code(index, card, board, context, trigger)
      end
    end

    def failed!(key, **options)
      raise ActionFailed, I18n.t("pipelines.triggers.failures.#{key}", **options)
    end

    def execute_notify(action, card, board)
      account_ids = action[:account_ids].presence || watcher_and_assigned_ids(card)
      accounts = board.organization.accounts.active.where(id: Array(account_ids).select { |id| Pipelines.uuid?(id) })

      accounts.each do |account|
        I18n.with_locale(account.locale.presence || I18n.default_locale) do
          AccountNotice.create!(
            account_id: account.id,
            organization_id: board.organization_id,
            title: I18n.t("pipelines.notices.trigger_title"),
            description: notice_text(action, card, board),
            url: CardLink.path(board, card),
            category: "general"
          )
        end
      rescue StandardError => e
        Rails.logger.error("[Pipelines::TriggerJob] aviso para #{account.id}: #{e.class}: #{e.message}")
      end

      { notified: accounts.size }
    end

    def notice_text(action, card, board)
      text = render_message(action[:message], card, board).presence ||
        I18n.t("pipelines.notices.trigger_default", card: card.title, board: board.name)

      text.truncate(1000)
    end

    def execute_move_card(action, card, board)
      target = Pipelines.uuid?(action[:stage_id]) ? board.stages.find_by(id: action[:stage_id]) : nil
      failed!(:stage_not_found) unless target

      MoveCard.call(card: card, stage: target, at: :bottom, enforce_gates: false)
      nil
    end

    def execute_assign_user(action, card, trigger, board)
      # Um id só, a forma antiga: vale como está, e a validação do card confere a organização.
      account_ids = Array(action[:account_ids].presence || action[:account_id]).map(&:to_s)
      failed!(:no_accounts) if account_ids.empty?

      # Rodízio, pulando quem perdeu o acesso ou só configura o sistema: o card não pode ficar com quem
      # nunca vai abri-lo.
      eligible = board.organization.accounts.active.where(setup_only: false, id: account_ids.select { |id| Pipelines.uuid?(id) }).pluck(:id)
      candidates = account_ids & eligible
      failed!(:no_accounts) if candidates.empty?

      selected = candidates[trigger.next_round_robin_index % candidates.size]
      card.update!(assigned_to_id: selected)
      { accountId: selected }
    end

    # ── WhatsApp ─────────────────────────────────────────
    def execute_send_whatsapp_message(action, card, board)
      connector = find_connector!(action[:connector_id], board)
      chat = resolve_chat!(action, card, connector)

      # A recusa da Meta não levanta: a mensagem volta `failed`, com o motivo.
      message = chat.send_text_message(render_message(action[:message].to_s, card, board))
      failed!(:message_refused, reason: message.status_message) if message.status == "failed"
      nil
    end

    def execute_send_whatsapp_template(action, card, board)
      connector = find_connector!(action[:connector_id], board)
      failed!(:connector_not_waba) unless connector.is_a?(Connector::WhatsappCloud)

      chat = resolve_chat!(action, card, connector)
      template = connector.whatsapp_templates.where(id: action[:whatsapp_template_id].to_s).take
      failed!(:template_not_found) unless template

      message = Chats::SendTemplate.call(
        chat: chat, template: template, components: template_components(action, card, board), sender_name: board.organization.name
      )
      failed!(:template_refused, reason: message.status_message) if message.status == "failed"
      nil
    end

    # A tela manda uma lista de textos, um por variável do corpo. Componentes no formato da Meta também
    # valem, como vão para `Chats::SendTemplate`.
    def template_components(action, card, board)
      params = Array(action[:template_params])
      return params unless params.any? && params.all?(String)

      [ {
        "type" => "body",
        "parameters" => params.map { |text| { "type" => "text", "text" => render_message(text, card, board) } }
      } ]
    end

    # ── Webhook ──────────────────────────────────────────
    def execute_fire_webhook(action, card, board, context)
      failed!(:webhook_without_url) if action[:url].blank?

      webhook_context = {
        card: {
          "id" => card.id, "title" => card.title, "description" => card.description, "priority" => card.priority,
          "status" => card.status, "due_date" => card.due_date&.iso8601, "assigned_to_id" => card.assigned_to_id,
          "chat_id" => card.chat_id, "tags" => card.tags, "deal_value" => card.deal_value&.to_f,
          "company_name" => card.company_name
        },
        board: { "id" => board.id, "name" => board.name },
        stage: { "id" => card.stage&.id, "name" => card.stage&.name, "position" => card.stage&.position },
        event_type: context[:event_type]
      }

      result = WebhookSender.call(
        url: action[:url],
        method: action[:method] || "POST",
        headers: action[:headers] || {},
        body: action[:body_template].presence || webhook_context,
        context: webhook_context
      )

      failed!(:webhook_failed, reason: result.error || result.status_code) unless result.success
      { statusCode: result.status_code }
    end

    # ── Automação da conversa ────────────────────────────
    def execute_toggle_automation(action, card)
      chat = card.chat
      failed!(:card_without_chat) unless chat

      case action[:automation_status]
      when "disabled"
        chat.disable_automation_to(action[:disable_period] || "hours", action[:disable_time] || 1)
      when "enabled"
        chat.update(automation_enabled: true)
      end
      nil
    end

    # ── Código ───────────────────────────────────────────
    # O script não roda aqui: vai para a fila `scripts`, em processo próprio. O resultado entra na
    # execução que `CodeRunnerJob` registra.
    def execute_run_code(index, card, board, context, trigger)
      CodeRunnerJob.perform_later(trigger.id, index, card.id, board.organization_id, context.to_json)
      { enqueued: true }
    end

    # ── Apoio ────────────────────────────────────────────
    def find_connector!(connector_id, board)
      connector = connector_id.present? ? Connector::Base.scoped(board.organization_id, connector_id) : nil
      connector || failed!(:connector_not_found)
    end

    def resolve_chat!(action, card, connector)
      chat = case action[:target] || "card_contact"
      when "card_contact" then card.chat
      when "specific" then chat_for_phone(action[:specific_phone], connector)
      end

      chat || failed!(:card_without_chat)
    end

    def chat_for_phone(phone, connector)
      digits = phone.to_s.gsub(/\D/, "")
      return nil if digits.blank?

      Chats::Locator.find_or_create(connector: connector, phone: digits, attributes: { user_name: digits })
    end

    # Uma passada só: trocar token por token, como na origem, deixava um título com "{{card.description}}"
    # ser expandido de novo, e backslash no valor virava referência de grupo no `gsub`.
    def render_message(template, card, board)
      return "" if template.blank?

      template.to_s.gsub(/\{\{\s*([^{}]+?)\s*\}\}/) do |token|
        value = token_value(Regexp.last_match(1), card, board)
        value.nil? ? token : value.to_s
      end
    end

    def token_value(name, card, board)
      case name
      when "card.title" then card.title
      when "card.description" then card.description
      when "card.priority" then card.priority
      when "card.due_date" then card.due_date&.strftime("%d/%m/%Y").to_s
      when "card.deal_value" then card.deal_value
      when "card.company_name" then card.company_name
      when "card.contact_email" then card.contact_email
      when "card.contact_phone" then card.contact_phone
      when "card.tags" then Array(card.tags).join(", ")
      when "card.labels" then card.labels.map(&:name).join(", ")
      when "card.assigned_to", "card.assigned_to_name" then card.assigned_to&.name.to_s
      when "card.assigned_to_id" then card.assigned_to_id.to_s
      when "board.name" then board.name
      when "stage.name" then card.stage&.name.to_s
      else custom_field_token(name, card, board)
      end
    end

    # Pela `key` do campo, como está no card, ou pelo nome de exibição: {{card.custom_field.<key|nome>}}.
    def custom_field_token(name, card, board)
      return nil unless name.start_with?("card.custom_field.")

      reference = name.delete_prefix("card.custom_field.")
      values = card.custom_field_values
      return values[reference].to_s if values.key?(reference)

      definition = custom_fields_of(board).find { |field| field.name == reference || field.key == reference }
      definition ? values[definition.key].to_s : ""
    end

    def custom_fields_of(board)
      @custom_fields_of ||= {}
      @custom_fields_of[board.id] ||= board.custom_fields.to_a
    end

    # O `description_json` do card novo, preservando formatação: expande {{card.description}} com os
    # nós ricos do card de origem e converte o resto do modelo, com os tokens já trocados, em parágrafos.
    def build_description_json(template, card, board)
      source_nodes = source_description_nodes(card)
      segments = template.to_s.split("{{card.description}}", -1)

      content = []
      segments.each_with_index do |segment, index|
        content.concat(text_to_tiptap_nodes(render_message(segment, card, board)))
        content.concat(source_nodes.map(&:deep_dup)) if index < segments.size - 1
      end

      content = [ { "type" => "paragraph" } ] if content.empty?
      { "type" => "doc", "content" => content }
    end

    # Cai para o texto puro quando o card não tem descrição rica (criado por API ou outro gatilho).
    def source_description_nodes(card)
      doc = card.description_json
      return doc["content"] if doc.is_a?(Hash) && doc["content"].is_a?(Array)

      text_to_tiptap_nodes(card.description.to_s)
    end

    def text_to_tiptap_nodes(text)
      return [] if text.to_s.empty?

      text.split("\n", -1).map do |line|
        if line.empty?
          { "type" => "paragraph" }
        else
          { "type" => "paragraph", "content" => [ { "type" => "text", "text" => line } ] }
        end
      end
    end

    # ── Criar card em outro quadro ───────────────────────
    def execute_create_card(action, card, board)
      target_board = board.organization.pipeline_boards.find_by(id: action[:target_board_id].to_s)
      failed!(:board_not_found) unless target_board

      target_stage = if action[:target_stage_id].present?
        target_board.stages.find_by(id: action[:target_stage_id].to_s)
      else
        target_board.stages.first
      end
      failed!(:stage_not_found) unless target_stage

      new_card = Card.new(new_card_attributes(action, card, board).merge(stage: target_stage))
      new_card.suppress_trigger_evaluation = true
      new_card.suppress_broadcast = true

      Card.transaction do
        new_card.save!
        assign_new_card_labels(new_card, action, card, board)
      end

      # Um evento só, depois das etiquetas: a tela de quem está no outro quadro vê o card pronto.
      PipelineBoardChannel.broadcast_card_event(
        target_board, assignee_id: new_card.assigned_to_id, event: "card_created", data: new_card.reload.broadcast_json
      )

      { cardId: new_card.id }
    end

    def new_card_attributes(action, card, board)
      attributes = {
        title: render_message(action[:card_title_template].presence || "{{card.title}}", card, board),
        # O texto puro sai daqui, em `Card#sync_description_text`.
        description_json: build_description_json(action[:card_description_template].presence || "", card, board)
      }

      if truthy?(action[:card_inherit_assigned])
        attributes[:assigned_to_id] = card.assigned_to_id
      elsif action[:card_assigned_to_id].present?
        attributes[:assigned_to_id] = action[:card_assigned_to_id]
      end

      attributes[:priority] = action[:card_priority] if action[:card_priority].present?
      attributes[:color_label] = action[:card_color_label] if action[:card_color_label].present?
      attributes[:tags] = Array(action[:card_tags]) if action[:card_tags].present?

      { deal_value: :card_deal_value_template, company_name: :card_company_name_template,
        contact_email: :card_contact_email_template, contact_phone: :card_contact_phone_template }.each do |attribute, key|
        attributes[attribute] = render_message(action[key], card, board) if action[key].present?
      end
      attributes[:deal_value] = attributes[:deal_value].to_f if attributes.key?(:deal_value)

      if action[:card_due_date_offset].present?
        attributes[:due_date] = (card.due_date || Time.current) + action[:card_due_date_offset].to_i.days
      end

      if action[:card_custom_field_values].is_a?(Hash)
        attributes[:custom_field_values] = action[:card_custom_field_values].to_h do |key, value|
          [ key.to_s, render_message(value.to_s, card, board) ]
        end
      end

      attributes
    end

    def assign_new_card_labels(new_card, action, card, board)
      if truthy?(action[:card_inherit_labels])
        new_card.sync_labels!(card.card_labels.pluck(:label_id))
      elsif action[:card_label_ids].present?
        new_card.sync_labels!(action[:card_label_ids])
      end
    end

    def truthy?(value)
      [ true, "true" ].include?(value)
    end

    def watcher_and_assigned_ids(card)
      ids = card.watchers.pluck(:account_id)
      ids << card.assigned_to_id if card.assigned_to_id.present?
      ids.uniq.compact
    end

    def finish(trigger, card, outcomes)
      failures = outcomes.select { |outcome| outcome[:status] == "failure" }
      log_execution(trigger, card, outcomes, failures)
      report_alert(trigger, card, failures)
    end

    def log_execution(trigger, card, outcomes, failures)
      TriggerExecution.create!(
        trigger: trigger,
        card: card,
        status: failures.any? ? "failure" : "success",
        executed_actions: outcomes,
        error_message: failures.filter_map { |outcome| outcome[:error] }.join("; ").presence&.truncate(MAX_STORED_ERROR),
        executed_at: Time.current
      )
    rescue StandardError => e
      Rails.logger.error("[Pipelines::TriggerJob] registro da execução: #{e.class}: #{e.message}")
    end

    # Falhou: fica um alerta no menu, um por gatilho, até uma execução dar certo. Sem isso, o erro só
    # apareceria para quem abrisse o histórico do quadro.
    def report_alert(trigger, card, failures)
      organization = trigger.board.organization

      if failures.any?
        raise_organization_alert!(
          organization: organization,
          category: "pipelines",
          origin_type: "PipelineTrigger",
          origin_id: trigger.id,
          origin_name: trigger.name,
          code: ALERT_CODE,
          severity: "warning",
          metadata: { board_id: trigger.board_id, card_id: card.id }
        )
      else
        resolve_organization_alert!(organization: organization, origin_type: "PipelineTrigger", origin_id: trigger.id, code: ALERT_CODE)
      end
    rescue StandardError => e
      Rails.logger.error("[Pipelines::TriggerJob] alerta: #{e.class}: #{e.message}")
    end

    def broadcast_card_final_state(card)
      card.reload
      PipelineBoardChannel.broadcast_card_event(card.board, assignee_id: card.assigned_to_id, event: "card_updated", data: card.broadcast_json)
    end
  end
end

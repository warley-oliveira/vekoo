# frozen_string_literal: true

module Copilot
  # O funil no copiloto. Exige `funnel`, conferido em `ToolExecutor#dispatch`, e conta só as conversas que
  # a pessoa pode ver. Na origem era por assistente; aqui são os funis da organização.
  module FunnelTools
    private

    # Pela última mensagem, como a análise de funil da origem: quem está em movimento no período. Em
    # `/dashboard` é pela criação da conversa.
    def tool_get_chat_funnel(args)
      from = parse_date(args["date_from"])&.beginning_of_day || 30.days.ago.beginning_of_day
      to = parse_date(args["date_to"])&.end_of_day || current_time
      funnels = organization.funnels.includes(:stages).order(:name, :id).to_a

      {
        period: { from: format_time(from), to: format_time(to) },
        funnels: ChatFunnel.analyze(visible_chats, funnels, from: from, to: to, date_field: "last_message_at").map { |entry| funnel_summary(entry) }
      }
    end

    def funnel_summary(entry)
      {
        funnel_id: entry[:funnel].id,
        name: entry[:funnel].name,
        total: entry[:total],
        steps: entry[:stages].map do |stage|
          {
            step: stage[:name],
            currently_in_step: stage[:count],
            reached_step: stage[:reached],
            rate_from_first_step: stage[:conversion_rate],
            rate_from_previous_step: stage[:step_rate],
            drop_off_from_previous_step: stage[:drop_off]
          }
        end
      }
    end
  end
end

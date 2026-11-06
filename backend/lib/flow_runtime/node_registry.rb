module FlowRuntime
  # A lista final dos blocos: é contrato com a definição salva e com o editor, documentada inteira em
  # docs/migration/api/automation.md (uma spec confere as duas). Fica numa tabela só, e não registrada no fim de
  # cada arquivo como na origem, para o catálogo não depender da ordem em que as classes carregam.
  #
  # Os nomes seguem o vocabulário daqui: `assign_team`, `finalize_chat`, `pipeline_*`. Sem migração de dados não existe
  # definição antiga para respeitar, e o `recycle.rb` deixaria metade de cada jeito.
  class NodeRegistry
    class UnknownNodeType < StandardError; end

    CATALOG = {
      "trigger" => {
        "trigger_message_received" => "Trigger",
        "trigger_first_message" => "Trigger",
        "trigger_keyword" => "Trigger",
        "trigger_contact_created" => "Trigger",
        "trigger_human_handoff" => "Trigger",
        "trigger_manual" => "Trigger",
        "trigger_webhook" => "Trigger"
      },
      "message" => {
        "send_text" => "SendText",
        "send_media" => "SendMedia",
        "send_template" => "SendTemplate",
        "send_interactive" => "SendInteractive",
        "ask_question" => "AskQuestion"
      },
      "ai" => {
        "ai_assistant" => "AiAssistant",
        "ai_sentiment" => "AiSentiment",
        "ai_intent_classification" => "AiIntentClassification",
        "ai_parameter_extractor" => "AiParameterExtractor",
        "ai_audio_transcription" => "AiAudioTranscription"
      },
      "logic" => {
        "condition" => "Condition",
        "switch" => "Switch",
        "wait" => "Wait",
        "wait_for_message" => "WaitForMessage",
        "set_variable" => "SetVariable",
        "loop" => "Loop"
      },
      "action" => {
        "add_tag" => "AddTag",
        "remove_tag" => "RemoveTag",
        "set_custom_attribute" => "SetCustomAttribute",
        "assign_agent" => "AssignAgent",
        "assign_team" => "AssignTeam",
        "transfer_to_human" => "TransferToHuman",
        "finalize_chat" => "FinalizeChat",
        "pause_automation" => "AutomationStatus",
        "resume_automation" => "AutomationStatus",
        "set_funnel_stage" => "SetFunnelStage"
      },
      "pipeline" => {
        "pipeline_create_card" => "PipelineCreateCard",
        "pipeline_move_card" => "PipelineMoveCard",
        "pipeline_update_card" => "PipelineUpdateCard",
        "pipeline_set_custom_field" => "PipelineSetCustomField",
        "pipeline_mark_won" => "PipelineMarkWon",
        "pipeline_mark_lost" => "PipelineMarkLost",
        "pipeline_reopen_deal" => "PipelineReopenDeal",
        "pipeline_add_label" => "PipelineAddLabel",
        "pipeline_remove_label" => "PipelineRemoveLabel",
        "pipeline_add_comment" => "PipelineAddComment",
        "pipeline_add_checklist" => "PipelineAddChecklist",
        "pipeline_archive_card" => "PipelineArchiveCard",
        "pipeline_create_deal" => "PipelineCreateDeal",
        "pipeline_update_deal" => "PipelineUpdateDeal"
      },
      "integration" => {
        "http_request" => "HttpRequest",
        "execute_tool" => "ExecuteTool",
        "goto_flow" => "GotoFlow",
        "catalog_search" => "CatalogSearch"
      },
      "flow_control" => {
        "end" => "EndFlow"
      }
    }.freeze

    NODES = CATALOG.values.reduce(:merge).freeze

    class << self
      def for(type)
        name = NODES[type.to_s]
        raise UnknownNodeType, "Unknown node type: #{type}" unless name

        Nodes.const_get(name)
      end

      def known?(type)
        NODES.key?(type.to_s)
      end

      def types
        NODES.keys
      end

      def category_of(type)
        CATALOG.find { |_, nodes| nodes.key?(type.to_s) }&.first
      end
    end
  end
end

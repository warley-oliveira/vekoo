# frozen_string_literal: true

module Copilot
  # As ferramentas do copiloto, no formato da API da Anthropic, e a conferência da entrada.
  #
  # Só as que têm base no que já existe. Agendamentos, funil e consumo de IA entram quando os domínios
  # deles estiverem aqui (ver docs/migration/api/inbox.md).
  #
  # `eager_input_streaming`: a entrada chega em fluxo, sem o servidor esperar nem validar. Em troca,
  # quem confere somos nós (`validation_error`), antes de rodar qualquer coisa.
  module Tools
    module_function

    def definitions
      @definitions ||= DEFINITIONS.map { |tool| tool.merge(eager_input_streaming: true) }.freeze
    end

    def names
      @names ||= DEFINITIONS.map { |tool| tool[:name] }.freeze
    end

    # @return [String, nil] o que está errado na entrada, para voltar ao modelo como erro
    def validation_error(name, input)
      tool = DEFINITIONS.find { |candidate| candidate[:name] == name }
      return I18n.t("inbox.copilot.unknown_tool") if tool.nil?
      return "A entrada não é um objeto JSON válido." unless input.is_a?(Hash)

      schema_error(tool[:input_schema], input, "")
    end

    def schema_error(schema, value, path)
      case schema[:type]
      when "object"
        return "#{path} deveria ser um objeto." unless value.is_a?(Hash)

        Array(schema[:required]).each do |key|
          return "Falta #{path}#{key}." if value[key.to_s].nil?
        end

        schema.fetch(:properties, {}).each do |key, inner|
          next if value[key.to_s].nil?

          error = schema_error(inner, value[key.to_s], "#{path}#{key}.")
          return error if error
        end
        nil
      when "array"
        return "#{path} deveria ser uma lista." unless value.is_a?(Array)

        value.filter_map { |item| schema_error(schema[:items], item, path) if schema[:items] }.first
      when "string"
        return "#{path} deveria ser um texto." unless value.is_a?(String)

        "#{path} deveria ser um destes: #{schema[:enum].join(', ')}." if schema[:enum] && !schema[:enum].include?(value)
      when "integer"
        "#{path} deveria ser um número inteiro." unless value.is_a?(Integer)
      when "boolean"
        "#{path} deveria ser verdadeiro ou falso." unless [ true, false ].include?(value)
      end
    end

    def tool(name, description, properties = {}, required: [])
      {
        name: name,
        description: description,
        input_schema: { type: "object", properties: properties, required: required }
      }
    end

    DATE_FROM = { type: "string", description: "Data inicial (formato YYYY-MM-DD)" }.freeze
    DATE_TO = { type: "string", description: "Data final (formato YYYY-MM-DD)" }.freeze
    CHAT_ID = { type: "string", description: "ID da conversa" }.freeze

    DEFINITIONS = [
      tool(
        "search_chats",
        "Busca conversas por nome do contato, número de telefone, conteúdo da última mensagem, situação ou etiquetas. Retorna lista resumida.",
        {
          chat_id: { type: "string", description: "ID específico da conversa (retorna apenas essa conversa)" },
          query: { type: "string", description: "Texto para buscar (nome, telefone ou conteúdo)" },
          status: { type: "string", enum: %w[open closed], description: "Filtrar por situação" },
          has_tag: { type: "string", description: "Filtrar por nome de uma etiqueta" },
          has_tags: { type: "array", items: { type: "string" }, description: "Filtrar por várias etiquetas (lista de nomes). Use com tag_operator para definir AND/OR." },
          tag_operator: { type: "string", enum: %w[and or], description: "Operador lógico para has_tags: and (todas) ou or (qualquer uma). Padrão: or" },
          assigned_to_me: { type: "boolean", description: "Mostrar apenas conversas atribuídas a mim" },
          assigned_to_user: { type: "string", description: "E-mail do atendente para filtrar as conversas dele. Alternativa a assigned_to_me." },
          limit: { type: "integer", description: "Número máximo de resultados (padrão: 10, máx: 25)" }
        }
      ),
      tool(
        "get_chat_details",
        "Obtém os detalhes de uma conversa, incluindo as últimas mensagens, etiquetas, atributos e situação.",
        { chat_id: CHAT_ID },
        required: %w[chat_id]
      ),
      tool(
        "summarize_chat",
        "Gera um resumo de uma conversa, com os pontos-chave e a situação atual. Aceita critérios de foco para direcionar o resumo.",
        {
          chat_id: CHAT_ID,
          last_n_messages: { type: "integer", description: "Quantidade de mensagens recentes a considerar (padrão: 30, máx: 50)" },
          focus_criteria: { type: "string", description: "Critérios para direcionar o resumo, como \"foco em potencial de venda\". Sempre preencha com os critérios que a pessoa mencionou." }
        },
        required: %w[chat_id]
      ),
      tool("list_tags", "Lista todas as etiquetas da organização."),
      tool(
        "assign_tag",
        "Aplica uma etiqueta a uma conversa. Se a etiqueta não existir, ela é criada.",
        { chat_id: CHAT_ID, tag_name: { type: "string", description: "Nome da etiqueta" } },
        required: %w[chat_id tag_name]
      ),
      tool(
        "remove_tag",
        "Remove uma etiqueta de uma conversa.",
        { chat_id: CHAT_ID, tag_name: { type: "string", description: "Nome da etiqueta" } },
        required: %w[chat_id tag_name]
      ),
      tool(
        "assign_chat",
        "Atribui uma conversa à própria pessoa ou a um colega. Sem assign_to_me nem user_email, tira a atribuição.",
        {
          chat_id: CHAT_ID,
          assign_to_me: { type: "boolean", description: "Se true, atribui a conversa a quem está pedindo" },
          user_email: { type: "string", description: "E-mail do colega que vai receber a conversa" }
        },
        required: %w[chat_id]
      ),
      tool(
        "toggle_automation",
        "Liga ou pausa a automação de uma conversa específica.",
        { chat_id: CHAT_ID, enabled: { type: "boolean", description: "true para ligar, false para pausar" } },
        required: %w[chat_id enabled]
      ),
      tool(
        "find_hot_leads",
        "Encontra as conversas com maior chance de fechar negócio, analisando recência, engajamento e o conteúdo real das conversas. Aceita critérios específicos da pessoa.",
        {
          limit: { type: "integer", description: "Número máximo (padrão: 5, máx: 15)" },
          days_lookback: { type: "integer", description: "Período de análise em dias (padrão: 7)" },
          user_question: { type: "string", description: "A pergunta original e os critérios que a pessoa mencionou, como \"quem tem faturamento acima de 50 mil\"." }
        }
      ),
      tool("close_chat", "Fecha uma conversa.", { chat_id: CHAT_ID }, required: %w[chat_id]),
      tool(
        "send_messages",
        "Envia mensagens de texto para uma ou mais conversas. ATENÇÃO: as mensagens chegam de verdade ao contato e não voltam. " \
        "Só use depois de mostrar a prévia e os destinatários e a pessoa aprovar nesta conversa. Máximo de 50 por vez.",
        {
          messages: {
            type: "array",
            description: "Lista de mensagens a enviar.",
            items: {
              type: "object",
              properties: {
                chat_id: { type: "string", description: "ID da conversa destinatária" },
                message: { type: "string", description: "Texto da mensagem para este contato" }
              },
              required: %w[chat_id message]
            }
          }
        },
        required: %w[messages]
      ),
      tool(
        "qualify_chats",
        "Analisa o conteúdo real das conversas para qualificar contatos com precisão. Detecta conversas de teste, spam e falsos positivos. " \
        "Use sempre que precisar avaliar potencial de venda ou quando perguntarem sobre oportunidades reais. Aceita até 10 conversas.",
        {
          chat_ids: { type: "array", items: { type: "string" }, description: "IDs das conversas a analisar (máx 10)" },
          analysis_context: { type: "string", enum: %w[lead_qualification general_analysis], description: "Contexto da análise (padrão: lead_qualification)" },
          user_question: { type: "string", description: "A pergunta original e os critérios que a pessoa mencionou." }
        },
        required: %w[chat_ids]
      ),
      tool(
        "search_message_content",
        "Pesquisa no texto das mensagens de várias conversas, para achar quem falou de um assunto, produto ou termo. " \
        "Aceita vários termos separados por vírgula: \"marketing, vendas\" traz as que têm um OU outro.",
        {
          query: { type: "string", description: "Termos a buscar, separados por vírgula" },
          date_from: { type: "string", description: "Data inicial (formato YYYY-MM-DD). Padrão: 30 dias atrás." },
          date_to: { type: "string", description: "Data final (formato YYYY-MM-DD). Padrão: hoje." },
          status: { type: "string", enum: %w[open closed], description: "Só conversas nesta situação" },
          limit: { type: "integer", description: "Número máximo de conversas (padrão: 20, máx: 50)" }
        },
        required: %w[query]
      ),
      tool(
        "list_team_members",
        "Lista quem atende na organização: nome, e-mail, departamentos, conversas abertas e total de conversas no período.",
        { date_from: DATE_FROM, date_to: DATE_TO }
      ),
      tool(
        "get_agent_performance",
        "Métricas de um atendente ou de todos: contatos atendidos, mensagens enviadas, conversas abertas e fechadas e tempo médio de resposta.",
        {
          user_email: { type: "string", description: "E-mail do atendente. Sem ele, traz todos." },
          date_from: { type: "string", description: "Data inicial (formato YYYY-MM-DD). Padrão: 30 dias atrás." },
          date_to: { type: "string", description: "Data final (formato YYYY-MM-DD). Padrão: hoje." }
        }
      ),
      tool(
        "get_team_ranking",
        "Ranking do time com uma nota de 0 a 100, que pesa tempo de resposta, volume de conversas e conversas fechadas.",
        {
          date_from: { type: "string", description: "Data inicial (formato YYYY-MM-DD). Padrão: 30 dias atrás." },
          date_to: { type: "string", description: "Data final (formato YYYY-MM-DD). Padrão: hoje." },
          sort_by: { type: "string", enum: %w[score chats response_time], description: "Ordenar por: score (padrão), chats ou response_time" }
        }
      ),
      tool(
        "get_tag_distribution",
        "Quantas conversas há em cada etiqueta, com percentual, e quantas estão sem etiqueta.",
        {
          date_from: DATE_FROM,
          date_to: DATE_TO,
          status: { type: "string", enum: %w[open closed], description: "Filtrar conversas por situação" },
          limit: { type: "integer", description: "Número máximo de etiquetas (padrão: 20, máx: 50)" }
        }
      ),
      tool(
        "get_chat_volume",
        "Volume de conversas: novas por dia, com última atividade por dia, total do período, média diária, abertas e fechadas.",
        {
          date_from: { type: "string", description: "Data inicial (formato YYYY-MM-DD). Padrão: 7 dias atrás." },
          date_to: { type: "string", description: "Data final (formato YYYY-MM-DD). Padrão: hoje." }
        }
      ),
      tool(
        "get_hourly_activity",
        "Conversas novas por hora do dia e os três horários de pico.",
        { days_back: { type: "integer", description: "Número de dias para analisar (padrão: 7, máx: 30)" } }
      )
    ].freeze
  end
end

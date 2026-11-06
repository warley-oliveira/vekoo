##
# app/services/insights/message_authorship.rb
#
# Fragmentos de pipeline compartilhados por todas as métricas que classificam
# mensagens. Centralizado porque as armadilhas abaixo já produziram números
# errados na origem e precisam valer em TODAS as agregações:
#
#   1. `.collection.aggregate` ignora o default_scope de ChatMessage::Base.
#      Mensagens longas gravam 1 doc pai + N spans (`is_span: true`); sem o
#      filtro a mesma mensagem conta N+1 vezes.
#   2. `active` fica nil na maioria dos docs: a condição no modelo é
#      `self.active = true unless active.nil?`. Usar `$ne: false`.
#   3. `role` não distingue automação de pessoa: o operador envia com role
#      'assistant' e message_origin 'frontend'.
#
# Quem manda o quê, sem assistente:
#
#   human       `account_id` presente (operador pela plataforma), ou `role: assistant` com origem
#               'user': a mensagem que saiu do próprio celular e voltou pelo webhook. A origem não
#               contava essa, e aí quem atende pelo aparelho aparecia como se ninguém atendesse.
#   campaign    `campaign_id` presente. Fica à parte: disparo em massa não é atendimento, e contado
#               como automação inflaria "horas economizadas" e "atendidas pela automação".
#   automation  o resto do que sai da plataforma sem pessoa: fluxo, lembrete e sequência da agenda.
#   user        o contato.
#
module Insights
  module MessageAuthorship
    # O horário comercial do card "fora do horário", como na origem. Dia e hora no fuso da organização.
    BUSINESS_START_HOUR = 8
    BUSINESS_END_HOUR = 18

    module_function

    # Guardas do `$match` que reproduzem o default_scope do modelo. Chamada de ferramenta dos blocos
    # de IA não é mensagem: a tela também não mostra.
    def match_guards
      {
        "is_span" => { "$ne" => true },
        "active" => { "$ne" => false },
        "role" => { "$in" => %w[user assistant] },
        "tool_calls" => nil
      }
    end

    # O que a contagem de mensagens lê de cada documento. Inclui `chat_id` e `created_at`: conversa
    # distinta, dia e hora saem daqui.
    def projection
      { "_id" => 0, "chat_id" => 1, "role" => 1, "message_origin" => 1, "account_id" => 1, "campaign_id" => 1, "created_at" => 1 }
    end

    def blank(field)
      { "$eq" => [ { "$ifNull" => [ field, nil ] }, nil ] }
    end

    def present(field)
      { "$ne" => [ { "$ifNull" => [ field, nil ] }, nil ] }
    end

    # Inbound = mensagem do contato. `message_origin` NÃO serve para distinguir:
    # inbound do WhatsApp também chega com origem 'platform' (padrão do campo).
    def inbound_cond(prefix = "$")
      { "$and" => [ { "$eq" => [ "#{prefix}role", "user" ] }, blank("#{prefix}account_id") ] }
    end

    def human_cond(prefix = "$")
      {
        "$or" => [
          present("#{prefix}account_id"),
          { "$and" => [ { "$eq" => [ "#{prefix}role", "assistant" ] }, { "$eq" => [ "#{prefix}message_origin", "user" ] } ] }
        ]
      }
    end

    def campaign_cond(prefix = "$")
      { "$and" => [ { "$eq" => [ "#{prefix}role", "assistant" ] }, blank("#{prefix}account_id"), present("#{prefix}campaign_id") ] }
    end

    def automation_cond(prefix = "$")
      {
        "$and" => [
          { "$eq" => [ "#{prefix}role", "assistant" ] },
          { "$eq" => [ "#{prefix}message_origin", "platform" ] },
          blank("#{prefix}account_id"),
          blank("#{prefix}campaign_id")
        ]
      }
    end

    # Classificação em 'user' | 'automation' | 'campaign' | 'human' | nil.
    # A ordem dos branches importa: quem é pessoa vence, porque o operador também envia com role
    # 'assistant'. Bolhas 'widget_proactive' e 'widget_context' caem no default e são descartadas.
    def kind_switch(prefix = "$")
      {
        "$switch" => {
          "branches" => [
            { "case" => human_cond(prefix), "then" => "human" },
            { "case" => campaign_cond(prefix), "then" => "campaign" },
            { "case" => automation_cond(prefix), "then" => "automation" },
            { "case" => { "$eq" => [ "#{prefix}role", "user" ] }, "then" => "user" }
          ],
          "default" => nil
        }
      }
    end

    # Fim de semana, ou fora do horário comercial, no fuso da organização.
    # `$dayOfWeek`: 1 = domingo, 7 = sábado.
    def out_of_hours_cond(zone_name, field = "$created_at")
      local = { "date" => field, "timezone" => zone_name }

      {
        "$or" => [
          { "$in" => [ { "$dayOfWeek" => local }, [ 1, 7 ] ] },
          { "$lt" => [ { "$hour" => local }, BUSINESS_START_HOUR ] },
          { "$gte" => [ { "$hour" => local }, BUSINESS_END_HOUR ] }
        ]
      }
    end

    # Trunca uma data para o dia no fuso da organização.
    def day_of(field, zone_name)
      { "$dateTrunc" => { "date" => field, "unit" => "day", "timezone" => zone_name } }
    end
  end
end

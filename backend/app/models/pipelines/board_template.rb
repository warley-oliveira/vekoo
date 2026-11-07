module Pipelines
  # Modelo de quadro. Global, sem organização, como na origem.
  #
  # O conteúdo é dado do produto e não semente de exemplo: `db/seeds.rb` só carrega as sementes dos
  # domínios fora de produção, e `db:schema:load` não roda migration. Por isso quem lê chama
  # `ensure_defaults!`, que é idempotente e só escreve quando falta alguma.
  class BoardTemplate < ApplicationRecord
    DEFAULTS = [
      {
        template_key: "vendas",
        name: "Vendas",
        description: "Pipeline de vendas com etapas prontas para acompanhar cada negociação.",
        icon: "hand-coins",
        color: "#4CAF50",
        default_board_type: "crm",
        stages_config: [
          { name: "Prospecção", position: 0, color: "#90CAF9" },
          { name: "Qualificação", position: 1, color: "#CE93D8" },
          { name: "Proposta", position: 2, color: "#FFE082" },
          { name: "Negociação", position: 3, color: "#FFAB91" },
          { name: "Fechado/Ganho", position: 4, color: "#A5D6A7" },
          { name: "Fechado/Perdido", position: 5, color: "#EF9A9A" }
        ],
        custom_fields_config: [
          { name: "Empresa", field_type: "text", required: false },
          { name: "Fonte", field_type: "select", options: %w[Inbound Outbound Indicação Outro] }
        ],
        triggers_config: [
          {
            name: "Avisar ao fechar a venda",
            event_type: "card_moved",
            conditions: { to_stage_name: "Fechado/Ganho" },
            actions: [ { type: "notify", message: "Venda fechada com sucesso!" } ]
          }
        ]
      },
      {
        template_key: "suporte",
        name: "Suporte",
        description: "Acompanhe os pedidos de suporte dos seus clientes, com etapas claras.",
        icon: "headset",
        color: "#2196F3",
        default_board_type: "standard",
        stages_config: [
          { name: "Novo", position: 0, color: "#90CAF9" },
          { name: "Em atendimento", position: 1, color: "#FFE082" },
          { name: "Aguardando cliente", position: 2, color: "#FFAB91" },
          { name: "Resolvido", position: 3, color: "#A5D6A7" },
          { name: "Fechado", position: 4, color: "#B0BEC5" }
        ],
        custom_fields_config: [
          { name: "Categoria", field_type: "select", options: %w[Problema Dúvida Melhoria Reclamação] },
          { name: "Urgência", field_type: "select", options: %w[Baixa Média Alta Crítica] },
          { name: "Canal de origem", field_type: "text", required: false }
        ],
        triggers_config: [
          {
            name: "Avisar de novo pedido",
            event_type: "card_created",
            conditions: {},
            actions: [ { type: "notify", message: "Novo pedido de suporte recebido!" } ]
          }
        ]
      },
      {
        template_key: "lead_scoring",
        name: "Pipeline com pontuação",
        description: "Pipeline com pontuação de contatos. Use um fluxo ou um gatilho com código para somar pontos a cada sinal do contato: resposta no WhatsApp, visita ao site, e-mail aberto.",
        icon: "trending-up",
        color: "#10B981",
        default_board_type: "crm",
        stages_config: [
          { name: "Novos contatos", position: 0, color: "#3B82F6" },
          { name: "Qualificação", position: 1, color: "#F59E0B" },
          { name: "Proposta", position: 2, color: "#10B981" },
          { name: "Fechamento", position: 3, color: "#6366F1" }
        ],
        custom_fields_config: [
          { name: "Lead Score", field_type: "number", default_value: "0", required: false }
        ],
        triggers_config: []
      },
      {
        template_key: "onboarding",
        name: "Onboarding",
        description: "Acompanhe a chegada de cada novo cliente, do cadastro ao acompanhamento.",
        icon: "user-plus",
        color: "#FF9800",
        default_board_type: "standard",
        stages_config: [
          { name: "Cadastro", position: 0, color: "#90CAF9" },
          { name: "Configuração", position: 1, color: "#CE93D8" },
          { name: "Treinamento", position: 2, color: "#FFE082" },
          { name: "Acompanhamento", position: 3, color: "#FFAB91" },
          { name: "Concluído", position: 4, color: "#A5D6A7" }
        ],
        custom_fields_config: [
          { name: "Plano", field_type: "select", options: %w[Básico Profissional Empresa] },
          { name: "Data de início", field_type: "date", required: true },
          { name: "Responsável comercial", field_type: "user", required: false }
        ],
        triggers_config: []
      }
    ].freeze

    validates :name, presence: true
    validates :template_key, presence: true, uniqueness: true
    validates :stages_config, presence: true

    scope :ordered, -> { order(:name) }

    def self.ensure_defaults!
      seed_defaults! if count < DEFAULTS.size
    end

    def self.seed_defaults!
      DEFAULTS.each do |attributes|
        find_or_create_by!(template_key: attributes[:template_key]) do |template|
          template.assign_attributes(attributes.except(:template_key))
        end
      rescue ActiveRecord::RecordNotUnique
        # Dois processos semeando ao mesmo tempo: o modelo já está lá.
        next
      end
    end
  end
end

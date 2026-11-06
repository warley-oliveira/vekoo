# A definição do fluxo: blocos (`nodes`), conexões (`edges`), posição da tela (`viewport`), campos
# coletados (`fields`) e o prompt base (`base_prompt`). É um mapa livre, e o que o editor grava é o que
# o runtime lê: arestas em camelCase (`sourceHandle`) e `data` em snake_case. Catálogo dos blocos em
# docs/migration/api/automation.md.
class FlowVersion < ApplicationRecord
  # Um fluxo real tem dezenas de blocos: 2 MB é folga larga, e sem teto o editor poderia gravar qualquer coisa
  # numa coluna que cada execução lê.
  MAX_DEFINITION_BYTES = 2.megabytes

  belongs_to :flow

  validates :version_number, presence: true, uniqueness: { scope: :flow_id }
  validates :definition, presence: true
  validate :definition_shape

  scope :published, -> { where.not(published_at: nil) }
  scope :drafts, -> { where(published_at: nil) }

  def published?
    published_at.present?
  end

  def nodes
    Array(definition["nodes"])
  end

  def edges
    Array(definition["edges"])
  end

  # Prompt base herdado pelos blocos de IA no modelo principal (ver Nodes::AiBase#system_prompt).
  def base_prompt
    definition["base_prompt"].to_s
  end

  # Campos que o fluxo coleta e grava em cada conversa (`Chat#flow_data`).
  def fields
    Array(definition["fields"])
  end

  def field_keys
    fields.map { |field| field["key"].to_s }.select { |key| FlowRuntime::ChatData.valid_key?(key) }
  end

  def viewport
    definition["viewport"] || {}
  end

  def find_node(id)
    nodes.find { |node| node["id"] == id }
  end

  def outgoing_edges(node_id)
    edges.select { |edge| edge["source"] == node_id }
  end

  def trigger_node
    nodes.find { |node| node["type"].to_s.start_with?("trigger_") }
  end

  # O gatilho que o bloco inicial diz ser, sem o prefixo. É o que vale ao publicar.
  def trigger_type
    type = trigger_node&.dig("type").to_s.delete_prefix("trigger_")
    type if Flow::TRIGGER_TYPES.include?(type)
  end

  # Por onde a execução começa: o bloco depois do gatilho.
  def entry_node_id
    trigger = trigger_node
    return nodes.first&.dig("id") unless trigger

    outgoing_edges(trigger["id"]).first&.dig("target") || trigger["id"]
  end

  private

  def definition_shape
    return errors.add(:definition, :invalid) unless definition.is_a?(Hash)

    errors.add(:definition, :invalid) unless definition.fetch("nodes", []).is_a?(Array) && definition.fetch("edges", []).is_a?(Array)
    errors.add(:definition, :too_large) if definition.to_json.bytesize > MAX_DEFINITION_BYTES
  end
end

# Os quadros de pipeline: quadros, etapas, cards, comentários, checklists, campos, gatilhos, metas e
# filtros salvos. Na origem, "Kanban V2". Tudo em Postgres, como lá.
#
# Vocabulário: na API, nos modelos e nos eventos o nome é `stage`/`stages`. `column` só sobrevive na
# API JS `kanban.*` (`MiniRacerEngine::Workers::Kanban`), que é contrato de quem escreve script.
module Pipelines
  # Modelos daqui usam tabelas `pipeline_*`: Pipelines::Card -> pipeline_cards.
  def self.table_name_prefix = "pipeline_"

  UUID_FORMAT = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

  # O que cabe numa coluna `integer`. Passar disso seria um 500 no INSERT, e não um 422.
  POSITIVE_INTEGER ={ only_integer: true, greater_than: 0, less_than_or_equal_to: 2_147_483_647 }.freeze

  # Arquivo anexado a comentário ou card. É bem menor que o teto dos anexos do chat (100 MB): aqui
  # o arquivo não vai para nenhum provedor, é só apoio ao trabalho do time.
  MAX_UPLOAD_BYTES = 25.megabytes
  MAX_FILES_PER_COMMENT = 10

  def self.uuid?(value)
    UUID_FORMAT.match?(value.to_s)
  end

  # O fuso de quem é dona do quadro. Os relatórios contam por mês, e o `Time.zone` do processo é UTC:
  # um negócio ganho às 22h do dia 30 no Brasil não pode cair no mês seguinte.
  def self.time_zone_for(organization)
    ActiveSupport::TimeZone[organization&.timezone.to_s] || Time.zone
  end
end

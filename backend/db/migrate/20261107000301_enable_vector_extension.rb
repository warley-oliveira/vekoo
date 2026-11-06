# A busca semântica do catálogo guarda os vetores em pgvector. A imagem de
# desenvolvimento (pgvector/pgvector:pg16) já traz a extensão; em produção o
# Postgres precisa tê-la instalada antes desta migration.
class EnableVectorExtension < ActiveRecord::Migration[8.1]
  def change
    enable_extension "vector"
  end
end

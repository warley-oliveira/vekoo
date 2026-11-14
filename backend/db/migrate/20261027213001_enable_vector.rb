# pgvector: o tipo `vector` do embedding do banco de referências. Exige a
# imagem `pgvector/pgvector` no Postgres (docker-compose e accessory do Kamal).
class EnableVector < ActiveRecord::Migration[8.1]
  def change
    enable_extension "vector"
  end
end

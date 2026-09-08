# Uma publicação do Brandcore: o documento inteiro naquele momento e o que
# mudou desde a anterior. Quem publicou fica em `account` (nulo se a conta
# saiu — a versão continua valendo).
class BrandCoreVersion < ApplicationRecord
  belongs_to :brand_core
  belongs_to :account, optional: true

  validates :number, numericality: { greater_than: 0 }, uniqueness: { scope: :brand_core_id }
end

# O identificador público do vínculo (`Account`) na URL do front e no cabeçalho `X-Account`.
# A conta é UUID; o hashid codifica `accounts.number`, uma sequência que nunca sai pela API.
#
# Hashid não é segredo nem autorização: quem decide o acesso é a conferência do vínculo com a
# pessoa da sessão. O sal só evita que a URL conte quantas contas existem. Trocar o sal (ou o
# alfabeto e o tamanho) quebra todo link já guardado, então ele é fixo por ambiente.
Rails.application.config.x.account_hashid = Hashids.new(
  ENV["HASHID_SALT"].presence || "vekoo-accounts",
  8,
  "abcdefghijkmnopqrstuvwxyz23456789"
)

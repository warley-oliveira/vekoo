# Transação do Active Record não desfaz o que foi gravado no Mongo: cada exemplo
# limpa as coleções ao terminar. As specs podem usar `create` em documento Mongoid
# normalmente — o banco é de verdade, como no Postgres.
RSpec.configure do |config|
  config.before(:suite) { Mongoid.purge! }
  config.after { Mongoid.truncate! }
end

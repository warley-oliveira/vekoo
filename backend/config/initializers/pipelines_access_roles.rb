# Os quadros guardam os grupos liberados numa lista de ids, sem chave estrangeira. Apagar um grupo tira
# o id de todos os quadros da organização. Fica aqui, e não em AccessRole, para o domínio de pessoas não
# precisar saber de pipelines. `to_prepare`: em desenvolvimento a classe é recarregada, e a nova nasce
# sem o callback.
Rails.application.config.to_prepare do
  AccessRole.after_destroy { |role| Pipelines::Board.forget_access_role(role) }
end

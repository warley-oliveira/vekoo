class ApplicationJob < ActiveJob::Base
  # O ActiveJob escreve os argumentos no log, e `filter_parameters` não vale ali: o corpo de um webhook,
  # com mensagem e telefone do contato, iria parar no log de produção. Para investigar, há o id do job.
  self.log_arguments = false

  # Automatically retry jobs that encountered a deadlock
  # retry_on ActiveRecord::Deadlocked

  # Most jobs are safe to ignore if the underlying records are no longer available
  # discard_on ActiveJob::DeserializationError
end

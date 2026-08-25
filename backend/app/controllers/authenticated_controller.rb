# Base de tudo que só existe depois de entrar. Cada consulta parte da
# organização da sessão — nunca de `Carousel.find(id)` solto, senão um id
# adivinhado alcançaria o trabalho de outra pessoa.
class AuthenticatedController < ApplicationController
  include Authenticatable
end

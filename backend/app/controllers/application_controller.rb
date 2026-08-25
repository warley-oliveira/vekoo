class ApplicationController < ActionController::API
  # `ActionController::API` não traz `t`/`l` (são do controlador com views) —
  # e a API responde no idioma pedido, então precisa deles.
  include AbstractController::Translation

  include Localizable
  include ErrorRendering
end

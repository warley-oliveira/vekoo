# O saldo de créditos da organização. Consumir é operação do servidor: o
# cliente pede, o servidor decide — é o que impede o saldo de ser "corrigido"
# no navegador.
class CreditsController < AuthenticatedController
  def show
    render json: CreditsSerializer.one(current_organization)
  end

  # POST /credits/consume
  def consume
    amount = params.require(:amount).to_i

    if current_organization.consume_credits(amount)
      render json: CreditsSerializer.one(current_organization)
    else
      render_error(
        status: :unprocessable_entity,
        code: "noCredits",
        message: t("credits.no_credits")
      )
    end
  end
end

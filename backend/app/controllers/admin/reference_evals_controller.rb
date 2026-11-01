# /admin/reference-evals — o teste lado a lado da Fase 3, às cegas.
#
#   GET   /                 as rodadas, com o andamento
#   GET   /:round           os pares da rodada, na ordem sorteada
#   GET   /:round/results   o resultado — só com a rodada inteira avaliada
#   GET   /pairs/:id        um par: o pedido, a marca e as peças de cada lado
#   PATCH /pairs/:id        a avaliação do par
#
# Nenhuma resposta diz que lado tem referência, nem qual par é de controle,
# antes do resultado.
module Admin
  class ReferenceEvalsController < BaseController
    before_action :set_pair, only: %i[pair update_pair]

    def index
      rows = ReferenceEvalPair.group(:round).order(Arel.sql("min(created_at) desc"))
        .pluck(:round, Arel.sql("count(*)"), Arel.sql("count(verdict)"), Arel.sql("min(created_at)"))
      render json: {
        rounds: rows.map { |round, total, decided, created_at|
          { round: round, total: total, decided: decided, createdAt: ApplicationSerializer.epoch_ms(created_at) }
        }
      }
    end

    def show
      pairs = ReferenceEvalPair.in_round(params[:round]).includes(:brand_core).to_a
      return render_not_found if pairs.empty?

      render json: {
        round: params[:round],
        total: pairs.size,
        decided: pairs.count(&:decided?),
        pairs: ReferenceEvalPairSerializer.list(pairs)
      }
    end

    def results
      render json: { round: params[:round], **References::Eval::Results.call(params[:round]) }
    rescue References::Eval::Results::Incomplete
      render_error(status: :conflict, code: "evalIncomplete")
    end

    def pair
      render json: ReferenceEvalPairSerializer.one(@pair)
    end

    def update_pair
      input = params.require(:pair).permit(:verdict, :usableLeft, :usableRight, :notes, reasons: [], copiedSides: [])
      @pair.assign_attributes(
        verdict: input[:verdict].presence,
        usable_left: input[:usableLeft].presence&.to_i,
        usable_right: input[:usableRight].presence&.to_i,
        reasons: input[:reasons],
        copied_sides: input[:copiedSides],
        notes: input[:notes].to_s.strip.presence
      )
      @pair.decided_by = current_account
      @pair.decided_at = @pair.verdict ? Time.current : nil
      return render_invalid(@pair) unless @pair.save

      render json: ReferenceEvalPairSerializer.one(@pair)
    end

    private

    def set_pair
      @pair = ReferenceEvalPair.find_by(id: params[:id]) or render_not_found
    end
  end
end

module References
  module Eval
    # O resultado de uma rodada do teste lado a lado, com a regra de decisão
    # fixada antes de olhar (spec, "Fase 3 — plano aprovado"):
    #
    #   - liga se "com referência" vence ≥ 60% dos pares sem empate, o
    #     "postaria sem mexer" não cai e nenhuma peça com referência parece
    #     cópia;
    #   - entre 50% e 60%, ajusta e roda uma 2ª rodada com pedidos novos;
    #   - abaixo de 50%, não liga.
    #
    # Os pares de controle (sem × sem) ficam de fora da conta e medem o ruído:
    # preferência forte entre dois lados iguais quer dizer que o efeito precisa
    # ser maior que isso para valer.
    #
    # Só sai com a rodada inteira avaliada — antes, a tela não pode saber que
    # lado era qual.
    class Results
      ON = 0.6
      ADJUST = 0.5

      class Incomplete < StandardError; end

      def self.call(round) = new(round).call

      def initialize(round)
        @pairs = ReferenceEvalPair.in_round(round).includes(:brand_core).to_a
      end

      def call
        raise Incomplete if @pairs.empty? || @pairs.any? { |pair| !pair.decided? }

        main = @pairs.reject(&:control)
        controls = @pairs.select(&:control)
        summary = tally(main)
        {
          pairs: @pairs.size,
          main: summary,
          inBank: tally(main.select { |pair| in_bank?(pair) }),
          outOfBank: tally(main.reject { |pair| in_bank?(pair) }),
          controls: {
            pairs: controls.size,
            ties: controls.count { |pair| pair.verdict == "tie" },
            # Quantos controles tiveram um lado escolhido — dois lados iguais
            # deveriam empatar.
            preferred: controls.count { |pair| pair.verdict != "tie" }
          },
          copied: {
            references: main.sum { |pair| copied(pair, "references") },
            plain: main.sum { |pair| copied(pair, "plain") }
          },
          followed: followed(main),
          costMicroUsd: cost(main),
          decision: decision(summary, main)
        }
      end

      private

      def tally(pairs)
        wins = pairs.count { |pair| pair.winner == "references" }
        losses = pairs.count { |pair| pair.winner == "plain" }
        decided = wins + losses
        {
          pairs: pairs.size,
          referencesWins: wins,
          plainWins: losses,
          ties: pairs.count { |pair| pair.winner == "tie" },
          winRate: decided.zero? ? nil : (wins.to_f / decided).round(3),
          usable: {
            references: average(pairs.map { |pair| usable(pair, "references") }),
            plain: average(pairs.map { |pair| usable(pair, "plain") })
          }
        }
      end

      def usable(pair, arm)
        pair.left_arm == arm ? pair.usable_left : pair.usable_right
      end

      def copied(pair, arm)
        pair.copied_sides.count { |side| pair.arm(side) == arm }
      end

      def average(values)
        values = values.compact
        values.empty? ? nil : (values.sum.to_f / values.size).round(2)
      end

      # Nicho com card no banco: é aí que a busca tem padrão do próprio ramo.
      def in_bank?(pair)
        @in_bank ||= {}
        niche = pair.brand_core.generation_niche
        @in_bank[niche] = ReferenceCard.published.where(niche: niche).count >= References::Retriever::MIN_NICHE_CARDS unless @in_bank.key?(niche)
        @in_bank[niche]
      end

      # Das peças com referência, quantas seguiram um padrão.
      def followed(pairs)
        ids = pairs.flat_map { |pair| pair.piece_ids(pair.left_arm == "references" ? "left" : "right") }
        pieces = Piece.where(id: ids)
        { pieces: pieces.count, withReference: pieces.where("cardinality(reference_ids) > 0").count }
      end

      def cost(pairs)
        sides = pairs.flat_map { |pair| [ [ pair.left_arm, pair.left_cost_micro_usd ], [ pair.right_arm, pair.right_cost_micro_usd ] ] }
        sides.group_by(&:first).transform_values { |list| (list.sum(&:last).to_f / list.size).round }
      end

      def decision(summary, pairs)
        rate = summary[:winRate]
        return "noSignal" if rate.nil?

        usable = summary[:usable]
        holds = usable[:references].to_f >= usable[:plain].to_f
        clean = pairs.sum { |pair| copied(pair, "references") }.zero?
        if rate >= ON && holds && clean then "turnOn"
        elsif rate >= ADJUST then "adjust"
        else "keepOff"
        end
      end
    end
  end
end

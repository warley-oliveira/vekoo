module References
  module Eval
    # Uma rodada do teste lado a lado: cada pedido gerado duas vezes na marca de
    # teste — com os padrões de referência (`references`) e sem (`plain`) —,
    # mesmo modelo, ferramenta de foto desligada nos dois lados. Os lados de
    # cada par são sorteados e a ordem dos pares também; `CONTROLS` pedidos
    # ganham um par a mais, sem × sem, escondido no meio, para medir quanto o
    # modelo varia sozinho.
    #
    # Cada geração é um turno de verdade (`Agent::Run`), numa conversa da marca
    # de teste, sem cobrar crédito. As imagens chegam depois, pelo Sidekiq.
    class Run
      CONTROLS = 4
      THREADS = 3

      # `pairs`: os pares criados; `skipped`: pedidos sem par (marca que não
      # existe, ou um dos lados não entregou peça — pergunta ou falha).
      Result = Struct.new(:pairs, :skipped, :cost_micro_usd, keyword_init: true)

      Request = Struct.new(:key, :brand, :text, :objective, keyword_init: true)

      # `requests`: [{ "key", "brand", "text", "objective" }] — os pedidos da
      # página do teste, já com cortes e trocas aplicados.
      def initialize(round:, requests:, account:, controls: CONTROLS, seed: nil, log: ->(_line) { }, generate: nil)
        @round = round.to_s
        @requests = requests.map { |raw| Request.new(**raw.to_h.symbolize_keys.slice(:key, :brand, :text, :objective)) }
        @account = account
        @controls = controls
        @random = Random.new(seed || Zlib.crc32("reference-eval-#{@round}"))
        @log = log
        @generate = generate || ->(turn, mode) { Agent::Run.new(turn, references: mode, image_tool: false).call }
      end

      def call
        raise ArgumentError, "a rodada #{@round} já existe" if ReferenceEvalPair.where(round: @round).exists?

        brands = Brands.all
        skipped = []
        runnable = @requests.select { |request|
          next true if brands[request.brand]

          skipped << "#{request.key}: marca '#{request.brand}' não existe — rode references:eval:brands"
          false
        }
        controls = runnable.sample(@controls, random: @random).map(&:key)
        jobs = runnable.flat_map { |request|
          arms = %w[references plain]
          arms << "control" if controls.include?(request.key)
          arms.map { |arm| [ request, arm ] }
        }

        outputs = generate_all(jobs, brands)
        pairs = []
        runnable.each do |request|
          refs, plain, control = %w[references plain control].map { |arm| outputs[[ request.key, arm ]] }
          if [ refs, plain ].any? { |side| side.nil? || side[:piece_ids].empty? }
            skipped << "#{request.key}: um dos lados não entregou peça (#{[ refs, plain ].map { |side| side&.dig(:status) || 'erro' }.join(' / ')})"
            next
          end
          pairs << build(request, brands[request.brand], refs.merge(arm: "references"), plain.merge(arm: "plain"), control: false)
          if control && control[:piece_ids].any?
            pairs << build(request, brands[request.brand], plain.merge(arm: "plain"), control.merge(arm: "plain"), control: true)
          end
        end

        save(pairs)
        Result.new(pairs: pairs, skipped: skipped, cost_micro_usd: outputs.values.sum { |output| output[:cost] })
      end

      private

      # Os turnos, `THREADS` de cada vez: são dezenas de chamadas de 30–60 s.
      def generate_all(jobs, brands)
        queue = Queue.new
        jobs.each { |job| queue << job }
        outputs = {}
        lock = Mutex.new
        Array.new([ THREADS, jobs.size ].min) {
          Thread.new do
            Rails.application.executor.wrap do
              while (job = (queue.pop(true) rescue nil))
                request, arm = job
                output = generate_one(request, brands[request.brand], arm)
                lock.synchronize { outputs[[ request.key, arm ]] = output }
              end
            end
          end
        }.each(&:join)
        outputs
      end

      def generate_one(request, brand, arm)
        conversation = brand.agent_conversations.create!(
          organization: brand.organization, account: @account, title: "[teste #{@round}] #{request.key} · #{arm}"
        )
        turn = conversation.turns.create!(
          organization: brand.organization, account: @account, kind: "create", prompt: request.text, credits_charged: 0
        )
        @generate.call(turn, arm == "references" ? "on" : "off")
        turn.reload
        @log.call("#{request.key} · #{arm}: #{turn.status}, #{turn.pieces.count} peças")
        { status: turn.status, piece_ids: turn.pieces.order(:created_at).pluck(:id), cost: turn.cost_micro_usd.to_i }
      rescue StandardError => e
        @log.call("#{request.key} · #{arm}: falhou — #{e.class}: #{e.message.to_s.first(160)}")
        { status: "erro", piece_ids: [], cost: 0 }
      end

      # Os lados sorteados: o braço nunca fica sempre do mesmo lado.
      def build(request, brand, first, second, control:)
        left, right = @random.rand < 0.5 ? [ first, second ] : [ second, first ]
        ReferenceEvalPair.new(
          round: @round, brand_core: brand, request_key: request.key, request_text: request.text,
          objective: request.objective, control: control,
          left_arm: left[:arm], right_arm: right[:arm],
          left_piece_ids: left[:piece_ids], right_piece_ids: right[:piece_ids],
          left_cost_micro_usd: left[:cost], right_cost_micro_usd: right[:cost]
        )
      end

      # A ordem também é sorteada: os controles ficam no meio dos outros.
      def save(pairs)
        ReferenceEvalPair.transaction do
          pairs.shuffle(random: @random).each_with_index { |pair, index| pair.update!(position: index + 1) }
        end
      end
    end
  end
end

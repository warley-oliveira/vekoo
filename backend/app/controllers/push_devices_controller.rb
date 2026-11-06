# As assinaturas de Web Push de quem está logado. Tudo parte da conta da sessão: a origem
# aceitava `user_email` no corpo, o que deixaria assinar ou testar em nome de outra pessoa.
class PushDevicesController < PlatformController
  def index
    records, meta = paginate(current_account.push_devices.order(created_at: :desc))

    render json: { pushDevices: PushDeviceSerializer.many(records), meta: meta }
  end

  # POST /push-devices { subscription: <PushSubscription.toJSON() do navegador> }
  def create
    device = PushDevice.register!(
      account: current_account,
      endpoint: subscription[:endpoint],
      p256dh_key: subscription.dig(:keys, :p256dh),
      auth_key: subscription.dig(:keys, :auth),
      user_agent: request.user_agent
    )

    render json: PushDeviceSerializer.one(device), status: :created
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end

  def destroy
    current_account.push_devices.find(params[:id]).destroy!
    head :no_content
  end

  # DELETE /push-devices?endpoint= — o navegador conhece a própria assinatura pelo
  # endpoint, não pelo id. Sem endpoint, remove todas as da pessoa.
  def destroy_by_endpoint
    devices = current_account.push_devices
    devices = devices.where(endpoint: params[:endpoint].to_s) if params[:endpoint].present?
    devices.destroy_all

    head :no_content
  end

  # A chave é pública por definição. `null` quer dizer que o push não está configurado, e a
  # tela deve esconder a opção.
  def vapid_public_key
    render json: { publicKey: Push::Delivery.public_key }
  end

  # 202: a entrega roda em job, então o sucesso aqui é "foi para a fila".
  def test
    result = Push::Delivery.send_notification(
      current_account,
      params[:title].presence&.to_s || t("push.test_title"),
      params[:body].presence&.to_s || t("push.test_body"),
      url: params[:url].presence&.to_s,
      tag: "test",
      actions: [ { action: "view", title: t("push.test_action") } ]
    )

    if result[:success]
      render json: { enqueued: result[:enqueued] }, status: :accepted
    else
      render_error(status: :unprocessable_content, code: TEST_REFUSALS.fetch(result[:error]))
    end
  end

  TEST_REFUSALS = { "notConfigured" => "pushNotConfigured", "noDevices" => "noPushDevices" }.freeze
  private_constant :TEST_REFUSALS

  private

  def subscription
    @subscription ||= params.expect(subscription: [ :endpoint, { keys: %i[p256dh auth] } ])
  end
end

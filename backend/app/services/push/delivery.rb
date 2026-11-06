module Push
  # Web Push com VAPID. A entrega roda em job, um por dispositivo: assim uma assinatura
  # com problema não atrasa as outras, e a nova tentativa alcança só quem falhou, sem
  # repetir a notificação em quem já recebeu.
  #
  #   Push::Delivery.send_notification(account, "Novo agendamento", "Com Ana, às 14h", url: "/calendar")
  #
  # Chaves por ENV: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT. Sem elas, loga e
  # não falha: notificação é um extra, e não pode derrubar quem a pediu.
  class Delivery
    # O limite do serviço de push fica em torno de 4 KB, já contando a criptografia.
    BODY_LIMIT = 500
    VIBRATE = [ 200, 100, 200 ].freeze
    TIMEOUTS = { open_timeout: 5, read_timeout: 10, ssl_timeout: 5 }.freeze

    class << self
      def configured?
        vapid_keys.values.all?(&:present?)
      end

      def public_key
        ENV["VAPID_PUBLIC_KEY"].presence
      end

      # `recipient` é a `Account` ou o e-mail dela (o e-mail é único no produto, e é
      # assim que o código reciclado da origem chama).
      def send_notification(recipient, title, body, options = {})
        return not_configured unless configured?

        devices = devices_of(recipient)
        return { success: false, error: "noDevices" } if devices.empty?

        payload = build_payload(title, body, options).as_json
        devices.each { |device| Push::DeliveryJob.perform_later(device.id, payload) }

        { success: true, enqueued: devices.size }
      end

      # Entrega para um dispositivo. Erro passageiro (429, 5xx, rede) sobe de propósito:
      # é o job que decide tentar de novo.
      def deliver(device, payload)
        return not_configured unless configured?
        return { success: false, error: "revoked" } if device.account.revoked?

        response = WebPush.payload_send(
          message: payload.to_json,
          endpoint: device.endpoint,
          p256dh: device.p256dh_key,
          auth: device.auth_key,
          vapid: vapid_keys,
          **TIMEOUTS
        )

        { success: true, response_code: response.code }
      rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription => e
        # 410 e 404: o navegador desfez a assinatura, e ela nunca mais volta a valer.
        device.destroy!
        Rails.logger.info("[Push] assinatura #{device.id} removida (#{e.class.name.demodulize})")
        { success: false, error: "expired" }
      rescue WebPush::Unauthorized, WebPush::PayloadTooLarge => e
        # Tentar de novo daria o mesmo erro.
        Rails.logger.error("[Push] dispositivo #{device.id}: #{e.class.name.demodulize}")
        { success: false, error: e.class.name.demodulize.camelize(:lower) }
      end

      private

      def devices_of(recipient)
        accounts = recipient.is_a?(Account) ? Account.where(id: recipient.id) : Account.where(email: recipient.to_s.strip.downcase)

        # Revogado não recebe: a assinatura fica, para o caso de o acesso voltar.
        PushDevice.where(account_id: accounts.active.select(:id)).to_a
      end

      def not_configured
        Rails.logger.warn("[Push] VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ou VAPID_SUBJECT ausente: nada foi enviado")
        { success: false, error: "notConfigured" }
      end

      def vapid_keys
        {
          subject: ENV["VAPID_SUBJECT"].presence,
          public_key: ENV["VAPID_PUBLIC_KEY"].presence,
          private_key: ENV["VAPID_PRIVATE_KEY"].presence
        }
      end

      # Mesmo formato que o `sw-push.js` lê. Sem ícone aqui, vale o padrão do service
      # worker: quem sabe quais arquivos o front publica é o front.
      def build_payload(title, body, options)
        {
          title: title,
          body: body.to_s.truncate(BODY_LIMIT),
          icon: options[:icon],
          badge: options[:badge],
          image: options[:image],
          tag: options[:tag] || "default",
          data: { url: options[:url], timestamp: Time.current.to_i, **(options[:data] || {}) }.compact,
          actions: options[:actions] || [],
          requireInteraction: options[:require_interaction] || false,
          silent: options[:silent] || false,
          vibrate: options[:vibrate] || VIBRATE
        }.compact
      end
    end
  end
end

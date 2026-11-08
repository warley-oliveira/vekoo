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

      # `recipient` é a `Account` (o vínculo: o aviso é de uma organização), o `User` (o teste do
      # próprio aparelho) ou o e-mail, como o código reciclado da origem chama. O link do aviso
      # ganha o prefixo do vínculo de quem recebe (`AccountLink`), para abrir na organização certa.
      def send_notification(recipient, title, body, options = {})
        return not_configured unless configured?

        account = recipient_account(recipient)
        devices = devices_of(recipient, account)
        return { success: false, error: "noDevices" } if devices.empty?

        if account
          options = options.merge(url: AccountLink.path(account, options[:url]),
            actions: AccountLink.actions(account, options[:actions]))
        end
        payload = build_payload(title, body, options).as_json
        devices.each { |device| Push::DeliveryJob.perform_later(device.id, payload) }

        { success: true, enqueued: devices.size }
      end

      # Entrega para um dispositivo. Erro passageiro (429, 5xx, rede) sobe de propósito:
      # é o job que decide tentar de novo.
      def deliver(device, payload)
        return not_configured unless configured?
        return { success: false, error: "revoked" } if device.user.locked_out?

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

      def recipient_account(recipient)
        case recipient
        when Account then recipient
        when User then nil
        else Account.for_email(recipient)
        end
      end

      # Vínculo revogado não recebe: a assinatura fica, para o caso de o acesso voltar. O vínculo
      # de suporte também não: ninguém está "de plantão" como suporte.
      def devices_of(recipient, account)
        return PushDevice.where(user_id: recipient.id).to_a if recipient.is_a?(User)
        return [] if account.nil? || account.revoked? || account.support?

        PushDevice.where(user_id: account.user_id).to_a
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

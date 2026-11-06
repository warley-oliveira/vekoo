module Push
  # Entrega um Web Push para um dispositivo. O id, e não o registro: o dispositivo pode
  # ter sido removido entre enfileirar e rodar, e aí não há o que entregar.
  class DeliveryJob < ApplicationJob
    queue_as :default

    TRANSIENT_ERRORS = [
      WebPush::TooManyRequests,
      WebPush::PushServiceError,
      Net::OpenTimeout,
      Net::ReadTimeout,
      SocketError,
      SystemCallError,
      OpenSSL::SSL::SSLError
    ].freeze

    # O bloco encerra sem erro depois da última tentativa: push perdido é registrado, mas
    # não vai para a fila de mortos, porque não há nada para alguém reprocessar à mão.
    retry_on(*TRANSIENT_ERRORS, wait: :polynomially_longer, attempts: 5) do |job, error|
      Rails.logger.warn("[Push] desisti do dispositivo #{job.arguments.first}: #{error.class}")
    end

    def perform(device_id, payload)
      device = PushDevice.includes(:account).find_by(id: device_id)
      return unless device

      Push::Delivery.deliver(device, payload)
    end
  end
end

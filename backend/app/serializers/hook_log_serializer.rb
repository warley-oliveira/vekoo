# Corpo, cabeçalhos e query saem como chegaram: as chaves são de quem chamou.
class HookLogSerializer < ApplicationSerializer
  def self.one(log)
    {
      id: log.id.to_s,
      webhookId: log.hook_id,
      webhookUid: log.hook_uid,
      webhookName: log.hook_name,
      requestMethod: log.request_method,
      requestHeaders: log.request_headers,
      requestBody: log.request_body,
      requestQuery: log.request_query,
      requestIp: log.request_ip,
      status: log.status,
      statusCode: log.status_code,
      errorMessage: log.error_message,
      processingTimeMs: log.processing_time_ms,
      webhookStatus: log.hook_status,
      createdAt: epoch_ms(log.created_at)
    }
  end
end

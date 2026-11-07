# Lightweight throttling + input validation helpers shared by every endpoint
# under Api::Widget. Counters live in Rails.cache (Redis in dev/prod, null in
# tests) and expire automatically per period. We deliberately avoid adding a
# Rack::Attack dependency: the surface here is small and the buckets are
# scoped per endpoint, so an inline counter keeps the code obvious.
#
# Defense layers wired up by this concern, in addition to the JWT visitor
# session already enforced by Api::Widget::BaseController:
#
#  - per-IP throttling on every public endpoint (defends against bots
#    bombarding a customer site)
#  - per-public-token throttling on session creation (cap the number of
#    sessions a single widget can mint)
#  - format validation on visitor_id, public_token, name, phone, email and
#    message content (defends against enumeration / oversized payloads)
module WidgetThrottling
  extend ActiveSupport::Concern

  # === Throttling ==========================================================

  # Public token format: "pk_widget_<urlsafe id>". Length is bounded mostly to
  # keep payloads sane — the real defense is the exact-match lookup in Mongo
  # (collisions on a 24-byte SecureRandom are not a real concern).
  PUBLIC_TOKEN_REGEX = /\Apk_widget_[A-Za-z0-9_-]{4,80}\z/

  # Visitor id must look like a UUID v4 produced by the widget. We accept any
  # 8..64 char string of url-safe characters too, in case a future revision
  # of the widget changes the format — but reject anything that contains
  # path separators, whitespace or BSON-injection markers.
  VISITOR_ID_REGEX = /\A[A-Za-z0-9_-]{8,64}\z/

  # Hard upper bounds for body fields so a single request can't blow the
  # log line / Mongo document. Re-validated even when the model has its own
  # validations because some payloads never reach the model (rejected early).
  MAX_NAME_LENGTH    = 80
  MAX_PHONE_LENGTH   = 24
  MAX_EMAIL_LENGTH   = 120
  MAX_CONTENT_LENGTH = 4_000

  # Throttles a request and renders 429 when the bucket is full. Returns
  # `true` when the caller should keep going, `false` when 429 was rendered.
  #
  #   throttle!(scope: 'widget:session:ip', limit: 30, period: 1.minute, key: ip)
  def throttle!(scope:, limit:, period:, key:)
    return true if Rails.env.test? && !ENV["WIDGET_THROTTLE_TESTS"]
    return true if key.blank? || limit.to_i <= 0

    cache_key = "throttle:#{scope}:#{key}"
    count = Rails.cache.increment(cache_key, 1, expires_in: period, raw: true)
    if count.nil?
      Rails.cache.write(cache_key, 1, expires_in: period, raw: true)
      count = 1
    end

    if count.to_i > limit
      render_error(status: :too_many_requests, code: "rateLimited", details: { retryAfter: period.to_i })
      return false
    end
    true
  end

  # Increments a counter without rendering anything. Useful for windowed
  # quotas (e.g. messages-per-day) that need a custom rejection path.
  def counter_increment(scope:, period:, key:)
    cache_key = "counter:#{scope}:#{key}"
    count = Rails.cache.increment(cache_key, 1, expires_in: period, raw: true)
    if count.nil?
      Rails.cache.write(cache_key, 1, expires_in: period, raw: true)
      count = 1
    end
    count.to_i
  end

  def counter_read(scope:, key:)
    Rails.cache.read("counter:#{scope}:#{key}", raw: true).to_i
  end

  # === Input validation ====================================================

  def valid_public_token?(token)
    token.is_a?(String) && PUBLIC_TOKEN_REGEX.match?(token)
  end

  def valid_visitor_id?(visitor_id)
    visitor_id.is_a?(String) && VISITOR_ID_REGEX.match?(visitor_id)
  end

  def truncate_field(value, limit)
    return nil if value.nil?

    str = value.to_s
    str.length > limit ? str.first(limit) : str
  end
end

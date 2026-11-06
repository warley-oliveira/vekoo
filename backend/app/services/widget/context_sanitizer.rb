module Widget
  # Single write-gate for host-page context coming from the widget
  # (POST /api/widget/v1/messages and PUT /api/widget/v1/context).
  #
  # Everything here is attacker-controlled input that ends up in Mongo and in
  # LLM prompts: keys are whitelisted per section (which also neutralizes
  # $/dot Mongo operator keys), values are clipped, control characters are
  # stripped, `"""` prompt delimiters are collapsed, URLs must be http(s) and
  # the optional identity HMAC is verified against the connector secret.
  #
  # Output: plain Hash with String keys and sections page/product/visitor/
  # events, each stamped with a server-side captured_at. Returns nil when
  # nothing usable remains. Raises ContextTooLargeError for oversized input.
  class ContextSanitizer
    class ContextTooLargeError < StandardError; end

    MAX_SERIALIZED_BYTES = 8 * 1024

    LIMITS = {
      url: 500,
      title: 200,
      name: 200,
      description: 1_000,
      priceish: 50,
      sku: 100,
      email: 200,
      phone: 50,
      external_id: 100,
      extra_keys: 10,
      extra_key: 40,
      extra_value: 200,
      events: 10,
      event_name: 60,
      event_at: 40
    }.freeze

    CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.freeze

    def initialize(raw, connector:)
      @raw = raw
      @connector = connector
    end

    def perform
      input = normalize_input(@raw)
      return nil if input.blank?

      raise ContextTooLargeError if input.to_json.bytesize > MAX_SERIALIZED_BYTES

      {
        'page' => input['page'].is_a?(Hash) ? sanitize_page(input['page']) : nil,
        'product' => input['product'].is_a?(Hash) ? sanitize_product(input['product']) : nil,
        'visitor' => input['visitor'].is_a?(Hash) ? sanitize_visitor(input['visitor']) : nil,
        'events' => input['events'].is_a?(Array) ? sanitize_events(input['events']) : nil
      }.compact.presence
    end

    private

    attr_reader :connector

    def normalize_input(raw)
      hash = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw
      return nil unless hash.is_a?(Hash)

      hash.deep_stringify_keys
    end

    def sanitize_page(page)
      stamped(
        'url' => http_url(page['url']),
        'title' => clean_text(page['title'], LIMITS[:title]),
        'referrer' => clean_text(page['referrer'], LIMITS[:url])
      )
    end

    def sanitize_product(product)
      stamped(
        'name' => clean_text(product['name'], LIMITS[:name]),
        'price' => clean_text(product['price'], LIMITS[:priceish]),
        'currency' => clean_text(product['currency'], LIMITS[:priceish]),
        'url' => http_url(product['url']),
        'image_url' => http_url(product['image_url']),
        'description' => clean_text(product['description'], LIMITS[:description]),
        'sku' => clean_text(product['sku'], LIMITS[:sku]),
        'extra' => sanitize_pairs(product['extra'])
      )
    end

    def sanitize_visitor(visitor)
      external_id = clean_text(visitor['external_id'], LIMITS[:external_id])
      data = {
        'external_id' => external_id,
        'name' => clean_text(visitor['name'], LIMITS[:name]),
        'email' => clean_text(visitor['email'], LIMITS[:email]),
        'phone' => clean_text(visitor['phone'], LIMITS[:phone])
      }.compact
      return nil if data.empty?

      data['verified'] = verified_identity?(external_id, visitor['hash'])
      data.merge('captured_at' => Time.current.iso8601)
    end

    def sanitize_events(events)
      events.first(LIMITS[:events]).filter_map do |event|
        next unless event.is_a?(Hash)

        event = event.deep_stringify_keys
        name = clean_text(event['name'], LIMITS[:event_name])
        next if name.blank?

        entry = {
          'name' => name,
          'at' => clean_text(event['at'], LIMITS[:event_at]) || Time.current.iso8601
        }
        props = sanitize_pairs(event['props'])
        entry['props'] = props if props.present?
        entry
      end.presence
    end

    def sanitize_pairs(pairs)
      return nil unless pairs.is_a?(Hash)

      out = {}
      pairs.each do |key, value|
        break if out.size >= LIMITS[:extra_keys]

        clean_key = clean_text(key, LIMITS[:extra_key])
        clean_value = clean_text(value, LIMITS[:extra_value])
        out[clean_key] = clean_value if clean_key.present? && clean_value.present?
      end
      out.presence
    end

    def clean_text(value, limit)
      return nil unless value.is_a?(String) || value.is_a?(Numeric)

      value.to_s
           .gsub(CONTROL_CHARS, '')
           .gsub('"""', '"')
           .strip
           .presence
           &.slice(0, limit)
    end

    def http_url(value)
      str = clean_text(value, LIMITS[:url])
      return nil if str.blank?

      uri = URI.parse(str)
      uri.is_a?(URI::HTTP) ? str : nil
    rescue URI::InvalidURIError
      nil
    end

    # Identity verification à la Intercom: the customer's backend computes
    # HMAC-SHA256(signing_secret, external_id) and the page sends it as `hash`.
    # Without a valid hash the identity is stored but flagged unverified and
    # never merged into contact data.
    def verified_identity?(external_id, hash)
      return false if external_id.blank? || connector&.signing_secret.blank?

      provided = hash.to_s.downcase
      return false unless provided.match?(/\A[0-9a-f]{64}\z/)

      expected = OpenSSL::HMAC.hexdigest('SHA256', connector.signing_secret, external_id)
      ActiveSupport::SecurityUtils.secure_compare(expected, provided)
    end

    # Drops the section entirely when no data survived sanitization; otherwise
    # stamps it with the server clock (never trusted from the client).
    def stamped(data)
      cleaned = data.compact
      return nil if cleaned.empty?

      cleaned.merge('captured_at' => Time.current.iso8601)
    end
  end
end

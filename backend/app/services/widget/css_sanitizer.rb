module Widget
  # Sanitizes the raw custom CSS a organization owner sets for their web widget.
  #
  # The CSS is injected into the widget's Shadow DOM via a <style> element's
  # text content, so it cannot leak to the host page and cannot break out of
  # the <style> tag. The owner is authenticated (admin panel), so this is a
  # semi-trusted input — the goal here is to strip constructs that load or
  # execute external/active content, not to fully parse CSS.
  #
  # Removed: @import (external stylesheet loading), expression()/-moz-binding/
  # behavior: (legacy IE scripting), javascript: URLs, and any </...> that
  # could confuse the injection point. url() to http(s)/data images is kept —
  # it's the owner styling their own widget.
  class CssSanitizer
    MAX_LENGTH = Connector::WebWidget::MAX_CUSTOM_CSS

    CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.freeze

    DANGEROUS = [
      /@import\b/i,
      /expression\s*\(/i,
      /-moz-binding\b/i,
      /\bbehavior\s*:/i,
      /javascript\s*:/i,
      %r{</[^>]*>?}
    ].freeze

    def self.call(css)
      new(css).call
    end

    def initialize(css)
      @css = css
    end

    def call
      return '' if @css.blank?

      cleaned = @css.to_s.gsub(CONTROL_CHARS, '')
      DANGEROUS.each { |pattern| cleaned = cleaned.gsub(pattern, '') }
      cleaned.strip.slice(0, MAX_LENGTH).to_s
    end
  end
end

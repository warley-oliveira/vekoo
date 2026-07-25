# Resolve o idioma da requisição: `?locale=` ganha do header `Accept-Language`,
# e qualquer coisa fora de `available_locales` cai no padrão (pt-BR). O escopo é
# por requisição — `I18n.locale` é global por thread e vazaria entre requests.
module Localizable
  extend ActiveSupport::Concern

  included do
    around_action :switch_locale
  end

  private

  def switch_locale(&)
    I18n.with_locale(requested_locale, &)
  end

  def requested_locale
    from_param = params[:locale].presence
    return from_param if available?(from_param)

    from_header = preferred_locale_from_header
    available?(from_header) ? from_header : I18n.default_locale
  end

  # "pt-BR,pt;q=0.9,en;q=0.8" → primeiro idioma que a API realmente fala.
  def preferred_locale_from_header
    header = request.headers["Accept-Language"].to_s
    header
      .split(",")
      .map { |part| part.split(";").first.to_s.strip }
      .reject(&:empty?)
      .find { |tag| available?(tag) || available?(base_match(tag)) }
      .then { |tag| available?(tag) ? tag : base_match(tag) }
  end

  # "pt" e "pt-PT" viram "pt-BR": o produto só tem essa variante do português.
  def base_match(tag)
    return nil if tag.blank?

    base = tag.split("-").first.downcase
    I18n.available_locales.map(&:to_s).find { |l| l.split("-").first.downcase == base }
  end

  def available?(locale)
    locale.present? && I18n.available_locales.map(&:to_s).include?(locale.to_s)
  end
end

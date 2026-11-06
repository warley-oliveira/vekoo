# Tokens de longa duração do Instagram duram 60 dias. Este job renova os que vencem em
# REFRESH_BEFORE_DAYS; rodando todo dia às 4h sobra folga.
class InstagramTokenRefreshJob < ApplicationJob
  queue_as :default

  REFRESH_BEFORE_DAYS = 7

  def perform
    refreshed = 0
    failed = 0

    connectors_to_refresh.each do |connector|
      if connector.refresh_instagram_token!
        refreshed += 1
      else
        failed += 1
      end
    end

    Rails.logger.info "[InstagramTokenRefreshJob] Done: #{refreshed} refreshed, #{failed} failed"
  end

  private

  def connectors_to_refresh
    Connector::InstagramDirect
      .where(status_cd: "active", auth_provider: "instagram_login")
      .select { |connector| connector.instagram_token_expiring_soon?(days: REFRESH_BEFORE_DAYS) }
  end
end

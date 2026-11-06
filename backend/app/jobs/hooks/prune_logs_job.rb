module Hooks
  # O teto de logs por webhook. A idade já é do índice TTL: isto é para o webhook que recebe milhares por hora, que encheria o Mongo
  # dentro dos 90 dias.
  class PruneLogsJob < ApplicationJob
    queue_as :low

    def perform
      Hook.select(:id, :organization_id).find_each do |hook|
        scope = HookLog.for_organization(hook.organization_id).for_hook(hook.id)
        oldest_kept = scope.recent.skip(HookLog::MAX_PER_HOOK).limit(1).pick(:created_at)
        next unless oldest_kept

        scope.where(:created_at.lte => oldest_kept).delete_all
      end
    end
  end
end

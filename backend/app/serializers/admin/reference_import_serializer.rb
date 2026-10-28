# Um lote de importação como a curadoria o vê: cada conta com o resultado e os
# candidatos já ordenados pelo engajamento relativo. Nada de legenda — não há
# onde ela estar.
module Admin
  class ReferenceImportSerializer < ApplicationSerializer
    def self.one(import)
      summary(import).merge(accounts: import.accounts.map { |account| account(account) })
    end

    def self.summary(import)
      accounts = import.accounts.to_a
      candidates = accounts.flat_map(&:candidates)
      {
        id: import.id,
        niche: import.niche,
        size: import.size,
        handles: accounts.map(&:username),
        running: accounts.any? { |account| account.status.in?(%w[pending running]) },
        counts: {
          accounts: accounts.length,
          errors: accounts.count { |account| account.status == "error" },
          candidates: candidates.length,
          highlighted: candidates.count(&:highlight?),
          carded: candidates.count(&:carded?)
        },
        createdAt: epoch_ms(import.created_at)
      }
    end

    def self.list(imports) = imports.map { |import| summary(import) }

    def self.account(account)
      {
        id: account.id,
        username: account.username,
        status: account.status,
        errorCode: account.error_code,
        retryable: account.retryable?,
        retryAt: epoch_ms(account.retry_at),
        name: account.name,
        followersCount: account.followers_count,
        fetchedCount: account.fetched_count,
        eligibleCount: account.eligible_count,
        baselineMedian: account.baseline_median&.to_f,
        fetchedAt: epoch_ms(account.fetched_at),
        candidates: account.candidates.map { |candidate| candidate(candidate) }
      }
    end

    def self.candidate(candidate)
      {
        id: candidate.id,
        igMediaId: candidate.ig_media_id,
        mediaType: candidate.media_type,
        productType: candidate.product_type,
        format: candidate.reference_format,
        permalink: candidate.permalink,
        previewUrl: candidate.preview_url,
        likeCount: candidate.like_count,
        commentsCount: candidate.comments_count,
        relativeEngagement: candidate.relative_engagement&.to_f,
        highlight: candidate.highlight?,
        postedAt: epoch_ms(candidate.posted_at),
        childrenCount: candidate.children_count,
        partial: candidate.partial,
        status: candidate.status,
        referenceCardId: candidate.reference_card_id
      }
    end
  end
end

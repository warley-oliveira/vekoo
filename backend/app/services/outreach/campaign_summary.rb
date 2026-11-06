module Outreach
  # Os números do topo da lista de campanhas. A origem somava só a página aberta, então o total
  # mudava ao paginar e nada dizia sobre a organização.
  class CampaignSummary
    def initialize(organization)
      @organization = organization
    end

    def as_json(*)
      groups = Campaign.collection.aggregate([
        { "$match" => { organization_id: organization.id.to_s } },
        {
          "$group" => {
            _id: "$status_cd",
            count: { "$sum" => 1 },
            sent: { "$sum" => "$sent_count" },
            delivered: { "$sum" => "$delivered_count" },
            read: { "$sum" => "$read_count" },
            failed: { "$sum" => "$failed_count" }
          }
        }
      ]).to_a

      {
        total: sum(groups, "count"),
        byStatus: Campaign.statuses.index_with { |status| groups.find { |group| group["_id"] == status }&.fetch("count", 0).to_i },
        sent: sum(groups, "sent"),
        delivered: sum(groups, "delivered"),
        read: sum(groups, "read"),
        failed: sum(groups, "failed"),
        openRate: open_rate(groups)
      }
    end

    private

    attr_reader :organization

    def sum(groups, key)
      groups.sum { |group| group[key].to_i }
    end

    def open_rate(groups)
      sent = sum(groups, "sent")
      sent.positive? ? (sum(groups, "read").to_f / sent).round(4) : 0.0
    end
  end
end

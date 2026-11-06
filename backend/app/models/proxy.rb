class Proxy
  include Mongoid::Document
  include Mongoid::Timestamps

  field :url, type: String
  field :organization_id, type: String

  belongs_to :connector, class_name: "Connector::Base", inverse_of: :proxy, optional: true

  index({ connector_id: 1 })
  index({ organization_id: 1 })

  validate :valid_url

  def valid_url
    errors.add(:url, :invalid) unless url.present? && url.match?(URI::DEFAULT_PARSER.make_regexp)
  end
end

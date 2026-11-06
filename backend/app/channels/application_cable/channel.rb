module ApplicationCable
  class Channel < ActionCable::Channel::Base
    private

    def current_organization
      current_account.organization
    end

    # Toda transmissão é escopada pela organização: um id trocado no `subscribe`
    # nunca alcança a stream de outra organização.
    def organization_stream(name)
      self.class.organization_stream(current_organization.id, name)
    end

    def self.organization_stream(organization_id, name)
      "org:#{organization_id}:#{name}"
    end
  end
end

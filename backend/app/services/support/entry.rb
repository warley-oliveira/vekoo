module Support
  # O suporte do Vekoo (ou staff, numa organização interna) entrando numa organização. Devolve o vínculo que a URL vai levar e registra
  # a entrada (`SupportAccess`), sempre.
  #
  # O vínculo de suporte (`support: true`) nasce na primeira entrada e fica: é ele que dá o hashid
  # da URL e o autor das ações ("Suporte Vekoo"). Quem já participa da organização como pessoa
  # entra pelo próprio vínculo, que o suporte faz valer mesmo revogado.
  class Entry
    def self.call(...)
      new(...).call
    end

    # O suporte (`master`) entra em qualquer organização; staff, só nas internas da Vekoo (as das
    # marcas de teste da curadoria).
    def self.allowed?(user, organization)
      return false unless user && organization

      user.master? || (user.staff? && organization.internal?)
    end

    def initialize(user:, organization:, ip_address: nil, user_agent: nil)
      @user = user
      @organization = organization
      @ip_address = ip_address
      @user_agent = user_agent
    end

    def call
      raise ArgumentError, "só o suporte do Vekoo entra assim" unless self.class.allowed?(@user, @organization)

      account = Account.find_by(user_id: @user.id, organization_id: @organization.id) || create_support_account
      SupportAccess.record!(account, ip_address: @ip_address, user_agent: @user_agent)
      account
    end

    private

    def create_support_account
      @organization.support_accounts.create!(user: @user, role: "member")
    rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
      # Duas abas entrando ao mesmo tempo: a outra já criou.
      Account.find_by!(user_id: @user.id, organization_id: @organization.id)
    end
  end
end

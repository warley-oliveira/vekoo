module Support
  # O suporte do Vekoo entrando numa organização. Devolve o vínculo que a URL vai levar e registra
  # a entrada (`SupportAccess`), sempre.
  #
  # O vínculo de suporte (`support: true`) nasce na primeira entrada e fica: é ele que dá o hashid
  # da URL e o autor das ações ("Suporte Vekoo"). Quem já participa da organização como pessoa
  # entra pelo próprio vínculo, que o suporte faz valer mesmo revogado.
  class Entry
    def self.call(...)
      new(...).call
    end

    def initialize(user:, organization:, ip_address: nil, user_agent: nil)
      @user = user
      @organization = organization
      @ip_address = ip_address
      @user_agent = user_agent
    end

    def call
      raise ArgumentError, "só o suporte do Vekoo entra assim" unless @user.master?

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

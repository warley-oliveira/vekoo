module Access
  # As regras de quem pode fazer o quê com as pessoas da organização. A permissão
  # `core_settings` abre a porta (no controlador); aqui fica o que ela não resolve:
  #
  #   - quem não é dono não mexe no dono, nem cria outro dono;
  #   - a organização nunca fica sem um dono com acesso;
  #   - ninguém corta o próprio acesso;
  #   - a própria senha só muda em /profile, onde a senha atual é exigida;
  #   - nome, e-mail, telefone e senha são da pessoa (`User`) e valem em todas as organizações
  #     dela: daqui só mudam enquanto ela não participar de nenhuma outra;
  #   - convidar quem já tem conta no Vekoo cria só o vínculo; remover tira só o vínculo.
  #
  # O lock na organização não é zelo: sem ele, dois donos rebaixando um ao outro ao
  # mesmo tempo passariam os dois pela checagem e a organização ficaria sem dono.
  class ManagePerson
    # 403: a recusa é por causa de quem pede.
    class Denied < StandardError; end

    # 422: a recusa é por causa da regra. `code` é o contrato com a tela.
    class Refused < StandardError
      attr_reader :code, :field

      def initialize(code, field: nil)
        @code = code
        @field = field
        super(code)
      end
    end

    IDENTITY = %w[name email phone password password_confirmation].freeze

    def initialize(actor:)
      @actor = actor
      @organization = actor.organization
    end

    # Quem já tem conta no Vekoo ganha só o vínculo, e entra com a senha que já usa: nome, senha e
    # telefone do pedido são ignorados. Quem não tem nasce aqui, com o que veio.
    def create(attributes, team_ids: nil)
      deny_granting_owner!(attributes)

      attributes = attributes.to_h.stringify_keys
      existing = User.find_by_login(attributes["email"]) if attributes["email"].present?
      account =
        if existing
          raise Refused.new("alreadyMember", field: "email") if existing.accounts.exists?(organization_id: @organization.id)

          @organization.accounts.new(attributes.except(*IDENTITY, "email").merge("user" => existing))
        else
          @organization.accounts.new(attributes)
        end
      account.teams = teams_from(team_ids) unless team_ids.nil?
      account.save!
      account
    rescue ActiveRecord::RecordInvalid => e
      raise taken_email if e.record.errors.of_kind?(:email, :taken)

      raise
    rescue ActiveRecord::RecordNotUnique
      # Dois pedidos com o mesmo e-mail ao mesmo tempo: quem chega depois recebe o
      # mesmo recado de e-mail já cadastrado.
      raise taken_email
    end

    def update(account, attributes, team_ids: nil)
      deny_touching_owner!(account)
      deny_granting_owner!(attributes)

      attributes = drop_blank_password(attributes.to_h.stringify_keys)
      changing_password = attributes.key?("password")
      raise Refused.new("ownPasswordInProfile", field: "password") if changing_password && account == @actor
      teams_before = account.team_ids
      change_identity!(account, attributes.slice(*IDENTITY))

      @organization.with_lock do
        keep_an_owner!(account) if demoting?(account, attributes)

        account.assign_attributes(attributes.except(*IDENTITY))
        account.teams = teams_from(team_ids) unless team_ids.nil?
        account.save!
      end

      # Mesmo tratamento da troca de senha pelo link: quem estava com a senha
      # antiga, seja quem for, precisa entrar de novo.
      account.end_sessions! if changing_password
      # `chat_list_to: team` escuta a stream de cada departamento da pessoa.
      account.reconnect_realtime if account.team_ids.sort != teams_before.sort
      account
    rescue ActiveRecord::RecordInvalid => e
      raise taken_email if e.record.errors.of_kind?(:email, :taken)

      raise
    rescue ActiveRecord::RecordNotUnique
      raise taken_email
    end

    def revoke(account)
      deny_touching_owner!(account)

      @organization.with_lock do
        keep_an_owner!(account) if account.owner?
        raise Refused.new("cannotRevokeSelf") if account == @actor

        account.revoke!
      end
      account
    end

    def restore(account)
      deny_touching_owner!(account)

      account.restore!
      account
    end

    # Tira o vínculo. A pessoa continua existindo, com as outras organizações dela intactas.
    def destroy(account)
      deny_touching_owner!(account)

      @organization.with_lock do
        keep_an_owner!(account) if account.owner?
        raise Refused.new("cannotDeleteSelf") if account == @actor

        account.destroy!
      end
    end

    # Passa a posse: a pessoa escolhida vira dona e quem era dono vira membro, na mesma transação.
    # Só dono faz (o suporte também, sem rebaixar ninguém).
    def transfer_ownership(account)
      raise Denied unless @actor.full_access?
      raise Refused.new("alreadyOwner") if account.owner?
      raise Refused.new("accountRevoked") if account.revoked?

      @organization.with_lock do
        account.update!(role: "owner")
        @actor.update!(role: "member") if @actor.owner? && !@actor.support?
      end
      account
    end

    # Sair da organização: tira o próprio vínculo. O último dono não sai.
    def leave
      raise Refused.new("supportCannotLeave") if @actor.support?

      @organization.with_lock do
        keep_an_owner!(@actor) if @actor.owner?

        @actor.destroy!
      end
    end

    private

    def deny_touching_owner!(account)
      raise Denied if account.owner? && !@actor.full_access?
    end

    def deny_granting_owner!(attributes)
      raise Denied if attributes.to_h.stringify_keys["role"].to_s == "owner" && !@actor.full_access?
    end

    def demoting?(account, attributes)
      account.owner? && attributes.key?("role") && attributes["role"].to_s != "owner"
    end

    # A identidade é da pessoa e vale nas outras organizações dela: quem administra esta não muda
    # o nome, o e-mail ou a senha de quem também está em outra (seria tomar a conta dela lá).
    def change_identity!(account, identity)
      return if identity.empty?

      user = account.user
      user.assign_attributes(identity)
      return unless user.changed?

      return unless user.master? || user.accounts.where.not(id: account.id).exists?

      field = (user.changed & %w[name email phone]).first || "password"
      user.restore_attributes
      raise Refused.new("sharedIdentity", field: field)
    end

    # Dono revogado não conta: ele não consegue entrar para administrar nada.
    def keep_an_owner!(account)
      others = @organization.accounts.active.where(role: "owner").where.not(id: account.id)
      raise Refused.new("lastOwner", field: "role") unless others.exists?
    end

    # Departamento de outra organização nunca entra: um id adivinhado cai aqui.
    def teams_from(team_ids)
      ids = team_ids.uniq
      teams = @organization.teams.where(id: ids).to_a
      raise Refused.new("invalidTeam", field: "teamIds") unless teams.size == ids.size

      teams
    end

    # A tela de edição manda o campo vazio quando ninguém quis trocar a senha.
    def drop_blank_password(attributes)
      return attributes if attributes["password"].present?

      attributes.except("password", "password_confirmation")
    end

    def taken_email
      Refused.new("emailTaken", field: "email")
    end
  end
end

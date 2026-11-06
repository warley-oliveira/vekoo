module MiniRacerEngine::Workers
  # Etiquetas e atribuição da conversa. Tudo resolvido dentro da organização do contexto: um
  # nome ou e-mail de outra organização simplesmente não existe aqui.
  class Tag < MiniRacerEngine::EngineModule
    def register(worker, context, event)
      @worker = worker
      context.attach("tag.add", proc { |*params| attach_method(method(:add_tag), params, event) })
      context.attach("tag.remove", proc { |*params| attach_method(method(:remove_tag), params, event) })
      context.attach("tag.list", proc { |*params| attach_method(method(:list_tags), params, event) })
      context.attach("tag.listUserTags", proc { |*params| attach_method(method(:list_user_tags), params, event) })
      context.attach("tag.userHasTag", proc { |*params| attach_method(method(:user_has_tag), params, event) })
      context.attach("assignedUser", proc { |*params| attach_method(method(:assigned_user), params, event) })
      context.attach("assignUser", proc { |*params| attach_method(method(:assign_user), params, event) })
      context.attach("assignDepartmentByName", proc { |*params|
                                                 attach_method(method(:assign_department_by_name), params, event)
                                               })
      context.attach("assignUserByEmail", proc { |*params|
                                            attach_method(method(:assign_user_by_email), params, event)
                                          })
      context.attach("userList", proc { |*params| attach_method(method(:user_list), params, event) })
    end

    private

    def add_tag(params)
      name = tag_name(params[0])
      conversation = chat

      if conversation.nil? || name.blank?
        Rails.logger.warn "tag.add sem conversa ou sem nome na organização #{organization_id}"
        return { success: false }
      end

      conversation.add_tag!(name)
      { success: true }
    end

    def remove_tag(params)
      conversation = chat

      unless conversation
        Rails.logger.warn "tag.remove sem conversa na organização #{organization_id}"
        return { success: false }
      end

      tag = ChatTag.where(name: tag_name(params[0]), organization_id: conversation.organization_id).take
      return nil unless tag

      conversation.pull(chat_tag_ids: tag.id)
      { success: true }
    end

    def list_user_tags(_params)
      tags_of(require_chat!)
    end

    def user_has_tag(params)
      tags_on(require_chat!).where(name: tag_name(params[0])).exists?
    end

    def list_tags(_params)
      tags_of(require_chat!)
    end

    def assigned_user(_params)
      person = require_organization!.accounts.find_by(id: require_chat!.assigned_account_id)
      person && person_json(person)
    end

    # O nome engana, mas é o contrato: na origem `assignUser` recebe um departamento, igual a
    # `assignDepartmentByName`.
    def assign_user(params)
      assign_department_by_name(params)
    end

    def assign_department_by_name(params)
      department_name = params[0].to_s.parameterize.underscore
      conversation = require_chat!
      departments = require_organization!.teams.map { |team| [ team.name.parameterize.underscore, team.id ] }.to_h

      conversation.team_id = departments[department_name]
      conversation.save!
    end

    # Como na origem, o e-mail que não existe desfaz a atribuição: é assim que um script tira
    # o responsável com `assignUserByEmail(null)`. A origem procurava em todas as contas da
    # plataforma: aqui, só em quem atende nesta organização.
    def assign_user_by_email(params)
      conversation = require_chat!
      conversation.assigned_account_id = attendants.find_by(email: params[0].to_s)&.id
      conversation.save!
    end

    def user_list(_params)
      attendants.map { |person| person_json(person) }
    end

    # Quem pode receber conversa: sem os revogados e sem quem só configura.
    def attendants
      require_organization!.accounts.active.where(setup_only: false)
    end

    def person_json(person)
      { id: person.id, name: person.name, email: person.email }
    end

    def tags_of(conversation)
      tags_on(conversation).map { |tag| { name: tag.name, description: tag.description, color: tag.color } }
    end

    # Pela lista de ids, e não por `chat_tags`: a relação guarda em memória o que leu, e
    # `tag.list(); tag.add("x"); tag.list()` na mesma execução veria a lista velha.
    def tags_on(conversation)
      ChatTag.where(organization_id: conversation.organization_id, :_id.in => conversation.chat_tag_ids)
    end

    def tag_name(value)
      value.to_s.parameterize.dasherize
    end
  end
end

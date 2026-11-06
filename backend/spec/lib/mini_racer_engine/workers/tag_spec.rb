# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Tag do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }

  def run(code, on_chat: chat)
    run_script(code, organization: organization, chat: on_chat)
  end

  describe "tag.add" do
    it "cria a etiqueta na organização e põe na conversa" do
      expect(run("return tag.add('Cliente VIP');")).to eq("success" => true)

      tag = ChatTag.where(organization_id: organization.id, name: "cliente-vip").take
      expect(tag.color).to eq(ChatTag::DEFAULT_COLOR)
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
    end

    it "reaproveita a que existe, sem duplicar" do
      existing = create(:chat_tag, organization_id: organization.id, name: "vip", color: "#123456")

      run("tag.add('VIP'); tag.add('vip');")

      expect(ChatTag.where(organization_id: organization.id).count).to eq(1)
      expect(chat.reload.chat_tag_ids).to eq([ existing.id ])
      expect(existing.reload.color).to eq("#123456")
    end

    it "usa a etiqueta da própria organização, nunca a de mesmo nome de outra" do
      foreign = create(:chat_tag, organization_id: other_organization.id, name: "vip")

      run("tag.add('vip');")

      expect(chat.reload.chat_tag_ids).not_to include(foreign.id)
      expect(ChatTag.where(organization_id: organization.id, name: "vip").exists?).to be(true)
    end

    it "sem conversa, ou sem nome que preste, falha sem criar nada" do
      expect(run_script("return tag.add('x');", organization: organization)).to eq("success" => false)
      expect(run("return tag.add('!!!');")).to eq("success" => false)
      expect(run("return tag.add();")).to eq("success" => false)
      expect(run("return tag.add('x'.repeat(5000));")).to eq("success" => false)
      expect(ChatTag.count).to eq(0)
    end
  end

  describe "tag.remove" do
    it "tira da conversa" do
      run("tag.add('vip');")

      expect(run("return tag.remove('VIP');", on_chat: chat.reload)).to eq("success" => true)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "etiqueta que não existe devolve nulo" do
      expect(run("return tag.remove('nunca-existiu');")).to be_nil
    end

    it "sem conversa, falha" do
      expect(run_script("return tag.remove('x');", organization: organization)).to eq("success" => false)
    end

    it "não tira etiqueta de outra conversa" do
      other = create(:chat, organization: organization)
      run("tag.add('vip');", on_chat: other)

      run("tag.remove('vip');")

      expect(other.reload.chat_tag_ids).not_to be_empty
    end
  end

  describe "tag.list, tag.listUserTags e tag.userHasTag" do
    before { create(:chat_tag, organization_id: organization.id, name: "de-outra-conversa") }

    it "listam só as da conversa, com nome, descrição e cor" do
      run("tag.add('vip');")

      expected = [ { "name" => "vip", "description" => nil, "color" => ChatTag::DEFAULT_COLOR } ]
      expect(run("return tag.list();", on_chat: chat.reload)).to eq(expected)
      expect(run("return tag.listUserTags();", on_chat: chat.reload)).to eq(expected)
    end

    it "enxergam o que acabou de mudar, na mesma execução" do
      result = run(<<~JS)
        const antes = tag.list().length;
        tag.add('vip');
        const depois = tag.list().length;
        const tem = tag.userHasTag('VIP');
        tag.remove('vip');
        return [antes, depois, tem, tag.list().length, tag.userHasTag('vip')];
      JS

      expect(result).to eq([ 0, 1, true, 0, false ])
    end

    it "userHasTag não acha a etiqueta que existe mas não está na conversa" do
      expect(run("return tag.userHasTag('de-outra-conversa');")).to be(false)
    end

    it "sem conversa, diz isso" do
      expect { run_script("return tag.list();", organization: organization) }
        .to raise_error(MiniRacer::RuntimeError, /No chat in context/)
    end
  end

  describe "assignedUser" do
    it "devolve quem atende, só com id, nome e e-mail" do
      person = create(:account, organization: organization, name: "Ana Lima", email: "ana@exemplo.com.br")
      chat.update!(assigned_account_id: person.id)

      expect(run("return assignedUser();")).to eq("id" => person.id, "name" => "Ana Lima", "email" => "ana@exemplo.com.br")
    end

    it "ninguém atribuído é nulo" do
      expect(run("return assignedUser();")).to be_nil
    end

    it "conta de outra organização gravada na conversa não aparece" do
      chat.set(assigned_account_id: create(:account, organization: other_organization).id)

      expect(run("return assignedUser();")).to be_nil
    end
  end

  describe "assignUserByEmail" do
    let!(:person) { create(:account, organization: organization, email: "ana@exemplo.com.br") }

    it "atribui à pessoa da organização, e deixa a nota no histórico" do
      expect { run("return assignUserByEmail('ana@exemplo.com.br');") }
        .to change { ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "assigned-user-notation").count }.by(1)

      expect(chat.reload.assigned_account_id).to eq(person.id)
    end

    it "normaliza o e-mail" do
      run("assignUserByEmail(' ANA@exemplo.com.br ');")

      expect(chat.reload.assigned_account_id).to eq(person.id)
    end

    # A origem procurava em todas as contas da plataforma.
    it "e-mail de outra organização não atribui" do
      create(:account, organization: other_organization, email: "fora@exemplo.com.br")

      run("assignUserByEmail('fora@exemplo.com.br');")

      expect(chat.reload.assigned_account_id).to be_nil
    end

    it "como na origem, e-mail desconhecido ou nulo tira o responsável" do
      chat.update!(assigned_account_id: person.id)

      run("assignUserByEmail(null);", on_chat: chat.reload)

      expect(chat.reload.assigned_account_id).to be_nil
    end

    it "não atribui a quem foi revogado ou só configura" do
      revoked = create(:account, organization: organization, email: "saiu@exemplo.com.br")
      revoked.revoke!
      create(:account, organization: organization, email: "config@exemplo.com.br", setup_only: true)

      run("assignUserByEmail('saiu@exemplo.com.br');")
      expect(chat.reload.assigned_account_id).to be_nil

      run("assignUserByEmail('config@exemplo.com.br');", on_chat: chat.reload)
      expect(chat.reload.assigned_account_id).to be_nil
    end
  end

  describe "assignDepartmentByName e assignUser" do
    let!(:team) { create(:team, organization: organization, name: "Suporte Técnico") }

    it "atribui ao departamento pelo nome, sem ligar para caixa e acento" do
      run("assignDepartmentByName('suporte tecnico');")

      expect(chat.reload.team_id).to eq(team.id)
    end

    # O nome engana: na origem é o contrato, recebe um departamento.
    it "assignUser recebe departamento" do
      run("assignUser('Suporte Técnico');")

      expect(chat.reload.team_id).to eq(team.id)
    end

    it "departamento de outra organização não atribui" do
      create(:team, organization: other_organization, name: "Financeiro")

      run("assignDepartmentByName('Financeiro');")

      expect(chat.reload.team_id).to be_nil
    end

    it "sem organização, diz isso" do
      expect { run_script("assignDepartmentByName('x');", chat: chat) }.to raise_error(MiniRacerEngine::Error)
    end
  end

  describe "userList" do
    it "lista quem atende nesta organização" do
      person = create(:account, organization: organization, name: "Ana Lima", email: "ana@exemplo.com.br")
      create(:account, organization: organization, setup_only: true)
      create(:account, organization: organization).revoke!
      create(:account, organization: other_organization)

      expect(run("return userList();")).to eq([ { "id" => person.id, "name" => "Ana Lima", "email" => "ana@exemplo.com.br" } ])
    end

    it "não entrega nada além de id, nome e e-mail" do
      create(:account, organization: organization)

      expect(run("return Object.keys(userList()[0]).sort();")).to eq(%w[email id name])
    end
  end
end

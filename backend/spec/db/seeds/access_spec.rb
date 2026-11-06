require "rails_helper"

# Roda a semente de ponta a ponta, em cima da conta de demonstração que `db/seeds.rb` cria.
RSpec.describe "db/seeds/access.rb" do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }

  def seed
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/access.rb")
  ensure
    $stdout = original
  end

  before do
    owner
    seed
  end

  it "traz os grupos padrão e um feito pela organização" do
    expect(organization.access_roles.pluck(:name))
      .to contain_exactly("Gerente", "Usuário", "Atendimento por departamento")

    custom = organization.access_roles.find_by!(name: "Atendimento por departamento")
    expect(custom.permissions).to include("chat" => "all", "chat_list_to" => "team", "core_settings" => "none")
    expect(custom.permissions.keys).to match_array(AccessRole::KEYS)
  end

  it "traz 3 departamentos" do
    expect(organization.teams.pluck(:name)).to contain_exactly("Atendimento", "Comercial", "Pós-venda")
  end

  it "traz 5 pessoas além da dona, que entram com a senha da demonstração" do
    people = organization.accounts.where.not(id: owner.id)

    expect(people.count).to eq(5)
    expect(people.pluck(:name)).to contain_exactly(
      "Rafael Nunes", "Camila Rocha", "Thiago Almeida", "Juliana Ferreira", "Beatriz Lima"
    )
    expect(people.pluck(:role).uniq).to eq([ "member" ])
    expect(people).to all(satisfy { |person| person.authenticate("carrossel123") })
  end

  it "liga cada pessoa ao grupo e aos departamentos, e marca quem não atende" do
    thiago = organization.accounts.find_by!(email: "thiago.almeida@exemplo.com.br")
    expect(thiago.access_role.name).to eq("Usuário")
    expect(thiago.teams.pluck(:name)).to contain_exactly("Atendimento", "Pós-venda")
    expect(thiago.setup_only).to be(false)

    beatriz = organization.accounts.find_by!(email: "beatriz.lima@exemplo.com.br")
    expect(beatriz.setup_only).to be(true)
    expect(beatriz.can?(:core_settings)).to be(true)
  end

  it "traz avisos em todas as situações: não lidos, lidos e arquivado" do
    notices = AccountNotice.for_account(owner)

    expect(notices.count).to eq(5)
    expect(notices.visible.unread.count).to eq(2)
    expect(notices.visible.already_read.count).to eq(2)
    expect(notices.archived.count).to eq(1)
    expect(notices.pluck(:category).uniq).to contain_exactly("calendar", "chat", "system", "general")
  end

  it "traz alertas ativos com o texto que a tela mostra" do
    expect(organization.active_alert_badges).to eq("connectors" => 2, "webhooks" => 1)

    expect(organization.organization_alerts.map(&:display_message)).to contain_exactly(
      "A integração \"WhatsApp da loja\" foi desconectada.",
      "Falha na entrega do webhook \"CRM externo\".",
      "A Meta rejeitou o modelo \"confirmacao_agendamento\"."
    )
  end

  it "preenche os dados da empresa" do
    expect(organization.reload).to have_attributes(
      business_name: "Marina Duarte Conteúdo Digital Ltda", formatted_cnpj: "11.222.333/0001-81", valid_cnpj?: true
    )
  end

  it "é idempotente: rodar de novo não duplica nada" do
    expect { seed }
      .to not_change(Account, :count)
      .and not_change(AccessRole, :count)
      .and not_change(Team, :count)
      .and not_change(TeamMembership, :count)
      .and not_change(AccountNotice, :count)
      .and not_change(OrganizationAlert, :count)
  end

  it "rodar de novo não desfaz o que a pessoa mudou por conta própria" do
    rafael = organization.accounts.find_by!(email: "rafael.nunes@exemplo.com.br")
    rafael.update!(password: "senha-trocada-depois")
    notice = AccountNotice.for_account(owner).where(title: "Novo agendamento confirmado").take
    notice.mark_as_read!

    seed

    expect(rafael.reload.authenticate("senha-trocada-depois")).to be_truthy
    expect(notice.reload).to be_read
  end

  it "não toca em nada se a conta de demonstração não existe" do
    owner.update!(email: "outra@exemplo.com.br")

    expect { seed }.not_to change(Account, :count)
  end
end

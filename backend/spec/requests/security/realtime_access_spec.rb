require "rails_helper"

# A permissão é conferida ao assinar o canal, e a conexão guarda a conta (com o grupo já lido) enquanto
# ficar aberta. Sem derrubar, quem perdeu o acesso seguia recebendo as conversas e enviando mensagem pelo
# WebSocket até fechar a aba, e isso era só não fechar a aba.
#
# `reconnect: true` é o caso comum: a conexão cai, o cliente volta sozinho e passa pela conferência de novo.
RSpec.describe "Acesso em tempo real depois de mudar a permissão", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:full_role) { create(:access_role, organization: organization, name: "Atendimento", permissions: AccessRole::MANAGER_PERMISSIONS) }
  let(:blank_role) { create(:access_role, organization: organization, name: "Sem nada", permissions: AccessRole::BLANK_PERMISSIONS) }
  let!(:attendant) { create(:account, organization: organization, role: "member", access_role: full_role, password: "carrossel123") }

  def stream_of(account)
    "action_cable/#{account.to_gid_param}"
  end

  def reconnects(account)
    have_broadcasted_to(stream_of(account)).with(type: "disconnect", reconnect: true)
  end

  describe "PATCH /users/:id" do
    it "trocar o grupo da pessoa derruba o WebSocket dela" do
      expect {
        patch "/users/#{attendant.id}", params: { user: { access_role_id: blank_role.id } }, headers: auth_headers(owner), as: :json
      }.to reconnects(attendant)

      expect(response).to have_http_status(:ok)
    end

    it "promover ou rebaixar também" do
      other_owner = create(:account, organization: organization, role: "owner")

      expect {
        patch "/users/#{other_owner.id}", params: { user: { role: "member" } }, headers: auth_headers(owner), as: :json
      }.to reconnects(other_owner)
    end

    # `chat_list_to: team` escuta a stream de cada departamento da pessoa.
    it "trocar os departamentos também" do
      team = create(:team, organization: organization)

      expect {
        patch "/users/#{attendant.id}", params: { user: { team_ids: [ team.id ] } }, headers: auth_headers(owner), as: :json
      }.to reconnects(attendant)
    end

    it "mudar só o nome não mexe na conexão" do
      expect {
        patch "/users/#{attendant.id}", params: { user: { name: "Outro Nome" } }, headers: auth_headers(owner), as: :json
      }.not_to have_broadcasted_to(stream_of(attendant))
    end
  end

  describe "os grupos de permissão" do
    it "mudar as permissões derruba quem está no grupo" do
      expect {
        patch "/access-roles/#{full_role.id}", params: { access_role: { permissions: { chat: "none" } } }, headers: auth_headers(owner), as: :json
      }.to reconnects(attendant)

      expect(response).to have_http_status(:ok)
    end

    it "só quem está no grupo" do
      other = create(:account, organization: organization, role: "member", access_role: blank_role)

      expect {
        patch "/access-roles/#{full_role.id}", params: { access_role: { permissions: { chat: "none" } } }, headers: auth_headers(owner), as: :json
      }.not_to have_broadcasted_to(stream_of(other))
    end

    it "renomear o grupo não mexe na conexão" do
      expect {
        patch "/access-roles/#{full_role.id}", params: { access_role: { name: "Outro" } }, headers: auth_headers(owner), as: :json
      }.not_to have_broadcasted_to(stream_of(attendant))
    end

    it "apagar o grupo derruba quem estava nele: agora vale o padrão de membro" do
      expect {
        delete "/access-roles/#{full_role.id}", headers: auth_headers(owner), as: :json
      }.to reconnects(attendant)

      expect(response).to have_http_status(:no_content)
      expect(attendant.reload.access_role_id).to be_nil
    end
  end

  describe "DELETE /teams/:id" do
    it "derruba quem estava no departamento" do
      team = create(:team, organization: organization)
      attendant.teams << team

      expect {
        delete "/teams/#{team.id}", headers: auth_headers(owner), as: :json
      }.to reconnects(attendant)
    end
  end

  describe "a sessão acabou" do
    it "trocar a senha pelo link derruba o WebSocket e não deixa voltar" do
      reset = PasswordReset.open!(attendant)

      expect {
        patch "/password-resets/#{reset.token}", params: { passwordReset: { password: "senha-nova-123" } }, as: :json
      }.to have_broadcasted_to(stream_of(attendant)).with(type: "disconnect", reconnect: false)

      expect(response).to have_http_status(:no_content)
    end

    # Era o que ficava de pé depois de "esqueci a senha" num aparelho roubado: o outro pedido aberto.
    it "trocar a senha pelo link invalida os outros pedidos abertos" do
      first = PasswordReset.open!(attendant)
      other = PasswordReset.open!(attendant)

      patch "/password-resets/#{first.token}", params: { passwordReset: { password: "senha-nova-123" } }, as: :json
      patch "/password-resets/#{other.token}", params: { passwordReset: { password: "outra-senha-123" } }, as: :json

      expect(response).to have_http_status(:not_found)
      expect(attendant.reload.authenticate("senha-nova-123")).to be_truthy
    end

    # A conta é a chave da conexão, e não a sessão: cai tudo, e só quem tem token que vale consegue voltar.
    it "trocar a própria senha derruba o WebSocket que ficou aberto em outro aparelho" do
      expect {
        patch "/profile",
          params: { profile: { current_password: "carrossel123", password: "senha-nova-123", password_confirmation: "senha-nova-123" } },
          headers: auth_headers(attendant), as: :json
      }.to reconnects(attendant)

      expect(response).to have_http_status(:ok)
    end

    it "sair derruba o WebSocket daquela sessão" do
      expect {
        delete "/logout", headers: auth_headers(attendant), as: :json
      }.to reconnects(attendant)

      expect(response).to have_http_status(:no_content)
    end
  end

  describe "ao reconectar" do
    include ActionCable::Channel::TestCase::Behavior

    tests ChatListChannel

    it "quem perdeu `chat` é recusado, porque a conta é lida de novo" do
      attendant.update!(access_role: blank_role)
      stub_connection(current_account: Account.find(attendant.id))

      subscribe

      expect(subscription).to be_rejected
    end
  end
end

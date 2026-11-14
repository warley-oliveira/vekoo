# A pessoa da sessão: identidade, que vale em todas as organizações. `master` é só leitura: diz à
# tela se mostra a área de suporte. Nada na API escreve nele.
class UserSerializer < ApplicationSerializer
  def self.one(user)
    {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      avatarUrl: StoredImagePath.for(user.avatar, :thumb),
      master: user.master?,
      # Pessoa da Vekoo: a tela mostra a curadoria (`/admin`), que a API confere de novo.
      staff: user.staff?,
      createdAt: epoch_ms(user.created_at)
    }
  end
end

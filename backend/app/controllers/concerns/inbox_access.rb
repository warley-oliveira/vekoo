# O que os controladores do domínio inbox têm em comum: mais de uma permissão que libera a
# mesma rota, e a conversa que a pessoa pode ver.
module InboxAccess
  extend ActiveSupport::Concern

  class_methods do
    # Libera se a pessoa tem qualquer uma das chaves: uma mensagem rápida interessa a quem
    # atende (`chat`) e a quem configura (`core_settings`).
    def require_any_permission(*keys, **options)
      before_action(**options) do
        render_forbidden unless keys.any? { |key| current_account.can?(key) }
      end
    end
  end

  private

  # A conversa, se a pessoa pode vê-la (`chat_list_to`). Fora disso é 404, nunca 403: não
  # conta que a conversa existe.
  def visible_chats
    Chat.visible_to(current_account)
  end

  def find_visible_chat(id)
    return nil if id.blank?

    visible_chats.where(id: id.to_s).take
  end

  def organization_time_zone
    ActiveSupport::TimeZone[current_organization.timezone.to_s] || Time.zone
  end
end

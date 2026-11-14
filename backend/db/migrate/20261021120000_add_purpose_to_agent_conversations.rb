# O onboarding virou conversa e mora na mesma tabela da criação de peças.
# `purpose` separa as duas: a de criação é andaime e some em 30 dias; a de
# onboarding é a história de como a marca foi montada e só existe uma por
# marca.
class AddPurposeToAgentConversations < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_conversations, :purpose, :string, null: false, default: "create"
    add_index :agent_conversations, :brand_core_id, unique: true,
      where: "purpose = 'onboarding'", name: "index_agent_conversations_one_onboarding_per_brand"
  end
end

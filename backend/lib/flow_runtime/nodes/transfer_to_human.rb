module FlowRuntime
  module Nodes
    # Pausa a automação pelo período da organização e, se configurado, passa para um departamento ou pessoa. É isso que
    # dispara os fluxos de `trigger_human_handoff` (ver ChatRelations::Automation).
    class TransferToHuman < Base
      def call
        return skip("no_chat") unless chat

        attributes = {}
        team = own_team(data["team_id"])
        account = own_account(data["account_id"])
        attributes[:team_id] = team.id if team
        attributes[:assigned_account_id] = account.id if account

        chat.update(attributes) if attributes.any?
        chat.pause_automation_for_human!

        continue(default_next_node_id, log: { input: data, output: { transferred: true, attributes: attributes } })
      end
    end
  end
end

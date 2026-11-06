module FlowRuntime
  module Nodes
    class AssignTeam < Base
      def call
        return skip("no_chat") unless chat
        return skip("no_team") if data["team_id"].blank?

        team = own_team(data["team_id"])
        return skip("team_not_found") unless team

        chat.update(team_id: team.id)
        continue(default_next_node_id, log: { input: data, output: { team_id: team.id } })
      end
    end
  end
end

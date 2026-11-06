module FlowRuntime
  module Nodes
    class AssignAgent < Base
      def call
        return skip("no_chat") unless chat

        account = own_account(data["account_id"]) || pick_from_pool
        return skip("no_account") unless account

        chat.update(assigned_account_id: account.id)
        continue(default_next_node_id, log: { input: data, output: { assigned_account_id: account.id } })
      end

      private

      def pick_from_pool
        pool = Array(data["account_pool"]).compact_blank
        return nil if pool.empty?

        organization.accounts.active.where(id: pool).order(Arel.sql("RANDOM()")).first
      end
    end
  end
end

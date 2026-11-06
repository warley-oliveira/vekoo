module FlowRuntime
  module Nodes
    class RemoveTag < Base
      def call
        return skip("no_chat") unless chat
        return skip("no_tag_id") if data["tag_id"].blank? && data["tag_name"].blank?

        tag = find_tag
        return skip("tag_not_found") unless tag

        chat.pull(chat_tag_ids: tag.id)
        chat.dispatch_event!
        continue(default_next_node_id, log: { input: data, output: { removed: tag.name } })
      end

      private

      def find_tag
        return organization.chat_tags.where(id: data["tag_id"]).take if data["tag_id"].present?

        organization.chat_tags.where(name: interpolate(data["tag_name"].to_s).parameterize.dasherize).take
      end
    end
  end
end

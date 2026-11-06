module FlowRuntime
  module Nodes
    # Pelo `tag_id` da organização ou, em `tag_name`, pelo nome, criando se preciso (é o que um modelo de fluxo consegue
    # dizer, já que não conhece os ids de ninguém).
    class AddTag < Base
      def call
        return skip("no_chat") unless chat
        return by_name if data["tag_id"].blank? && data["tag_name"].present?
        return skip("no_tag_id") if data["tag_id"].blank?

        tag = organization.chat_tags.where(id: data["tag_id"]).take
        return skip("tag_not_found") unless tag

        chat.add_to_set(chat_tag_ids: tag.id) unless chat.chat_tag_ids.include?(tag.id)
        done(tag)
      end

      private

      def by_name
        done(chat.add_tag!(interpolate(data["tag_name"].to_s)))
      end

      def done(tag)
        chat.dispatch_event!
        continue(default_next_node_id, log: { input: data, output: { tag: tag.name } })
      end
    end
  end
end

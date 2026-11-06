class FlowTemplateSerializer < ApplicationSerializer
  def self.one(template)
    {
      slug: template.slug,
      name: template.name,
      description: template.description,
      category: template.category,
      triggerType: template.trigger_type,
      tags: template.tags,
      thumbnailUrl: template.thumbnail_url,
      definition: template.definition
    }
  end
end

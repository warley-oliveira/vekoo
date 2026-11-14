# "Por que funciona" deixa de ser um texto e vira quatro campos: o mecanismo
# deste post, o princípio transferível, as métricas que o padrão move e quando
# não usar. O texto que existia é o mecanismo; os outros três nascem vazios (a
# curadoria completa, ou a análise roda de novo).
#
# Em SQL, e não pelo modelo, para a migration não depender do código de hoje.
# A volta guarda só o mecanismo — os três campos novos não têm onde morar na
# forma antiga.
class SplitWhyItWorksInReferenceCards < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE reference_cards
         SET analysis = jsonb_set(analysis, '{whyItWorks}', jsonb_build_object(
               'mechanism', analysis->'whyItWorks',
               'transferablePrinciple', '',
               'targetMetrics', '[]'::jsonb,
               'whenNotToUse', ''))
       WHERE jsonb_typeof(analysis->'whyItWorks') = 'string'
    SQL
  end

  def down
    execute <<~SQL
      UPDATE reference_cards
         SET analysis = jsonb_set(analysis, '{whyItWorks}', COALESCE(analysis->'whyItWorks'->'mechanism', '""'::jsonb))
       WHERE jsonb_typeof(analysis->'whyItWorks') = 'object'
    SQL
  end
end

module Outreach
  # O resumo do público que a tela de criação mostra: quantos, de onde vieram e que variáveis têm.
  #
  # É daqui que sai o aviso de variável inexistente antes de lançar. A tela não pode confiar só nas
  # colunas que ela mesma importou: o rascunho é retomado depois, em outro aparelho, e a variável de uma
  # planilha não existe para quem veio da base de contatos. Por isso cada variável sai com a contagem.
  class RecipientSummary
    MAX_VARIABLES = 100

    def initialize(campaign)
      @campaign = campaign
    end

    def as_json(*)
      total = campaign.recipients.count
      from_contacts = campaign.recipients.where(:contact_id.ne => nil).count

      {
        total: total,
        fromContacts: from_contacts,
        imported: total - from_contacts,
        variables: variables,
        sample: sample
      }
    end

    private

    attr_reader :campaign

    # As chaves são dados da pessoa (o nome de uma coluna): saem como estão.
    def variables
      Recipient.collection.aggregate(
        [
          { "$match" => { campaign_id: campaign.id } },
          { "$project" => { pairs: { "$objectToArray" => { "$ifNull" => [ "$custom_variables", {} ] } } } },
          { "$unwind" => "$pairs" },
          { "$group" => { _id: "$pairs.k", count: { "$sum" => 1 } } },
          { "$sort" => { _id: 1 } },
          { "$limit" => MAX_VARIABLES }
        ]
      ).map { |row| { name: row["_id"], count: row["count"] } }
    end

    # O primeiro da lista: com ele a prévia mostra a mensagem como vai chegar de verdade.
    def sample
      recipient = campaign.recipients.order_by(_id: 1).first
      return nil unless recipient

      { name: recipient.name, phone: recipient.phone, variables: recipient.custom_variables.to_h }
    end
  end
end

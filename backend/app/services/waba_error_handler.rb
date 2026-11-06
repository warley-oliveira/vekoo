class WabaErrorHandler
  # Dicionário estendido de erros da API do WhatsApp Cloud / Business API
  ERROR_MAP = {
    # ------------------------------------------------------------------
    # 1. ERROS DE DESTINATÁRIO (RECIPIENT)
    # ------------------------------------------------------------------
    131_026 => 'Mensagem não entregue. O destinatário pode ter bloqueado o número, estar sem internet ou o celular está desligado.',
    131_043 => 'Destinatário inválido. Este número de telefone não possui uma conta de WhatsApp ativa.',
    131_016 => 'O destinatário não aceita mensagens deste remetente no momento.',
    131_021 => 'O destinatário não pode receber esta mensagem por estar em conflito com outra conversa ativa.',

    # ------------------------------------------------------------------
    # 2. ERROS DE LIMITE E VOLUME (RATE LIMITING)
    # ------------------------------------------------------------------
    130_429 => 'Rate Limit excedido. Você está enviando requisições rápido demais para a API da Meta.',
    131_045 => 'Limite diário (Tier) atingido. Sua conta alcançou o limite máximo de conversas iniciadas por dia.',
    131_047 => 'Fora da janela de 24 horas. Para iniciar ou retomar a conversa, você deve enviar um Template aprovado.',
    131_048 => 'Limite de spam. Você atingiu um limite temporário devido a uma alta taxa de rejeição/bloqueio pelos usuários.',
    131_049 => 'Bloqueio de ecossistema. O destinatário recebeu muitas mensagens de empresas recentemente. A Meta bloqueou o envio para evitar spam.',
    131_056 => 'Muitas requisições concorrentes. Diminua a paralelização dos seus workers de disparo.',
    131_057 => 'Limite de volume do número remetente atingido. Aguarde antes de tentar enviar novamente.',

    # ------------------------------------------------------------------
    # 3. ERROS DE TEMPLATE (MODELOS DE MENSAGEM)
    # ------------------------------------------------------------------
    132_000 => 'O nome do template ou o idioma informado não existe, ou não está aprovado.',
    132_001 => 'Incompatibilidade de variáveis. O número de parâmetros no JSON não bate com a quantidade do template aprovado.',
    132_005 => 'O template foi pausado pela Meta devido a feedback negativo recente dos usuários.',
    132_007 => 'O template foi desativado ou reprovado. Você não pode mais enviá-lo.',
    132_012 => 'O formato de uma das variáveis do template é inválido (ex: enviando texto onde deveria ser URL/botão).',
    132_015 => 'Limite de envio específico para este template atingido.',
    132_016 => 'Template com componente ausente. Um componente obrigatório do template não foi informado no payload.',
    132_068 => 'Fluxo bloqueado. O template do tipo flow está vinculado a um fluxo que não está publicado.',
    132_069 => 'Fluxo limitado. O limite de envios do fluxo vinculado a este template foi excedido.',

    # ------------------------------------------------------------------
    # 4. ERROS DE MÍDIA E FORMATAÇÃO (MEDIA & PAYLOAD)
    # ------------------------------------------------------------------
    131_008 => 'Parâmetro obrigatório ausente. Verifique se o JSON do corpo da requisição está completo.',
    131_009 => 'Um dos parâmetros da mensagem é inválido. Verifique formatações de data, números ou URLs.',
    131_030 => 'Tamanho ou formato de arquivo inválido. A mídia excede o limite ou não é suportada.',
    131_051 => 'Tipo de mensagem não suportado pela API (ex: tentativa de enviar um nó não documentado).',
    131_052 => 'Falha no download da mídia pela Meta. Verifique se o link da sua imagem/documento é público e acessível.',
    131_053 => 'Falha no upload de mídia. O arquivo gerado ou enviado pode estar corrompido.',
    131_054 => 'Erro ao processar a mídia. O arquivo pode estar corrompido ou em formato não reconhecido.',

    # ------------------------------------------------------------------
    # 5. ERROS DE CONTA, COBRANÇA E POLÍTICAS (ACCOUNT & BILLING)
    # ------------------------------------------------------------------
    190 => 'O Access Token da Meta expirou ou é inválido. É necessário gerar um token novo.',
    368 => 'Bloqueio de política. A conta foi temporariamente bloqueada por denúncias de spam ou violação de termos.',
    131_031 => 'Conta desativada ou restrita. O WhatsApp Business Account (WABA) está suspenso ou pendente de verificação.',
    133_010 => 'Problema de cobrança. O cartão de crédito falhou ou o limite de crédito na Meta esgotou.',
    131_050 => 'O número de telefone remetente não está registrado corretamente no WhatsApp Business.',
    131_042 => 'Problema de elegibilidade de cobrança. O método de pagamento ou a moeda da conta ' \
               'WhatsApp Business não está configurado corretamente no Gerenciador de Negócios da Meta.',
    131_055 => 'Método não permitido. A operação solicitada não é compatível com o tipo de conta (ex: BSP vs Cloud API).',

    # ------------------------------------------------------------------
    # 6. ERROS DE FLUXO INTERATIVO (FLOWS)
    # ------------------------------------------------------------------
    131_070 => 'Erro interno no fluxo. O endpoint do fluxo retornou uma resposta inválida.',
    131_071 => 'Timeout no fluxo. O endpoint do fluxo demorou muito para responder.',
    131_072 => 'Fluxo expirado. O fluxo interativo deste usuário expirou e precisa ser reiniciado.',

    # ------------------------------------------------------------------
    # 7. ERROS GENÉRICOS DE SERVIDOR (SYSTEM)
    # ------------------------------------------------------------------
    0 => 'Erro de validação do OAuth. Provavelmente o token está mal formatado.',
    1 => 'Erro desconhecido da API. Tente novamente mais tarde.',
    2 => 'Erro temporário nos servidores da Meta. É seguro tentar enviar novamente (Retry).',
    4 => 'A requisição excedeu os limites de processamento da API do Graph.',
    100 => 'Parâmetro inválido na requisição. Verifique os campos enviados.',
    10 => 'Permissão negada. O aplicativo não possui as permissões necessárias para esta operação.',
    200 => 'Permissão insuficiente. O token não tem acesso a este recurso.',
    80_007 => 'Limite de chamadas da API Graph atingido. Reduza a frequência de requisições.'
  }.freeze

  # Retorna a mensagem amigável, com a opção de incluir os detalhes técnicos que a Meta enviou
  def self.humanize(code, meta_details = nil)
    base_msg = ERROR_MAP[code.to_i] || "Erro não mapeado (Código: #{code}). Verifique a documentação da Meta."

    if meta_details.present?
      "#{base_msg} | Detalhes da Meta: #{meta_details}"
    else
      base_msg
    end
  end

  # Códigos de erro relacionados a conta, cobrança e políticas.
  # Estes erros indicam problemas graves que devem gerar alertas visíveis no organization.
  ACCOUNT_BILLING_CODES = [190, 368, 131_031, 131_042, 133_010, 131_050, 131_055].freeze

  # Define se o erro é "transiente" (pode ser resolvido apenas tentando de novo)
  # Usado para colocar jobs do Sidekiq/DelayedJob de volta na fila
  def self.retryable?(code)
    [1, 2, 4, 80_007, 130_429, 131_052, 131_056].include?(code.to_i)
  end

  # Verifica se o código de erro é da categoria de conta/cobrança/políticas
  def self.account_billing_error?(code)
    ACCOUNT_BILLING_CODES.include?(code.to_i)
  end
end

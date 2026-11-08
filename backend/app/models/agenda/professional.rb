module Agenda
  # Quem atende na agenda. Pode estar ligado a uma `Account` (`account_id`), e aí nome e e-mail
  # são copiados dela ao salvar, porque o Mongo não alcança o Postgres numa busca por nome.
  #
  # O avatar não é copiado: a origem espelhava a foto aqui para não consultar o Postgres por
  # colaborador, mas aqui a foto é um anexo cujo caminho vem do Active Storage. Os serializers
  # resolvem as contas de uma listagem inteira numa consulta só (`ProfessionalDirectory`), sem
  # cópia para envelhecer.
  class Professional
    include Mongoid::Document
    include Mongoid::Timestamps

    # DDI assumido quando o número vem só com DDD + número nacional.
    BR_DDI = "55".freeze

    # Número nacional brasileiro sem DDI: DDD (dois dígitos, nenhum deles 0) mais celular de 9
    # dígitos começando em 9, ou fixo de 8 começando em 2-5.
    BR_NATIONAL = /\A[1-9][1-9](?:9\d{8}|[2-5]\d{7})\z/

    # Um número completo tem no mínimo DDI (2) + DDD (2) + número (8).
    SENDABLE_PHONE_LENGTH = 12

    field :organization_id, type: String
    field :account_id, type: String
    field :name, type: String
    field :email, type: String
    field :phone, type: String
    field :external_id, type: String
    field :color, type: String, default: "#20cc95"

    belongs_to :calendar, class_name: "Agenda::Calendar", inverse_of: :professionals
    # `validate: false`: quem confere os horários é o `ProfessionalForm`, para o erro vir no campo.
    has_one :rule, class_name: "Agenda::Rule", inverse_of: :professional, dependent: :destroy, validate: false
    # Atende estes serviços. A porcentagem de cada um mora em `Offering#distribution`.
    has_and_belongs_to_many :services, class_name: "Agenda::Offering", inverse_of: nil
    # Quem sai não leva o histórico junto: o agendamento fica, sem profissional.
    has_many :bookings, class_name: "Agenda::Booking", inverse_of: :professional, dependent: :nullify

    index({ organization_id: 1, calendar_id: 1 })
    index({ calendar_id: 1, name: 1 })
    index({ account_id: 1 }, { sparse: true })

    before_validation :set_account_fields

    validates :organization_id, presence: true
    validates :name, presence: true, length: { maximum: 120 }
    validate :account_belongs_to_organization

    before_save :normalize_phone!

    before_destroy :leave_service_distributions

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    # Forma canônica do telefone: só dígitos, sempre com DDI.
    #
    # O 55 só é prefixado quando o que sobrou é reconhecidamente um número nacional brasileiro.
    # Contar dígitos não basta: `14155550100` (EUA, sem o +) também tem 11 e viraria
    # `5514155550100`, um número que não existe. O que não casa volta apenas limpo, nunca
    # adivinhado: quem recusa o envio é `sendable_phone?`.
    def self.normalize_phone(value)
      digits = value.to_s.split("@").first.to_s.gsub(/\D/, "")
      return nil if digits.blank?
      return "#{BR_DDI}#{digits}" if BR_NATIONAL.match?(digits)

      digits
    end

    def sendable_phone?
      phone.to_s.length >= SENDABLE_PHONE_LENGTH
    end

    def account
      return nil if account_id.blank?

      Account.find_by(id: account_id, organization_id: organization_id)
    end

    def user_email
      email.presence || account&.email
    end

    # A conta que recebe o aviso: a ligada, ou uma da organização com o mesmo e-mail.
    def notice_account
      account || (Account.with_email(email).find_by(organization_id: organization_id) if email.present?)
    end

    private

    # Saiu da organização ou foi apagada: `account` devolve nil e o cadastro segue salvável.
    def set_account_fields
      return if account_id.blank?

      linked = account
      return unless linked

      self.email = linked.email
      self.name = linked.name
    end

    def account_belongs_to_organization
      return if account_id.blank? || !account_id_changed?
      return if account

      errors.add(:account_id, I18n.t("agenda.validations.unknown_account"))
    end

    def normalize_phone!
      return unless phone_changed?

      self.phone = self.class.normalize_phone(phone)
    end

    # A soma deixa de dar 100, de propósito: quem reparte de novo é a pessoa, na tela do
    # serviço. Até lá o balanceador só enxerga quem ainda existe.
    def leave_service_distributions
      calendar&.services&.where("distribution.#{id}" => { "$exists" => true })&.each do |service|
        service.unset("distribution.#{id}")
      end
    end
  end
end

# Campo de documento Mongoid criptografado em repouso (tokens de provedor).
#
#   encrypted_field :access_token
#
# Guarda em `access_token_ciphertext`. A chave deriva do secret_key_base.
module EncryptedField
  extend ActiveSupport::Concern

  class_methods do
    def encrypted_field(name)
      column = :"#{name}_ciphertext"
      field column, type: String

      define_method(name) do
        ciphertext = self[column]
        ciphertext.present? ? EncryptedField.encryptor.decrypt_and_verify(ciphertext) : nil
      rescue ActiveSupport::MessageEncryptor::InvalidMessage, ActiveSupport::MessageVerifier::InvalidSignature
        nil
      end

      define_method(:"#{name}=") do |value|
        self[column] = value.present? ? EncryptedField.encryptor.encrypt_and_sign(value) : nil
      end
    end
  end

  def self.encryptor
    @encryptor ||= begin
      key = Rails.application.key_generator.generate_key("mongoid encrypted field", ActiveSupport::MessageEncryptor.key_len)
      ActiveSupport::MessageEncryptor.new(key)
    end
  end
end

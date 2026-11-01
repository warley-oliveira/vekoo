module References
  module Eval
    # As marcas do teste lado a lado (`config/reference_eval/brands.yml`):
    # criadas numa organização só delas, publicadas com nicho e estilo e com 5
    # fotos fixas cada. Idempotente — marca que já existe (pelo nome) fica como
    # está e só ganha as fotos que faltam.
    #
    # As fotos são geradas uma vez (Nano Banana) e guardadas como foto
    # **enviada** pela marca (`generated: false`): fazem o papel da foto que o
    # negócio de verdade teria, e é assim que a busca as conta — foto gerada
    # não comprova "foto do produto".
    class Brands
      PATH = Rails.root.join("config/reference_eval/brands.yml")
      ORGANIZATION = "Vekoo · teste de referências"
      PHOTOS = 5
      ASPECT = "4:5"
      # O fim de toda descrição de foto: a foto nunca leva texto (é da peça).
      PHOTO_SUFFIX = " Foto realista, sem texto, sem logotipo, sem marca d'água."

      class Invalid < StandardError; end

      def self.data = YAML.safe_load_file(PATH)

      def self.organization = Organization.find_by(name: ORGANIZATION)

      # As marcas já criadas, pela chave do YAML.
      def self.all
        organization = self.organization
        return {} unless organization

        names = data.transform_values { |spec| spec.dig("identity", "name") }.invert
        organization.brand_cores.each_with_object({}) { |brand, found|
          key = names[brand.full_document.dig("identity", "name")]
          found[key] = brand if key
        }
      end

      def initialize(account:, generator: nil, log: ->(_line) { })
        @account = account
        @generator = generator
        @log = log
      end

      # `photos: false` cria e publica sem gerar foto (para conferir os
      # documentos sem gastar).
      def call(only: nil, photos: true)
        organization = Organization.find_or_create_by!(name: ORGANIZATION)
        existing = self.class.all
        self.class.data.each_with_object({}) do |(key, spec), brands|
          next if only.present? && !only.include?(key)

          brand = existing[key] || create(organization, key, spec)
          brands[key] = brand
          add_photos(brand, key, spec["photos"]) if photos && !@stopped
        rescue Ai::Vertex::MissingKey
          @stopped = true
        end
      end

      private

      def create(organization, key, spec)
        brand = organization.brand_cores.new(status: "draft")
        sections(spec).each do |section, data|
          errors = brand.assign_section(section, data)
          raise Invalid, "#{key}.#{section}: #{errors.map(&:first).join(', ')}" if errors.any?
        end
        brand.save!
        result = PublishBrandCore.new(brand, account: @account).call
        raise Invalid, "#{key}: não publicou (#{result.error})" unless result.success?

        @log.call("#{key}: marca criada e publicada (#{brand.id})")
        brand.reload
      end

      def sections(spec)
        identity = spec.fetch("identity")
        {
          "identity" => identity.merge("archetypes" => identity.fetch("archetypes")),
          "palette" => {
            "colors" => spec.fetch("palette").each_with_index.map { |color, index| color.merge("id" => "c#{index + 1}") }
          },
          "typography" => spec.fetch("typography").to_h { |role, family|
            [ role, { "family" => family, "source" => "catalog", "weights" => [ 400, 700 ], "usage" => "" } ]
          },
          "voice" => spec.fetch("voice"),
          "offers" => {
            "items" => spec.fetch("offers", []).each_with_index.map { |offer, index| offer.merge("id" => "of#{index + 1}") }
          },
          "notes" => { "text" => spec["notes"].to_s }
        }
      end

      def add_photos(brand, key, prompts)
        missing = Array(prompts).first(PHOTOS).drop(brand.assets.where(kind: "photo").count)
        missing.each_with_index do |prompt, index|
          image = generator.generate(prompt: prompt + PHOTO_SUFFIX, aspect_ratio: ASPECT).image
          extension = image.mime_type.split("/").last
          asset = brand.assets.new(
            organization: brand.organization, account: @account, kind: "photo", generated: false,
            filename: "#{key}-#{brand.assets.where(kind: 'photo').count + 1}.#{extension}",
            content_type: image.mime_type, byte_size: image.data.bytesize
          )
          asset.file.attach(io: StringIO.new(image.data), filename: asset.filename, content_type: image.mime_type)
          asset.save!
          AnalyzeBrandAsset.call(asset, StringIO.new(image.data))
          @log.call("#{key}: foto #{index + 1}/#{missing.size}")
        rescue Ai::Vertex::MissingKey => e
          # Credencial do Google vencida ou ausente: as outras fotos falhariam
          # igual. Para aqui; rodar de novo depois completa o que faltou.
          @log.call("#{key}: sem credencial do Vertex (#{e.message.to_s.lines.first.to_s.strip.first(80)}) — confira a chave da conta de serviço (DEPLOY.md §2) e rode de novo esta tarefa")
          raise
        rescue StandardError => e
          @log.call("#{key}: foto não saiu — #{e.class}: #{e.message.to_s.first(120)}")
        end
      end

      def generator
        @generator ||= Ai::GeminiImage.new
      end
    end
  end
end

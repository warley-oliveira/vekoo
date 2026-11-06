module Products
  # Importação em duas fases.
  #
  # Fase A (#create): recebe o ARQUIVO CRU em multipart e devolve cabeçalho + amostra.
  # Só os primeiros KB são lidos aqui; o parse completo é do job.
  #
  # Fase B (#start): recebe o mapeamento e enfileira o job. O progresso sai pelo
  # ProductImportChannel.
  class ImportsController < BaseController
    PER_PAGE = 20
    OPTIONS = %w[dedupe_by_title mirror_images].freeze

    # As chaves de `mapping` são os nomes das colunas da planilha, e valem como vieram.
    self.opaque_params += %w[mapping]

    before_action :set_import, only: %i[show start destroy]

    def index
      records, meta = paginate(current_organization.product_imports.recent, per_page: PER_PAGE)

      render json: { imports: ImportSerializer.many(records), meta: meta }
    end

    def show
      render json: ImportSerializer.one(@import, with_errors: true)
    end

    def create
      file = params.require(:file)
      return render_unreadable_file unless file.respond_to?(:tempfile)
      return render_file_too_large if file.size > Import::MAX_FILE_BYTES

      sample = ImportFile.sniff(file.tempfile)

      import = current_organization.product_imports.new(
        account: current_account, status: "ready", filename: file.original_filename, delimiter: sample.delimiter
      )
      import.file.attach(file)
      import.save!

      render json: ImportSerializer.preview(import, sample), status: :created
    rescue ImportFile::Unreadable
      render_unreadable_file
    end

    def start
      return render_already_started unless @import.ready?

      mapping = free_map(:mapping)
      return render_title_not_mapped unless mapping.values.include?("title")

      @import.update!(mapping: mapping, options: import_options)
      ImportJob.perform_later(@import.id)

      render json: ImportSerializer.one(@import), status: :accepted
    end

    def destroy
      return render_in_progress if @import.processing?

      @import.destroy!
      head :no_content
    end

    private

    def set_import
      @import = current_organization.product_imports.find(params[:id])
    end

    def free_map(key)
      value = params[key]
      value.respond_to?(:to_unsafe_h) ? value.to_unsafe_h.to_h : {}
    end

    def import_options
      free_map(:options).slice(*OPTIONS).transform_values { |value| ActiveModel::Type::Boolean.new.cast(value) }
    end

    def render_file_too_large
      file_error("fileTooLarge", t("products.imports.file_too_large", max: Import::MAX_FILE_BYTES / 1.megabyte))
    end

    def render_unreadable_file
      file_error("unreadableFile", t("products.imports.unreadable_file"))
    end

    def file_error(code, message)
      render_error(status: :unprocessable_entity, code: code, field: "file", message: message, details: { "file" => [ message ] })
    end

    def render_already_started
      render_error(status: :unprocessable_entity, code: "importAlreadyStarted", message: t("products.imports.already_started"))
    end

    def render_title_not_mapped
      render_error(status: :unprocessable_entity, code: "titleNotMapped", field: "mapping", message: t("products.imports.title_not_mapped"))
    end

    def render_in_progress
      render_error(status: :unprocessable_entity, code: "importInProgress", message: t("products.imports.in_progress"))
    end
  end
end

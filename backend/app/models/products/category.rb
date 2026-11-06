module Products
  # Categoria do catálogo, hierárquica via materialized path.
  #
  # `path` é a concatenação dos slugs da raiz até aqui ('moda/feminino').
  # Filtrar um ramo inteiro é `path LIKE 'moda/%'`, que usa o índice
  # text_pattern_ops — sem CTE recursiva no caminho de busca.
  class Category < ApplicationRecord
    PATH_SEPARATOR = "/"
    MAX_DEPTH = 6

    belongs_to :organization
    belongs_to :parent, class_name: "Products::Category", optional: true, inverse_of: :children
    has_many :children, -> { order(position: :asc, name: :asc) },
      class_name: "Products::Category", foreign_key: :parent_id,
      dependent: :destroy, inverse_of: :parent

    has_many :item_categories, class_name: "Products::ItemCategory",
      foreign_key: :product_category_id, dependent: :destroy, inverse_of: :category
    has_many :items, through: :item_categories, source: :item

    validates :name, presence: true, length: { maximum: 200 }
    validates :position, numericality: Products::POSITION_RANGE
    validate :name_produces_slug
    validate :path_available
    validate :parent_belongs_to_same_organization
    validate :parent_outside_own_subtree
    validate :depth_within_limit

    before_validation :set_slug_and_path

    # Antes das associações `dependent`: depois delas os vínculos já se foram.
    before_destroy :remember_linked_items, prepend: true

    after_update :cascade_path_to_descendants, if: :saved_change_to_path?
    after_update_commit :reindex_subtree_items, if: :saved_change_to_path?
    after_destroy_commit :reindex_remembered_items

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }
    scope :roots, -> { where(parent_id: nil) }
    scope :under, ->(path) {
      where("product_categories.path = ? OR product_categories.path LIKE ?",
        path, "#{sanitize_sql_like(path)}#{PATH_SEPARATOR}%")
    }

    # Lista plana em ordem de árvore: filho logo depois do pai e, entre irmãos, pela
    # posição e depois pelo nome. Ordenar por `path` no banco não dá isso: entre 'moda' e
    # 'moda/camisetas' pode cair 'moda-praia', dependendo da collation, e a tela desenha a
    # árvore pela sequência.
    def self.in_tree_order(categories)
      by_path = categories.index_by(&:path)

      categories.sort_by do |category|
        segments = category.path.split(PATH_SEPARATOR)
        segments.each_index.map do |level|
          [ by_path[segments[0..level].join(PATH_SEPARATOR)]&.position.to_i, segments[level] ]
        end
      end
    end

    # A importação grava vínculos em lote, sem callback, então o `counter_cache` não a
    # enxerga. Uma única instrução por lote, para não serializar escrita na mesma linha.
    def self.refresh_items_count!(category_ids)
      return if category_ids.blank?

      where(id: category_ids).update_all(<<~SQL.squish)
        items_count = (
          SELECT COUNT(*) FROM product_item_categories links
          WHERE links.product_category_id = product_categories.id
        )
      SQL
    end

    def depth
      path.to_s.count(PATH_SEPARATOR)
    end

    # 'Moda > Feminino > Vestidos' — a forma legível, para mostrar ou enviar.
    def display_path
      ancestors_and_self.map(&:name).join(" > ")
    end

    def ancestors_and_self
      segments = path.to_s.split(PATH_SEPARATOR)
      paths = segments.each_with_index.map { |_, index| segments[0..index].join(PATH_SEPARATOR) }
      self.class.for_organization(organization_id).where(path: paths).sort_by { |category| category.path.length }
    end

    private

    def set_slug_and_path
      self.name = name.to_s.strip
      self.slug = name.parameterize.presence || slug
      self.path = [ parent&.path, slug ].compact.join(PATH_SEPARATOR)
    end

    def name_produces_slug
      return if name.blank? || name.parameterize.present?

      errors.add(:name, :invalid)
    end

    # O erro vai no nome, que é o que a pessoa preenche: o caminho ela nem vê.
    def path_available
      return if path.blank?

      taken = self.class.for_organization(organization_id).where(path: path).where.not(id: id).exists?
      errors.add(:name, :taken) if taken
    end

    def parent_belongs_to_same_organization
      return if parent_id.blank?
      return if parent&.organization_id == organization_id

      errors.add(:parent_id, :foreign)
    end

    # Sem esta trava uma categoria viraria filha de si mesma (ou do próprio ramo), e o
    # `dependent: :destroy` dos filhos entraria em ciclo.
    def parent_outside_own_subtree
      return if parent.nil? || new_record?
      return unless parent.id == id || parent.path.start_with?("#{path_in_database}#{PATH_SEPARATOR}")

      errors.add(:parent_id, :cycle)
    end

    def depth_within_limit
      return if depth < MAX_DEPTH

      errors.add(:parent_id, :too_deep, count: MAX_DEPTH)
    end

    # Renomear uma categoria muda o path de toda a subárvore. Feito com um UPDATE
    # só, sem instanciar os descendentes.
    def cascade_path_to_descendants
      old_path = path_before_last_save
      return if old_path.blank?

      self.class.where(organization_id: organization_id)
        .where("path LIKE ?", "#{self.class.sanitize_sql_like(old_path)}#{PATH_SEPARATOR}%")
        .update_all([ "path = ? || substring(path from ?)", path, old_path.length + 1 ])
    end

    # O caminho e o nome entram no texto indexado do item: sem reindexar, ele continuaria
    # sendo achado pelo nome antigo e não pelo novo.
    def reindex_subtree_items
      subtree = self.class.for_organization(organization_id).under(path).select(:id)
      ids = ItemCategory.where(product_category_id: subtree).distinct.pluck(:product_item_id)
      ReindexItemsJob.enqueue_for(organization_id, ids)
    end

    def remember_linked_items
      @linked_item_ids = item_categories.pluck(:product_item_id)
    end

    def reindex_remembered_items
      ReindexItemsJob.enqueue_for(organization_id, @linked_item_ids)
    end
  end
end

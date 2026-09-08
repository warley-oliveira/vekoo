# O que mudou entre duas versões do documento — o "o quê" do histórico.
#
# Compara seção a seção; listas com `id` casam por id (uma cor renomeada é
# "changed", não "removed" + "added"). Sai como lista de
# `{ section, path, kind }`, com um teto para o histórico não virar um dump.
class BrandCore::Diff
  MAX_ENTRIES = 120

  def self.call(before, after)
    new(before, after).call
  end

  def initialize(before, after)
    @before = BrandCore::Schema.complete(before)
    @after = BrandCore::Schema.complete(after)
    @entries = []
  end

  def call
    BrandCore::Schema::SECTIONS.each do |section|
      compare(@before[section], @after[section], section, section)
    end
    @entries.first(MAX_ENTRIES)
  end

  private

  def compare(before, after, section, path)
    return if before == after

    if before.is_a?(Hash) && after.is_a?(Hash)
      (before.keys | after.keys).each do |key|
        compare(before[key], after[key], section, "#{path}.#{key}")
      end
    elsif list_with_ids?(before) || list_with_ids?(after)
      compare_lists(Array(before), Array(after), section, path)
    else
      kind = before.nil? ? "added" : after.nil? ? "removed" : "changed"
      @entries << { "section" => section, "path" => path, "kind" => kind }
    end
  end

  def compare_lists(before, after, section, path)
    before_by_id = before.index_by { |item| item["id"] }
    after_by_id = after.index_by { |item| item["id"] }

    (before_by_id.keys | after_by_id.keys).each do |id|
      old_item = before_by_id[id]
      new_item = after_by_id[id]
      item_path = "#{path}.#{id}"
      if old_item.nil?
        @entries << { "section" => section, "path" => item_path, "kind" => "added" }
      elsif new_item.nil?
        @entries << { "section" => section, "path" => item_path, "kind" => "removed" }
      elsif old_item != new_item
        @entries << { "section" => section, "path" => item_path, "kind" => "changed" }
      end
    end
  end

  def list_with_ids?(value)
    value.is_a?(Array) && value.any? && value.all? { |item| item.is_a?(Hash) && item.key?("id") }
  end
end

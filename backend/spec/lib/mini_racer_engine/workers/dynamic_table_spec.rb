# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::DynamicTable do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }

  def run(code, org: organization)
    run_script(code, organization: org)
  end

  def seed(*rows, table: "pedidos", org: organization)
    run("return collection.BulkCreate('#{table}', #{rows.to_json});", org: org)["data"]
  end

  describe "collection.Create" do
    it "cria a tabela na primeira vez e devolve o registro com id" do
      result = run("return collection.Create('pedidos', { total: 10, nome: 'Ana' });")

      expect(result["ok"]).to be(true)
      expect(result["data"]).to include("total" => 10, "nome" => "Ana", "id" => a_string_matching(/\A\h{24}\z/))
      expect(DynamicTable.where(organization_id: organization.id, name: "pedidos").count).to eq(1)
    end

    it "reaproveita a tabela" do
      run("collection.Create('pedidos', {}); collection.Create('pedidos', {});")

      expect(DynamicTable.where(organization_id: organization.id).count).to eq(1)
    end

    it "valida a entrada" do
      expect(run("return collection.Create();")).to include("ok" => false, "error" => "Data must be an object")
      expect(run("return collection.Create('t');")).to include("ok" => false, "error" => "Data must be an object")
      expect(run("return collection.Create('t', 'texto');")).to include("ok" => false)
      expect(run("return collection.Create('', {});")).to include("ok" => false, "error" => "Missing table name")
      expect(run("return collection.Create('#{"x" * 200}', {});")).to include("ok" => false, "error" => "Table name too long")
    end

    it "recusa registro grande demais" do
      stub_const("#{described_class}::MAX_RECORD_BYTES", 20)

      expect(run("return collection.Create('t', { a: 'x'.repeat(50) });")).to include("ok" => false, "error" => /too large/)
      expect(DynamicTable.count).to eq(0)
    end

    it "conta na cota de bytes da execução" do
      stub_const("MiniRacerEngine::Limits::MAX_STORED_BYTES", 30)

      expect { run("for (let i = 0; i < 10; i++) collection.Create('t', { a: 'xxxxxx' });") }
        .to raise_error(MiniRacer::RuntimeError, /stored bytes/)
    end

    it "recusa tabela nova além do teto, mas continua usando as que existem" do
      stub_const("#{described_class}::MAX_TABLES", 1)
      run("collection.Create('a', {});")

      expect(run("return collection.Create('b', {});")).to include("ok" => false, "error" => /Too many tables/)
      expect(run("return collection.Create('a', {});")["ok"]).to be(true)
    end

    it "texto em bytes inválidos não derruba" do
      expect(run("return collection.Create('t', { a: '\\uD83D' }).ok;")).to be(true)
    end

    it "outra execução criando a mesma tabela ao mesmo tempo não é erro" do
      existing = DynamicTable.create!(name: "t", organization_id: organization.id)
      criteria = instance_double(Mongoid::Criteria)
      allow(criteria).to receive(:where).and_return(criteria)
      allow(criteria).to receive(:take).and_return(nil, existing)
      allow(criteria).to receive(:count).and_return(0)
      allow(DynamicTable).to receive(:where).and_return(criteria)
      allow(DynamicTable).to receive(:create!).and_raise(Mongo::Error::OperationFailure, "E11000 duplicate key")

      expect(run("return collection.Create('t', { a: 1 }).ok;")).to be(true)
      expect(DynamicRecord.where(dynamic_table_id: existing.id).count).to eq(1)
    end
  end

  describe "collection.Where" do
    before { seed({ status: "novo", total: 10 }, { status: "novo", total: 20 }, { status: "pago", total: 30 }) }

    it "filtra pelos campos" do
      expect(run("return collection.Where('pedidos', { status: 'novo' }).data.map(r => r.total);")).to eq([ 10, 20 ])
    end

    it "sem filtro traz tudo" do
      expect(run("return collection.Where('pedidos').data.length;")).to eq(3)
    end

    it "filtra por id" do
      id = run("return collection.Where('pedidos', { status: 'pago' }).data[0].id;")

      expect(run("return collection.Where('pedidos', { id: '#{id}' }).data[0].total;")).to eq(30)
    end

    it "aceita os operadores de comparação" do
      expect(run("return collection.Where('pedidos', { total: { $gte: 20 } }).data.length;")).to eq(2)
      expect(run("return collection.Where('pedidos', { status: { $in: ['pago'] } }).data.length;")).to eq(1)
      expect(run("return collection.Where('pedidos', { total: { $not: { $gt: 10 } } }).data.length;")).to eq(1)
      expect(run("return collection.Where('pedidos', { status: { $regex: '^no' } }).data.length;")).to eq(2)
    end

    it "tabela que não existe é erro" do
      expect(run("return collection.Where('nada', {});")).to include("ok" => false, "error" => "Table not found")
    end

    it "tem teto, e avisa que cortou" do
      stub_const("#{described_class}::MAX_RECORDS", 2)

      result = run("return collection.Where('pedidos');")

      expect(result["data"].size).to eq(2)
      expect(result["truncated"]).to be(true)
    end

    it "não avisa quando cabe" do
      expect(run("return collection.Where('pedidos');")).not_to have_key("truncated")
    end

    # O script monta o filtro, e `$where` executa código no banco.
    %w[$where $function $accumulator $expr $jsonSchema $text].each do |operator|
      it "recusa o operador #{operator}" do
        code = "return collection.Where('pedidos', { total: { '#{operator}': 'while(true){}' } });"

        expect(run(code)).to include("ok" => false, "error" => "Operator not allowed: #{operator}")
      end
    end

    it "recusa operador perigoso escondido" do
      expect(run("return collection.Where('pedidos', { a: { $not: { $where: '1' } } });")).to include("ok" => false)
      expect(run("return collection.Where('pedidos', { a: { $elemMatch: { $expr: 1 } } });")).to include("ok" => false)
      expect(run("return collection.Where('pedidos', { a: { $in: [{ $where: '1' }] } });")).to include("ok" => false)
    end

    it "operador na raiz vira só um nome de campo, que não acha nada" do
      expect(run("return collection.Where('pedidos', { $where: 'true' }).data.length;")).to eq(0)
      expect(run("return collection.Where('pedidos', { dynamic_table_id: { $ne: null } }).data.length;")).to eq(0)
    end

    it "filtro que não é objeto é erro" do
      expect(run("return collection.Where('pedidos', 'x');")).to include("ok" => false, "error" => /Criteria/)
    end
  end

  describe "collection.Update" do
    let!(:record) { seed({ status: "novo", total: 10 }).first }

    it "mescla os campos" do
      result = run("return collection.Update('pedidos', '#{record["id"]}', { status: 'pago' });")

      expect(result["data"]).to include("status" => "pago", "total" => 10)
      expect(DynamicRecord.where(id: record["id"]).take.data).to eq("status" => "pago", "total" => 10)
    end

    it "registro que não existe é erro" do
      expect(run("return collection.Update('pedidos', '#{BSON::ObjectId.new}', { a: 1 });")).to include("ok" => false, "error" => "Record not found")
    end

    it "sem dados é erro" do
      expect(run("return collection.Update('pedidos', '#{record["id"]}');")).to include("ok" => false)
    end

    it "objeto vazio não muda nada" do
      expect(run("return collection.Update('pedidos', '#{record["id"]}', {});")["data"]).to include("total" => 10)
    end

    it "nome de campo não pode ser operador" do
      expect(run("return collection.Update('pedidos', '#{record["id"]}', { $inc: 1 });")).to include("ok" => false, "error" => /Invalid field/)
    end

    # `merge!` + `save` apagaria o que o outro escreveu.
    it "é atômico por chave" do
      stale = DynamicRecord.where(id: record["id"]).take
      stale.data

      run("collection.Update('pedidos', '#{record["id"]}', { a: 1 });")
      run("collection.Update('pedidos', '#{record["id"]}', { b: 2 });")

      expect(DynamicRecord.where(id: record["id"]).take.data).to include("a" => 1, "b" => 2, "total" => 10)
    end
  end

  describe "collection.Delete" do
    let!(:record) { seed({ total: 10 }).first }

    it "apaga e devolve o que era" do
      expect(run("return collection.Delete('pedidos', '#{record["id"]}').data.total;")).to eq(10)
      expect(DynamicRecord.count).to eq(0)
    end

    it "registro que não existe é erro" do
      expect(run("return collection.Delete('pedidos', '#{BSON::ObjectId.new}');")).to include("ok" => false)
    end
  end

  describe "consultas" do
    before { seed({ n: 1, s: "Ana Lima" }, { n: 2, s: "ana souza" }, { n: 3, s: "Bia" }) }

    let(:first_id) { run("return collection.Where('pedidos').data[0].id;") }

    it "FindById" do
      expect(run("return collection.FindById('pedidos', '#{first_id}').data.n;")).to eq(1)
      expect(run("return collection.FindById('pedidos');")).to include("ok" => false, "error" => "Missing record id")
      expect(run("return collection.FindById('pedidos', 'id-invalido');")).to include("ok" => false, "error" => "Record not found")
    end

    it "FindOne devolve o mais antigo que atende, ou nulo" do
      expect(run("return collection.FindOne('pedidos', { n: { $gte: 1 } }).data.n;")).to eq(1)
      expect(run("return collection.FindOne('pedidos', { n: 99 });")).to eq("data" => nil, "ok" => true)
    end

    it "Count e Exists" do
      expect(run("return collection.Count('pedidos', { n: { $gt: 1 } }).data;")).to eq(2)
      expect(run("return collection.Exists('pedidos', { n: 3 }).data;")).to be(true)
      expect(run("return collection.Exists('pedidos', { n: 9 }).data;")).to be(false)
    end

    it "Paginate com ordem" do
      result = run("return collection.Paginate('pedidos', {}, { limit: 2, skip: 1, sort: { n: 'desc' } });")

      expect(result["data"].map { |row| row["n"] }).to eq([ 2, 1 ])
      expect(result).to include("total" => 3, "limit" => 2, "skip" => 1, "has_more" => false, "ok" => true)
    end

    it "Paginate tem teto e padrão" do
      stub_const("#{described_class}::MAX_PAGE_SIZE", 2)

      expect(run("return collection.Paginate('pedidos', {}, { limit: 99 }).limit;")).to eq(2)
      expect(run("return collection.Paginate('pedidos', {}, 'x').ok;")).to be(true)
    end

    it "Paginate ordena por id" do
      expect(run("return collection.Paginate('pedidos', {}, { sort: { id: 'desc' } }).data[0].n;")).to eq(3)
    end

    it "Search sem ligar para caixa, com texto tratado como texto" do
      expect(run("return collection.Search('pedidos', 'ANA', ['s']).data.map(r => r.n);")).to eq([ 1, 2 ])
      expect(run("return collection.Search('pedidos', '.*', ['s']).data;")).to be_empty
      expect(run("return collection.Search('pedidos', '', ['s']);")).to include("ok" => false, "error" => "Missing search text")
      expect(run("return collection.Search('pedidos', 'a', []);")).to include("ok" => false, "error" => "Missing fields to search")
    end

    it "Distinct" do
      seed({ n: 1, s: "repetido" })

      expect(run("return collection.Distinct('pedidos', 'n').data;")).to match_array(%w[1 2 3])
      expect(run("return collection.Distinct('pedidos');")).to include("ok" => false, "error" => "Missing field name")
    end

    it "Distinct e Search têm teto" do
      stub_const("#{described_class}::MAX_RECORDS", 1)

      expect(run("return collection.Distinct('pedidos', 'n');")).to include("truncated" => true)
      expect(run("return collection.Search('pedidos', 'a', ['s']);")).to include("truncated" => true)
    end
  end

  describe "operações em massa" do
    it "BulkCreate" do
      expect(run("return collection.BulkCreate('t', [{ a: 1 }, { a: 2 }]).data.length;")).to eq(2)
      expect(run("return collection.BulkCreate('t', 'x');")).to include("ok" => false, "error" => "Data must be an array")
      expect(run("return collection.BulkCreate('', []);")).to include("ok" => false, "error" => "Missing table name")
      expect(run("return collection.BulkCreate('t', ['x']);")).to include("ok" => false, "error" => "Data must be an object")
    end

    it "BulkCreate tem teto" do
      stub_const("#{described_class}::MAX_BULK_SIZE", 1)

      expect(run("return collection.BulkCreate('t', [{}, {}]);")).to include("ok" => false, "error" => /Maximum 1/)
    end

    it "UpdateWhere mexe em quem atende e diz quantos" do
      seed({ s: "a" }, { s: "a" }, { s: "b" })

      expect(run("return collection.UpdateWhere('pedidos', { s: 'a' }, { v: 1 }).data.updated;")).to eq(2)
      expect(run("return collection.Count('pedidos', { v: 1 }).data;")).to eq(2)
      expect(run("return collection.UpdateWhere('pedidos', { s: 'a' });")).to include("ok" => false, "error" => "Missing update data")
      expect(run("return collection.UpdateWhere('pedidos', { s: 'a' }, {}).data.updated;")).to eq(0)
    end

    it "UpdateWhere não recebe operador como campo" do
      seed({ s: "a" })

      expect(run("return collection.UpdateWhere('pedidos', {}, { $unset: 1 });")).to include("ok" => false, "error" => /Invalid field/)
    end

    it "DeleteWhere exige filtro" do
      seed({ s: "a" }, { s: "b" })

      expect(run("return collection.DeleteWhere('pedidos', {});")).to include("ok" => false, "error" => /criteria/)
      expect(run("return collection.DeleteWhere('pedidos');")).to include("ok" => false)
      expect(run("return collection.DeleteWhere('pedidos', { s: 'a' }).data.deleted;")).to eq(1)
      expect(run("return collection.Count('pedidos').data;")).to eq(1)
    end
  end

  describe "operações atômicas" do
    it "Upsert cria quando não acha, e atualiza quando acha" do
      created = run("return collection.Upsert('t', { email: 'a@b.c' }, { v: 1 });")
      expect(created).to include("ok" => true, "upserted" => true)
      expect(created["data"]).to include("email" => "a@b.c", "v" => 1)

      updated = run("return collection.Upsert('t', { email: 'a@b.c' }, { v: 2 });")
      expect(updated).to include("ok" => true, "upserted" => false)
      expect(updated["data"]).to include("email" => "a@b.c", "v" => 2)
      expect(DynamicRecord.count).to eq(1)
    end

    it "Upsert valida" do
      expect(run("return collection.Upsert();")).to include("ok" => false, "error" => "Missing table name")
      expect(run("return collection.Upsert('t', {}, {});")).to include("ok" => false, "error" => "Missing criteria")
      expect(run("return collection.Upsert('t', { a: 1 });")).to include("ok" => false, "error" => "Missing data")
    end

    it "Increment soma, subtrai e cria o campo" do
      id = seed({ n: 5 }).first["id"]

      expect(run("return collection.Increment('pedidos', '#{id}', 'n').data.n;")).to eq(6)
      expect(run("return collection.Increment('pedidos', '#{id}', 'n', -2).data.n;")).to eq(4)
      expect(run("return collection.Increment('pedidos', '#{id}', 'novo', 3).data.novo;")).to eq(3)
    end

    it "Increment valida" do
      id = seed({ s: "texto" }).first["id"]

      expect(run("return collection.Increment('pedidos');")).to include("ok" => false, "error" => "Missing record id")
      expect(run("return collection.Increment('pedidos', '#{id}');")).to include("ok" => false, "error" => "Missing field name")
      expect(run("return collection.Increment('pedidos', '#{BSON::ObjectId.new}', 'n');")).to include("ok" => false, "error" => "Record not found")
      expect(run("return collection.Increment('pedidos', '#{id}', 's');")).to include("ok" => false, "error" => "Field is not numeric")
      expect(run("return collection.Increment('pedidos', '#{id}', '$x');")).to include("ok" => false, "error" => /Invalid field/)
    end

    # A origem lia, somava e salvava: duas execuções perdiam uma soma.
    it "Increment não perde soma de quem leu antes" do
      id = seed({ n: 0 }).first["id"]

      threads = 4.times.map do
        Thread.new { run_script("collection.Increment('pedidos', '#{id}', 'n');", organization: organization) }
      end
      threads.each(&:join)

      expect(DynamicRecord.where(id: id).take.data["n"]).to eq(4)
    end
  end

  describe "collection.Aggregate" do
    before { seed({ v: 10, s: "a" }, { v: "20", s: "a" }, { s: "b" }) }

    it "soma, média, mínimo, máximo e contagem" do
      expect(run("return collection.Aggregate('pedidos', 'v', 'sum').data;")).to eq(30)
      expect(run("return collection.Aggregate('pedidos', 'v', 'avg').data;")).to eq(10)
      expect(run("return collection.Aggregate('pedidos', 'x', 'count').data;")).to eq(3)
      expect(run("return collection.Aggregate('pedidos', null, 'count', { s: 'a' }).data;")).to eq(2)
      expect(run("return collection.Aggregate('pedidos', 's', 'min').data;")).to eq("a")
      expect(run("return collection.Aggregate('pedidos', 's', 'max').data;")).to eq("b")
    end

    it "valida" do
      expect(run("return collection.Aggregate('pedidos', 'v', 'mediana');")).to include("ok" => false, "error" => /Invalid operation/)
      expect(run("return collection.Aggregate('pedidos', null, 'sum');")).to include("ok" => false, "error" => "Missing field name")
      expect(run("return collection.Aggregate('pedidos', 'v', 'min');")).to include("ok" => false, "error" => /mixed/)
    end

    it "tabela vazia" do
      run("collection.Create('vazia', {}); collection.DeleteWhere('vazia', { $x: 1 });")
      expect(run("return collection.Aggregate('nada', 'v', 'sum');")).to include("ok" => false)
    end

    it "tem teto de registros, e avisa que cortou" do
      stub_const("#{described_class}::MAX_AGGREGATE_RECORDS", 1)

      result = run("return collection.Aggregate('pedidos', 'v', 'sum');")

      expect(result).to include("data" => 10, "truncated" => true)
    end
  end

  describe "gerenciamento de tabelas" do
    it "ListTables" do
      run("collection.Create('b', {}); collection.Create('a', {});")

      expect(run("return collection.ListTables().data.map(t => t.name);")).to eq(%w[a b])
    end

    it "DropTable apaga a tabela e os registros" do
      seed({ a: 1 }, { a: 2 })

      expect(run("return collection.DropTable('pedidos').data;")).to eq("table" => "pedidos", "deleted_records" => 2)
      expect(DynamicTable.count).to eq(0)
      expect(DynamicRecord.count).to eq(0)
    end

    it "DropTable de tabela que não existe é erro" do
      expect(run("return collection.DropTable('nada');")).to include("ok" => false, "error" => "Table not found")
      expect(run("return collection.DropTable();")).to include("ok" => false, "error" => "Missing table name")
    end
  end

  # Nome ou id de outra organização não pode funcionar.
  describe "isolamento entre organizações" do
    let!(:foreign) { seed({ segredo: "de fora" }, org: other_organization).first }

    before { run("collection.Create('pedidos', { meu: true });") }

    it "a mesma tabela é outra em cada organização" do
      expect(DynamicTable.where(name: "pedidos").count).to eq(2)
      expect(run("return collection.Where('pedidos').data.length;")).to eq(1)
      expect(run("return collection.Where('pedidos').data[0].meu;")).to be(true)
    end

    it "a tabela que só a outra tem não existe aqui" do
      seed({ a: 1 }, table: "so-de-la", org: other_organization)

      expect(run("return collection.Where('so-de-la');")).to include("ok" => false, "error" => "Table not found")
      expect(run("return collection.ListTables().data.map(t => t.name);")).to eq([ "pedidos" ])
      expect(run("return collection.DropTable('so-de-la');")).to include("ok" => false)
      expect(DynamicTable.where(name: "so-de-la").count).to eq(1)
    end

    { "FindById" => "FindById('pedidos', ID)", "Delete" => "Delete('pedidos', ID)",
      "Update" => "Update('pedidos', ID, { invadido: true })",
      "Increment" => "Increment('pedidos', ID, 'invadido')" }.each do |name, call|
      it "#{name} com o id de um registro de lá não acha" do
        result = run("return collection.#{call.sub("ID", "'#{foreign["id"]}'")};")

        expect(result).to include("ok" => false, "error" => "Record not found")
        expect(DynamicRecord.where(id: foreign["id"]).take.data).to eq("segredo" => "de fora")
      end
    end

    it "filtrar pelo id de lá não acha" do
      expect(run("return collection.Where('pedidos', { id: '#{foreign["id"]}' }).data;")).to be_empty
    end

    # `where(tabela).or(x)` no Mongoid é "da tabela OU x": a origem vazava por aqui.
    it "a busca textual não acha o que é de lá" do
      expect(run("return collection.Search('pedidos', 'de fora', ['segredo']).data;")).to be_empty
    end

    it "a busca textual também não acha o que está em outra tabela da organização" do
      seed({ s: "achei" }, table: "outra")
      seed({ s: "nada" }, table: "alvo")

      expect(run("return collection.Search('alvo', 'achei', ['s']).data;")).to be_empty
    end

    it "operações em massa não atravessam" do
      run("collection.UpdateWhere('pedidos', { segredo: 'de fora' }, { invadido: true });")
      run("collection.DeleteWhere('pedidos', { segredo: 'de fora' });")

      expect(DynamicRecord.where(id: foreign["id"]).take.data).to eq("segredo" => "de fora")
    end

    it "não dá para trocar a tabela pelo filtro" do
      table_id = DynamicTable.where(organization_id: other_organization.id, name: "pedidos").take.id.to_s

      expect(run("return collection.Where('pedidos', { dynamic_table_id: '#{table_id}' }).data;")).to be_empty
    end
  end

  # Sem organização, a origem caía num espaço de tabelas compartilhado por toda execução
  # sem contexto.
  describe "sem organização no contexto" do
    %w[
      Create('t',{}) Where('t') Update('t','x',{}) Delete('t','x') FindById('t','x') FindOne('t') Count('t') Exists('t')
      Paginate('t') Search('t','a',['b']) Distinct('t','a') BulkCreate('t',[{}]) UpdateWhere('t',{},{}) DeleteWhere('t',{a:1})
      Upsert('t',{a:1},{}) Increment('t','x','a') Aggregate('t','a','sum') ListTables() DropTable('t')
    ].each do |call|
      it "falha fechado: collection.#{call}" do
        expect(run_script("return collection.#{call};")).to include("ok" => false, "error" => "No organization in context")
        expect(DynamicTable.count).to eq(0)
      end
    end
  end
end

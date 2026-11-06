require "rails_helper"

# O prazo e a falha de SQL, no Postgres de teste e sem dublê: `pg_sleep` passa do prazo de verdade.
RSpec.describe CustomDashboards::QueryBuilders::ActiveRecordBuilder do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:zone) { organization.reporting_zone }
  let(:time_range) { CustomDashboards::QueryEngine::TimeRange.new(field: "day", from: 2.days.ago, to: 2.days.from_now) }
  let(:own_rows) { ->(person) { DailyChatStat.unscoped.where(organization_id: person.organization_id) } }

  before { create(:daily_chat_stat, organization: organization, day: zone.today) }

  def builder(scope, max_time_ms:)
    source = CustomDashboards::DataSourceRegistry.find_source("daily_stats").dup
    source.scope = scope

    described_class.new(source, account, {}, time_range: time_range, zone: zone, max_time_ms: max_time_ms)
  end

  it "responde dentro do prazo" do
    expect(builder(own_rows, max_time_ms: 5_000).execute[:rows].size).to eq(1)
  end

  it "passou do prazo, o Postgres corta" do
    slow = ->(person) { own_rows.call(person).where("(SELECT true FROM pg_sleep(2))") }

    expect { builder(slow, max_time_ms: 50).execute }.to raise_error(CustomDashboards::QueryEngine::DeadlineExceeded)
  end

  it "o prazo cortado não fica valendo na conexão" do
    before_query = DailyChatStat.connection.select_value("SHOW statement_timeout")
    slow = ->(person) { own_rows.call(person).where("(SELECT true FROM pg_sleep(2))") }

    expect { builder(slow, max_time_ms: 50).execute }.to raise_error(CustomDashboards::QueryEngine::DeadlineExceeded)
    expect(DailyChatStat.connection.select_value("SHOW statement_timeout")).to eq(before_query)
  end

  it "erro de SQL vira recusa, e fica no log" do
    broken = ->(person) { own_rows.call(person).where("coluna_que_nao_existe = 1") }
    allow(Rails.logger).to receive(:error)

    expect { builder(broken, max_time_ms: 5_000).execute }
      .to raise_error(CustomDashboards::QueryEngine::QueryError) { |error| expect(error.code).to eq("queryFailed") }
    expect(Rails.logger).to have_received(:error).with(/daily_stats/)
  end
end

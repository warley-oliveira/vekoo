require "rails_helper"

RSpec.describe FlowPlaygroundChannel, type: :channel do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:flow) { create(:flow, organization: organization) }
  let(:execution) { create(:flow_execution, flow: flow, status: "waiting_for_message", playground: true) }

  before { stub_connection current_account: account }

  it "assina a execução de teste da organização" do
    subscribe(executionId: execution.id)

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(FlowRuntime::MessageDispatcher.playground_stream(execution))
  end

  it "recusa execução de outra organização" do
    alheia = create(:flow_execution, flow: create(:flow, organization: create(:organization)), status: "running", playground: true)

    subscribe(executionId: alheia.id)

    expect(subscription).to be_rejected
  end

  it "recusa execução de verdade: o canal é só do teste" do
    real = create(:flow_execution, flow: flow, status: "running")

    subscribe(executionId: real.id)

    expect(subscription).to be_rejected
  end

  it "recusa quem não tem a permissão, e id que não existe" do
    blank_role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: blank_role)
    subscribe(executionId: execution.id)
    expect(subscription).to be_rejected

    stub_connection current_account: account
    subscribe(executionId: "nao-existe")
    expect(subscription).to be_rejected
  end

  it "speak retoma com a mensagem do contato de mentira, e devolve o eco" do
    subscribe(executionId: execution.id)

    expect { perform(:speak, text: "oi") }
      .to have_enqueued_job(Flows::ResumeExecutionJob).with(execution.id, organization.id, { "user_text" => "oi" })
      .and have_broadcasted_to(FlowRuntime::MessageDispatcher.playground_stream(execution)).with(a_hash_including("kind" => "user_message", "body" => "oi"))
  end

  it "speak vazio não faz nada" do
    subscribe(executionId: execution.id)

    expect { perform(:speak, text: " ") }.not_to have_enqueued_job
  end
end

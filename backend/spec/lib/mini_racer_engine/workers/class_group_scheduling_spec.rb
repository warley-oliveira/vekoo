require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::ClassGroupScheduling do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }
  let(:calendar) { create(:agenda_calendar, organization_id: organization.id.to_s, calendar_type: "class_group") }
  let!(:group) do
    create(:agenda_class_group, calendar: calendar, organization_id: organization.id.to_s, name: "Costura", max_students: 2, instructor_name: "Bia", room: "Sala 1",
                                start_date: Date.current - 7, end_date: Date.current + 60,
                                schedule: [ { "day_of_week" => Date.current.wday, "enabled" => true, "windows" => [ { "start" => "23:58", "end" => "23:59" } ] } ])
  end

  def run(code, chat: self.chat)
    run_script(code, organization: organization, chat: chat)
  end

  it "mantém os nomes `classGroup.*` da origem" do
    %w[list availability enroll unenroll myEnrollments].each do |name|
      expect(run("return typeof classGroup.#{name};")).to eq("function")
    end
  end

  it "lista as turmas ativas e visíveis, com vagas e a grade em texto" do
    create(:agenda_class_group, calendar: calendar, organization_id: organization.id.to_s, name: "Escondida", visible: false)
    create(:agenda_class_group, calendar: calendar, organization_id: organization.id.to_s, name: "Encerrada", active: false)

    list = run("return classGroup.list();")

    expect(list.pluck("name")).to eq([ "Costura" ])
    expect(list.first).to include("available_spots" => 2, "schedule" => a_string_including("23:58-23:59"))
  end

  it "não enxerga turma de outra organização" do
    other = create(:organization)
    other_calendar = create(:agenda_calendar, organization_id: other.id.to_s, calendar_type: "class_group")
    create(:agenda_class_group, calendar: other_calendar, organization_id: other.id.to_s, name: "Alheia")

    expect(run("return classGroup.list();").pluck("name")).to eq([ "Costura" ])
    expect(run("return classGroup.availability('Alheia');")).to eq("error" => "Turma não encontrada")
    expect(run("return classGroup.enroll('Alheia', 1, '08:00');")).to eq("error" => "Turma não encontrada")
  end

  it "mostra as próximas aulas, com a hora de parede do calendário" do
    result = run("return classGroup.availability('Costura', 7);")

    expect(result).to include("name" => "Costura", "available_spots" => 2)
    session = result["sessions"].first
    expect(session).to include("window_start" => "23:58", "day_of_week" => Date.current.wday)
    expect(session["day_name"]).to be_present
    expect(session["date"]).to match(/\A\d{4}-\d{2}-\d{2}T23:58/)
  end

  it "inscreve, recusa a repetição e desinscreve" do
    enrolled = run("return classGroup.enroll('Costura', 2, '08:00');")
    expect(enrolled).to include("success" => true, "class_group_name" => "Costura", "schedule_day_of_week" => 2, "schedule_window_start" => "08:00")

    expect(run("return classGroup.enroll('Costura', 2, '08:00');")).to eq("error" => "Contato já está inscrito neste horário")
    expect(run("return classGroup.myEnrollments();").first).to include("class_group_name" => "Costura", "instructor_name" => "Bia", "room" => "Sala 1")

    expect(run("return classGroup.unenroll('Costura', 2, '08:00');")).to include("success" => true)
    expect(run("return classGroup.myEnrollments();")).to eq([])
    expect(run("return classGroup.unenroll('Costura', 2, '08:00');")).to eq("error" => "Contato não está inscrito neste horário")
  end

  it "recusa turma lotada" do
    group.update!(max_students: 1)
    create(:agenda_class_enrollment, class_group: group, organization_id: organization.id.to_s, chat: create(:chat, organization: organization))

    expect(run("return classGroup.enroll('Costura', 2, '08:00');")).to eq("error" => "Turma lotada, sem vagas disponíveis")
  end

  it "sem conversa, diz que não sabe quem é o contato" do
    expect(run("return classGroup.enroll('Costura', 2, '08:00');", chat: nil)).to eq("error" => "Contato não identificado")
    expect(run("return classGroup.myEnrollments();", chat: nil)).to eq("error" => "Contato não identificado")
  end

  it "um script que não usa turma não precisa de organização" do
    expect(run_script("return 1;")).to eq(1)
    expect { run_script("return classGroup.list();") }.to raise_error(MiniRacer::RuntimeError, /No organization/)
  end
end

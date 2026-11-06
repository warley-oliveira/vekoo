module MiniRacerEngine
  class Response
    attr_reader :result, :error, :events

    def initialize(result: nil, error: nil, events: nil)
      @result = result
      @error = error
      @events = events
    end
  end
end

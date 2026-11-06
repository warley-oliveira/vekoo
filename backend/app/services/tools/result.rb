module Tools
  class Result
    attr_reader :data, :errors

    def initialize(success:, data: nil, errors: [])
      @success = success
      @data = data
      @errors = Array(errors)
    end

    def success?
      @success
    end
  end
end

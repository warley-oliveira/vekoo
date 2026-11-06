module LeadChatApi
  class Error < StandardError
    attr_reader :status, :body

    def initialize(status, body)
      @status = status
      @body = body
      super("[LeadChatApi] Error: Status: #{status}, Body: #{body}")
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ZapiClient::Messaging do
  let(:instance_id) { 'INST123' }
  let(:token)       { 'TOKABC' }
  let(:client) { ZapiClient.new(instance_id, token, account_token: 'ACCT-XYZ') }
  let(:base_url) { "https://api.z-api.io/instances/#{instance_id}/token/#{token}" }

  describe '#send_text' do
    let(:ok_response) do
      instance_double('HTTParty::Response', success?: true, parsed_response: { 'messageId' => 'OUT-1' })
    end

    it 'posts /send-text with phone and message (no messageId by default)' do
      expect(HTTParty).to receive(:send).with(
        :post,
        "#{base_url}/send-text",
        hash_including(
          headers: hash_including('Content-Type' => 'application/json', 'Client-Token' => 'ACCT-XYZ'),
          body: a_string_matching(/"phone":"5511999999999"/).and(a_string_matching(/"message":"hello"/))
        )
      ) do |_method, _url, opts|
        expect(opts[:body]).not_to include('messageId')
        ok_response
      end

      client.send_text('5511999999999', 'hello')
    end

    it 'includes messageId in payload when message_id is provided (reply support)' do
      expect(HTTParty).to receive(:send).with(
        :post,
        "#{base_url}/send-text",
        hash_including(
          body: a_string_matching(/"messageId":"WAID-PARENT"/)
        )
      ).and_return(ok_response)

      client.send_text('5511999999999', 'replying', message_id: 'WAID-PARENT')
    end

    it 'ignores blank message_id (does not include messageId in payload)' do
      expect(HTTParty).to receive(:send) do |_method, _url, opts|
        expect(opts[:body]).not_to include('messageId')
        ok_response
      end

      client.send_text('5511999999999', 'hi', message_id: '')
    end
  end

  describe '#delete_message' do
    it 'issues DELETE /messages with messageId, phone and owner query params' do
      ok_response = instance_double(
        'HTTParty::Response',
        success?: true,
        parsed_response: nil
      )

      expect(HTTParty).to receive(:send).with(
        :delete,
        a_string_matching(%r{
          \A#{Regexp.escape(base_url)}/messages\?
          (?=.*messageId=WAID-1)
          (?=.*phone=5511999999999)
          (?=.*owner=true)
        }x),
        hash_including(
          headers: hash_including(
            'Content-Type' => 'application/json',
            'Client-Token' => 'ACCT-XYZ'
          )
        )
      ).and_return(ok_response)

      client.delete_message(phone: '5511999999999', message_id: 'WAID-1', owner: true)
    end

    it 'raises ZapiClient::Error on a 4xx response' do
      bad_response = instance_double(
        'HTTParty::Response',
        success?: false,
        code: 422,
        body: '{"error":"invalid"}'
      )

      allow(HTTParty).to receive(:send).and_return(bad_response)

      expect do
        client.delete_message(phone: '551199', message_id: 'WAID-X')
      end.to raise_error(ZapiClient::Error)
    end
  end
end

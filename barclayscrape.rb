# Copyright (C) 2010 Russ Garrett
# This file is distributed under the terms of the GNU Public License v2
require 'mechanize'


# A library to programmatically mainpulate Barclays online banking.
class BarclayScrape
  LOGIN_ENDPOINT='https://bank.barclays.co.uk/olb/auth/LoginLink.action'
  EXPORT_ENDPOINT='https://bank.barclays.co.uk/olb/balances/ExportDataStep1.action'
  STATEMENTS_ENDPOINT='https://bank.barclays.co.uk/olb/balances/SeeStatementsDirect.action?productIdentifier='

  # Initialize the class. Requires your surname, online banking membership number,
  # and either :cardnumber and :otp (8-digit one-time password from your PINSentry), or
  # your :pin and a working smartcard reader.
  def initialize(surname, membership_no, params)
    @surname = surname
    @membership_no = membership_no
    params = {:pinsentry_binary => './barclays-pinsentry'}.merge!(params)
    if params[:otp] and params[:cardnumber]
      @cardnumber = params[:cardnumber]
      @otp = params[:otp]
    elsif params[:motp]
      @motp = params[:motp]
      @otp = @motp
    elsif params[:pinsentry_binary] and params[:pin]
      if params[:cardnumber]
        @cardnumber = params[:cardnumber]
      end
      @pinsentry_binary = params[:pinsentry_binary]
      @pin = params[:pin]
      get_pinsentry_data
    else
      raise ArgumentError.new("Either provide :cardnumber and :otp or :motp or :pin")
    end
    if params[:logger]
      @logger = params[:logger]
    end
    @agent = Mechanize.new
    cert_store = OpenSSL::X509::Store.new
    cert_store.add_file 'cacert.pem'
    @agent.cert_store = cert_store

    @agent.ssl_version = :SSLv3
    @agent.user_agent_alias = 'Windows IE 8'
    login
  end

  def account_list()
    page = @agent.get EXPORT_ENDPOINT
    form = page.forms_with(:name => "process-form").first
    results = []

    form.field_with(:name => "productIdentifier").options.each do |option|
      results.push(option.value) unless ['All', 'BUSINESS', 'PERSONAL'].include? option.value
    end
    return results
  end

  # Returns a string in OFX format. The type parameter controls which 
  # accounts to return, and can be one of the following strings:
  #   All::       All your accounts
  #   PERSONAL::  Personal accounts
  #   BUSINESS::  Business accounts
  #   <sortcode><accountno>:: A specific account (no punctuation/spaces)
  def export_data(type="All")
    # Export request page
    page = @agent.get EXPORT_ENDPOINT
    form = page.forms_with(:name => "process-form").first
    form['productIdentifier'] = type
    page = @agent.submit(form, form.buttons.first)

    if !['All', 'PERSONAL', 'BUSINESS'].include? type
      # Exporting specific accounts sends you via another page
      form = page.form_with(:name => "process-form")
      page = @agent.submit(form, form.button_with(:name => "action:ExportDataStep2_display"))
    end

    # Export confirm page
    form = page.form_with(:name => "process-form")
    file = @agent.submit(form, form.button_with(:name => "action:ExportDataStep2All_download"))
    return file.body
  end

  def extract_html_statement(account_number)
    page = @agent.get STATEMENTS_ENDPOINT + account_number
    txns = {}
    rows = page./('table#filterable tbody tr')
    rows.each do |row|
        row_id = row['id'].gsub(/transaction_(\d+).*/, '\1')
        if txns[row_id]
            txd = txns[row_id]
        else
            txd = {}
        end
        if row['id'] =~ /reveal/
            txd['amount'] = row.at('.spend').text.strip
            txd['trans-type'] = row.at('.trans-type').text.strip
            txd['ref'] = row./('.keyword-search')[2].text.strip
            if row./('.keyword-search')[3]
                txd['ref2'] = row./('.keyword-search')[3].text.strip
            end
        else
            txd['date'] = row.at('.date').text.strip
            txd['description'] = row.at('.description').text.strip
            txd['balance'] = row.at('.balance').text.strip
        end
        txns[row_id] = txd
    end
    txns
  end

  private

  def get_pinsentry_data()
    @otp = `#{@pinsentry_binary} -p #{@pin} -o`.strip
    if not @cardnumber
      @cardnumber = `#{@pinsentry_binary} -i`.strip
    end
    @logger.debug("Card: #{@cardnumber} OTP: #{@otp}") if @logger
  end

  def login()
    # Login step one: Surname and membership number
    @logger.debug("Login stage 1") if @logger
    page = @agent.get LOGIN_ENDPOINT
    form = page.forms.first
    form['surname'] = @surname
    form['membershipNumber'] = @membership_no
    page = @agent.submit(form, form.buttons.first)

    # Login step two: PINSentry
    @logger.debug("Login stage 2") if @logger
    form = page.forms.first
    if @motp
        form.field_with(:id => "pin-authorise3").value = @otp[0..3]
        form.field_with(:id => "pin-authorise4").value = @otp[4..7]
        form.field_with(:id => "pin-authorise1").node['disabled'] = 'true'
        form.field_with(:id => "pin-authorise2").node['disabled'] = 'true'
        form.radiobutton_with(:name => 'pinsentrySelection', :value => 'mobilePINsentry').check 
    else
        # Different accounts require different numbers of card digits, so check the field size
        num_digits = form.field_with(:name => 'cardDigits').node['size'].to_i
        form['cardDigits'] = @cardnumber[-num_digits, num_digits]
        form.field_with(:id => "pin-authorise1").value = @otp[0..3]
        form.field_with(:id => "pin-authorise2").value = @otp[4..7]

        # This only appears to be present if the account has mobile auth set up
        card_field = form.radiobutton_with(:name => 'pinsentrySelection', :value => 'cardPINsentry')
        if card_field
          card_field.check
        end
    end
    page = @agent.submit(form, form.buttons.first)
  end
end

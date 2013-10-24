# Copyright (C) 2010 Russ Garrett
# This file is distributed under the terms of the GNU Public License v2
require 'mechanize'

# A library to programmatically mainpulate Barclays online banking.
class BarclayScrape
  LOGIN_ENDPOINT='https://bank.barclays.co.uk/olb/auth/LoginLink.action'
  EXPORT_ENDPOINT='https://bank.barclays.co.uk/olb/balances/ExportDataStep1.action'

  # Initialize the class. Requires your surname, online banking membership number,
  # and either :cardnumber and :otp (8-digit one-time password from your PINSentry), or
  # your :pin and a working smartcard reader.
  def initialize(surname, membership_no, params)
    @surname = surname
    @membership_no = membership_no
    params = {:pinsentry_binary => './barclays-pinsentry'}.merge!(params)
    if params[:cardnumber]
      @cardnumber = params[:cardnumber]
    end
    if params[:otp]
      @otp = params[:otp]
    elsif params[:pinsentry_binary] and params[:pin]
      @pinsentry_binary = params[:pinsentry_binary]
      @pin = params[:pin]
      get_pinsentry_data
    else
      raise ArgumentError.new("Either provide :otp and :cardnumber or :pin")
    end
    if params[:logger]
      @logger = params[:logger]
    end
    @agent = Mechanize.new
    login
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
    form.productIdentifier = type
    page = @agent.submit(form, form.buttons.first)

    # Export confirm page
    form = page.forms_with(:name => "process-form").first
    file = @agent.submit(form, form.buttons_with(:name => "action:ExportDataStep2All_download").first)
    return file.body
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
    form.cardDigits = @cardnumber[-4,4]
    form.oneTimePasscode1 = @otp[0..3]
    form.oneTimePasscode2 = @otp[4..7]
    page = @agent.submit(form, form.buttons.first)
  end
end

#!/usr/bin/env ruby
# encoding: utf-8
require './barclayscrape'
# require 'logger'

SURNAME = ''
MEMBERSHIP_NUMBER = ''
ACCOUNTS = {
    'gbp' => '',
    'eur' => '',
    'usd' => '',
}

print 'Identify with mobile pin sentry: '
bs = BarclayScrape.new(
    SURNAME,
    MEMBERSHIP_NUMBER,
    :motp => gets.strip,
    # :logger => Logger.new(STDOUT)
)

ACCOUNTS.each do |label, number|
    data = bs.extract_html_statement(number)
    printf("Importing %s account: %s (%s rows)\n", label, number, data.length)
    if data.length
        File.open('export/' + label + '.csv', 'w') do |file|
            data.each do |k, d|
                ref = ''
                if d['ref']
                    ref = sprintf("-%s", d['ref'])
                    if d['ref2']
                        ref = sprintf("%s-%s", ref, d['ref2'])
                    end
                end
                line = sprintf("%s,%s-%s%s,%s\n", d['date'], d['trans-type'], d['description'], ref, d['amount'].gsub(/[£,]/, ''))
                file.write(line)
            end
            file.close()
        end
    end
end

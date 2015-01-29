#!/usr/bin/env casperjs
var casper = require('casper').create({
    verbose: true,
    logLevel: "error",
    pageSettings: {
        webSecurityEnabled: false
    }
});
var barclayscrape = require("./barclayscrape");
casper.start();

function parseHtml(accountName, accountNumber) {
    var page = 'https://bank.barclays.co.uk/olb/balances/SeeStatementsDirect.action?productIdentifier=' + accountNumber;
    casper.thenOpen(page, function openAccount() {
        // this.echo('Opened statement for: ' + accountNumber, "DEBUG");
        this.then(function openAccountThen () {
            var res = this.evaluate(function parseStatement() {
                var txns = {};
                var txn_list = [];
                var rows = document.querySelectorAll('table#filterable tbody tr');
                if (rows.length) {
                    [].forEach.call(rows, function (row) {
                        if (row.id) {
                            var row_id = row.id.replace(/transaction_(\d+).*/, '$1');
                            var txd;
                            if (txns[row_id]) {
                                txd = txns[row_id];
                            } else {
                                txd = {};
                                txn_list.push(txd);
                                txns[row_id] = txd;
                            }
                            if (row.id.indexOf('reveal') !== -1) {
                                txd['amount'] = row.querySelector('.spend').innerText.trim();
                                txd['trans-type'] = row.querySelector('.trans-type').innerText.trim();
                                if (row.querySelectorAll('.keyword-search')[2]) {
                                    txd['ref'] = row.querySelectorAll('.keyword-search')[2].innerText.trim();
                                }
                                if (row.querySelectorAll('.keyword-search')[3]) {
                                    txd['ref2'] = row.querySelectorAll('.keyword-search')[3].innerText.trim();
                                }
                            } else {
                                txd['date'] = row.querySelector('.date').innerText.trim();
                                txd['description'] = row.querySelector('.description').innerText.trim();
                                txd['balance'] = row.querySelector('.balance').innerText.trim();
                            }
                        }
                    });
                } else {
                    rows = document.querySelectorAll('table#filterable-ftb tbody tr');
                    if (rows.length) {
                        [].forEach.call(rows, function (row) {
                            if (row.id) {
                                var row_id = row.id.replace(/transaction_(\d+).*/, '$1');
                                var txd;
                                txd = {};
                                txn_list.push(txd);
                                txns[row_id] = txd;
                                txd['amount'] = row.querySelector('[headers=header-money-in]').innerText.trim()
                                    || row.querySelector('[headers=header-money-out]').innerText.trim();
                                txd['description'] = row.querySelector('.description span').innerText.trim();
                                txd['date'] = row.querySelector('[headers=header-date]').innerText.trim();
                                txd['balance'] = row.querySelector('[headers=header-balance]').innerText.trim();
                                var transType = row.querySelector('.description div.additional-data div');
                                txd['trans-type'] = transType.innerText.trim();
                                var refs = transType.nextSibling.textContent.split('\n');
                                var refParts = [];
                                refs.forEach(function (ref) {
                                    var refTrim = ref.trim();
                                    if (refTrim) {
                                        refParts.push(refTrim);
                                    }
                                });
                                txd['ref'] = refParts[0];
                                txd['ref2'] = refParts[1];
                            }
                        });
                    }
                }
                return txn_list;
            });
            var statement = [].slice.call(res);
            writeCsv(accountName, accountNumber, statement);
        });
    });
}

function writeCsv(accountName, accountNumber, statement) {
    var filename = accountName + '.csv';
    var csvLines = statement.map(function (d) {
        var ref = '';
        if (d.ref) {
            ref = "-" + d.ref;
            if (d.ref2) {
                ref = ref + '-' + d.ref2;
            }
        }
        return d['date'] + ',' + d['trans-type'] + '-' + d['description'] + ref + ',' + d['amount'].replace(/[£,]/g, '');
    });

    require('fs').write('export/' + filename, [].join.call(csvLines, '\n'), 'w');
    casper.echo("Exporting " + accountName + " account: " + accountNumber + " (" + csvLines.length + " rows)");
}

barclayscrape.login(casper, {
    onAccounts: function (accounts) {
        // Iterate through each account and export it
        for (var accountName in accounts) {
            var accountNumber = accounts[accountName];
            parseHtml(accountName, accountNumber);
        }
    }
});

casper.run();

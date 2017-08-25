#!/usr/bin/env casperjs
var casper = require('casper').create({
    verbose: true,
    // logLevel: "debug",
    pageSettings: {
        webSecurityEnabled: false
    }
});
var barclayscrape = require("./barclayscrape");
casper.start();

function parseHtml(account) {
    var page = 'https://bank.barclays.co.uk/olb/balances/SeeStatementsDirect.action?productIdentifier=' + account.number;
    casper.thenOpen(page, function openAccount() {
        // this.echo('Opened statement for: ' + account.number, "DEBUG");
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
            writeCsv(account, statement);
        });
    });
}

function writeCsv(account, statement) {
    var filename = account.name + '.csv';
    var csvLines = statement.map(function (d) {
        var ref = '';
        if (d.ref) {
            ref = "-" + d.ref;
            if (d.ref2) {
                ref = ref + '-' + d.ref2;
            }
        }
        return d['date'] + ',' + d['trans-type'].replace(/,/g, ';') + '-' + d['description'].replace(/,/g, ';') + ref + ',' + d['amount'].replace(/[£,]/g, '');
    });
    
    csvLines.unshift('Date,Reference,Amount');
    require('fs').write('export/' + filename, [].join.call(csvLines, '\n'), 'w');
    var extraLog = '';
    if (account.name != account.number) {
        extraLog = ' (' + account.number + ')'
    }
    casper.echo("Exporting " + account.name + extraLog + " (" + (csvLines.length - 1) + " rows)");
}

barclayscrape.login(casper, {
    onAccounts: function (accounts) {
        // Iterate through each account and export it
        for (var accountNumber in accounts) {
            parseHtml(accounts[accountNumber]);
        }
    }
});

casper.run(function() {
    // workaround to suppress benign stdout errors - https://github.com/ariya/phantomjs/issues/12697
    var _this = this;
    _this.page.close();
    setTimeout(function exit(){
        _this.exit(0);
    }, 0);
});

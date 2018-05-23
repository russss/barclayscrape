#!/usr/bin/env casperjs
var casper = require('casper').create({
    verbose: true,
    // logLevel: "debug",
    pageSettings: {
        webSecurityEnabled: false
    }
});
var x = require('casper').selectXPath;
var barclayscrape = require("./barclayscrape");

casper.start();

// Download an OFX file for a given account
function downloadOfx (account) {
    casper.then(function clickAccountLink() {
        // Click the link using the javascript .click() in-browser. This allows us to click
        // links which aren't visible in-page (if we're on the Personal tab and the link is
        // on the Business tab)
        var accountLink = "#a" + account.idx + " #showStatements"
        casper.log("Clicking account link " + accountLink, "debug");
        this.evaluate(function(selector) {
            $(selector).click();
        }, accountLink);
    });

    casper.waitForSelector("a.export", function() {
        doDownload(account);
    }, function noExportLink() {
        // Accounts with no transactions have no export link
        casper.log("No export option for account " + account.idx + " - possibly no transactions", "warn");
        var extraLog = '';
        if (account.name != account.number) {
            extraLog = ' (' + account.number + ')'
        }
        this.echo("No txns for " + account.name + extraLog);
    }, 10000);

    // Return to the main page
    casper.thenClick("#logo");
    casper.waitForSelector(".account-paging");
}

function doDownload(account) {
    var filename = 'export/' + account.name + '.ofx';
    var extraLog = '';
    if (account.name != account.number) {
        extraLog = ' (' + account.number + ')'
    }
    casper.echo("Downloading " + account.name + extraLog);
    var el = casper.getElementInfo(x("//a[text()[contains(., ' Money 2001')]]"));
    casper.download(el['attributes']['href'], filename);
}

barclayscrape.login(casper, {
    onAccounts: function (accounts) {
        // Iterate through each account and export it
        for (var accountNumber in accounts) {
            downloadOfx(accounts[accountNumber]);
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

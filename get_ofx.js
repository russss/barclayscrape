#!/usr/bin/env casperjs
var casper = require('casper').create({
    verbose: false,
    pageSettings: {
        webSecurityEnabled: false
    }
});
var barclayscrape = require("./barclayscrape");

casper.start();

// Download an OFX file for a given account
function downloadOfx (accountId, accountNumber) {
    casper.then(function clickAccountLink() {
        // Click the link using the javascript .click() in-browser. This allows us to click
        // links which aren't visible in-page (if we're on the Personal tab and the link is
        // on the Business tab)
        var account = "#a" + accountId + " #showStatements"
        casper.log("Clicking account link " + account, "debug");
        this.evaluate(function(selector) {
            $(selector).click();
        }, account);
    });

    casper.waitForSelector("a.export", function() {
        doDownload(accountId, accountNumber);
    },
    function noExportLink() {
        // Accounts with no transactions have no export link
        casper.log("No export option for account " + accountId + " - possibly no transactions", "warn");
    }, 10000);

    // Return to the main page
    casper.thenClick("#logo");
    casper.waitForSelector(".account-paging");
}

function doDownload(accountId, accountNumber) {
    casper.thenClick("a.export");
    casper.waitForSelector("div.export-options");
    casper.then(function downloadOFXFile() {
        // Here we cheat and just fetch the URL.
        var filename = accountNumber + '.ofx';
        this.echo("Downloading " + filename, "INFO");
        var url = 'https://bank.barclays.co.uk/olb/balances/ExportData_FTB.action?reqSoftwarePkgCode=4&accountIdentifierIndex=' + accountId;
        this.download(url, filename);
    });
}

barclayscrape.login(casper, {
    onAccounts: function (accounts) {
        // Iterate through each account and export it
        for (var accountId in accounts) {
            var accountNumber = accounts[accountId];
            downloadOfx(accountId, accountNumber);
        }
    }
});

casper.run();

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

function downloadOfx (accountName, accountNumber) {
    casper.thenOpen('https://bank.barclays.co.uk/olb/balances/ExportDataStep1.action', function() {
        this.echo("Exporting account: " + accountNumber, "INFO");
        this.fill('.process-form', {
                 'reqSoftwarePkgCode': 7, // Microsoft Money 2002 (i.e. OFX)
                 'productIdentifier': accountNumber});
    });
    casper.thenClick('input[type="submit"]'); // Next
    casper.waitForSelector('#fromExportDate'); // Wait for the details form
    casper.thenClick('.btn-right input[type="submit"]'); // Next
    casper.waitForSelector('.body', function exportConfirmation() { // Wait for confirmation page
        if (casper.exists('div.section-error')) {
            this.echo("Can't download OFX for " + accountNumber + " (probably nothing there)", "COMMENT");
        } else {
            var filename = accountName + '.ofx';
            this.echo("Downloading " + filename, "INFO");
            // Here we have to be a bit messy and send the post request manually, as
            // Casper/Phantom has no way of catching the downloaded file if we click the button.
            var requestid = this.getElementAttribute('input[name="requestid"]', 'value');
            this.download('https://bank.barclays.co.uk/olb/balances/ExportDataStep2.action', filename, 'POST', {
                'requestid': requestid,
                'requesttoken': '',
                'action:ExportDataStep2All_download': 'Download'
            });
        }
    });
}

barclayscrape.login(casper, {
    onAccounts: function (accounts) {
        // Iterate through each account and export it
        for (var accountName in accounts) {
            var accountNumber = accounts[accountName];
            downloadOfx(accountName, accountNumber);
        }
    }
});

casper.run();

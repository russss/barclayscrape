var casper = require('casper').create({
    verbose: true,
    logLevel: "error",
    pageSettings: {
        webSecurityEnabled: false
    }
});
var childProcess = require("child_process");
var barclayscrape = require("./barclayscrape");
casper.start();
var accounts = [];
if (!casper.cli.has("otp")) {
    casper.die("Usage: casperjs ./get_ofx.js --otp=12345678");
}

casper.echo('Barclayscrape Starting', 'INFO');

casper.on('error', function() {
    this.capture('error.png');
    this.exit(1);
});

casper.userAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)');

barclayscrape.login(casper, String(casper.cli.get('otp')));

// Load the "Export my Data" modal. There might be an export data widget on the dashboard,
// but we shouldn't rely on it.
casper.thenClick('a#accounts-menu');
casper.waitForSelector('.mega-menu-wrapper'); // "Mega"
casper.thenClick('a[href="/olb/balances/ExportDataStep1.action"]');

// Obtain a list of all accounts
casper.then(function fetchAccountList() {
    accounts = this.evaluate(function() {
        var nodes = document.querySelectorAll('div#listproductIdentifier input');
        var account_nodes = [].filter.call(nodes, function(node) {
            // Remove "special" account names (all/business/personal)
            return node.value != 'All' && node.value != 'BUSINESS' && node.value != 'PERSONAL';
        });
        return [].map.call(account_nodes, function(node) {
            return node.value;
        });
    });

    // Iterate through each account and export it
    this.each(accounts, function fetchAccount(self, account) {
        self.thenOpen('https://bank.barclays.co.uk/olb/balances/ExportDataStep1.action', function() {
            this.echo("Exporting account: " + account, "INFO");
            this.fill('.process-form', {
                     'reqSoftwarePkgCode': 7, // Microsoft Money 2002 (i.e. OFX)
                     'productIdentifier': account});
        });
        self.thenClick('input[type="submit"]'); // Next
        self.waitForSelector('#fromExportDate'); // Wait for the details form
        self.thenClick('.btn-right input[type="submit"]'); // Next
        self.waitForSelector('.body', function exportConfirmation() { // Wait for confirmation page
            if (casper.exists('div.section-error')) {
                this.echo("Can't download OFX for " + account + " (probably nothing there)", "COMMENT");
            } else {
                var filename = account + '.ofx';
                this.echo("Downloading " + filename, "INFO");
                // Here we have to be a bit messy and send the post request manually, as
                // Casper/Phantom has no way of catching the downloaded file if we click the button.
                var requestid = this.getElementAttribute('input[name="requestid"]', 'value');
                this.download('https://bank.barclays.co.uk/olb/balances/ExportDataStep2.action',
                              filename, 'POST',
                              {'requestid': requestid,
                               'requesttoken': '',
                               'action:ExportDataStep2All_download': 'Download'
                              });
            }
        });
    });
});


casper.run(function complete() {
    this.echo("Accounts exported: " + accounts, "INFO");
    this.exit();
});

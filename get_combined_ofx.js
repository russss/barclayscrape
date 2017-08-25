#!/usr/bin/env casperjs
// Download a combined .ofx file of all accounts into export/all.ofx.
var casper = require('casper').create({
    verbose: false,
    //logLevel: 'debug',
    pageSettings: {
        webSecurityEnabled: false
    }
});
var barclayscrape = require("./barclayscrape");
var export_link_text = "Export my transaction data";

casper.start();

function downloadCombinedOfx () {
    casper.then(function clickAccountLink() {
        // Click the link using the javascript .click() in-browser. This allows us to click
        // the "View all online services" link in the (you can't make it up) "megaMenu":
        var account = "a#megaMenu_1_viewAllOnlineServices";
        casper.log("Clicking account link", "debug");
        this.evaluate(function(selector) {
            $(selector).click();
        }, account);
    });

    // Barclays, you are really spoiling us with your semantic element IDs.
    casper.waitForText(export_link_text, function() {
        doDownload();
    },
    function noExportLink() {
        casper.log("No export link found", "warn");
    }, 10000);
}

function doDownload() {
    casper.clickLabel(export_link_text);
    casper.waitForSelector("input#reqSoftwarePkgCode0");

    // Because this website does unholy things with forms and JS, we can't simply fill the form,
    // we have to go through the motions of clicking on the "Microsoft (R) Money 2002" option.
    casper.thenClick("div.reqSoftwarePkgCode .handle");
    casper.thenClick('label[for="reqSoftwarePkgCode6"]');
    casper.thenClick('input#next_step1');

    casper.waitForSelector("input#data-download", function downloadOFXFile() {
        requestid = casper.getElementAttribute('form.process-form input[name="requestid"]', "value");
        var url = "https://bank.barclays.co.uk/olb/balances/ExportDataStep2All.action";
        this.echo("Downloading all.ofx");
        this.download(url, 'export/all.ofx', 'POST', {'requestid': requestid,
                                               'requesttoken': '',
                                               'action:ExportDataStep2All_download': 'Download'});
        casper.log("Statement for all accounts downloaded to all.ofx", "INFO");
    }, function step1Timeout() {
        casper.log("Unable to submit export data form step 1. Error saved.", "error");
        this.capture("combined-export-step1-error.png");
    }, 10000);
}

barclayscrape.login(casper, {
    onLogin: function () {
        downloadCombinedOfx();
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

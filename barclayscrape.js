var config = require("./config");

function login(casper, loginOpts) {
    loginOpts = loginOpts || {};
    if (casper.cli.has("otp")) {
        loginOpts.otp = String(casper.cli.get('otp'));
    } else {
        casper.echo('Identify with mobile pin sentry: ', 'INFO');
        loginOpts.motp = require('system').stdin.readLine();
    }

    casper.on('error', function(msg, backtrace) {
        this.capture('error.png');
        this.die(msg, 1);
    });
    casper.userAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)');

    casper.on('remote.message', function(msg) {
        this.log('console message: ' + msg, 'debug');
    });
    casper.on("page.error", function(msg, backtrace) {
        this.log('JS error: ' + msg, 'debug');
        this.log(JSON.stringify(backtrace), 'debug');
    });
    casper.thenOpen('https://bank.barclays.co.uk/olb/auth/LoginLink.action', function loginStageOne() {
        this.log("Login stage 1");
        var part1, part2;
        if (loginOpts.motp) {
            part1 = loginOpts.motp.slice(0, 4);
            part2 = loginOpts.motp.slice(4, 8);
        } else if (config.card_digits && loginOpts.otp) {
            part1 = loginOpts.otp.slice(0, 4);
            part2 = loginOpts.otp.slice(4, 8);
        } else {
            this.die("Please provide card_digits and otp or motp", 3);
        }
        if (this.exists("form#accordion-top-form")) {
            this.fill("form#accordion-top-form", {
                'surname': config.surname,
                'membershipNumber': config.membership_number
            });
            this.click('button#forward');
            this.waitForSelector('input#card-digits', function loginStageTwo() {
                this.log("Login stage 2");
                this.fill('form#accordion-bottom-form', {
                    'cardDigits': config.card_digits,
                    'oneTimePasscode1': part1,
                    'oneTimePasscode2': part2
                });
                this.click('button#log-in-to-online-banking');
            }, function loginStageTwoTimeout() {
                this.capture("login-error.png");
                this.debugHTML();
                this.die("Login stage 2 timeout. Screenshot saved to login-error.png.", 2);
            }, 10000);
        } else {
            this.fill("form#login-form", {
                'surname': config.surname,
                'membershipNumber': config.membership_number
            });
            this.click('input.action-button');

            this.waitForSelector('input#showMobilePINsentryTag-hidden-field',function loginStageTwo() {
                this.log("Login stage 2");
                if (this.exists('#pinsentryRadioBtn-card') && this.exists('#pinsentryRadioBtn-mobile')) {
                    // These options only exist if you've enabled
                    // mobile PINSentry on your account
                    if (loginOpts.motp) {
                        this.click('#pinsentryRadioBtn-mobile');
                    } else {
                        this.click('#pinsentryRadioBtn-card');
                    }
                    // Not strictly necessary for the scraper but
                    // remove the dupe name fields so that casper/phantom
                    // doesn't get confused when checking getFormValues
                    this.evaluate(function removeMotpFields () {
                        if (loginOpts.motp) {
                            __utils__.removeElementsByXPath('//*[@id="pin-authorise1"]');
                            __utils__.removeElementsByXPath('//*[@id="pin-authorise2"]');
                        } else {
                            __utils__.removeElementsByXPath('//*[@id="pin-authorise3"]');
                            __utils__.removeElementsByXPath('//*[@id="pin-authorise4"]');
                        }
                    });
                }
                this.fill('form#login-form', {
                    'cardDigits': config.card_digits,
                    'oneTimePasscode1': part1,
                    'oneTimePasscode2': part2
                });
                this.log(JSON.stringify(this.evaluate(function checkLoginFormValues () {
                    return __utils__.getFormValues('form#login-form');
                })), 'debug');

                this.click('input.action-button:not(.cancel)');
            }, function loginStageTwoTimeout() {
                this.capture("login-error.png");
                this.die("Login stage 2 timeout. Screenshot saved to login-error.png.", 2);
            }, 10001);
        }
    });

    casper.then(function completeLogin() {
        this.log("Waiting to be logged in", "debug");
        this.waitForSelector('a#logout', function waitForLogin() {
            this.echo("Successfully logged in", "INFO");
            if (loginOpts.onAccounts) {
                fetchAccounts(this, loginOpts.onAccounts);
            }
        }, function loginTimeout(response) {
            this.capture("login-error.png");
            this.echo("Surname: " + config.surname);
            this.echo("Membership number: " + config.membership_number);
            this.echo("Card digits: " + config.card_digits);
            this.die("Login timeout. Check credentials. Screenshot saved to login-error.png.", 2);
        }, 10002);
    });
}

// Obtain a list of all accounts
function fetchAccounts(casper, then) {
    if (config.accounts) {
        then(config.accounts);
    } else {
        // Load the "Export my Data" modal. There might be an export data widget on the dashboard,
        // but we shouldn't rely on it.
        casper.thenClick('a#accounts-menu');
        casper.waitForSelector('.mega-menu-wrapper'); // "Mega"
        casper.thenClick('a[href="/olb/balances/ExportDataStep1.action"]');
        casper.then(function fetchAccountList() {
            var accounts = {};
            var account_list = this.evaluate(function() {
                var nodes = document.querySelectorAll('div#listproductIdentifier input');
                var account_nodes = [].filter.call(nodes, function(node) {
                    // Remove "special" account names (all/business/personal)
                    return node.value != 'All' && node.value != 'BUSINESS' && node.value != 'PERSONAL';
                });
                return [].map.call(account_nodes, function(node) {
                    return node.value;
                });
            });
            this.each(account_list, function (self, acct) {
                accounts[acct] = acct;
            });
            then(accounts);
        });
    }
}

module.exports = {login: login};

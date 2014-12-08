var config = require("./config");

function login(casper, loginOpts) {
    loginOpts = loginOpts || {};
    if (casper.cli.has("otp")) {
        loginOpts.otp = String(casper.cli.get('otp'));
    } else {
        casper.echo('Identify with mobile pin sentry: ', 'INFO');
        loginOpts.motp = require('system').stdin.readLine();
    }

    casper.on('error', function() {
        this.capture('error.png');
        this.exit(1);
    });
    casper.userAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)');
    casper.on('remote.message', function(msg) {
        this.log('console message: ' + msg);
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
            this.die("Please provide card_digits and otp or motp");
        }
        if (this.exists("form#accordion-top-form")) {
            this.fill("form#accordion-top-form", {
                'surname': config.surname,
                'membershipNumber': config.membership_number
            });
            this.click('button#forward');
            this.waitForSelector('input#card-digits', function loginStageTwo() {
                this.log("Login stage 2");
                if (loginOpts.motp) {
                    this.fill('form#accordion-bottom-form', {
                        'oneTimePasscode1': part1,
                        'oneTimePasscode2': part2
                    });
                } else if (config.card_digits && loginOpts.otp) {
                    this.fill('form#accordion-bottom-form', {
                        'cardDigits': config.card_digits,
                        'oneTimePasscode1': part1,
                        'oneTimePasscode2': part2
                    });
                }
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

            this.waitForSelector('input#showMobilePINsentryTag-hidden-field',function waitForLogin() {
                if (loginOpts.motp) {
                    this.fillSelectors('form#login-form', {
                        '#pin-authorise1': '',
                        '#pin-authorise2': '',
                        '#pin-authorise3': part1,
                        '#pin-authorise4': part2,
                        '#pinsentryRadioBtn-mobile': 'mobilePINsentry'
                    });
                } else if (config.card_digits && loginOpts.otp) {
                    this.fillSelectors('form#login-form', {
                        '#card-digits': config.card_digits,
                        '#pin-authorise1': part1,
                        '#pin-authorise2': part2,
                        '#pin-authorise3': '',
                        '#pin-authorise4': '',
                        '#pinsentryRadioBtn-card': 'cardPINsentry'
                    });
                }
                this.click('input.action-button:not(.cancel)');
            }, function loginStageTwoTimeout() {
                this.capture("login-error.png");
                this.die("Login stage 2 timeout. Screenshot saved to login-error.png.", 2);
            }, 10000);
        }
    });

    casper.then(function completeLogin() {
        this.waitForSelector('a#logout', function waitForLogin() {
            this.echo("Successfully logged in", "INFO");
            if (loginOpts.onAccounts) {
                fetchAccounts(this, loginOpts.onAccounts);
            }
        }, function loginTimeout(response) {
            this.capture("login-error.png");
            this.die("Login timeout. Screenshot saved to login-error.png.", 2);
        }, 10000);
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

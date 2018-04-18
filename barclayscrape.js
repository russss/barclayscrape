var config = require("./config");

function initErrorHandlers(casper) {
    casper.on("resource.error", function(resourceError){
        var level = 'error';
        if (resourceError.errorCode == 5) {
            // Operation Cancelled. This appears to be benign.
            level = 'info';
        }
        this.log('Unable to load resource (error #' + resourceError.id + 
                    ' URL: ' + resourceError.url + ')', level);
        this.log('Error code: ' + resourceError.errorCode + 
                 '. Description: ' + resourceError.errorString, level);
    });

    casper.on('error', function(msg, backtrace) {
        this.capture('error.png');
        this.die(msg, 1);
    });

    casper.on('remote.message', function(msg) {
        this.log('console message: ' + msg, 'debug');
    });

    casper.on("page.error", function(msg, backtrace) {
        this.log('JS error: ' + msg, 'debug');
        this.log(JSON.stringify(backtrace), 'debug');
    });

    casper.on('waitFor.timeout', function(timeout, details) {
        if ('selector' in details) {
            if (details['selector'] == "a.export") {
                // This is an expected timeout and an ugly way to handle it.
                return;
            }
            this.log("Timeout waiting for " + details.selector, "error")
        }
        this.capture('waitfor-timeout.png');
        this.log("Screenshot saved to waitfor-timeout.png.", "error");
    });
}

function login(casper, loginOpts) {
    initErrorHandlers(casper);
    loginOpts = loginOpts || {};
    if (casper.cli.has("otp")) {
        loginOpts.otp = String(casper.cli.get('otp'));
    } else if (casper.cli.has("pcode") && casper.cli.has("mcode")) {
        loginOpts.pcode = String(casper.cli.get('pcode'));
        loginOpts.mcode = String(casper.cli.get('mcode'));
    } else {
        casper.echo('Identify with mobile pin sentry: ', 'INFO');
        loginOpts.motp = require('system').stdin.readLine();
    }

    casper.userAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.49 Safari/537.36');

    casper.thenOpen('https://bank.barclays.co.uk/olb/authlogin/loginAppContainer.do#/identification', function loginStageOne() {
        this.log("Login stage 1");

        if (!("surname" in config) || config.surname == "") {
            this.die("Please provide the surname field in the config");
        }
        if (!("membership_number" in config) || config.membership_number == "") {
            this.die("Please provide the membership_number field in the config.");
        }

        var part1, part2;
        if (loginOpts.motp) {
            part1 = loginOpts.motp.slice(0, 4);
            part2 = loginOpts.motp.slice(4, 8);
        } else if (config.card_digits && loginOpts.otp) {
            part1 = loginOpts.otp.slice(0, 4);
            part2 = loginOpts.otp.slice(4, 8);
        } else if (!(loginOpts.mcode && loginOpts.pcode)) {
            this.die("Please provide card_digits, plus either otp or motp (or pcode and mcode)", 3);
        }

        this.waitForSelector('input#membershipNum0', function loginStageOneA() {
            this.fill('form[name="loginStep1"]', {
                'surname': config.surname,
                'membershipNum': config.membership_number
            });
            this.click('button[title="Next Step"]');
        });
        
        // log in via passcode and memorable password
        if (loginOpts.pcode && loginOpts.mcode) {
            var chars = [];
            
            this.log("Login stage 2 - Passcode and Memorable word");
            
            // select passcode radio button as authentication method
            this.waitForSelector("div.row.selectRadio span.radio-control:nth-of-type(2)", function() {
                this.click("div.row.selectRadio span.radio-control:nth-of-type(2)");
            });
            
            this.waitUntilVisible('input#passcode0', function loginStageOneB() {
                if (this.waitUntilVisible("label#label-memorableCharacters", function loginStageOneB_DetectPasscodeIndices() {
                    // parse the two requested indices (ie, "1st " and "12th") from memorable password
                    var indices = this.evaluate(function getIndices() {
                        var digits = /^[0-9]{1,2}/;
                        return [
                            document.querySelector("label#label-memorableCharacters strong:nth-of-type(1)").innerText.match(digits),
                            document.querySelector("label#label-memorableCharacters strong:nth-of-type(2)").innerText.match(digits)
                        ];
                    });
                    
                    // ensure both indices are valid and adjust to 0-based
                    for (var i=0; i<2; i++) {
                        indices[i]--;
                        if ((indices[i] === null) || (indices[i] < 0)) {
                            this.capture("login-error.png");
                            this.die("Failed to parse requested memorable password indices. Screenshot saved to login-error.png.", 2);
                        }

                        if (indices[i] >= loginOpts.mcode.length) {
                            this.capture("login-error.png");
                            this.die("Requested char: "+ indices[i].toString() +" exceeded length of supplied mcode: "+loginOpts.mcode.length.toString()+". Screenshot saved to login-error.png.", 2);
                        }
                    }
        
                    // extract the two requested characters from memorable password
                    chars = [loginOpts.mcode.substring(indices[0], indices[0]+1), loginOpts.mcode.substring(indices[1],indices[1]+1)];
                }, function () {
                    this.die("Was unable to determine passcode character indices");
                }));
                
                this.waitForSelector('input#passcode0, input[name="firstMemorableCharacter"], input[name="secondMemorableCharacter"]', function loginStageOneB_Passcode() {
                    this.sendKeys('input#passcode0', loginOpts.pcode);
                });
            
                this.waitForSelector('input[name="firstMemorableCharacter"]', function loginStageOneB_Char1() {
                    this.click("div.dropdown.firstMemorableCharacter");
                    this.waitForSelector("div.dropdown.firstMemorableCharacter div.dropdown__options-list.closed", function () {
                        this.sendKeys('div.dropdown.firstMemorableCharacter', chars[0]);
                    });
                });
                
                this.waitForSelector('input[name="secondMemorableCharacter"]', function loginStageOneB_Char2() {
                    this.click("div.dropdown.secondMemorableCharacter");
                    this.waitForSelector('div.dropdown.secondMemorableCharacter', function () {
                        this.sendKeys('div.dropdown.secondMemorableCharacter', chars[1]);
                        this.capture('debug-post.png');
                        this.waitForSelector("div.dropdown.secondMemorableCharacter div.dropdown__options-list.closed", function () {
                            this.click('button[title="Log in to Online Banking"]');
                        });
                    });
                });
            });
        }
        else
        {
            // login via PIN sentry
            var pinSentryInputs = loginOpts.motp ?
                'input#mobilePinsentryCode0' : 'input#pinsentryCode0';
            var pinSentryRadios = '[ng-controller="authTFACtrl"] ' +
                (loginOpts.motp ? 'input#radio-c3' : 'input#radio-c4');
            var pinSentryAny = pinSentryInputs + ',' + pinSentryRadios;
            // Wait for the radio buttons or just the inputs if this
            // account doesn't have the choice
            this.waitForSelector(pinSentryAny, function loginStageTwoA() {
                // This is either the login screen, or a page to select the login method
                this.log("Login stage 2 - PINSentry");


                // Select the login method if we get the choice
                if (this.exists(pinSentryRadios)) {
                    this.click(pinSentryRadios);
                }
            });
            // Wait for the inputs again in case we switched radio buttons
            this.waitForSelector(pinSentryInputs, function loginStageTwoA() {
                // This is the main login screen.
                if (loginOpts.motp) {
                    this.sendKeys('input#mobilePinsentryCode0', part1);
                    this.sendKeys('input#mobilePinsentryCode1', part2);
                } else {
                    this.sendKeys('input#lastDigits0', config.card_digits);
                    this.sendKeys('input#pinsentryCode0', part1);
                    this.sendKeys('input#pinsentryCode1', part2);
                }
                this.click('button[title="Log in to Online Banking"]');
            }, function loginStageTwoTimeout() {
                this.die("Login stage 2 timeout.", 2);
            });
        }
    });

  casper.then(function completeLogin() {
    this.log("Waiting to be logged in", "debug");
    this.waitForSelector('a#logout', function waitForLogin() {
      this.echo("Successfully logged in", "INFO");
      if (loginOpts.onLogin) {
        loginOpts.onLogin();
      }
      if (loginOpts.onAccounts) {
        fetchAccounts(this, loginOpts.onAccounts);
      }
    }, function loginTimeout(response) {
      this.click('button[title="Log in to Online Banking"]');
      this.waitForSelector('a#logout', function waitForLogin() {
        this.echo("Successfully logged in", "INFO");
        if (loginOpts.onLogin) {
          loginOpts.onLogin();
        }
        if (loginOpts.onAccounts) {
          fetchAccounts(this, loginOpts.onAccounts);
        }
      }, function loginTimeoutTwo(response) {
        this.echo("Surname: " + config.surname);
        this.echo("Membership number: " + config.membership_number);
        this.echo("Card digits: " + config.card_digits);
        this.die("Login timeout. Check credentials.", 2);
      }, 5000);
    }, 5000);
  });
}

// Obtain a list of all accounts
function fetchAccounts(casper, then) {
    casper.then(function fetchAccountList() {
        var fullAccounts = {};
        var account_list = this.evaluate(function() {
            var account_nodes = document.querySelectorAll("a#account-actions");
            return [].map.call(account_nodes, function(node) {
                var id = node.getAttribute("data-productindex");
                var product = node.getAttribute("data-productid");
                return [id, product];
            });
        });
        this.each(account_list, function (self, acct) {
            fullAccounts[acct[1]] = {
                number: acct[1],
                name: acct[1],
                idx: acct[0]
            };
        });
        casper.log('Fetched accounts: ' + JSON.stringify(accounts), 'debug');
        var accounts = {};
        if (config.accounts) {
            for (var accountName in config.accounts) {
                var accountNumber = config.accounts[accountName];
                accounts[accountNumber] = fullAccounts[accountNumber];
                accounts[accountNumber].name = accountName;
            }
        } else {
            accounts = fullAccounts;
        }
        casper.log('Named accounts: ' + JSON.stringify(accounts), 'debug');
        then(accounts);
    });
}

module.exports = {login: login};

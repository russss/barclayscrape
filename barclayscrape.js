var config = require("./config");

function login(casper, otp) {
    casper.thenOpen('https://bank.barclays.co.uk/olb/auth/LoginLink.action', function loginStageOne() {
        this.log("Login stage 1");
        this.fill("form#accordion-top-form", {
            'surname': config.surname,
            'membershipNumber': config.membership_number});
    });

    casper.then(function() {
        casper.click('button#forward');
    });

    casper.waitForSelector('input#card-digits', function loginStageTwo() {
        this.log("Login stage 2");
        part1 = otp.slice(0, 4)
        part2 = otp.slice(4, 8)
        this.fill('form#accordion-bottom-form', {
            'cardDigits': config.card_digits,
            'oneTimePasscode1': part1,
            'oneTimePasscode2': part2
        });
    });

    casper.then(function completeLogin() {
        casper.click('button#log-in-to-online-banking');
    });

    casper.waitForSelector('a#logout', function waitForLogin() {
        this.echo("Successfully logged in", "INFO");
    },
    function loginTimeout() {
        this.capture("login-error.png");
        this.die("Login Failed! Check your OTP is correct. Screenshot saved to login-error.png.", 2);
    });
};

module.exports = {login: login};

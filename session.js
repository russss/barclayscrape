const puppeteer = require('puppeteer');
const u = require('./utils.js');
const Account = require('./account.js');

class Session {
  async init(options) {
    this.browser = await puppeteer.launch(options);
    this.page = await this.browser.newPage();
    this.logged_in = false;
    //this.page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await this.page.setViewport({width: 1000, height: 1500});
    await this.page.goto('https://bank.barclays.co.uk');
  }

  async close() {
    this.browser.close();
  }

  async loginStage1(credentials) {
    // Stage 1 of login - enter surname and membership number.
    await u.wait(this.page, '#membershipNum0');
    await u.fillFields(this.page, {
      '#surname0': credentials['surname'],
      '#membershipNum0': credentials['membershipno'],
    });
    await u.click(this.page, 'button[title="Next Step"]');
  }

  async loginSelectMethod(method) {
    // Stage 2: If multiple auth methods are enabled for this account,
    // select the correct one.
    
    // Wait for the login button which hopefully means the page has loaded.
    await u.wait(this.page, 'button[title="Log in to Online Banking"]')
    let selector = '[ng-controller="authTFACtrl"] ';
    if (method == 'motp') {
      selector += 'input#radio-c3';
    } else if (method == 'otp') {
      selector += 'input#radio-c4';
    }

    const sel = await this.page.$(selector);
    if (sel) {
      await this.page.$eval(selector, el => { el.click() })
    }
  }

  async ensureLoggedIn() {
    // Check that we're looking at the logged in homepage and throw an
    // error if we aren't.
    await u.wait(this.page, '#module-account-summary');
    this.logged_in = true;
  }

  async loginOTP(credentials) {
    // Log in using a one time password (PinSentry).
    await this.loginStage1(credentials);
    await this.loginSelectMethod('otp');
    await u.wait(this.page, '#pinsentryCode0');
    await u.fillFields(this.page, {
      '#lastDigits0': credentials['card_digits'],
      '#pinsentryCode0': credentials['otp'].slice(0, 4),
      '#pinsentryCode1': credentials['otp'].slice(4, 8),
    });
    await u.click(this.page, 'button[title="Log in to Online Banking"]');
    await this.ensureLoggedIn();
  }

  async loginMOTP(credentials) {
    // Log in using Mobile PinSentry.
    await this.loginStage1(credentials);
    await this.loginSelectMethod('motp');
    await u.wait(this.page, '#mobilePinsentryCode0');
    await u.fillFields(this.page, {
      '#mobilePinsentryCode0': credentials['motp'].slice(0, 4),
      '#mobilePinsentryCode1': credentials['motp'].slice(4, 8),
    });
    await u.click(this.page, 'button[title="Log in to Online Banking"]');
    await this.ensureLoggedIn();
  }

  async accounts() {
    const accs = await this.page.$$('a#account-actions');
    let res = [];
    for (let a of accs) {
      res.push(
        new Account(
          this,
          await u.getAttribute(this.page, a, 'data-productid'),
          await u.getAttribute(this.page, a, 'data-productindex'),
        ),
      );
    }
    return res;
  }

  async home() {
    await u.click(this.page, '#logo');
    await u.wait(this.page, '.account-paging');
  }
}

exports.launch = async (options) => {
  const sess = new Session();
  await sess.init(options);
  return sess;
};

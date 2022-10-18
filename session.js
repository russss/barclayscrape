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
    await u.wait(this.page, '#membership0');
    await u.fillFields(this.page, {
      '#surnameMem': credentials['surname'],
      '#membership0': credentials['membershipno'],
    });
    await u.click(this.page, 'button#continue');
  }

  async loginSelectMethod(method) {
    // There's now a tab bar along the top of the page which needs clicking to switch method.
    let selector = 'button';
    switch (method) {
      case 'motp':
        selector += '#athenticationType_tab_button_0';
        break;

      case 'otp':
        selector += '#athenticationType_tab_button_1';
        break;

      case 'plogin':
        selector += '#athenticationType_tab_button_2';
        break;

      default:
        return;
    }

    await u.wait(this.page, selector);
    await this.page.$eval(selector, el => { el.click() });
  }

  async ensureLoggedIn() {
    // Check that we're looking at the logged in homepage and throw an
    // error if we aren't.
    await u.wait(this.page, '.accounts-body');
    this.logged_in = true;
  }

  async loginOTP(credentials) {
    // Log in using a one time password (PinSentry).
    await this.loginStage1(credentials);
    await this.loginSelectMethod('otp');
    await u.wait(this.page, '#mobilePinsentryCode-input-1');
    await u.fillFields(this.page, {
      'input[name="lastDigits"]': credentials['card_digits'],
      '#mobilePinsentryCode-input-1': credentials['otp'].slice(0, 4),
      '#mobilePinsentryCode-input-2': credentials['otp'].slice(4, 8),
    });

    // Press tab and wait 500ms so annoying JS validation can run
    await this.page.keyboard.press('Tab');
    await new Promise(resolve => setTimeout(resolve, 500));

    await u.click(this.page, 'button#submitAuthentication');
    await this.ensureLoggedIn();
  }

  async loginMOTP(credentials) {
    // Log in using Mobile PinSentry.
    await this.loginStage1(credentials);
    await this.loginSelectMethod('motp');
    await u.wait(this.page, '#mobilePinsentry-input-1');
    await u.fillFields(this.page, {
      '#mobilePinsentry-input-1': credentials['motp'].slice(0, 4),
      '#mobilePinsentry-input-2': credentials['motp'].slice(4, 8),
    });

    // Press tab and wait 500ms so annoying JS validation can run
    await this.page.keyboard.press('Tab');
    await new Promise(resolve => setTimeout(resolve, 500));

    await u.click(this.page, 'button#submitAuthentication');
    await this.ensureLoggedIn();
  }
  
  async loginPasscode(credentials) {
    // Log in using memorable passcode and password
    await this.loginStage1(credentials);
    await this.loginSelectMethod('plogin');
    await u.wait(this.page, '#passcode');
    await u.fillFields(this.page, {
      'input[name="passcode"]': credentials["passcode"]
    })

    let digits = /[0-9]{1,2}/g;
    let char_selectors = [
      'div.memorableWordInputSpaceFirst #memorableCharacters-1',
      'div.memorableWordInputSpace #memorableCharacters-2'
    ];

    for (const [idx, selector] of char_selectors.entries()) {
      await u.wait(this.page, selector);
      let input = await this.page.$(selector)
      let index_label = await this.page.evaluate(el => el.textContent, input)
      let charindex = index_label.match(digits);
      const passcode_char = credentials['password'].substr(charindex-1, 1);
      let field_selector = "input[type='text']#memorableCharacters-input-" + (idx+1).toString();
      await u.fillField(this.page, field_selector, passcode_char)
    }

    // blur the memorable char input (by re-focusing passcode input). This is necessary to allow onblur validation to take place
    await this.page.focus("input#passcode");

    let button_selector = 'button#submitAuthentication';
    await u.wait(this.page, button_selector);
    await u.click(this.page, button_selector);

    // bypass occasional security page, if presented
    await this.loginPasscode_interim_page(credentials);
    await this.ensureLoggedIn();
  }

  async loginPasscode_interim_page(credentials) {
    // check for interim security page
    try {
      await this.page.waitForSelector("span#label-scaCardLastDigits")
    } catch (error) {
      return;
    }

    await u.fillField(this.page, "input#scaCardLastDigits", credentials['card_digits'])
    await u.fillField(this.page, "input#scaSecurityCode", credentials['card_cvv'])
    await u.click(this.page, "button#saveScaAuthentication")
  }

  async accounts() {
    let accData = await this.page.$$eval('.o-account-list__item', accounts => {
      return accounts.map(acc => {
        return [
          acc.querySelector('.my-account-link').getAttribute('href'),
          acc.querySelector('.o-account').getAttribute('id').replace(/[^0-9]/g, ''),
          acc.querySelector('.my-account-link').textContent.trim(),
          acc.querySelector('.o-account__balance-head') !== null ? acc.querySelector('.o-account__balance-head').textContent.trim().replace(/[£$€]/g, '') : ''
        ]
      });
    });
    let res = [];
    accData.forEach(a => {
      if ((a[1] == '') || (a[3] == '')) {
        return;
      }

      res.push(
        new Account(
          this,
          a[0],
          a[1],
          a[2],
          a[3]
        ),
      );
    });
    return res;
  }

  async home() {
    await u.click(this.page, '[aria-label="Home"]');
    await u.wait(this.page, '.accounts-body');
  }
}

exports.launch = async (options) => {
  const sess = new Session();
  await sess.init(options);
  return sess;
};

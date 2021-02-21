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
      '#lastDigits0': credentials['card_digits'],
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
    await u.wait(this.page, '#passcode0');
    
    // detect which character indices are required
    await u.wait(this.page, '#label-memorableCharacters');
    
    const options = await this.page.$$('#label-memorableCharacters');
    for (const option of options) {
        const label = await this.page.evaluate(el => el.innerText, option);

        let digits = /[0-9]{1,2}/g;
        let indices = label.match(digits);

        if (indices.length == 2) {
            const char1 = credentials['password'].substr(indices[0]-1, 1);
            const char2 = credentials['password'].substr(indices[1]-1, 1);
            
            await u.fillFields(this.page, {
                'input[name="passcode"]': credentials["passcode"],
            });
            
            await u.wait(this.page, 'div.dropdown.firstMemorableCharacter div');
            await this.page.focus('div.dropdown.firstMemorableCharacter');
            await u.fillFields(this.page, {
                'div.dropdown.firstMemorableCharacter': char1,
            });

            await u.wait(this.page, 'div.dropdown.secondMemorableCharacter div');
            await this.page.focus('div.dropdown.secondMemorableCharacter');
            await u.fillFields(this.page, {
                'div.dropdown.secondMemorableCharacter': char2,
            });
            
            // arbitrary delay is not ideal, but have been unable to identify a suitable wait candidate for state update
            await this.page.waitForTimeout(1000);
            await u.click(this.page, 'button[title="Log in to Online Banking"]');
            await this.ensureLoggedIn();
        }
    }
  }

  async accounts() {
    let accData = await this.page.$$eval('.o-account-list__item', accounts => {
      return accounts.map(acc => {
        return [
          acc.querySelector('.my-account-link').getAttribute('href'),
          acc.querySelector('.o-account').getAttribute('id').replace(/[^0-9]/g, '')
        ]
      });
    });
    let res = [];
    accData.forEach(a => {
      if (a[1] == '') {
        return;
      }

      res.push(
        new Account(
          this,
          a[0],
          a[1]
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

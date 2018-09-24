const u = require('./utils.js');

// Class for dealing with the Barclays account page.
module.exports = class Account {
  constructor(session, number, idx) {
    this.session = session;
    this.page = session.page;
    this.number = number;
    this.idx = idx;
  }

  async select() {
    // Switch the page to this account.
    // Call `await this.session.home()` to reset state when you're done.
    console.log('Selecting account ' + this.number);
    await this.page.$eval('#a' + this.idx + ' #showStatements', el => el.click());
    // waitForNavigation seems to stall indefinitely here (?!) so we don't use u.click
    await u.wait(this.page, '.transaction-list-container-header');
  }

  async statementOFX() {
    // Return an OFX-formatted string of the most recent account statement.
    await this.select();
    if (!(await this.page.$('a.export'))) {
      console.log(
        'No export option (probably no transactions) for account ' +
          this.number,
      );
      return null;
    }

    // Locate the download links
    const dl_el = await this.page.$x("//a[text()[contains(., ' Money 2001')]]");

    // Fetch the href of this link in the context of the page.
    const ofx = await this.page.evaluate(el => {
      return fetch(el.href, {method: 'GET', credentials: 'include'}).then(r =>
        r.text(),
      );
    }, dl_el[0]);
    console.log('Fetched OFX for account ' + this.number);

    await this.session.home();
    return ofx;
  }

  toString() {
    return '[Account ' + this.number + ']';
  }
};

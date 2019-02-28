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
    await this.page.$eval('#a' + this.idx + ' #showStatements', el => { el.click() });
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
      await this.session.home();
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

  async statement(from, to) {
    // Return a CSV-formatted string of the most recent account statement.
    await this.select();
    if (!(await this.page.$('table#filterable-ftb'))) {
      console.log(
        'No transactions for account ' +
          this.number,
      );
      await this.session.home();
      return [];
    }

    if (from) {
      await this.page.$eval('#searchDateFromBottom', (el, f) => { el.value = f }, from);
    }
    if (to) {
      await this.page.$eval('#searchDateToBottom', (el, t) => { el.value = t }, to);
    }

    // Always perform a search to normalise the html additional-data
    // (yup, the initial format is different :/

    // Remove this so we can wait for it again
    await this.page.$eval('table#filterable-ftb', el => { el.remove() });
    await this.page.$eval('#searchBottom', el => { el.click() });
    await u.wait(this.page, 'table#filterable-ftb');

    // Parse the transactions in the context of the page.
    let transactions = await this.page.evaluate(() => {
      let txns = {};
      let txn_list = [];
      let rows = document.querySelectorAll('table#filterable-ftb tbody tr');
      if (rows.length) {
          [].forEach.call(rows, function (row) {
              if (row.id) {
                  let row_id = row.id.replace(/transaction_(\d+).*/, '$1');
                  let txd;
                  txd = {};
                  txn_list.push(txd);
                  txns[row_id] = txd;
                  txd['amount'] = row.querySelector('[headers=header-money-in]').innerText.trim()
                      || row.querySelector('[headers=header-money-out]').innerText.trim();
                  txd['description'] = row.querySelector('.description span').innerText.trim();
                  txd['date'] = row.querySelector('[headers=header-date]').innerText.trim();
                  txd['balance'] = row.querySelector('[headers=header-balance]').innerText.trim();
                  let transType = row.querySelector('.description div.additional-data div');
                  txd['trans-type'] = transType.innerText.trim();
                  let refs = [];
                  row.querySelectorAll('.description div.additional-data p').forEach((p) => {
                    refs = refs.concat(p.textContent.split('\n'));
                  });
                  let refParts = [];
                  refs.forEach(function (ref) {
                      let refTrim = ref.trim();
                      if (refTrim) {
                          refParts.push(refTrim);
                      }
                  });
                  txd['ref'] = refParts[0];
                  txd['ref2'] = refParts[1];
              }
          });
      }
      return txn_list;
    });

    let statement = [].slice.call(transactions);
    console.log('Fetched statement for account ' + this.number);

    await this.session.home();
    return statement;
  }

  async statementCSV(from, to) {
    let statement  = await this.statement(from, to);
    return this.csvLines(statement);
  }

  csvLines(statement) {
    var csvLines = statement.map(function (d) {
        var ref = '';
        if (d.ref) {
            ref = "-" + d.ref;
            if (d.ref2) {
                ref = ref + '-' + d.ref2;
            }
        }
        return d['date'] + ',' + d['trans-type'].replace(/,/g, ';') + '-' + d['description'].replace(/,/g, ';') + ref + ',' + d['amount'].replace(/[£,]/g, '');
    });
    
    csvLines.unshift('Date,Reference,Amount');
    return csvLines;
  }


  toString() {
    return '[Account ' + this.number + ']';
  }
};

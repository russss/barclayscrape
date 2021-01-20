const u = require('./utils.js');

// Class for dealing with the Barclays account page.
module.exports = class Account {
  constructor(session, href, number) {
    this.session = session;
    this.page = session.page;
    this.number = number;
    this.href = href;
  }

  async select() {
    // Switch the page to this account.
    // Call `await this.session.home()` to reset state when you're done.
    console.log('Selecting account ' + this.number);
    await this.page.$eval('[href="'+u.cssEsc(this.href)+'"]', el => { el.click() });
    // waitForNavigation seems to stall indefinitely here (?!) so we don't use u.click
    await u.wait(this.page, '.transaction-list-container-header');
  }

  async statementOFX() {
    // Return an OFX-formatted string of the most recent account statement.
    await this.select();
    // waitFor is required here as of 12/2020
    await this.page.waitForTimeout(1000);
    if (!(await this.page.$('a.export'))) {
      console.log(
        'No export option (probably no transactions) for account ' +
          this.number,
      );
      await this.session.home();
      return null;
    }

    const ofx = await this.page.evaluate(() => {
      let hashTag = document.querySelector('#trans-hashTag').value;
      let data = JSON.stringify({
        "hashTag": hashTag
      });
      let url = "https://bank.barclays.co.uk/olb/trans/transdecouple/ControllerExportTransaction.do?hashTag=" + hashTag + "&param=" + data + "&downloadFormat=ofx";
      return fetch(url, {method: 'GET', credentials: 'include'}).then(r =>
        r.text(),
      );
    });
    console.log('Fetched OFX for account ' + this.number);

    await this.session.home();
    return ofx;
  }

  async statement(from, to) {
    await this.select();
    if ((await this.page.$('#no-trans-msg'))) {
      console.log(
        'No transactions for account ' +
          this.number,
      );
      await this.session.home();
      return [];
    }

    await u.wait(this.page, '#search');

    if (from) {
      let fromSelector = '[label="From date"] [name=datepicker]';
      await u.wait(this.page, fromSelector);
      await this.page.$eval(fromSelector, (el, f) => {
        el.value = f;
        angular.element(el).triggerHandler('input');
      }, from);
    }
    if (to) {
      let toSelector = '[label="To date"] [name=datepicker]';
      await u.wait(this.page, toSelector);
      await this.page.$eval(toSelector, (el, t) => {
        el.value = t;
        angular.element(el).triggerHandler('input');
      }, to);
    }


    await this.page.$eval('#search', el => { el.click() });

    await this.page.waitForFunction(() => {
      return document.querySelector('#trans-spinner').style.display === 'none';
    });

    // Parse the transactions in the context of the page.
    let transactions = await this.page.evaluate(() => {
      let txns = {};
      let txn_list = [];
      let rows = document.querySelectorAll('#filterable-trans .tbody-trans .tr');
      if (rows.length) {
          [].forEach.call(rows, function (row) {
              if (row.id) {
                  let row_id = row.id.replace(/transaction_(\d+).*/, '$1');
                  let txd;
                  txd = {};
                  txn_list.push(txd);
                  txns[row_id] = txd;
                  txd['amount'] = row.querySelector('.money-in').innerText.trim()
                      || row.querySelector('.money-out').innerText.trim();
                  txd['description'] = row.querySelector('.description span').innerText.trim();
                  let date = new Date(Date.parse(row.querySelector('.date').innerText.trim()));
                  let day = (date.getDate() + '').padStart(2, '0');
                  let month = (date.getMonth() + 1 + '').padStart(2, '0');
                  let year = date.getFullYear();
                  txd['date'] = day + '/' + month + '/' + year;
                  txd['balance'] = row.querySelector('.balance').innerText.trim();
                  let transType = row.querySelector('[headers=header-description] .additional-data-content:not(.ng-scope)');
                  txd['trans-type'] = transType.innerText.trim();
                  let refs = [];
                  let ref1 = row.querySelector('[data-ng-if="entry.narrativeLine2"]');
                  if (ref1) {
                    refs.push(ref1.textContent);
                  }
                  let extraRefs = row.querySelector('[data-ng-if="entry.narrativeLine3to15"]');
                  if (extraRefs) {
                    refs.push(extraRefs.textContent.replace(/\s\s+/g, '\n').split('\n').join(' '));
                  }
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
    let logLine = 'Fetched statement for account ' + this.number;
    if (from) {
      logLine += ' from=' + from;
    }
    if (to) {
      logLine += ' to=' + to;
    }
    console.log(logLine);

    await this.session.home();
    return statement;
  }

  async statementCSV(from, to) {
    // Return a CSV-formatted string of the most recent account statement.
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
        return d['date'] + ',' + d['trans-type'].replace(/,/g, ';') + '-' + d['description'].replace(/,/g, ';') + ref + ',' + d['amount'].replace(/[£, A-Z]/g, '');
    });
    
    csvLines.unshift('Date,Reference,Amount');
    return csvLines;
  }


  toString() {
    return '[Account ' + this.number + ']';
  }
};

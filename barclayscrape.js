#!/usr/bin/env node
const util = require('util');
const path = require('path');
const fs = require('fs');
const fs_writeFile = util.promisify(fs.writeFile);

const program = require('commander');
const Configstore = require('configstore');
const prompt = require('syncprompt');

const pkg = require('./package.json');
const session = require('./session.js');

const conf = new Configstore(pkg.name);

program
  .version(pkg.version)
  .description('Programmatic access to Barclays online banking.')
  .option('--otp [pin]', 'PINSentry code')
  .option('--motp [pin]', 'Mobile PINSentry code')
  .option('--no-headless', 'Show browser window when interacting');

program
  .command('list')
  .description('List all available accounts')
  .action(async options => {
    var sess;
    try {
      sess = await auth();
    } catch (err) {
      console.error(err);
      return;
    }

    try {
      const accounts = await sess.accounts();
      console.table(accounts.map(acc => [acc.number, exportLabel(acc)]));
    } catch (err) {
      console.error(err);
    } finally {
      await sess.close();
    }
  });

program
  .command('get_ofx <out_path>')
  .description('Fetch .ofx files for all accounts into out_path')
  .action(async (out_path, options) => {
    var sess;
    try {
      sess = await auth();
    } catch (err) {
      console.error(err);
      return;
    }

    try {
      const accounts = await sess.accounts();
      for (let account of accounts) {
        const ofx = await account.statementOFX();
        if (ofx) {
          await fs_writeFile(path.join(out_path, exportLabel(account)) + '.ofx', ofx);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      await sess.close();
    }
  });

program
  .command('csv')
  .option('-p, --path <path>', 'Export path. defaults to ./export')
  .description('Fetch .csv files for accounts')
  .option('-f, --from <dd/mm/yyyy>', 'From date')
  .option('-t, --to <dd/mm/yyyy>', 'To date')
  .action(async (options) => {
    var sess;
    try {
      sess = await auth();
    } catch (err) {
      console.error(err);
      return;
    }

    try {
      const accounts = await sess.accounts();
      for (let account of accounts) {
        const csvLines = await account.statementCSV(options.path, options.to);
        if (csvLines) {
          var label = exportLabel(account);
          var extraLog = '';
          if (label != account.number) {
              extraLog = ' (' + account.number + ')'
          }
          let csv = [].join.call(csvLines, '\n');
          let out_path = options.path || 'export';
          console.log("Exporting " + label + extraLog + " (" + (csvLines.length - 1) + " rows)");
          await fs_writeFile(path.join(out_path, label) + '.csv', csv);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      await sess.close();
    }
  });

program
  .command('config')
  .description('Set up login details')
  .action(options => {
    var surname = prompt('Enter your surname: ');
    conf.set('surname', surname);
    do {
      var num = prompt('Enter your online banking membership number: ');
      if (num.length != 12) {
        console.log('Membership number should be 12 digits');
      }
    } while (num.length != 12);
    conf.set('membershipno', num);
    console.log(
      "\nIf you're going to be logging in using PinSentry, please enter the last few\n" +
        "(usually four) digits of your card number, which you're prompted for on login.\n" +
        "If you're using Mobile PinSentry, you can leave this blank.\n",
    );
    var digits = prompt('Enter the last digits of your card number: ');
    conf.set('card_digits', digits);
    console.log(
      "\nIf you want to export statements with a friendly name instead of the account\n" +
        "number, you can add aliases here.\n" +
        "Press enter to continue if you don't need this or once you're finished.\n",
    );
    var account, alias;
    var aliases = {};
    while (true) {
      account = prompt('Enter an account number: ');
      if (!account) {
        break;
      }
      alias = prompt('Enter friendly label: ');
      if (!alias) {
        break;
      }
      aliases[account] = alias;
    }
    conf.set('aliases', aliases);
    console.log('\nBarclayscrape is now configured.');
  });

program.parse(process.argv);

function exportLabel(account) {
  let aliases = conf.get('aliases') || {};
  return aliases[account.number] || account.number;
}

async function auth() {
  if (!(conf.has('surname') && conf.has('membershipno'))) {
    console.error(
      'Barclayscrape has not been configured. Please run `barclayscrape config`',
    );
    program.help();
  }

  if (!(program.otp || program.motp)) {
    console.error('--otp or --motp must be specified');
    program.help();
  }

  if (program.otp && program.otp.length != 8) {
    console.error('OTP should be 8 characters long');
    program.help();
  }

  if (program.motp && program.motp.length != 8) {
    program.motp = prompt('Enter your 8 digit mobile PIN sentry code: ');
  }

  // The --no-sandbox argument is required here for this to run on certain kernels
  // and containerised setups. My understanding is that disabling sandboxing shouldn't
  // cause a security issue as we're only using one tab anyway.
  const sess = await session.launch({
    headless: program.headless,
    args: ['--no-sandbox'],
  });

  try {
    if (program.otp) {
      await sess.loginOTP({
        surname: conf.get('surname'),
        membershipno: conf.get('membershipno'),
        card_digits: conf.get('card_digits'),
        otp: program.otp,
      });
    } else if (program.motp) {
      await sess.loginMOTP({
        surname: conf.get('surname'),
        membershipno: conf.get('membershipno'),
        motp: program.motp,
      });
    }
  } catch (err) {
    try {
      await sess.close();
    } catch (e) {}
    throw err;
  }
  return sess;
}

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
const services = require('./services.js');

const conf = new Configstore(pkg.name);

program
  .version(pkg.version)
  .description('Programmatic access to Barclays online banking.')
  .option('--otp [pin]', 'PINSentry code')
  .option('--motp [pin]', 'Mobile PINSentry code')
  .option('--plogin', 'Login using passcode and password')
  .option('--no-headless', 'Show browser window when interacting');

program
  .command('list')
  .option('-j, --json', 'Output account list as a JSON object')
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
      if (options.json) {
        let account_list = accounts.map( function(acc) { return {'number': acc.number, 'alias': exportLabel(acc), 'name': acc.label, 'balance': acc.balance} });
        console.log(JSON.stringify(account_list));
      }
      else {
        console.table(accounts.map(acc => [acc.number, exportLabel(acc), acc.label, acc.balance]));
      }
    } catch (err) {
      console.error(err);
    } finally {
      await sess.close();
    }
  });

  program
  .command('get_ofx_combined [out_path]')
  .description('Fetch a combined .ofx file containing all accounts into out_path directory')
  .action(async (out_path, options) => {
 		// if out_path is undefined, default to cwd
		if (typeof(out_path) == "undefined") {
		  out_path = '.';
		}

    var sess;
    try {
      sess = await auth();
      try {
        var serv = new services(sess);
        await serv.get_ofx_combined(out_path)
      } catch (err) {
        console.error(err);
      }
    } catch (err) {
      console.error(err);
      return;
    } finally {
      await sess.close();
    }
  });
  
  program
  .command('get_ofx <out_path>')
  .description('Fetch individual ofx files for each account, into out_path directory')
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
        const csvLines = await account.statementCSV(options.from, options.to);
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
      "\nIf you're going to be logging in using PinSentry or Passcode, please enter the last few\n" +
        "(usually four) digits of your card number, which you're prompted for on login.\n" +
        "If you're using Mobile PinSentry, you can leave this blank.\n",
    );
    var digits = prompt('Enter the last digits of your card number: ');
    conf.set('card_digits', digits);
	
    console.log(
      "\nSome accounts allow logging in via a memorable passcode and password.\n" +
      "It is recommended you leave this blank, unless you understand the security implications.\n",
    );
    do {
      var passcode = prompt('Enter your 5 digit memorable passcode, or leave blank (recommended): ');
      if ((passcode !== '') && (passcode.length != 5)) {
        console.log('Memorable passcode must be 5 digits');
      }
    } while ((passcode !== '') && (passcode.length != 5));

    var password = '';
    if (passcode !== '') {
      console.log(
          "\nEnter your memorable password (Barclays will request 2 random characters from it when logging in via passcode).\n"
        );
        password = prompt('Enter your memorable password: ');
    }

    var card_cvv = '';
    if (passcode !== '') {
      console.log(
        "\nWhen logging in via passcode, Barclays will occasionally prompt for your card CVV number as an additional security measure.\n"
      );

      do {
        card_cvv = prompt('Enter the 3 digit CVV number (on the back of your card), or leave blank to abort: ');
        if ((card_cvv !== '') && (card_cvv.length != 3)) {
          console.log('CVV be exactly 3 digits, or leave blank to abort');
        }
      } while ((card_cvv !== '') && (card_cvv.length != 3));

      if (card_cvv == '') {
        // exit with error message
        console.log("Error: configuration was aborted due to blank CVV digits");
        return;
      }

      // defer saving passcode login details, until all fields are valid
      conf.set('passcode', passcode);
      conf.set('password', password);
      conf.set('card_cvv', card_cvv);
    }

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
    console.log('Credentials were saved to: ' + conf.path);
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

  if (!(program.otp || program.motp || program.plogin)) {
    console.error('Must specify either --otp, --motp or --plogin');
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
  } else if (program.plogin) {
    await sess.loginPasscode({
      surname: conf.get('surname'),
      membershipno: conf.get('membershipno'),
      passcode: conf.get('passcode'),
      password: conf.get('password'),
      card_digits: conf.get('card_digits'),
      card_cvv: conf.get('card_cvv'),
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

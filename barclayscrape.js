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
  .version('3.0.1')
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
      const accounts = await sess.accounts();
      console.table(accounts.map(acc => acc.number));
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
      const accounts = await sess.accounts();
      for (let account of accounts) {
        const ofx = await account.statementOFX();
        if (ofx) {
          await fs_writeFile(path.join(out_path, account.number) + '.ofx', ofx);
        }
      }
      await sess.close();
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
    var num = prompt('Enter your online banking membership number: ');
    conf.set('membershipno', num);
    console.log(
      "\nIf you're going to be logging in using PinSentry, please enter the last few\n" +
        "(usually four) digits of your card number, which you're prompted for on login.\n" +
        "If you're using Mobile PinSentry, you can leave this blank.\n",
    );
    var digits = prompt('Enter the last digits of your card number: ');
    conf.set('card_digits', digits);
    console.log('\nBarclayscrape is now configured.');
  });

program.parse(process.argv);

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

  // The --no-sandbox argument is required here for this to run on certain kernels
  // and containerised setups. My understanding is that disabling sandboxing shouldn't
  // cause a security issue as we're only using one tab anyway.
  const sess = await session.launch({
    headless: program.headless,
    args: ['--no-sandbox'],
  });

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
      otp: program.motp,
    });
  }
  return sess;
}

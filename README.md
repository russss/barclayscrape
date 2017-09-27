Barclayscrape
=============
Code to programmatically manipulate Barclays online banking.
At the moment it supports:

* Logging in
* Fetching a list of accounts
* `get_ofx.js` uses the export function to fetch an .ofx
file for each of your bank accounts (assuming there are
transactions available) into the `export` directory
* `get_combined_ofx.js` fetches a combined .ofx file of all
available transactions for all accounts into `all.ofx` in the `export`
directory.
* `export_csv.js` parses HTML statements into a CSV
file for each of your bank accounts and saves them into the `export`
directory.

Prerequisites
-------------

* [Phantomjs](http://phantomjs.org/) 1.9.8
* [Casperjs](http://casperjs.readthedocs.org/) 1.1.4

Configuration
-------------
Copy `config.js.example` to `config.js`, and fill in:

* `surname`
* `membership_number`

If you use the Mobile PINSentry app, that's it, otherwise you'll
be using the PINSentry card reader and will also need:

* `card_digits` (last digits of your authentication card)

If you know your account numbers, want to limit the exported files
and give the exported files aliases for readability, you can set:

* `accounts` an object e.g:

```
accounts: { 
    'gbp': '12345678901234',
    'eur': '12345678901234',
    'usd': '12345678901234'
}
```

Otherwise, you can leave it null and all accounts will be exported

Usage
-----

If you use the Mobile PINSentry app, no arguments are needed

    $ ./get_ofx.js # or export_csv.js

To log in via the PINSentry card reader, usage is like so:

    $ ./get_ofx.js --otp=<otp>

Where `otp` is your PINSentry one-time password.

Finally, you can log non-interactively, by also passing a pre-configured
memorable password and 5 digit passcode.

This is supported if your Barclays account was set up to allow
non-PINSentry access, but it is unclear whether Barclays allow existing
account holders to opt into this any more.

Logging in this way will still require PINSentry to transfer funds, but
you should take measures to secure the script if you choose to use this method.

    $ ./get_ofx.js --mcode=<memorable password> --pcode=<5 digit passcode>

Automating PINSentry Generation
-------------------------------

Typing in your OTP every time is a pain, but there are ways of
automating the process entirely using a USB smartcard reader.

**NOTE:** This somewhat defeats the purpose of two-factor
authentication, so please do not implement this unless you are confident
in your ability to adequately secure the machine running it. It is your
money at risk.

The [python-emv](https://github.com/russss/python-emv) package contains
a tool to generate a one-time password on the command line. It can be
hooked up to barclayscrape like so:

    $ ./get_ofx.js --otp=`emvtool -p <PIN> cap`

Please be aware that if you're putting this command into cron, any error
emails will include your PIN in the subject line. It's worth using a small
shell script to prevent this.

Security Notes
--------------

* Do not be tempted to set the PhantomJS option to ignore certificate errors.
  This leaves **your banking data** subject to man-in-the-middle attacks.
* If you're changing this code please don't leave debugHTML() calls in it
  when submitting pull requests. This can leak privileged data into cron emails.

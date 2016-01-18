Barclayscrape
=============
Code to programmatically manipulate Barclays online banking.
At the moment it supports:

* Logging in
* Fetching a list of accounts
* `get_ofx.js` uses the export function to fetch an .ofx
file for each of your bank accounts (assuming there are
transactions available) into the current directory.
* `get_combined_ofx.js` fetches a combined .ofx file of all
available transactions for all accounts into `all.ofx` in the current
directory.
* `export_csv.js` parses HTML statements into a CSV
file for each of your bank accounts and saves them into the `export`
directory.

Version 2
---------
Owing to Barclays' recent move to using an AJAX-powered login system, I
have had to rewrite this code from Ruby/Mechanize to CasperJS. This
automates the site using a headless web browser, and the new code relies
less on the position of objects within the page.

This new code should be more future-proof against online banking
changes.

The old Ruby version can be found in the barclayscrape-1
branch.

Prerequisites
-------------

* [Phantomjs](http://phantomjs.org/) 1.9
* [Casperjs](http://casperjs.readthedocs.org/) 1.1

Configuration
-------------
Copy `config.js.example` to `config.js`, and fill in:

* `surname`
* `membership_number`

If you use the Mobile PINSentry app, that's it, otherwise you'll
be using the PINSentry card reader and will also need:

* `card_digits` (last digits of your authentication card)

If you know your account numbers, want to limit the exported files
and give them aliases for readability, you can set:

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

Otherwise, you'll need the PINSentry card reader and usage is like so:

    $ ./get_ofx.js --otp=<otp>

Where `otp` is your PINSentry one-time password.

PINSentry emulator `barclays-pinsentry`
---------------------------------------

Typing in your OTP every time is a pain, so we also ship Adrian
Kennard's barclays-pinsentry emulator (see below for tips):

    $ ./get_ofx.js --otp=`./barclays-pinsentry -p <pin> -o`

Only tested on Ubuntu/Debian Linux. You will need:

* A pcsc-compatible smartcard reader (I use the Gemalto PC Twin USB which can be had for about £20)
* The pcsc, libpcsclite-dev, and libpopt-dev packages

Make the barclays-pinsentry binary using the Makefile provided. Insert your debit/auth card into
the card reader. Then you should be able to run it:

    $ ./barclays-pinsentry -l
     0: Gemplus GemPC Twin 00 00

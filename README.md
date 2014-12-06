Barclayscrape
=============
Code to programmatically mainpulate Barclays online banking.
At the moment it only supports logging in and exporting all your
accounts data to .ofx.

Version 2
---------
Owing to Barclays' recent move to using an AJAX-powered login system, I
have had to rewrite this code from Ruby/Mechanize to CasperJS. This
automates the site using a headless web browser, and the new code relies
less on the position of objects within the page.

This new code should be more future-proof against online banking
changes.

Unfortunately a couple of the features of the old code have been removed
in this rewrite. The old Ruby version can be found in the barclayscrape-1
branch.

Prerequisites
-------------

* [Phantomjs](http://phantomjs.org/) 1.9
* [Casperjs](http://casperjs.readthedocs.org/) 1.1

Use
---
Firstly copy `config.js.example` to `config.js`, and fill in your surname,
membership number, and the last digits of your authentication card.

Then:

    $ ./get_ofx.js --otp="12345678"

Where `otp` is your PINSentry one-time password.

Typing in your OTP every time is a pain, so we also ship Adrian
Kennard's barclays-pinsentry emulator.

Setting up barclays-pinsentry
-----------------------------
I've only tested this on Ubuntu/Debian Linux. You will need:

* A pcsc-compatible smartcard reader (I use the Gemalto PC Twin USB which can be had for about £20)
* The pcsc, libpcsclite-dev, and libpopt-dev packages

Make the barclays-pinsentry binary using the Makefile provided. Insert your debit/auth card into
the card reader. Then you should be able to run it:

    $ ./barclays-pinsentry -l
     0: Gemplus GemPC Twin 00 00
    $ ./barclays-pinsentry -i
     <my debit card number redacted>


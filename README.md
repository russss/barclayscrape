Barclayscrape
=============
This is a small ruby library to programmatically mainpulate Barclays online banking.
At the moment it only supports logging in and exporting account data to .ofx. New features
are welcome. Being able to make payments would be sweet.

Authentication
--------------
You can authenticate by providing a credit card number and one-time password
provided by the Barclays PINSentry reader:

    bs = BarclayScrape.new(SURNAME, MEMBERSHIP_NO,
                    :cardnumber => '1234567890123456', :otp => '62458413')

But typing into that little device is no fun, and a pain to automate. So we also
support Adrian Kennard's nifty barclays-pinsentry emulator:

    bs = BarclayScrape.new(SURNAME, MEMBERSHIP_NO, :pin => '1234')

Easy as that!

Setting up barclays-pinsentry
-----------------------------
I've only tested this on (Ubuntu) Linux. You will need:

* A pcsc-compatible smartcard reader (I use the Gemalto PC Twin USB which can be had for about £20)
* The pcsc, libpcsclite-dev, and libpopt-dev packages

Make the barclays-pinsentry binary using the Makefile provided. Insert your debit/auth card into 
the card reader. Then you should be able to run it:

    $ ./barclays-pinsentry -l
     0: Gemplus GemPC Twin 00 00
    $ ./barclays-pinsentry -i
     <my debit card number redacted>


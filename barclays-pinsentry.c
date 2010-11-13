// Copyright (c) 2006 Adrian Kennard Andrews & Arnold ltd
// Application to work as Barclays PINSentry card reader
// Issued under GNU licence

#include <ctype.h>
#include <err.h>
#include <string.h>
#include <stdio.h>
#include <popt.h>
#include <winscard.h>
#include <malloc.h>

void
dump (char d, int n, BYTE * p)
{
   fprintf (stderr, "%3d%c", n, d);
   while (n--)
      fprintf (stderr, " %02X", *p++);
   fprintf (stderr, "\n");
}


int
main (int argc, const char *argv[])
{
   char *pin = 0;
   char *chal = 0;
   char *reader = 0;
   char *amount = 0;
   int getid = 0;
   int getotp = 0;
   int readernum = 0;
   int debug = 0;
   int listreader = 0;
   int hyphen = 0;
   int res;
   char c;
   SCARDCONTEXT ctx;
   SCARDHANDLE card;
   BYTE atr[MAX_ATR_SIZE];
   DWORD atrlen;
   DWORD state;
   DWORD proto;
   DWORD temp;
   SCARD_IO_REQUEST recvpci;
   DWORD buflen;
   BYTE buf[256],
     cmd[256];

   poptContext optCon;          // context for parsing command-line options
   const struct poptOption optionsTable[] = {
      {"id", 'i', POPT_ARG_NONE, &getid, 0, "Report card ID", 0},
      {"pin", 'p', POPT_ARG_STRING, &pin, 0, "PIN", "6 to 12 digits"},
      {"otp", 'o', POPT_ARG_NONE, &getotp, 0, "Get OTP", 0},
      {"reference", 'c', POPT_ARG_STRING, &chal, 0, "Challenge/response or account reference", "Up to 8 digit reference/account"},
      {"amount", 'a', POPT_ARG_STRING, &amount, 0, "", "Amount pounds.pence"},
      {"reader", 'r', POPT_ARG_INT, &readernum, 0, "Which reader to use", "Index number"},
      {"list", 'l', POPT_ARG_NONE, &listreader, 0, "List readers", 0},
      {"hyphen", 'h', POPT_ARG_NONE, &hyphen, 0, "Hyphenate OTP or C/R responses", 0},
      {"debug", 'v', POPT_ARG_NONE, &debug, 0, "Debug output", 0},
      POPT_AUTOHELP {NULL, 0, 0, NULL, 0}
   };

   optCon = poptGetContext (NULL, argc, argv, optionsTable, 0);
   //poptSetOtherOptionHelp (optCon, "");

   /* Now do options processing, get portname */
   if ((c = poptGetNextOpt (optCon)) < -1)
   {
      /* an error occurred during option processing */
      fprintf (stderr, "%s: %s\n", poptBadOption (optCon, POPT_BADOPTION_NOALIAS), poptStrerror (c));
      return 1;
   }
   if (poptPeekArg (optCon))
   {
      poptPrintUsage (optCon, stderr, 0);
      return 2;
   }
   if ((res = SCardEstablishContext (SCARD_SCOPE_SYSTEM, NULL, NULL, &ctx)) != SCARD_S_SUCCESS)
      errx (1, "Can't establish context for reading cards (%s)", pcsc_stringify_error (res));

   {                            // list the readers
      int rn = 0;
      char *r,
       *e;
      if ((res = SCardListReaders (ctx, NULL, NULL, &temp)) != SCARD_S_SUCCESS)
         errx (1, "Cannot get reader list (%s)", pcsc_stringify_error (res));
      if (!(r = malloc (temp)))
         errx (1, "Cannot allocated %d bytes for reader list", (int) temp);
      if ((res = SCardListReaders (ctx, NULL, r, &temp)) != SCARD_S_SUCCESS)
         errx (1, "Cannot list readers (%s)", pcsc_stringify_error (res));
      e = r + temp;
      while (*r && r < e)
      {
         if (rn == readernum)
            reader = r;
         if (listreader)
            printf ("%d: %s\n", rn, r);
         r += strlen (r) + 1;
         rn++;
      }
      // not freed as reader is pointer into r.
   }
   if (!reader)
      errx (1, "Reader %d does not exist", readernum);
   if (debug)
      fprintf (stderr, "Reader: %s\n", reader);

   // connect to card
   if ((res =
        SCardConnect (ctx, reader, SCARD_SHARE_EXCLUSIVE, SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1, &card, &proto)) != SCARD_S_SUCCESS)
      errx (1, "Cannot connect to %s (%s)", reader, pcsc_stringify_error (res));
   if (debug)
      fprintf (stderr, "Active protocol %X\n", (int) proto);

   if ((res = SCardBeginTransaction (card)) != SCARD_S_SUCCESS)
      errx (1, "Cannot start transaction (%s)", pcsc_stringify_error (res));

   atrlen = sizeof (atr);
   if ((res = SCardStatus (card, 0, &temp, &state, &proto, atr, &atrlen)) != SCARD_S_SUCCESS)
      errx (1, "Cannot get card status (%s)", pcsc_stringify_error (res));
   if (debug)
      fprintf (stderr, "ATR len %d state %X\n", (int) atrlen, (int) state);

   {                            // get basic data
      BYTE datareq[] = { 0x00, 0xA4, 0x04, 0x00, 0x07, 0xA0, 0x00, 0x00, 0x00, 0x03, 0x80, 0x02 };      // initial data request
      buflen = sizeof (buf);
      if (debug)
         dump ('>', sizeof (datareq), datareq);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, datareq, sizeof (datareq), &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send initial request for data (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 2 || buf[0] != 0x61)
         errx (1, "Unexpected response to data request");
   }

   cmd[0] = 0x0;
   cmd[1] = 0xC0;
   cmd[2] = 0;
   cmd[3] = 0;
   cmd[4] = buf[1];
   buflen = sizeof (buf);
   if (debug)
      dump ('>', 5, cmd);
   if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
      errx (1, "Failed get initial data (%s)", pcsc_stringify_error (res));
   if (debug)
      dump ('<', buflen, buf);
   if (buflen != cmd[4] + 2)
      errx (1, "Did not get right data length %d!=%d", (int) buflen, cmd[4]);

   cmd[0] = 0x80;
   cmd[1] = 0xA8;
   cmd[2] = 0x00;
   cmd[3] = 0x00;
   cmd[4] = 0x02;
   cmd[5] = 0x83;
   cmd[6] = 0x00;
   buflen = sizeof (buf);
   if (debug)
      dump ('>', 7, cmd);
   if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 7, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
      errx (1, "Failed get data (%s)", pcsc_stringify_error (res));
   if (debug)
      dump ('<', buflen, buf);
   if (buflen != 2 || buf[0] != 0x61)
      errx (1, "Bad response\n");

   cmd[0] = 0x00;
   cmd[1] = 0xC0;
   cmd[2] = 0x00;
   cmd[3] = 0x00;
   cmd[4] = buf[1];
   buflen = sizeof (buf);
   if (debug)
      dump ('>', 5, cmd);
   if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
      errx (1, "Failed to send data (%s)", pcsc_stringify_error (res));
   if (debug)
      dump ('<', buflen, buf);

   if (getid)
   {                            // card number
      int n = 0;
      cmd[0] = 0x00;
      cmd[1] = 0xB2;
      cmd[2] = 0x02;
      cmd[3] = 0x0C;
      cmd[4] = 0x00;
      buflen = sizeof (buf);
      if (debug)
         dump ('>', 5, cmd);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send data (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 2 || buf[0] != 0x6C)
         errx (1, "Unexpected response to data request");
      cmd[4] = buf[1];
      buflen = sizeof (buf);
      if (debug)
         dump ('>', 5, cmd);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed get initial data (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != cmd[4] + 2 || buflen < 12)
         errx (1, "Did not get right data length %d!=%d", (int) buflen, cmd[4]);
      for (n = 4; n < 12; n++)
         printf ("%02X", buf[n]);
      printf ("\n");
   }
   // send PIN if needed
   if (pin && (getotp || chal || amount || debug))
   {                            // send PIN
      char *p = pin;
      int n = 0;
      cmd[0] = 0;
      cmd[1] = 0x20;
      cmd[2] = 0x00;
      cmd[3] = 0x80;
      cmd[4] = 8;
      cmd[5] = 0x24;
      while (*p && n < 14)
      {
         if (isdigit (*p))
         {
            cmd[6 + n / 2] = (cmd[6 + n / 2] << 4) + (*p - '0');
            n++;
         }
         p++;
      }
      while (n < 14)
      {
         cmd[6 + n / 2] = (cmd[6 + n / 2] << 4) + 0xF;
         n++;
      }
      buflen = sizeof (buf);
      if (debug)
         dump ('>', 13, cmd);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 13, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send PIN (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 2 || buf[0] != 0x90 || buf[1])
         errx (1, "PIN failed");
   }


   if (getotp || chal || amount)
   {                            // OTP
      unsigned char req[29] = { 0 };
      req[14] = 0x80;
      req[21] = req[22] = req[23] = 1;
      if (chal)
      {
         int n = 0,
            p;
         for (p = 0; chal[p]; p++)
            if (isdigit (chal[p]))
               n++;
         for (p = 0; chal[p] && n; p++)
            if (isdigit (chal[p]))
            {
               n--;
               if (n < 8)
                  req[28 - n / 2] |= ((chal[p] & 0xF) << ((n & 1) ? 4 : 0));
            }
      }
      if (amount)
      {
         int n = 0,
            p;
         for (p = 0; amount[p]; p++)
            if (isdigit (amount[p]))
               n++;
         for (p = 0; amount[p] && n; p++)
            if (isdigit (amount[p]))
            {
               n--;
               if (n < 12)
                  req[5 - n / 2] |= ((amount[p] & 0xF) << ((n & 1) ? 4 : 0));
            }
      }

      buflen = sizeof (buf);
      buf[0] = 0x80;
      buf[1] = 0xAE;
      buf[2] = 0x80;
      buf[3] = 0x00;
      buf[4] = sizeof (req);
      memcpy (buf + 5, req, sizeof (req));
      if (debug)
         dump ('>', sizeof (req) + 5, buf);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, buf, sizeof (req) + 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send OTP request (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 2 || buf[0] != 0x61)
         errx (1, "Failed to get OTP");
      cmd[0] = 0x00;
      cmd[1] = 0xC0;
      cmd[2] = 0x00;
      cmd[3] = 0x00;
      cmd[4] = buf[1];
      buflen = sizeof (buf);
      if (debug)
         dump ('>', 5, cmd);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send OTP request (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 22)
         errx (1, "Bad OTP response");
      {
         unsigned long res = ((1 << 25) | (buf[4] << 17) | ((buf[10] & 0x01) << 16) | (buf[11] << 8) | buf[12]);
         printf ("%08lu\n", res);
      }

      // Advance OTP to next number
      buf[0] = 0x80;
      buf[1] = 0xAE;
      buf[2] = 0x00;
      buf[3] = 0x00;
      buf[4] = sizeof (req) + 2;
      buf[5] = 0x5A;
      buf[6] = 0x33;
      memcpy (buf + 7, req, sizeof (req));
      buflen = sizeof (buf);
      if (debug)
         dump ('>', sizeof (req) + 7, buf);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, buf, sizeof (req) + 7, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send OTP request (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
      if (buflen != 2 || buf[0] != 0x61)
         errx (1, "Failed to get OTP");
      cmd[0] = 0x00;
      cmd[1] = 0xC0;
      cmd[2] = 0x00;
      buflen = sizeof (buf);
      if (debug)
         dump ('>', 5, cmd);
      if ((res = SCardTransmit (card, SCARD_PCI_T0, cmd, 5, &recvpci, buf, &buflen)) != SCARD_S_SUCCESS)
         errx (1, "Failed to send OTP request (%s)", pcsc_stringify_error (res));
      if (debug)
         dump ('<', buflen, buf);
   }
   // Done
   if ((res = SCardEndTransaction (card, SCARD_UNPOWER_CARD)) != SCARD_S_SUCCESS)
      errx (1, "Cannot end transaction (%s)", pcsc_stringify_error (res));

   if ((res = SCardReleaseContext (ctx)) != SCARD_S_SUCCESS)
      errx (1, "Cant release context (%s)", pcsc_stringify_error (res));
   return 0;
}

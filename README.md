# BillMark Live Search — final search test package

This version uses the official California bill-navigation URL format:
https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB222

The serverless function constructs the 2025–26 bill ID, fetches the official record server-side, and returns a small normalized response to the mobile page. It avoids browser CORS and avoids trying to parse a California search form.

Test first with AB 222. The official record is verified and contains its amendment history and Legislative Counsel's Digest.

Next after this test: session disambiguation, version retrieval, AI explanation, Stripe and watch/email.

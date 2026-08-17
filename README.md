# BillMark Live Search MVP — fixed deployment package

The previous package used an outdated Vercel runtime declaration. This package removes that declaration and lets Vercel auto-detect the Node.js serverless function runtime.

Vercel documents Node.js serverless functions as a supported deployment model and says framework/runtime detection can apply the correct settings automatically.

Next:
1. Replace the files in the GitHub `billmark` repository with these files.
2. Commit the changes.
3. Vercel should automatically create a new deployment.
4. Open the new deployment URL and test `AB 222`.

The live lookup endpoint is `/api/bill`.

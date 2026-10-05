# Cooking with Naomi Kingbird

Static sales site for the e-book *200+ Forgotten Native American Recipes* by Naomi
Kingbird. Same architecture as the haroldcooks site: a static page served from the
repository root, Paddle overlay checkout, and two Netlify Functions that handle the
webhook and the paid PDF download. No build step.

## Before this can take money

Everything below is a placeholder and must be replaced with real values.

| Placeholder | Where | What it is |
|---|---|---|
| `live_REPLACE_WITH_NAOMI_CLIENT_SIDE_TOKEN` | `script.js` | Paddle client-side token, `live_` prefixed |
| `pri_REPLACE_WITH_NAOMI_PRICE_ID` | `script.js`, `netlify/functions/paddle-webhook.mjs` | Paddle price ID — **must match in both files** |
| `REPLACE_WITH_NAOMI_UMAMI_WEBSITE_ID` | every `.html` | Umami Cloud website ID |
| `naomikingbird.com` | every `.html` | the real domain, if different |
| `hello@naomikingbird.com` | `.html` + `netlify/functions/download.mjs` | a mailbox someone actually reads |

Also required:

- `PADDLE_WEBHOOK_SECRET` set as a Netlify environment variable, in **all** deploy
  contexts. Without it the webhook returns 500 and nobody can download.
- The PDF uploaded to Netlify Blobs: store `files`, key `cookbook.pdf`.
  `netlify blobs:set files cookbook.pdf --input <path>`
- A Paddle notification destination pointing at
  `https://<domain>/api/paddle-webhook`, subscribed to `transaction.completed`.
- The domain approved under Paddle → Developer tools → Domains. Checkout will not
  open on an unapproved domain.
- Apple Pay domain association file at `.well-known/` if Apple Pay is wanted
  (Paddle issues a per-domain file; the haroldcooks one will not work here).

## How a purchase flows

1. `script.js` opens the Paddle overlay on any `[data-buy]` element.
2. On `checkout.completed` the browser is sent to `/download?txn=…`.
3. Paddle posts `transaction.completed` to `/api/paddle-webhook`, which verifies the
   HMAC signature and writes the transaction ID into the Netlify Blobs store `orders`.
4. `download.html` polls `/api/download?check=1&txn=…` until that record exists, then
   enables the button, which serves the PDF from the `files` store.

A transaction ID that was never paid for is refused, so the download cannot be opened
by guessing.

## The book data

`assets/recipes.js` holds all 20 chapters and 200 recipes as `window.BOOK`. It drives
the table of contents, the four ledger rows and the savings calculator.

The calculator averages the `diff` range of every recipe that serves 4 or more, with
chapters 1 (kitchen habits), 19 (sweets) and 20 (cooking for a crowd) excluded — none
of those is an ordinary weeknight supper. At two suppers a week it currently reports
roughly **$2,545 – $4,654 a year**, which brackets the $3,650 claim on the cover.

If you edit recipe costs, re-check that figure:

```sh
node -e "global.window={};eval(require('fs').readFileSync('assets/recipes.js','utf8'));
const all=window.BOOK.flatMap(c=>c.recipes.map(r=>({...r,chapter:c.n})));
const g=s=>s.match(/\d+/g).map(Number);
const s=all.filter(r=>/Serves [4-9]|Serves 1\d/.test(r.meta)&&![1,19,20].includes(r.chapter));
const lo=s.reduce((a,r)=>a+g(r.diff)[0],0)/s.length, hi=s.reduce((a,r)=>a+g(r.diff)[1],0)/s.length;
console.log('2/wk: \$'+Math.round(lo*2*52)+' – \$'+Math.round(hi*2*52));"
```

## Styling

`styles.css` is unchanged from the original except for `:root` and a few hardcoded
colours. The palette is sampled from the cover: olive-black `#25290E`, brick `#842811`,
cream `#F4EEDC`, wood tan `#CCA176`. Variable names were deliberately kept identical,
so the ~500 lines below `:root` needed no edits.

## Local preview

```sh
npx netlify dev
```

Functions need the Netlify CLI; plain `python3 -m http.server` will serve the pages but
checkout and download will not work.

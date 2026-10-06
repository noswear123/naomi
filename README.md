# Cooking with Naomi Kingbird

Static sales site for the e-book *100+ Forgotten Native American Recipes* by Naomi
Kingbird: a static page served from the repository root, Paddle overlay checkout, and
two Netlify Functions that handle the webhook and the paid PDF download. No build step.

## Live configuration

The site is live and taking payments. Two real purchases have been verified
end to end: Paddle checkout, signed webhook, order recorded, PDF served.

| Setting | Value |
|---|---|
| Domain | `naomicooking.com` (Netlify primary, SSL forced) |
| Netlify project | `gregarious-alfajores-1766f0`, team `Naomi` |
| Paddle client-side token | in `script.js`, `live_` prefixed, public by design |
| Paddle price ID | in `script.js` **and** `netlify/functions/paddle-webhook.mjs` — must stay identical, or paying customers are refused at download |
| Umami website ID | in every `.html` |
| Contact mail | `hello@naomicooking.com` — Porkbun email forwarding (MX on fwd1/fwd2.porkbun.com); the `hello@` alias must exist there or mail bounces |

Held outside the repo:

- `PADDLE_WEBHOOK_SECRET` — Netlify environment variable, scoped to **Functions**,
  production context. The `pdl_ntfset_`-prefixed signing secret from the Paddle
  notification destination, **not** the `ntfset_` destination ID; pasting the ID
  rejects every webhook with a 401 and buyers silently never get the book.
  **Netlify bakes env vars in at deploy time, so changing it needs a redeploy.**
- The PDF — Netlify Blobs, store `files`, key `cookbook.pdf`. Blob stores do not
  move between Netlify accounts; a new site starts empty and buyers get
  "temporarily unavailable" until it is re-uploaded.
  `netlify blobs:set files cookbook.pdf --input <path>`
- Paid orders — Netlify Blobs, store `orders`, keyed by transaction ID. Written by
  the webhook. If a buyer pays but gets no download, `netlify blobs:list orders`
  is the first thing to check; a record can be written by hand to unblock them.

Paddle side: domain approved under Developer tools → Domains, notification
destination at `https://naomicooking.com/api/paddle-webhook` subscribed to
`transaction.completed`, business verification passed.

Not set up: Apple Pay, which needs a domain association file at `.well-known/`.
Paddle issues one file per domain; a file from another site will not work here.

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

`assets/recipes.js` is generated from the book PDF and holds all 15 chapters and 105
recipes as `window.BOOK` — name, label, serving/prep line and the book's own three cost
figures. It drives the table of contents, the four ledger rows and the savings
calculator, so the page cannot drift from the book.

The calculator averages the `diff` range of every recipe that serves 4 or more, with
chapters 7 (jerky and trail staples), 11 (fruit and sweet dishes) and 12 (pickles,
freezer packs and broth) excluded — none of those is a weeknight supper. Chapter 14
drops out on its own, since those recipes serve one or two. That leaves 77 suppers,
and at two a week it reports roughly **$1,592 – $3,783 a year**, which brackets the
$3,650 claim on the cover.

If you edit recipe costs, re-check that figure:

```sh
node -e "global.window={};eval(require('fs').readFileSync('assets/recipes.js','utf8'));
const all=window.BOOK.flatMap(c=>c.recipes.map(r=>({...r,chapter:c.n})));
const g=s=>s.match(/\d+/g).map(Number);
const s=all.filter(r=>/Serves [4-9]|Serves 1\d/.test(r.meta)&&![7,11,12].includes(r.chapter));
const lo=s.reduce((a,r)=>a+g(r.diff)[0],0)/s.length, hi=s.reduce((a,r)=>a+g(r.diff)[1],0)/s.length;
console.log('2/wk: \$'+Math.round(lo*2*52)+' – \$'+Math.round(hi*2*52));"
```

## Styling

The palette is drawn from the kitchen on the cover rather than its lettering:
cast-iron brown `#2A241C`, cranberry `#8E2F3C`, juniper `#3C5347`, parchment `#F5F1E6`
and toasted corn `#C08B4A`. Every text/background pair in use meets WCAG AA. Variable
names are kept identical to the original stylesheet, so the ~500 lines below `:root`
needed no edits.

## Local preview

```sh
npx netlify dev
```

Functions need the Netlify CLI; plain `python3 -m http.server` will serve the pages but
checkout and download will not work.

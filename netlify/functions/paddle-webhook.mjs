// Receives Paddle webhooks. On transaction.completed for the cookbook price,
// records the transaction ID as paid so /api/download will serve the PDF, then
// emails the buyer their download link.
//
// The email matters more than it looks. Paddle's own receipt carries no link to
// the download page, and Paddle's successUrl redirect arrives without a
// transaction id — so a buyer who closes the tab, or whose browser blocks the
// redirect, otherwise has no way back to the book they paid for.
//
// Sending is best-effort and never changes the response: a non-2xx here would
// make Paddle retry for days and send duplicate emails without fixing anything.
//
// Environment:
//   PADDLE_WEBHOOK_SECRET  signing secret of the notification destination
//   PADDLE_API_KEY         server-side key; the payload carries customer_id, not the address
//   BREVO_API_KEY          Brevo transactional email key
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const PRICE_ID = 'pri_01m488knfx1np6p7h50exag81r';
const MAX_AGE_SECONDS = 5 * 60; // reject old, replayed webhooks
const SITE = 'https://naomicooking.com';
const FROM = { name: 'Cooking with Naomi Kingbird', email: 'hello@naomicooking.com' };

// Paddle-Signature: "ts=1671552777;h1=abc..." (several h1 values while a secret is rotated)
function isValidSignature(rawBody, header, secret) {
  let ts = '';
  const hashes = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=');
    if (key === 'ts') ts = value;
    if (key === 'h1' && value) hashes.push(value);
  }
  if (!ts || !hashes.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  return hashes.some(h => {
    const given = Buffer.from(h, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// The transaction.completed payload carries customer_id, not the address.
async function buyerEmail(txn) {
  if (txn.customer?.email) return txn.customer.email;
  const apiKey = (process.env.PADDLE_API_KEY || '').trim().replace(/^Bearer\s+/i, '');
  if (!apiKey || !txn.customer_id) return null;
  const r = await fetch(`https://api.paddle.com/customers/${txn.customer_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) return null;
  return (await r.json())?.data?.email || null;
}

function mailBody(link) {
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#2A241C;max-width:520px">
  <p>Thank you for buying <i>100+ Forgotten Native American Recipes</i>.</p>
  <p><a href="${link}" style="display:inline-block;background:#8E2F3C;color:#F5F1E6;padding:14px 26px;border-radius:6px;text-decoration:none;font-weight:bold">Download your cookbook</a></p>
  <p>Or paste this into your browser:<br><span style="color:#6B6A52">${link}</span></p>
  <p>Keep this email &mdash; the link stays valid, so you can download the cookbook
     again whenever you need it.</p>
  <p>If the link ever stops working, just reply to this email and we will send your
     cookbook straight over.</p>
  <p>Cook well, waste less.<br>&mdash; Naomi Kingbird</p>
</div>`;
}

async function sendReceipt(txn) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return 'no_brevo_key';

  const to = await buyerEmail(txn);
  if (!to) return 'no_email';

  const link = `${SITE}/download?txn=${encodeURIComponent(txn.id)}`;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: FROM,
      to: [{ email: to }],
      subject: 'Your cookbook is ready to download',
      htmlContent: mailBody(link),
    }),
  });
  return r.ok ? 'sent' : `brevo_${r.status}`;
}

export default async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook secret not configured', { status: 500 });

  const rawBody = await req.text();
  if (!isValidSignature(rawBody, req.headers.get('paddle-signature') || '', secret)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event_type === 'transaction.completed') {
    const txn = event.data;
    const boughtBook = (txn.items || []).some(item => item.price?.id === PRICE_ID);
    if (boughtBook) {
      await getStore('orders').setJSON(txn.id, {
        paidAt: event.occurred_at,
        customerId: txn.customer_id,
      });
      console.log('[paddle] STORED order %s', txn.id);
      // Best-effort, and never allowed to change the response: a non-2xx would
      // make Paddle retry for days and resend this email each time.
      try {
        console.log('[paddle] receipt %s %s', txn.id, await sendReceipt(txn));
      } catch (err) {
        console.error('[paddle] receipt failed %s', txn.id, err);
      }
    }
  }

  return new Response('ok');
};

export const config = { path: '/api/paddle-webhook' };

// ---- Site settings ----
const PRICE = '$22.99';               // what the customer actually pays — keep in sync with Paddle
const PADDLE_TOKEN = 'live_ea3d649eb059f862f00c0c8456b';   // client-side token, safe to publish
const PADDLE_PRICE_ID = 'pri_01m488knfx1np6p7h50exag81r';

// ---- Offer display ----
// PRICE_WAS is struck through next to PRICE. $22.99 is 40% off $38.32
// (22.99 / 0.60 = 38.3166…), so the two numbers and the percentage agree.
// Set PRICE_WAS to '' to drop the strike-through and the badge everywhere.
const PRICE_WAS = '$38.32';
const DISCOUNT_PCT = '40%';
// If the saving is a real Paddle discount rather than only a label, put its code
// here and it is applied automatically, so the Paddle overlay shows the same
// before/after figures as the page. Leave '' to send the customer straight to PRICE.
const CHECKOUT_DISCOUNT_CODE = '';

document.querySelectorAll('[data-price]').forEach(el => { el.textContent = PRICE; });
document.querySelectorAll('[data-discount]').forEach(el => { el.textContent = DISCOUNT_PCT; });
// No former price configured: remove the whole offer treatment rather than leave it blank.
document.querySelectorAll('[data-offer]').forEach(el => {
  if (PRICE_WAS) el.querySelectorAll('[data-price-was]').forEach(w => { w.textContent = PRICE_WAS; });
  else el.remove();
});

// ---- Sales popup: once per visitor, 5 seconds after the first visit ----
const POPUP_DELAY = 5000;
const popup = document.getElementById('popup');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
function closePopup() {
  if (!popup || popup.hidden) return;
  popup.hidden = true;
  document.body.classList.remove('has-popup');
}
if (popup && !store.get('popupSeen')) {
  const first = Number(store.get('firstVisit')) || Date.now();
  store.set('firstVisit', first);
  setTimeout(() => {
    if (document.querySelector('.paddle-frame')) return; // already in checkout
    popup.hidden = false;
    document.body.classList.add('has-popup');
    store.set('popupSeen', '1');
    popup.querySelector('.popup__close').focus();
    if (window.umami) umami.track('Popup shown');
  }, Math.max(0, first + POPUP_DELAY - Date.now()));
  popup.addEventListener('click', e => {
    if (e.target === popup || e.target.closest('[data-popup-close]')) closePopup();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
}

// ---- Checkout: Buy -> Paddle overlay -> /download ----
// If Paddle.js fails to load, the buttons keep their #order link as a fallback.
if (window.Paddle) {
  Paddle.Initialize({
    token: PADDLE_TOKEN,
    eventCallback: e => {
      const track = (name, data) => { if (window.umami) umami.track(name, data); };
      if (e.name === 'checkout.loaded') track('Checkout opened');
      if (e.name === 'checkout.closed') track('Checkout closed without buying');
      if (e.name === 'checkout.completed' && e.data && e.data.transaction_id) {
        const t = e.data.totals || {};
        track('Purchase', { revenue: t.total, currency: e.data.currency_code });
        // short pause so the Purchase event is sent before leaving the page
        setTimeout(() => { location.href = '/download?txn=' + encodeURIComponent(e.data.transaction_id); }, 400);
      }
    },
  });
  document.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault();
    closePopup();
    Paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      ...(CHECKOUT_DISCOUNT_CODE ? { discountCode: CHECKOUT_DISCOUNT_CODE } : {}),
      settings: { displayMode: 'overlay', variant: 'one-page' },
    });
  }));
}

const book = window.BOOK || [];
const all = book.flatMap(ch => ch.recipes.map(r => ({ ...r, chapter: ch.n })));
const range = s => s.match(/\d+/g).map(Number);
const fmt = n => '$' + Math.round(n).toLocaleString('en-US');

// ---- Ledger: a few rows straight from the book ----
const picks = [
  'Three Sisters Stew',
  'Wild Rice & Mushroom Pot',
  'Baked Salmon with Maple Glaze',
  'Simple Corn Flatbread',
];
document.getElementById('ledger-rows').innerHTML = picks
  .map(name => all.find(r => r.name === name))
  .filter(Boolean)
  .map(r => `
    <div class="ledger__row">
      <span>${r.name}<small>${r.meta.split(' • ')[0]}</small></span>
      <span>${r.home.replace('-', '–')}</span>
      <span>${r.out.replace('-', '–')}</span>
      <span class="diff">${r.diff.replace('-', '–')}</span>
    </div>`).join('');

// ---- Calculator: average supper difference from the book's own ranges ----
// Chapters left out: 7 (jerky and trail staples), 11 (fruit and sweet dishes) and
// 12 (pickles, freezer packs and broth), none of which is a weeknight supper.
// Chapter 14 drops out on its own: those recipes serve one or two.
const suppers = all.filter(r => /Serves [4-9]|Serves 1\d/.test(r.meta) && ![7, 11, 12].includes(r.chapter));
const avgLo = suppers.reduce((s, r) => s + range(r.diff)[0], 0) / suppers.length;
const avgHi = suppers.reduce((s, r) => s + range(r.diff)[1], 0) / suppers.length;
const slider = document.getElementById('calc-range');
const updateCalc = () => {
  const n = Number(slider.value);
  document.getElementById('calc-n').textContent = n;
  document.getElementById('calc-year').textContent = `${fmt(avgLo * n * 52)} – ${fmt(avgHi * n * 52)}`;
};
slider.addEventListener('input', updateCalc);
updateCalc();

// ---- Table of contents: chapter titles only ----
document.getElementById('toc').innerHTML = book
  .map(ch => `<li><span>${String(ch.n).padStart(2, '0')}</span>${ch.title}</li>`).join('');

// ---- Scroll reveal ----
const io = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches
  ? new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('is-in'));

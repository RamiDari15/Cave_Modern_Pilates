// Ad and analytics tags (Meta Pixel, Google tag for GA4 and Google Ads).
// Each tag loads only when its ID is set in the Vite env, so nothing runs
// until the ad accounts exist. Purchases also go to Meta from the server
// (server/adConversions.mjs) with the same event ID for de-duplication.

const env = import.meta.env || {};
const META_PIXEL_ID = String(env.VITE_META_PIXEL_ID || "").trim();
const GA4_ID = String(env.VITE_GA4_MEASUREMENT_ID || "").trim();
const GOOGLE_ADS_ID = String(env.VITE_GOOGLE_ADS_ID || "").trim();
const GOOGLE_ADS_INTRO_LABEL = String(env.VITE_GOOGLE_ADS_INTRO_PURCHASE_LABEL || "").trim();
const GOOGLE_ADS_PURCHASE_LABEL = String(env.VITE_GOOGLE_ADS_PURCHASE_LABEL || "").trim();
const NEW_CLIENT_PATTERN = /\b(new client|newbie|intro)\b/i;

let initialized = false;

function loadScript(src) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function initTracking() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (META_PIXEL_ID && !window.fbq) {
    const fbq = function fbq() {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
  }

  const googleIds = [GA4_ID, GOOGLE_ADS_ID].filter(Boolean);
  if (googleIds.length && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleIds[0])}`);
    window.gtag("js", new Date());
    googleIds.forEach((id) => window.gtag("config", id, { send_page_view: false, allow_enhanced_conversions: true }));
  }
}

function fbq(...args) {
  if (META_PIXEL_ID && typeof window !== "undefined" && window.fbq) window.fbq(...args);
}

function gtag(...args) {
  if (typeof window !== "undefined" && window.gtag) window.gtag(...args);
}

export function newTrackingEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function priceToNumber(price) {
  const parsed = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isNewClientItem(item) {
  return NEW_CLIENT_PATTERN.test(String(item?.name || ""));
}

export function trackPageView(page) {
  fbq("track", "PageView");
  gtag("event", "page_view", { page_title: document.title, page_location: window.location.href, page_path: window.location.pathname });

  if (["newbie", "pricing", "memberships", "class-packs", "drop-in"].includes(page)) {
    fbq("track", "ViewContent", { content_name: page, content_category: "pricing" });
  }
}

export function trackInitiateCheckout(items) {
  const list = Array.isArray(items) ? items : [];
  const value = list.reduce((sum, item) => sum + priceToNumber(item.price) * (Number(item.quantity) || 1), 0);
  fbq("track", "InitiateCheckout", { value, currency: "USD", num_items: list.length });
  gtag("event", "begin_checkout", { value, currency: "USD" });
}

// Call after a successful checkout. eventId must match the trackingEventId
// sent to the server so Meta counts the browser and server event once.
export function trackPurchase({ items, eventId, email }) {
  const list = Array.isArray(items) ? items : [];
  const value = list.reduce((sum, item) => sum + priceToNumber(item.price) * (Number(item.quantity) || 1), 0);
  const names = list.map((item) => item.name).filter(Boolean).join(", ");
  const newClientItems = list.filter(isNewClientItem);

  if (email) gtag("set", "user_data", { email: String(email).trim().toLowerCase() });

  fbq("track", "Purchase", { value, currency: "USD", content_name: names }, { eventID: eventId });
  gtag("event", "purchase", { transaction_id: eventId, value, currency: "USD", items: list.map((item) => ({ item_name: item.name, price: priceToNumber(item.price), quantity: Number(item.quantity) || 1 })) });
  if (GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`, value, currency: "USD", transaction_id: eventId });
  }

  if (newClientItems.length) {
    const introValue = newClientItems.reduce((sum, item) => sum + priceToNumber(item.price) * (Number(item.quantity) || 1), 0);
    fbq("trackCustom", "NewClientPurchase", { value: introValue, currency: "USD", content_name: newClientItems.map((item) => item.name).join(", ") }, { eventID: `${eventId}-intro` });
    if (GOOGLE_ADS_ID && GOOGLE_ADS_INTRO_LABEL) {
      gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_INTRO_LABEL}`, value: introValue, currency: "USD", transaction_id: `${eventId}-intro` });
    }
  }
}

export function trackMembershipPurchase({ eventId, name }) {
  fbq("track", "Subscribe", { currency: "USD", content_name: name || "Membership" }, { eventID: eventId });
  gtag("event", "membership_purchase", { item_name: name || "Membership" });
}

export function trackLead(source) {
  fbq("track", "Lead", { content_name: source });
  gtag("event", "generate_lead", { lead_source: source });
}

export function trackSignUp() {
  fbq("track", "CompleteRegistration");
  gtag("event", "sign_up");
}

export function trackContact(method) {
  fbq("track", "Contact", { content_name: method });
  gtag("event", "contact", { method });
}

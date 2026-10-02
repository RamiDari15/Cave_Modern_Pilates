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
const GOOGLE_ADS_SIGNUP_LABEL = String(env.VITE_GOOGLE_ADS_SIGNUP_LABEL || "").trim();
const GOOGLE_ADS_PHONE_LABEL = String(env.VITE_GOOGLE_ADS_PHONE_LABEL || "").trim();

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
  try { if (META_PIXEL_ID && typeof window !== "undefined" && window.fbq) window.fbq(...args); } catch {}
}

function gtag(...args) {
  try { if (typeof window !== "undefined" && window.gtag) window.gtag(...args); } catch {}
}

export function newTrackingEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function priceToNumber(price) {
  const parsed = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function trackPageView(page) {
  fbq("track", "PageView");
  gtag("event", "page_view", { page_title: document.title, page_location: `${window.location.origin}${window.location.pathname}`, page_path: window.location.pathname });

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

// Only the server's successful-checkout receipt determines revenue and IDs.
// Never infer a purchase amount from a cart's pre-discount display prices.
export function trackConversionReceipt(receipt, email) {
  try {
    for (const event of receipt?.events || []) {
      const { name, id, data } = event;
      if (!id || !name) continue;
      fbq(name === "NewClientPurchase" ? "trackCustom" : "track", name, data, { eventID: id });
      const value = Number.isFinite(data?.value) ? { value: data.value, currency: "USD" } : {};
      if (name === "Purchase") {
        gtag("event", "purchase", { ...value, transaction_id: id, items: [{ item_name: data.content_name || "Studio purchase", ...(value.value != null ? { price: value.value } : {}), quantity: 1 }] });
      } else if (name === "CompleteRegistration") {
        gtag("event", "sign_up", { method: "studio_profile" });
      } else if (name === "Subscribe") {
        gtag("event", "membership_purchase");
      }
      const label = name === "Purchase" ? GOOGLE_ADS_PURCHASE_LABEL : name === "NewClientPurchase" ? GOOGLE_ADS_INTRO_LABEL : name === "CompleteRegistration" ? GOOGLE_ADS_SIGNUP_LABEL : "";
      if (GOOGLE_ADS_ID && label) {
        if (email) gtag("set", "user_data", { email: String(email).trim().toLowerCase() });
        gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${label}`, ...value, transaction_id: id });
        gtag("set", "user_data", null);
      }
    }
  } catch { /* Analytics must never disrupt a completed checkout. */ }
}

export function trackLead(source) {
  fbq("track", "Lead", { content_name: source });
  gtag("event", "generate_lead", { lead_source: source });
}

export function trackContact(method) {
  fbq("track", "Contact", { content_name: method });
  gtag("event", "contact", { method });
  if (method === "phone" && GOOGLE_ADS_ID && GOOGLE_ADS_PHONE_LABEL) {
    gtag("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PHONE_LABEL}` });
  }
}

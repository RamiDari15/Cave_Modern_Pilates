// Instagram, Facebook and Messenger open links in their own in-app browser.
// Google sign-in is blocked there and Mindbody sign-in often loses its session,
// so checkout pages offer a way out to Safari or Chrome.
export function detectInAppBrowser(userAgent = "") {
  const ua = String(userAgent || "");
  const app = /Instagram/i.test(ua) ? "Instagram"
    : /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua) ? "Facebook"
    : /Messenger|MESSENGER/.test(ua) ? "Messenger"
    : /musical_ly|TikTok|BytedanceWebview/i.test(ua) ? "TikTok"
    : "";
  if (!app) return null;
  const platform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  return { app, platform };
}

export function externalBrowserUrl(href, platform) {
  const url = new URL(href);
  if (platform === "android") {
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
  }
  if (platform === "ios") {
    return `x-safari-${url.href}`;
  }
  return url.href;
}

// Mindbody's own checkout for a pricing option, used as a fallback for new clients.
export function mindbodyPricingOptionUrl(serviceId, studioId = "5753835") {
  return `https://clients.mindbodyonline.com/classic/ws?studioid=${encodeURIComponent(studioId)}&stype=40&prodid=${encodeURIComponent(serviceId)}`;
}

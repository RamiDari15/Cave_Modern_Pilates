import crypto from "node:crypto";

// Server-side ad conversion events (Meta Conversions API).
// Does nothing unless META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set, so
// local dev and tests never call Meta. Browser events from src/tracking.js
// share the same event_id, which lets Meta de-duplicate the pair.

const META_GRAPH_VERSION = "v21.0";
const META_TIMEOUT_MS = 1500;
const NEW_CLIENT_PATTERN = /\b(new client|newbie|intro)\b/i;

export function isNewClientItemName(name) {
  return NEW_CLIENT_PATTERN.test(String(name || ""));
}

export function hashForMeta(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function normalizeUsPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return "";
}

export function cleanEventId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{8,100}$/.test(id) ? id : crypto.randomUUID();
}

function requestContext(request) {
  const headers = request?.headers || {};
  const cookies = Object.fromEntries(
    String(headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, decodeURIComponent(rest.join("="))])
  );
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  const origin = String(headers.origin || "").replace(/\/$/, "");
  return {
    clientIp: forwarded || request?.socket?.remoteAddress || undefined,
    userAgent: headers["user-agent"] || undefined,
    fbp: cookies._fbp || undefined,
    fbc: cookies._fbc || undefined,
    referer: headers.referer || (origin ? `${origin}/` : undefined)
  };
}

export function buildMetaEvent({ eventName, eventId, value, contentName, email, phone, externalId, request, now = Date.now() }) {
  const context = requestContext(request);
  const userData = {
    em: email ? [hashForMeta(email)] : undefined,
    ph: normalizeUsPhone(phone) ? [hashForMeta(normalizeUsPhone(phone))] : undefined,
    external_id: externalId ? [hashForMeta(externalId)] : undefined,
    client_ip_address: context.clientIp,
    client_user_agent: context.userAgent,
    fbp: context.fbp,
    fbc: context.fbc
  };
  const customData = {
    currency: "USD",
    ...(Number.isFinite(Number(value)) && Number(value) > 0 ? { value: Number(Number(value).toFixed(2)) } : {}),
    ...(contentName ? { content_name: String(contentName).slice(0, 200) } : {})
  };

  return {
    event_name: eventName,
    event_time: Math.floor(now / 1000),
    event_id: cleanEventId(eventId),
    action_source: "website",
    event_source_url: context.referer,
    user_data: JSON.parse(JSON.stringify(userData)),
    custom_data: customData
  };
}

export async function sendMetaEvents(events, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const pixelId = String(env.META_PIXEL_ID || "").trim();
  const accessToken = String(env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!pixelId || !accessToken || !events.length || typeof fetchImpl !== "function") {
    return { sent: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: events,
          ...(env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: env.META_CAPI_TEST_EVENT_CODE } : {})
        }),
        signal: controller.signal
      }
    );
    if (!response.ok) {
      console.warn("[ad-conversions] Meta rejected events:", response.status);
    }
    return { sent: response.ok };
  } catch (error) {
    console.warn("[ad-conversions] Meta events not sent:", error?.name || "error");
    return { sent: false };
  } finally {
    clearTimeout(timer);
  }
}

// Purchase events for a completed cart checkout. A new-client item adds a
// NewClientPurchase event, which is what the ad campaigns optimize for.
export function cartPurchaseEvents({ items, total, eventId, email, externalId, request }) {
  const list = Array.isArray(items) ? items : [];
  const names = list.map((item) => item?.name).filter(Boolean);
  const newClientItems = list.filter((item) => isNewClientItemName(item?.name));
  const baseId = cleanEventId(eventId);
  const events = [
    buildMetaEvent({ eventName: "Purchase", eventId: baseId, value: total, contentName: names.join(", "), email, externalId, request })
  ];

  if (newClientItems.length) {
    const newClientValue = newClientItems.reduce(
      (sum, item) => sum + (Number(String(item.price || "").replace(/[^0-9.]/g, "")) || 0) * (Number(item.quantity) || 1),
      0
    );
    events.push(
      buildMetaEvent({
        eventName: "NewClientPurchase",
        eventId: `${baseId}-intro`,
        value: newClientValue || total,
        contentName: newClientItems.map((item) => item.name).join(", "),
        email,
        externalId,
        request
      })
    );
  }

  return events;
}

export const KLAVIYO_PUBLIC_KEY = "RzBGun";
export const KLAVIYO_EMAIL_LIST_ID = "St7Lbx";
export const KLAVIYO_SMS_LIST_ID = "VAdfe9";
export const KLAVIYO_API_REVISION = "2026-07-15";
export const CAVE_UPDATES_PREFERENCE_KEY = "cave-updates-preferences-v1";
export const CAVE_UPDATES_PROMPT_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000;

function readStoredPreferences(storage) {
  if (!storage) return {};

  try {
    return JSON.parse(storage.getItem(CAVE_UPDATES_PREFERENCE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStoredPreferences(storage, preferences) {
  if (!storage) return preferences;

  try {
    storage.setItem(CAVE_UPDATES_PREFERENCE_KEY, JSON.stringify(preferences));
  } catch {
    // Signup must still work when storage is blocked or unavailable.
  }

  return preferences;
}

export function getCaveUpdatesPreferences(storage = globalThis.localStorage) {
  const preferences = readStoredPreferences(storage);

  return {
    emailSubscribed: preferences.emailSubscribed === true,
    smsSubscribed: preferences.smsSubscribed === true,
    lastPromptedAt: Number(preferences.lastPromptedAt) || 0
  };
}

export function rememberCaveUpdatesPrompt(storage = globalThis.localStorage, now = Date.now()) {
  const preferences = getCaveUpdatesPreferences(storage);
  return writeStoredPreferences(storage, { ...preferences, lastPromptedAt: now });
}

export function rememberCaveUpdatesSubscription({ includeSms = false, storage = globalThis.localStorage } = {}) {
  const preferences = getCaveUpdatesPreferences(storage);
  return writeStoredPreferences(storage, {
    ...preferences,
    emailSubscribed: true,
    smsSubscribed: preferences.smsSubscribed || includeSms,
    lastPromptedAt: Date.now()
  });
}

export function shouldShowCaveUpdatesPrompt({ storage = globalThis.localStorage, now = Date.now() } = {}) {
  const preferences = getCaveUpdatesPreferences(storage);
  if (preferences.emailSubscribed) return false;
  return now - preferences.lastPromptedAt >= CAVE_UPDATES_PROMPT_COOLDOWN_MS;
}

export function normalizeKlaviyoPhone(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  const digits = input.replace(/\D/g, "");
  if (input.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function createKlaviyoSubscriptionPayload({ email, phoneNumber = "", channel = "email" }) {
  const isSms = channel === "sms";
  const profileAttributes = {
    email: String(email || "").trim().toLowerCase(),
    subscriptions: isSms
      ? { sms: { marketing: { consent: "SUBSCRIBED" } } }
      : { email: { marketing: { consent: "SUBSCRIBED" } } },
    properties: {
      "Signup Source": "Cave website updates form"
    }
  };

  if (isSms && phoneNumber) {
    profileAttributes.phone_number = phoneNumber;
  }

  return {
    data: {
      type: "subscription",
      attributes: {
        custom_source: "Cave website updates form",
        profile: {
          data: {
            type: "profile",
            attributes: profileAttributes
          }
        }
      },
      relationships: {
        list: {
          data: {
            type: "list",
            id: isSms ? KLAVIYO_SMS_LIST_ID : KLAVIYO_EMAIL_LIST_ID
          }
        }
      }
    }
  };
}

export async function subscribeToCaveUpdates({ email, phoneNumber = "", includeSms = false, fetchImpl = fetch }) {
  const subscribe = async (channel) => {
    const response = await fetchImpl(
      `https://a.klaviyo.com/client/subscriptions?company_id=${encodeURIComponent(KLAVIYO_PUBLIC_KEY)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          revision: KLAVIYO_API_REVISION
        },
        body: JSON.stringify(createKlaviyoSubscriptionPayload({ email, phoneNumber, channel }))
      }
    );

    if (!response.ok) {
      throw new Error(`Klaviyo ${channel} subscription failed`);
    }
  };

  await subscribe("email");
  if (includeSms) {
    await subscribe("sms");
  }
}

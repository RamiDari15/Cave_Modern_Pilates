import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const API_HOST = "api." + "mind" + "bodyonline.com";
const BASE_URL = `https://${API_HOST}/public/v6`;
const OFFICIAL_SITE_URL = "https://www.cavemodernpilates.com";
const SESSION_COOKIE = "cave_session";
const OAUTH_COOKIE = "cave_oauth";
const SESSION_COOKIE_CHUNK_SIZE = 3600;
const SESSION_COOKIE_MAX_CHUNKS = 8;
const STORE_CACHE_FILE = resolve(ROOT_DIR, "data", "studio-cache.json");
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_TTL_SECONDS = 10 * 60;
const DEFAULT_OAUTH_SCOPE =
  "email openid profile Platform.Contacts.Api.Write Platform.Contacts.Api.Read Platform.Accounts.Api.Read Mindbody.Api.Public.v6 Platform.ProductInventory.Api.Read Platform.ProductInventory.Api.Write";
const OAUTH_PROFILE_REFRESH_MS = 10 * 60 * 1000;
const PUBLIC_SCHEDULE_REFRESH_TTL_MS = Math.max(Number(process.env.BOOKING_SCHEDULE_REFRESH_SECONDS || 120), 30) * 1000;
const AUTH_RATE_LIMIT = { count: 20, windowMs: 15 * 60 * 1000 };
const rateLimitHits = new Map();
const pendingOAuthStates = new Map();
const actionTokenCache = {
  key: "",
  token: "",
  expiresAt: 0
};
const publicScheduleCache = {
  key: "",
  expiresAt: 0,
  generatedAt: "",
  schedule: []
};
const addCardUrlCache = {
  configuredUrl: "",
  ok: false,
  checkedAt: 0,
  TTL_MS: 5 * 60 * 1000
};
const liveClassesCache = {
  key: "",
  data: [],
  expiresAt: 0,
  TTL_MS: 2 * 60 * 1000
};

loadLocalEnv();

function loadLocalEnv() {
  const envFile = resolve(ROOT_DIR, ".env");

  if (!existsSync(envFile)) {
    return;
  }

  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    process.env[key.trim()] ||= valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

export function getBookingConfig() {
  const apiKey = configuredEnvValue("BOOKING_API_KEY", "MINDBODY_API_KEY");
  const siteId = configuredEnvValue("BOOKING_SITE_ID", "MINDBODY_SITE_ID") || "5753835";
  const oauthClientId = configuredEnvValue(
    "BOOKING_OAUTH_CLIENT_ID",
    "MINDBODY_OAUTH_CLIENT_ID",
    "BOOKING_CLIENT_AUTH_CLIENT_ID",
    "MINDBODY_CLIENT_AUTH_CLIENT_ID"
  );
  const oauthClientSecret = configuredEnvValue(
    "BOOKING_OAUTH_CLIENT_SECRET",
    "MINDBODY_OAUTH_CLIENT_SECRET",
    "BOOKING_CLIENT_AUTH_CLIENT_SECRET",
    "MINDBODY_CLIENT_AUTH_CLIENT_SECRET"
  );
  const configuredPublicBaseUrl = configuredEnvValue("PUBLIC_BASE_URL", "SITE_URL", "VITE_SITE_URL");
  const defaultBaseUrl =
    configuredPublicBaseUrl ||
    (process.env.NODE_ENV === "production"
      ? OFFICIAL_SITE_URL
      : `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 8765}`);
  const oauthRedirectUri =
    configuredEnvValue("BOOKING_OAUTH_REDIRECT_URI", "MINDBODY_OAUTH_REDIRECT_URI") ||
    `${defaultBaseUrl}/api/auth/callback`;
  const oauthSubscriberId =
    configuredEnvValue(
      "BOOKING_OAUTH_SUBSCRIBER_ID",
      "MINDBODY_OAUTH_SUBSCRIBER_ID",
      "BOOKING_SUBSCRIBER_ID",
      "MINDBODY_SUBSCRIBER_ID"
    ) ||
    siteId;
  const sessionSecret = configuredEnvValue("SESSION_SECRET") || (process.env.NODE_ENV === "production" ? "" : apiKey);
  const oauthUsePkce = configuredEnvBoolean("BOOKING_OAUTH_USE_PKCE", "MINDBODY_OAUTH_USE_PKCE");
  const oauthIncludeSubscriberId = configuredEnvBoolean(
    "BOOKING_OAUTH_INCLUDE_SUBSCRIBER_ID",
    "MINDBODY_OAUTH_INCLUDE_SUBSCRIBER_ID"
  );
  const staffUsername = configuredEnvValue(
    "BOOKING_STAFF_USERNAME",
    "BOOKING_USER_USERNAME",
    "MINDBODY_STAFF_USERNAME",
    "MINDBODY_USER_USERNAME"
  );
  const staffPassword = configuredEnvValue(
    "BOOKING_STAFF_PASSWORD",
    "BOOKING_USER_PASSWORD",
    "MINDBODY_STAFF_PASSWORD",
    "MINDBODY_USER_PASSWORD"
  );
  const sourceName = configuredEnvValue("BOOKING_SOURCE_NAME", "MINDBODY_SOURCE_NAME");
  const sourcePassword = configuredEnvValue("BOOKING_SOURCE_PASSWORD", "MINDBODY_SOURCE_PASSWORD");
  const staffToken = configuredEnvValue(
    "BOOKING_STAFF_TOKEN",
    "BOOKING_USER_TOKEN",
    "MINDBODY_STAFF_TOKEN",
    "MINDBODY_USER_TOKEN"
  );
  const paymentSetupUrl = configuredEnvValue("BOOKING_PAYMENT_SETUP_URL", "MINDBODY_PAYMENT_SETUP_URL");
  const paymentAuthenticationCallbackUrl = configuredEnvValue(
    "BOOKING_PAYMENT_AUTH_CALLBACK_URL",
    "MINDBODY_PAYMENT_AUTH_CALLBACK_URL"
  );
  const actionTokenConfigured = Boolean(staffToken || (staffUsername && staffPassword) || (sourceName && sourcePassword));

  return {
    apiKey,
    siteId,
    sessionSecret,
    secureCookies: process.env.NODE_ENV === "production" && process.env.DISABLE_SECURE_COOKIES !== "true",
    oauthAuthorizeUrl:
      configuredEnvValue("BOOKING_OAUTH_AUTHORIZE_URL", "MINDBODY_OAUTH_AUTHORIZE_URL") ||
      "https://signin.mindbodyonline.com/connect/authorize",
    oauthTokenUrl:
      configuredEnvValue(
        "BOOKING_OAUTH_TOKEN_URL",
        "MINDBODY_OAUTH_TOKEN_URL",
        "BOOKING_CLIENT_AUTH_URL",
        "MINDBODY_CLIENT_AUTH_URL"
      ) ||
      "https://signin.mindbodyonline.com/connect/token",
    oauthClientId,
    oauthClientSecret,
    oauthRedirectUri,
    oauthScope:
      configuredEnvValue(
        "BOOKING_OAUTH_SCOPE",
        "MINDBODY_OAUTH_SCOPE",
        "BOOKING_CLIENT_AUTH_SCOPE",
        "MINDBODY_CLIENT_AUTH_SCOPE"
      ) ||
      DEFAULT_OAUTH_SCOPE,
    oauthResponseMode: configuredEnvValue("BOOKING_OAUTH_RESPONSE_MODE", "MINDBODY_OAUTH_RESPONSE_MODE") || "form_post",
    oauthResponseType: configuredEnvValue("BOOKING_OAUTH_RESPONSE_TYPE", "MINDBODY_OAUTH_RESPONSE_TYPE") || "code id_token",
    oauthUsePkce,
    oauthIncludeSubscriberId,
    oauthSubscriberId,
    locationId: configuredEnvValue("BOOKING_LOCATION_ID", "MINDBODY_LOCATION_ID") || "1",
    staffToken,
    staffUsername,
    staffPassword,
    sourceName,
    sourcePassword,
    paymentSetupUrl,
    paymentAuthenticationCallbackUrl,
    publicBaseUrl: defaultBaseUrl,
    actionTokenConfigured,
    oauthConfigured: Boolean(oauthClientId && oauthRedirectUri && oauthSubscriberId)
  };
}

function configuredEnvValue(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();

    if (value && !isPlaceholderEnvValue(value)) {
      return value;
    }
  }

  return "";
}

function isPlaceholderEnvValue(value) {
  const lower = String(value || "").trim().toLowerCase();

  return (
    /^booking_[a-z0-9_]+$/.test(lower) ||
    /^mindbody_[a-z0-9_]+$/.test(lower) ||
    (lower.includes("cave-modern-pilates") && lower.includes(".vercel.app")) ||
    lower.includes("api.mindbodyonline.com/public/v6") ||
    lower.includes("actual_unhidden") ||
    lower.includes("actual-hidden") ||
    lower.includes("secure-payment-link") ||
    lower.includes("source_password") ||
    lower.includes("source password") ||
    lower.includes("your_") ||
    lower.includes("your-") ||
    lower.includes("your ") ||
    lower.includes("replace_with") ||
    lower.includes("_here") ||
    lower.includes("client_auth") ||
    lower.includes("staff_level_user_token") ||
    lower.includes("source_derived") ||
    lower === "https://..." ||
    lower === "..."
  );
}

function configuredEnvBoolean(...keys) {
  const value = configuredEnvValue(...keys);

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export async function handleApiRequest(request, response) {
  loadLocalEnv();
  const url = new URL(request.url || "/", "http://localhost");
  const path = url.pathname;

  if (!path.startsWith("/api/")) {
    return false;
  }

  try {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "") && path !== "/api/auth/callback") {
      enforceSameOrigin(request);
    }

    if (["/api/auth/start", "/api/auth/sign-in", "/api/auth/sign-up", "/api/client/waiver", "/api/client/complete-profile", "/api/client/saved-cards", "/api/classes/book", "/api/payment/setup", "/api/mindbody/add-card-url", "/api/mindbody/book-class", "/api/mindbody/join-waitlist", "/api/store/purchase", "/api/assistant/chat"].includes(path)) {
      enforceRateLimit(request);
    }

    if (path === "/api/auth/status") {
      const {
        apiKey,
        siteId,
        sessionSecret,
        oauthConfigured,
        oauthIncludeSubscriberId,
        oauthRedirectUri,
        oauthResponseMode,
        oauthResponseType,
        oauthScope,
        oauthSubscriberId,
        oauthUsePkce
      } = getBookingConfig();
      const { actionTokenConfigured } = getBookingConfig();
      const actionTokenMode = getMindbodyActionTokenMode(getBookingConfig());
      sendJson(response, 200, {
        configured: Boolean(apiKey),
        oauthConfigured,
        actionTokenConfigured,
        actionTokenMode,
        hasSessionSecret: Boolean(sessionSecret),
        oauthRedirectUri,
        oauthResponseMode,
        oauthResponseType,
        oauthScope,
        oauthIncludeSubscriberId,
        oauthSubscriberId,
        oauthUsePkce,
        siteId
      });
      return true;
    }

    if (path === "/api/mindbody/readiness") {
      sendJson(response, 200, await mindbodyReadinessReport());
      return true;
    }

    if (path === "/api/mindbody/action-token-status") {
      sendJson(response, 200, await mindbodyActionTokenStatus());
      return true;
    }

    if (path === "/api/studio-cache") {
      const freshSchedule = ["1", "true", "schedule"].includes(String(url.searchParams.get("fresh") || "").toLowerCase());
      const cache = freshSchedule ? await readStoreCacheWithFreshSchedule() : readStoreCache();
      sendJson(response, 200, cache);
      return true;
    }

    if (path === "/api/auth/session") {
      const session = await readHydratedSession(request, response);
      sendJson(response, 200, { signedIn: Boolean(session), session: publicSession(session) });
      return true;
    }

    if (path === "/api/auth/sign-out" && request.method === "POST") {
      clearSessionCookie(response);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (path === "/api/auth/link" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session?.consumerIdentityToken && !session?.accessToken) {
        sendJson(response, 401, { ok: false, message: "Please sign in first." });
        return true;
      }

      const consumerToken = session.consumerIdentityToken || session.accessToken || "";
      const email = session.user?.email || session.user?.username || "";
      const firstName = session.user?.firstName || "";
      const lastName = session.user?.lastName || "";

      if (!email) {
        sendJson(response, 400, { ok: false, message: "No email on session to link with." });
        return true;
      }

      // Try AddOrUpdateClient — Mindbody will match an existing studio client by email
      // or create a new stub record. Either way we get back a ClientId we can store in session.
      let linkedClientId = session.clientId || "";
      let linkError = null;

      if (!linkedClientId) {
        const clientPayload = compactObject({ Email: email, FirstName: firstName, LastName: lastName });

        const staffLinkAttempts = [];

        try {
          const staffToken = await getMindbodyActionToken("Account link");
          staffLinkAttempts.push(
            () => bookingRequest("/client/addorupdateclient", { method: "POST", token: staffToken, body: { Client: clientPayload } }),
            () => bookingRequest("/client/clients", { token: staffToken, params: { SearchText: email } })
          );
        } catch (_) { /* no action token */ }

        const consumerLinkAttempts = [
          () => bookingRequest("/client/addorupdateclient", { method: "POST", consumerIdentityToken: consumerToken, body: { Client: clientPayload } }),
          () => bookingRequest("/client/clients", { token: consumerToken, params: { SearchText: email } }),
          () => bookingRequest("/client/clients", { token: consumerToken, params: { SearchText: email, CrossRegionalLookup: true } }),
          () => bookingRequest("/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { CrossRegionalLookup: true } })
        ];

        for (const attempt of [...staffLinkAttempts, ...consumerLinkAttempts]) {
          try {
            const result = await attempt();
            const profile = extractClientProfile(result, email);
            if (profile?.clientId) {
              linkedClientId = profile.clientId;
              break;
            }
          } catch (err) {
            linkError = err.message || "Link attempt failed.";
          }
        }
      }

      if (linkedClientId) {
        const updatedSession = {
          ...session,
          clientId: linkedClientId,
          user: {
            ...session.user,
            id: linkedClientId
          }
        };
        setSessionCookie(response, updatedSession);
        sendJson(response, 200, { ok: true, clientId: linkedClientId });
      } else {
        sendJson(response, 200, { ok: false, message: linkError || "Could not find a matching studio account for this email." });
      }

      return true;
    }

    if (path === "/api/client/required-fields") {
      const data = await bookingRequest("/client/requiredclientfields");
      sendJson(response, 200, data);
      return true;
    }

    if (path === "/api/assistant/chat" && request.method === "POST") {
      const body = await readJsonBody(request);
      const message = String(body.message || "").trim().slice(0, 800);

      if (!message) {
        sendJson(response, 400, { message: "Please ask the assistant a question." });
        return true;
      }

      sendJson(response, 200, buildAssistantReply(message, body));
      return true;
    }

    if (path === "/api/auth/start" && request.method === "GET") {
      startOAuthSignIn(
        request,
        response,
        url.searchParams.get("returnTo"),
        url.searchParams.get("popup") === "1",
        url.searchParams.get("force") === "1"
      );
      return true;
    }

    if (path === "/api/auth/callback" && ["GET", "POST"].includes(request.method || "")) {
      const form = request.method === "POST" ? await readFormBody(request) : Object.fromEntries(url.searchParams);
      await finishOAuthSignIn(request, response, form);
      return true;
    }

    if (path === "/api/auth/sign-in" && request.method === "POST") {
      sendJson(response, 409, {
        message: "Use /api/auth/start for Mindbody OAuth sign-in."
      });
      return true;
    }

    if (path === "/api/auth/sign-up" && request.method === "POST") {
      const body = await readJsonBody(request);
      const missing = requiredSignupFields(body);
      const waiver = normalizeWaiverPayload(body.waiver || body);

      if (missing.length) {
        sendJson(response, 400, { message: `Missing required field(s): ${missing.join(", ")}` });
        return true;
      }

      if (!isSignedWaiver(waiver)) {
        sendJson(response, 400, { message: "Please complete and sign the liability waiver." });
        return true;
      }

      const payload = clientPayload(body, waiver);
      const created = await addClient(payload);
      const session = sessionFromCreatedClient(created, payload);
      session.waiver = publicWaiver(waiver);
      const waiverSync = await attachClientWaiver(session, waiver).catch((error) => ({
        storedInMindbody: false,
        message: error.message,
        details: error.data || null
      }));

      setSessionCookie(response, session);
      sendJson(response, 200, { created, session: publicSession(session), waiver: waiverSync });
      return true;
    }

    if (path === "/api/client/waiver" && request.method === "POST") {
      const session = await readHydratedSession(request, response);
      const body = await readJsonBody(request);
      const waiver = normalizeWaiverPayload(body.waiver || body);

      if (!isSignedWaiver(waiver)) {
        sendJson(response, 400, { message: "Please complete and sign the liability waiver." });
        return true;
      }

      if (!session?.signedIn && !session?.clientId && !session?.consumerIdentityToken && !session?.accessToken) {
        sendJson(response, 401, {
          message: "Please sign in before saving your waiver.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/policies#liability-waiver")}`
        });
        return true;
      }

      const waiverSync = await attachClientWaiver(session, waiver);
      session.waiver = publicWaiver(waiver);
      setSessionCookie(response, session);
      sendJson(response, 200, { waiver: waiverSync, session: publicSession(session) });
      return true;
    }

    if (path === "/api/client/complete-profile" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        sendJson(response, 401, { message: "Please sign in first." });
        return true;
      }

      const body = await readJsonBody(request);
      const consumerToken = session.consumerIdentityToken || session.accessToken || "";
      const clientId = await resolveSessionClientId(session).catch(() => "");
      const waiver = body.waiver ? normalizeWaiverPayload(body.waiver) : null;

      const profileUpdate = compactObject({
        Id: clientId || undefined,
        MobilePhone: body.phone,
        AddressLine1: body.addressLine1,
        AddressLine2: body.addressLine2,
        City: body.city,
        State: body.state,
        PostalCode: body.postalCode,
        BirthDate: body.birthDate
      });

      let updated = null;
      let updateError = null;

      if (Object.keys(profileUpdate).length > 1) {
        try {
          updated = await bookingRequest("/client/updateclient", {
            method: "PUT",
            consumerIdentityToken: consumerToken,
            body: { Client: profileUpdate }
          });
        } catch (err) {
          updateError = err.message || "Profile update failed.";
        }
      }

      if (waiver && isSignedWaiver(waiver)) {
        const waiverSync = await attachClientWaiver(session, waiver).catch(() => null);
        session.waiver = publicWaiver(waiver);
        if (waiverSync) {
          session.waiverSync = { storedInMindbody: waiverSync.storedInMindbody };
        }
      }

      setSessionCookie(response, session);
      sendJson(response, 200, {
        updated,
        updateError,
        session: publicSession(session)
      });
      return true;
    }

    if (path === "/api/classes/book" && request.method === "POST") {
      const session = await readHydratedSession(request, response);
      const body = await readJsonBody(request);
      const classId = Number(body.classId);

      if (!Number.isInteger(classId) || classId <= 0) {
        sendJson(response, 400, { message: "A valid class ID is required." });
        return true;
      }

      if (!session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        sendJson(response, 401, {
          message: "Please sign in before booking.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent(`/schedule?classId=${classId}`)}`
        });
        return true;
      }

      const booking = await bookClientIntoClass(session, classId);
      sendJson(response, 200, { booking });
      return true;
    }

    if (path === "/api/payment/setup" && request.method === "GET") {
      const session = await readHydratedSession(request, response);
      const returnTo = safeReturnTo(url.searchParams.get("returnTo") || "/pricing");

      if (!session?.clientId && !session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        sendJson(response, 401, {
          message: "Please sign in before adding a payment card.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`
        });
        return true;
      }

      sendJson(response, 200, buildPaymentSetupResponse(session, returnTo));
      return true;
    }

    if (path === "/api/mindbody/add-card-url" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.clientId && !session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        sendJson(response, 401, {
          ok: false,
          message: "Please sign in before adding a payment card.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/pricing")}`
        });
        return true;
      }

      const { paymentSetupUrl } = getBookingConfig();

      if (!paymentSetupUrl) {
        console.warn("[add-card-url] No MINDBODY_ADD_CARD_URL / BOOKING_PAYMENT_SETUP_URL configured");
        sendJson(response, 200, { ok: false, message: "Online card setup is being configured. Please contact the studio or try again later." });
        return true;
      }

      const valid = await validateAddCardUrl(paymentSetupUrl);

      if (!valid) {
        sendJson(response, 200, { ok: false, message: "Online card setup is being configured. Please contact the studio or try again later." });
        return true;
      }

      console.log(`[add-card-url] Returning valid add-card URL`);
      sendJson(response, 200, { ok: true, url: paymentSetupUrl });
      return true;
    }

    if (path === "/api/mindbody/classes" && request.method === "GET") {
      const { apiKey, locationId } = getBookingConfig();

      if (!apiKey) {
        sendJson(response, 503, { ok: false, code: "MINDBODY_AUTH_MISSING", message: "Studio booking is not yet configured." });
        return true;
      }

      try {
        const classes = await fetchLiveClasses(locationId);
        sendJson(response, 200, { ok: true, data: { classes } });
      } catch (error) {
        const msg = isStudioConnectionApiMessage(error.message)
          ? "Schedule is loading. Please try again in a moment."
          : error.message || "Could not load schedule.";
        sendJson(response, 503, { ok: false, code: "MINDBODY_API_ERROR", message: msg });
      }

      return true;
    }

    if (path === "/api/mindbody/class-descriptions" && request.method === "GET") {
      const { apiKey, locationId } = getBookingConfig();

      if (!apiKey) {
        sendJson(response, 200, { ok: true, data: { classDescriptions: [] } });
        return true;
      }

      try {
        const params = { "request.includeInactive": "false" };
        if (locationId) params["request.locationId"] = locationId;
        const data = await bookingRequest("/class/classdescriptions", { params });
        const descriptions = firstListByKey(data, "ClassDescriptions");
        sendJson(response, 200, {
          ok: true,
          data: {
            classDescriptions: descriptions.map((d) => ({
              id: d.Id,
              name: d.Name || "",
              description: d.Description || "",
              imageUrl: d.ImageURL || d.ImageUrl || ""
            }))
          }
        });
      } catch (error) {
        sendJson(response, 503, { ok: false, code: "MINDBODY_API_ERROR", message: error.message || "Could not load class descriptions." });
      }

      return true;
    }

    if (path === "/api/mindbody/client-info" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.signedIn) {
        sendJson(response, 401, { ok: false, code: "NO_CLIENT_ID", message: "Please sign in first.", loginUrl: "/api/auth/start?returnTo=/account" });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => null);

      if (!clientId) {
        sendJson(response, 400, { ok: false, code: "NO_CLIENT_ID", message: "Could not resolve your studio client ID. Please sign out and sign back in." });
        return true;
      }

      try {
        const info = await fetchClientCompleteInfo(clientId, session);
        sendJson(response, 200, { ok: true, data: info });
      } catch (error) {
        sendJson(response, error.status || 503, { ok: false, code: "MINDBODY_API_ERROR", message: error.message || "Could not load client info." });
      }

      return true;
    }

    if (path === "/api/mindbody/client-memberships" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.signedIn) {
        sendJson(response, 401, { ok: false, code: "NO_CLIENT_ID", message: "Please sign in first." });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => null);

      if (!clientId) {
        sendJson(response, 400, { ok: false, code: "NO_CLIENT_ID", message: "Could not resolve your studio client ID." });
        return true;
      }

      try {
        const data = await bookingRequest("/client/activeclientmemberships", {
          consumerIdentityToken: session?.consumerIdentityToken || session?.accessToken,
          params: { clientId }
        });
        const memberships = firstListByKey(data, "ClientMemberships");
        sendJson(response, 200, {
          ok: true,
          data: {
            memberships: memberships.map((m) => ({
              id: m.Id,
              name: m.Name || "",
              status: m.MembershipStatus || m.Status || "",
              remainingVisits: m.RemainingVisits,
              expirationDate: m.ExpirationDate
            }))
          }
        });
      } catch (error) {
        sendJson(response, 503, { ok: false, code: "MINDBODY_API_ERROR", message: error.message || "Could not load memberships." });
      }

      return true;
    }

    if (path === "/api/mindbody/book-class" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session?.signedIn) {
        sendJson(response, 401, {
          ok: false,
          code: "NO_CLIENT_ID",
          message: "Please sign in before booking.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/schedule")}`
        });
        return true;
      }

      const body = await readJsonBody(request);
      assertNoRawCardPayload(body);
      const classId = Number(body.classId);

      if (!Number.isInteger(classId) || classId <= 0) {
        sendJson(response, 400, { ok: false, code: "NO_CLASS_ID", message: "A valid class ID is required." });
        return true;
      }

      try {
        const result = await bookClassWithValidation(session, classId, body.clientServiceId ? Number(body.clientServiceId) : null);
        sendJson(response, 200, { ok: true, data: result });
      } catch (error) {
        const code = error.bookingCode || "MINDBODY_API_ERROR";
        sendJson(response, error.status || 503, {
          ok: false,
          code,
          message: error.message || "Booking could not be completed.",
          canWaitlist: error.canWaitlist || false
        });
      }

      return true;
    }

    if (path === "/api/mindbody/join-waitlist" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session?.signedIn) {
        sendJson(response, 401, {
          ok: false,
          code: "NO_CLIENT_ID",
          message: "Please sign in first.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/schedule")}`
        });
        return true;
      }

      const body = await readJsonBody(request);
      const classId = Number(body.classId);

      if (!Number.isInteger(classId) || classId <= 0) {
        sendJson(response, 400, { ok: false, code: "NO_CLASS_ID", message: "A valid class ID is required." });
        return true;
      }

      try {
        const clientId = await resolveSessionClientId(session);

        if (!clientId) {
          sendJson(response, 400, { ok: false, code: "NO_CLIENT_ID", message: "Could not resolve your studio account." });
          return true;
        }

        const classData = await bookingRequest("/class/classes", {
          params: { "request.classIds": classId, "request.schedulingWindow": "true" }
        });
        const classes = firstListByKey(classData, "Classes");
        const classItem = classes.find((c) => c.Id === classId) || classes[0];

        if (!classItem) {
          sendJson(response, 404, { ok: false, code: "NO_CLASS_ID", message: "Class not found." });
          return true;
        }

        const maxWaitlist = Number(classItem.MaxWaitListSize || 0);
        if (maxWaitlist <= 0) {
          sendJson(response, 400, { ok: false, code: "WAITLIST_NOT_AVAILABLE", message: "This class does not have a waitlist." });
          return true;
        }

        const waitlistCount = Number(classItem.TotalWaitlistedClients || 0);
        if (waitlistCount >= maxWaitlist) {
          sendJson(response, 409, { ok: false, code: "WAITLIST_NOT_AVAILABLE", message: "The waitlist for this class is also full." });
          return true;
        }

        const staffToken = await getMindbodyActionToken("Waitlist booking");
        const result = await bookingRequest("/class/addclienttoclass", {
          method: "POST",
          token: staffToken,
          body: {
            ClientId: clientId,
            ClassId: classId,
            Waitlist: true,
            SendEmail: true,
            Test: process.env.BOOKING_TEST_MODE === "true"
          }
        });

        liveClassesCache.expiresAt = 0;
        sendJson(response, 200, { ok: true, data: result });
      } catch (error) {
        const code = error.bookingCode || "MINDBODY_API_ERROR";
        sendJson(response, error.status || 503, { ok: false, code, message: error.message || "Could not join waitlist." });
      }

      return true;
    }

    if (path === "/api/mindbody/payment-types" && request.method === "GET") {
      const { apiKey } = getBookingConfig();

      if (!apiKey) {
        sendJson(response, 200, { ok: true, data: { paymentTypes: [] } });
        return true;
      }

      try {
        const data = await bookingRequest("/site/paymenttypes");
        const types = firstListByKey(data, "PaymentTypes");
        sendJson(response, 200, {
          ok: true,
          data: {
            paymentTypes: types.map((t) => ({ id: t.Id, name: t.Name || "", isSystem: Boolean(t.IsSystem) }))
          }
        });
      } catch (error) {
        sendJson(response, 503, { ok: false, code: "MINDBODY_API_ERROR", message: error.message || "Could not load payment types." });
      }

      return true;
    }

    if (path === "/api/store/purchase" && request.method === "POST") {
      const session = await readHydratedSession(request, response);
      const body = await readJsonBody(request);
      assertNoRawCardPayload(body);
      const item = findStoreItem(body.itemId, body.kind);

      if (!item) {
        sendJson(response, 404, { message: "That pricing option is not available in the studio store cache." });
        return true;
      }

      if (item.requiresWaiver && !body.acceptWaiver) {
        sendJson(response, 400, { message: "Please accept the liability waiver before continuing." });
        return true;
      }

      if (item.requiresTerms && !body.acceptTerms) {
        sendJson(response, 400, { message: "Please accept the membership agreement before continuing." });
        return true;
      }

      if (!session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        const returnTo = safeReturnTo(body.returnTo || `/pricing?purchase=${item.kind}-${item.id}`);
        sendJson(response, 401, {
          message: "Please sign in before buying.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`
        });
        return true;
      }

      const purchase = await purchaseStoreItem(session, item, body);
      sendJson(response, 200, { purchase });
      return true;
    }

    if (path === "/api/client/saved-cards" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.signedIn && !session?.consumerIdentityToken && !session?.accessToken && session?.authMode !== "created-client") {
        sendJson(response, 200, { cards: [] });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => "");

      if (!clientId) {
        sendJson(response, 200, { cards: [] });
        return true;
      }

      try {
        const staffToken = await getMindbodyActionToken("Saved cards");
        const data = await bookingRequest("/sale/creditcards", {
          token: staffToken,
          params: { ClientId: clientId }
        });
        const cards = (data.CreditCards || data.creditCards || []).map((card) => ({
          lastFour: String(card.LastFour || card.lastFour || "").trim(),
          cardType: String(card.CardType || card.cardType || card.Type || "").trim(),
          expMonth: String(card.ExpMonth || card.expMonth || "").trim(),
          expYear: String(card.ExpYear || card.expYear || "").trim()
        })).filter((card) => /^\d{4}$/.test(card.lastFour));
        sendJson(response, 200, { cards });
      } catch (error) {
        sendJson(response, 200, { cards: [], note: publicApiErrorMessage(error) });
      }
      return true;
    }

    if (path === "/api/client/dashboard") {
      const session = await readHydratedSession(request, response);

      if (!session?.accessToken && !session?.consumerIdentityToken && session?.authMode !== "created-client") {
        sendJson(response, 401, { message: "Please sign in first." });
        return true;
      }

      const errors = [];
      const consumerToken = session.consumerIdentityToken || session.accessToken || "";
      const sessionEmail = session.user?.email || session.user?.username || "";
      let consumerProfile = null;

      if (consumerToken) {
        const profileAttempts = [
          () => bookingRequest("/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: compactObject({ ClientId: session.clientId }) }),
          () => bookingRequest("/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { CrossRegionalLookup: true } }),
          ...(sessionEmail ? [
            () => bookingRequest("/client/clients", { token: consumerToken, params: { SearchText: sessionEmail } }),
            () => bookingRequest("/client/clients", { token: consumerToken, params: { SearchText: sessionEmail, CrossRegionalLookup: true } })
          ] : [])
        ];

        for (const attempt of profileAttempts) {
          try {
            const result = await attempt();
            const extracted = extractClientId(result);
            if (extracted || result?.Client || result?.ClientCompleteInfo?.Client || result?.Clients?.length) {
              consumerProfile = result;
              break;
            }
          } catch (_) {}
        }
      }

      const config = getBookingConfig();
      const clientId = session.clientId || extractClientId(consumerProfile);
      const hasConsumerData = Boolean(consumerProfile?.Client || consumerProfile?.ClientCompleteInfo?.Client || (consumerProfile?.Clients?.length));

      if (!config.actionTokenConfigured || !clientId) {
        const cpClient = consumerProfile?.Client || {};
        sendJson(response, 200, {
          clientLinked: Boolean(clientId) || hasConsumerData,
          profile: consumerProfile || { Client: session.user || {} },
          schedule: consumerProfile?.ClientSchedule || consumerProfile?.Schedule || cpClient?.ClientSchedule || null,
          services: consumerProfile?.ClientServices || consumerProfile?.Services || cpClient?.ClientServices || null,
          contracts: consumerProfile?.ClientContracts || consumerProfile?.ClientMemberships || consumerProfile?.Memberships || cpClient?.ClientContracts || cpClient?.ClientMemberships || null,
          session: publicSession(session),
          errors: []
        });
        return true;
      }

      let staffToken = null;
      try {
        staffToken = await getMindbodyActionToken("Account dashboard");
      } catch (_) { /* fall back to consumerProfile data */ }

      if (!staffToken) {
        const cpClient = consumerProfile?.Client || {};
        sendJson(response, 200, {
          clientLinked: Boolean(clientId) || hasConsumerData,
          profile: consumerProfile || { Client: session.user || {} },
          schedule: consumerProfile?.ClientSchedule || consumerProfile?.Schedule || cpClient?.ClientSchedule || null,
          services: consumerProfile?.ClientServices || consumerProfile?.Services || cpClient?.ClientServices || null,
          contracts: consumerProfile?.ClientContracts || consumerProfile?.ClientMemberships || consumerProfile?.Memberships || cpClient?.ClientContracts || cpClient?.ClientMemberships || null,
          session: publicSession(session),
          errors: []
        });
        return true;
      }

      const requestOptions = { token: staffToken };
      const [profile, schedule, services, contracts] = await Promise.allSettled([
        bookingRequest("/client/clients", { ...requestOptions, params: { ClientIds: clientId } }),
        bookingRequest("/client/clientschedule", { ...requestOptions, params: { ClientId: clientId } }),
        bookingRequest("/client/clientservices", { ...requestOptions, params: { ClientId: clientId } }),
        bookingRequest("/client/clientcontracts", { ...requestOptions, params: { ClientId: clientId } })
      ]);

      sendJson(response, 200, {
        clientLinked: true,
        profile: fulfilledValue(profile) || consumerProfile,
        schedule: fulfilledValue(schedule),
        services: fulfilledValue(services),
        contracts: fulfilledValue(contracts),
        session: publicSession(session),
        errors: []
      });
      return true;
    }

    sendJson(response, 404, { message: "API route not found." });
    return true;
  } catch (error) {
    sendJson(response, error.status || 500, {
      message: publicApiErrorMessage(error),
      details: error.data || null
    });
    return true;
  }
}

function fulfilledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function buildAssistantReply(message, context = {}) {
  const cache = readStoreCache();
  const text = String(message || "").toLowerCase();
  const signedIn = Boolean(context.signedIn);
  const store = cache.store || {};
  const schedule = Array.isArray(cache.schedule) ? cache.schedule : [];
  const location = cache.location || {};

  if (matchesAny(text, ["price", "pricing", "cost", "membership", "package", "drop in", "drop-in", "newbie", "intro", "buy"])) {
    return pricingAssistantReply(text, store);
  }

  if (matchesAny(text, ["schedule", "book", "class", "time", "spot", "available", "availability"])) {
    return scheduleAssistantReply(schedule, signedIn);
  }

  if (matchesAny(text, ["login", "log in", "sign in", "account", "credit", "credits", "dashboard"])) {
    return {
      reply: signedIn
        ? "You’re signed in. Head to your account to review bookings, credits, memberships, and saved client details."
        : "Use the Login page to access your Cave account. Once the secure account connection is active, booking, credits, memberships, and client details will stay inside the Cave site experience.",
      actions: signedIn
        ? [{ label: "My Account", href: "/account" }, { label: "Schedule", href: "/schedule" }]
        : [{ label: "Login", href: "/login" }, { label: "Create Account", href: "/signup" }]
    };
  }

  if (matchesAny(text, ["sign up", "signup", "create account", "waiver", "liability", "first time", "first class"])) {
    return {
      reply: "First-time clients can create an account and complete the liability waiver before class. The signup form captures the required client details and waiver signature, then sends the profile to the studio booking system.",
      actions: [
        { label: "Create Account", href: "/signup" },
        { label: "Read Policies", href: "/policies#waiver-copy" },
        { label: "Newbie Promo", href: "/newbie" }
      ]
    };
  }

  if (matchesAny(text, ["cancel", "late", "no show", "no-show", "refund", "renew", "notice", "policy", "policies"])) {
    return {
      reply: "Classes need to be canceled at least 12 hours before start time. Package holders lose the reserved credit for late cancels or no-shows, and unlimited members may be charged the applicable fee. Membership or package non-renewal needs 14 days written notice before the next billing date. All sales are final unless Cave approves an exception.",
      actions: [
        { label: "FAQ", href: "/faq" },
        { label: "Policies", href: "/policies" },
        { label: "Contact Us", href: "/contact" }
      ]
    };
  }

  if (matchesAny(text, ["contact", "email", "phone", "call", "address", "location", "parking", "instagram", "tiktok"])) {
    return {
      reply: `You can reach Cave at support@cavemodernpilates.com or (708) 571-5730. The studio is at ${cleanAssistantAddress(location.address) || "31 Orland Square Drive Suite B, Orland Park IL 60462"}. Instagram and TikTok are both @cavemodernpilates.`,
      actions: [
        { label: "Contact Page", href: "/contact" },
        { label: "Instagram", href: "https://www.instagram.com/cavemodernpilates/" },
        { label: "TikTok", href: "https://www.tiktok.com/@cavemodernpilates" }
      ]
    };
  }

  if (matchesAny(text, ["mindbody", "mind body", "api", "oauth", "payment", "checkout"])) {
    return {
      reply: "The site is set up so clients stay on Cave for account, booking, waiver, and purchase actions. The backend sends secure requests to the studio booking system, and checkout only uses a saved-card ending or future Mindbody-approved tokenized payment data.",
      actions: [
        { label: "Login", href: "/login" },
        { label: "Schedule", href: "/schedule" },
        { label: "Pricing", href: "/pricing" }
      ]
    };
  }

  return {
    reply: "I can help with booking a class, current pricing, newbie offers, memberships, class packs, policies, account setup, or contacting the studio. What do you want to do next?",
    actions: [
      { label: "Book a Class", href: "/schedule" },
      { label: "View Pricing", href: "/pricing" },
      { label: "Create Account", href: "/signup" },
      { label: "Contact", href: "/contact" }
    ]
  };
}

function pricingAssistantReply(text, store) {
  const wantsMemberships = matchesAny(text, ["membership", "memberships", "monthly", "contract"]);
  const wantsPacks = matchesAny(text, ["class pack", "class packs", "package", "packages", "drop in", "drop-in"]);
  const wantsNewbie = matchesAny(text, ["newbie", "intro", "new client", "first"]);

  if (wantsMemberships && !wantsPacks && !wantsNewbie) {
    return {
      reply: `Memberships currently include ${assistantItemList(store.memberships, 4)}. Choose a membership to review terms and buy on-site after signing in.`,
      actions: [{ label: "Memberships", href: "/memberships" }, { label: "Login", href: "/login" }]
    };
  }

  if (wantsPacks && !wantsMemberships && !wantsNewbie) {
    return {
      reply: `Class packs currently include ${assistantItemList(store.classPacks, 4)}. You can buy from the class packs page once checkout is fully connected.`,
      actions: [{ label: "Class Packs", href: "/class-packs" }, { label: "Schedule", href: "/schedule" }]
    };
  }

  if (wantsNewbie && !wantsMemberships && !wantsPacks) {
    return {
      reply: `Newbie offers currently include ${assistantItemList(store.newbie, 3)}. First-time clients should create an account and complete the waiver before class.`,
      actions: [{ label: "Newbie Promo", href: "/newbie" }, { label: "Create Account", href: "/signup" }]
    };
  }

  return {
    reply: `Current pricing is grouped into newbie offers, memberships, and class packs. Newbie: ${assistantItemList(store.newbie, 2)}. Memberships: ${assistantItemList(store.memberships, 3)}. Class packs: ${assistantItemList(store.classPacks, 3)}.`,
    actions: [
      { label: "All Pricing", href: "/pricing" },
      { label: "Newbie Promo", href: "/newbie" },
      { label: "Memberships", href: "/memberships" },
      { label: "Class Packs", href: "/class-packs" }
    ]
  };
}

function scheduleAssistantReply(schedule, signedIn) {
  const upcoming = schedule
    .filter((item) => item?.startDateTime && new Date(item.startDateTime).getTime() >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
    .slice(0, 3);

  const classSummary = upcoming.length
    ? upcoming.map((item) => `${item.className || "Class"} with ${item.instructor || "the Cave team"} on ${item.date || formatAssistantDate(item.startDateTime)} at ${item.time || formatAssistantTime(item.startDateTime)}`).join("; ")
    : "The schedule page has the latest available classes.";

  return {
    reply: `${classSummary}. ${signedIn ? "Pick a class and tap Book to reserve your spot." : "You can view the schedule now; sign in before booking so the reservation is attached to your studio account."}`,
    actions: [
      { label: "View Schedule", href: "/schedule" },
      signedIn ? { label: "My Account", href: "/account" } : { label: "Login", href: "/login" }
    ]
  };
}

function assistantItemList(items = [], limit = 3) {
  const visible = (Array.isArray(items) ? items : [])
    .filter((item) => item?.sellOnline !== false)
    .slice(0, limit)
    .map((item) => `${item.name || item.sourceName || "Option"} (${item.price || "price shown on page"})`);

  return visible.length ? visible.join(", ") : "options shown on the pricing page";
}

function matchesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function cleanAssistantAddress(address) {
  return String(address || "")
    .replace(/\s+/g, " ")
    .replace(/\bsuite\s+b\b/i, "Suite B")
    .replace(/,\s*Orland Park,\s*IL,?\s*60462$/i, "")
    .trim();
}

function formatAssistantDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an upcoming date" : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatAssistantTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "the listed time" : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function mindbodyReadinessReport() {
  const config = getBookingConfig();
  const actionTokenMode = getMindbodyActionTokenMode(config);
  const waiverFieldIds = [
    "BOOKING_WAIVER_CUSTOM_FIELD_ID",
    "BOOKING_WAIVER_SIGNATURE_FIELD_ID",
    "BOOKING_WAIVER_DATE_FIELD_ID",
    "BOOKING_WAIVER_VERSION_FIELD_ID"
  ];
  const missingWaiverFields = waiverFieldIds.filter((key) => !configuredEnvValue(key, key.replace("BOOKING_", "MINDBODY_")));
  const scopeTokens = String(config.oauthScope || "").split(/\s+/).filter(Boolean);
  const hasPublicApiScope = scopeTokens.includes("Mindbody.Api.Public.v6");
  const actionTokenHealth = await checkActionTokenHealth(actionTokenMode);
  const actionTokenMissing = actionTokenHealth.ready
    ? []
    : [actionTokenHealth.message];

  const checks = {
    publicCache: {
      ready: Boolean(config.apiKey && config.siteId),
      missing: [config.apiKey ? "" : "BOOKING_API_KEY", config.siteId ? "" : "BOOKING_SITE_ID"].filter(Boolean),
      note: "Loads public schedule and pricing from the server-side Mindbody cache."
    },
    clientLogin: {
      ready: Boolean(config.oauthConfigured),
      missing: [
        config.oauthClientId ? "" : "BOOKING_OAUTH_CLIENT_ID",
        config.oauthRedirectUri ? "" : "BOOKING_OAUTH_REDIRECT_URI"
      ].filter(Boolean),
      note: "Uses Mindbody OAuth. Public OAuth clients use the approved client ID and redirect URI; add a client secret or PKCE only if Mindbody requires it."
    },
    clientApiAccess: {
      ready: Boolean(config.oauthConfigured && hasPublicApiScope),
      missing: hasPublicApiScope ? [] : ["BOOKING_OAUTH_SCOPE should include Mindbody.Api.Public.v6 if the OAuth client is approved for Public API calls"],
      note: "OAuth consumer tokens are used only for GET /client/clientcompleteinfo. Booking, buying, cancellation, and profile updates need a server-side user token issued from Source Credentials."
    },
    createClient: {
      ready: Boolean(config.apiKey && actionTokenHealth.ready),
      missing: [config.apiKey ? "" : "BOOKING_API_KEY", ...actionTokenMissing].filter(Boolean),
      note: "Creates a Mindbody client profile from the Cave sign-up form using the server-side Source Credentials user token."
    },
    bookClasses: {
      ready: Boolean(config.oauthConfigured && actionTokenHealth.ready),
      missing: [
        config.oauthConfigured ? "" : "BOOKING_OAUTH_*",
        ...actionTokenMissing
      ].filter(Boolean),
      note: "Books through /class/addclienttoclass from the Cave schedule page using a server-side user token issued from Source Credentials."
    },
    buyServices: {
      ready: Boolean(actionTokenHealth.ready),
      missing: actionTokenMissing,
      note: "Drop-ins and class packs use /sale/checkoutshoppingcart, which requires a server-side Source Credentials user token plus a saved/tokenized payment method."
    },
    buyMemberships: {
      ready: Boolean(actionTokenHealth.ready),
      missing: actionTokenMissing,
      note: "Membership contracts use /sale/purchasecontract with a server-side Source Credentials user token and a saved/tokenized payment method."
    },
    paymentFlow: {
      ready: Boolean(actionTokenHealth.ready),
      missing: actionTokenMissing,
      note: "Checkout is PCI-safe: Cave only sends saved-card last-four references or future Mindbody-approved tokenized payment data. Raw card numbers and CVV are blocked by the backend."
    },
    addCardSetup: {
      ready: Boolean(config.paymentSetupUrl),
      missing: config.paymentSetupUrl ? [] : ["BOOKING_PAYMENT_SETUP_URL"],
      note:
        "Shows clients a secure Add Card path before checkout. Set this to a Mindbody-approved card-on-file page or tokenized payment setup URL."
    },
    waiverSync: {
      ready: missingWaiverFields.length === 0 && Boolean(actionTokenHealth.ready),
      missing: [...missingWaiverFields, ...actionTokenMissing].filter(Boolean),
      note: "Stores the signed Cave liability waiver into Mindbody custom client fields through /client/updateclient."
    },
    sessionSecurity: {
      ready: Boolean(config.sessionSecret),
      missing: config.sessionSecret ? [] : ["SESSION_SECRET"],
      note: "Encrypts the Cave site session cookie."
    }
  };

  checks.oauthAuthorizeRequest = await checkOAuthAuthorizeRequest(config);

  return {
    ready: Object.values(checks).every((check) => check.ready),
    siteId: config.siteId,
    actionTokenMode,
    actionToken: actionTokenHealth,
    oauth: {
      configured: config.oauthConfigured,
      redirectUri: config.oauthRedirectUri,
      responseMode: config.oauthResponseMode,
      responseType: config.oauthResponseType,
      scope: config.oauthScope,
      includeSubscriberId: config.oauthIncludeSubscriberId,
      usePkce: config.oauthUsePkce
    },
    checks
  };
}

async function mindbodyActionTokenStatus() {
  const config = getBookingConfig();
  const mode = getMindbodyActionTokenMode(config);

  return checkActionTokenHealth(mode);
}

async function checkActionTokenHealth(mode = getMindbodyActionTokenMode()) {
  if (mode === "none") {
    return {
      ready: false,
      mode,
      message:
        "Add BOOKING_SOURCE_NAME and BOOKING_SOURCE_PASSWORD from Mindbody Public API Source Credentials."
    };
  }

  try {
    await getMindbodyActionToken("Mindbody action token check");

    return {
      ready: true,
      mode,
      message: "Server-side Mindbody action token is available."
    };
  } catch (error) {
    return {
      ready: false,
      mode,
      message: sanitizeActionTokenError(error),
      status: error.status || 500
    };
  }
}

async function checkOAuthAuthorizeRequest(config) {
  if (!config.oauthConfigured) {
    return {
      ready: false,
      missing: ["BOOKING_OAUTH_*"],
      note: "Mindbody authorize preflight was skipped because OAuth credentials are incomplete."
    };
  }

  const authorizeUrl = new URL(config.oauthAuthorizeUrl);
  authorizeUrl.searchParams.set("response_mode", config.oauthResponseMode);
  authorizeUrl.searchParams.set("response_type", config.oauthResponseType);
  authorizeUrl.searchParams.set("client_id", config.oauthClientId);
  authorizeUrl.searchParams.set("redirect_uri", config.oauthRedirectUri);
  authorizeUrl.searchParams.set("scope", config.oauthScope);
  authorizeUrl.searchParams.set("nonce", "readiness");
  authorizeUrl.searchParams.set("state", "readiness");

  if (config.oauthIncludeSubscriberId && config.oauthSubscriberId) {
    authorizeUrl.searchParams.set("subscriberId", config.oauthSubscriberId);
  }

  if (config.oauthUsePkce) {
    authorizeUrl.searchParams.set("code_challenge", createHash("sha256").update("readiness").digest("base64url"));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(authorizeUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    const location = response.headers.get("location") || "";
    const redirectedToError = isMindbodyErrorRedirect(location);
    const accepted = response.status >= 300 && response.status < 400 && !redirectedToError;

    return {
      ready: accepted,
      missing: accepted
        ? []
        : [
            "Mindbody rejected the OAuth authorize request. Check OAuth client ID, redirect URI, app type, scopes, and subscriber/site settings in the Mindbody developer portal."
          ],
      note: accepted
        ? "Mindbody accepts the OAuth authorize request and should show the secure sign-in screen."
        : "The Cave backend can build the OAuth request, but Mindbody is returning an error before login."
    };
  } catch (error) {
    return {
      ready: false,
      missing: ["Mindbody OAuth authorize endpoint could not be reached from the server."],
      note: error.name === "AbortError" ? "The OAuth authorize preflight timed out." : "The OAuth authorize preflight failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isMindbodyErrorRedirect(location) {
  if (!location) {
    return false;
  }

  try {
    const parsed = new URL(location);
    return parsed.pathname.toLowerCase().includes("error");
  } catch (error) {
    return String(location).toLowerCase().includes("error");
  }
}

function startOAuthSignIn(request, response, requestedReturnTo, popup = false, forceLogin = false) {
  const {
    oauthAuthorizeUrl,
    oauthClientId,
    oauthConfigured,
    oauthRedirectUri,
    oauthResponseMode,
    oauthResponseType,
    oauthScope,
    oauthIncludeSubscriberId,
    oauthSubscriberId,
    oauthUsePkce
  } = getBookingConfig();

  if (!oauthConfigured) {
    redirect(response, "/login?auth=not-ready");
    return;
  }

  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = oauthUsePkce ? randomBytes(32).toString("base64url") : "";
  const returnTo = safeReturnTo(requestedReturnTo);
  const statePayload = createOAuthState({ nonce, returnTo, popup, codeVerifier });
  const state = seal(statePayload);
  const authorizeUrl = new URL(oauthAuthorizeUrl);

  authorizeUrl.searchParams.set("response_mode", oauthResponseMode);
  authorizeUrl.searchParams.set("response_type", oauthResponseType);
  authorizeUrl.searchParams.set("client_id", oauthClientId);
  authorizeUrl.searchParams.set("redirect_uri", oauthRedirectUri);
  authorizeUrl.searchParams.set("scope", oauthScope);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("state", state);

  if (forceLogin) {
    authorizeUrl.searchParams.set("prompt", "login");
    authorizeUrl.searchParams.set("max_age", "0");
  }

  if (oauthIncludeSubscriberId && oauthSubscriberId) {
    authorizeUrl.searchParams.set("subscriberId", oauthSubscriberId);
  }

  if (oauthUsePkce) {
    authorizeUrl.searchParams.set("code_challenge", createHash("sha256").update(codeVerifier).digest("base64url"));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
  }

  setPendingOAuthState({ ...statePayload, state });
  setOAuthCookie(response, { ...statePayload, state });
  redirect(response, authorizeUrl.toString());
}

async function finishOAuthSignIn(request, response, form) {
  const formState = String(form.state || "");
  const oauthSession = resolveOAuthSession(request, formState);
  const finishPopup = (payload) => {
    clearOAuthCookie(response);
    sendOAuthPopupResponse(response, payload);
  };

  if (form.error) {
    if (oauthSession?.popup) {
      finishPopup({
        ok: false,
        error: "provider",
        message: form.error_description || form.error || "Mindbody could not complete sign-in."
      });
      return;
    }

    clearOAuthCookie(response);
    redirect(response, `/login?auth=error&message=${encodeURIComponent(form.error_description || form.error)}`);
    return;
  }

  if (!oauthSession?.state || !formState || oauthSession.state !== formState) {
    const stateMessage = oauthStateFailureMessage(formState);

    if (oauthSession?.popup) {
      finishPopup({
        ok: false,
        error: "state",
        message: stateMessage
      });
      return;
    }

    clearOAuthCookie(response);
    redirect(response, `/login?auth=state&message=${encodeURIComponent(stateMessage)}`);
    return;
  }

  if (!form.code) {
    if (oauthSession.popup) {
      finishPopup({
        ok: false,
        error: "missing-code",
        message: "Mindbody did not return a sign-in code. Please try again."
      });
      return;
    }

    clearOAuthCookie(response);
    redirect(response, "/login?auth=missing-code");
    return;
  }

  try {
    const tokenResponse = await exchangeOAuthCode(form.code, oauthSession.codeVerifier);
    const session = await hydrateOAuthSession(normalizeOAuthSession(tokenResponse, {
      authorizationIdToken: form.id_token,
      expectedNonce: oauthSession.nonce
    }));

    setSessionCookie(response, session);
    if (oauthSession.popup) {
      finishPopup({
        ok: true,
        returnTo: oauthSession.returnTo || "/account"
      });
      return;
    }

    clearOAuthCookie(response);
    redirect(response, oauthSession.returnTo || "/account");
  } catch (error) {
    const message = oauthFailureMessage(error);

    if (oauthSession.popup) {
      finishPopup({
        ok: false,
        error: "token",
        message
      });
      return;
    }

    clearOAuthCookie(response);
    redirect(response, `/login?auth=error&message=${encodeURIComponent(message)}`);
  }
}

function oauthFailureMessage(error) {
  const text = String(error?.message || "").trim();

  if (!text) {
    return "We could not finish sign-in. Please try again.";
  }

  if (/invalid_grant/i.test(text)) {
    return "That sign-in link expired. Please start sign-in again.";
  }

  return text;
}

function oauthStateFailureMessage(formState) {
  if (!formState) {
    return "Mindbody did not return the sign-in state. Please start sign-in from the Cave login page.";
  }

  if (!readOAuthState(formState)) {
    return "Please start sign-in from the Cave login page instead of a copied Mindbody authorize link.";
  }

  return "We could not verify the sign-in session. Please try again.";
}

function createOAuthState({ nonce, returnTo, popup, codeVerifier }) {
  return {
    stateId: randomBytes(16).toString("base64url"),
    nonce,
    returnTo,
    popup: Boolean(popup),
    codeVerifier,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS
  };
}

function resolveOAuthSession(request, formState) {
  const stateSession = readOAuthState(formState);

  if (stateSession) {
    return stateSession;
  }

  const pendingSession = takePendingOAuthState(formState);

  if (pendingSession) {
    return pendingSession;
  }

  const cookieSession = readOAuthSession(request);

  if (cookieSession?.state && cookieSession.state === formState) {
    return cookieSession;
  }

  return null;
}

function readOAuthState(formState) {
  if (!formState) {
    return null;
  }

  try {
    const payload = unseal(formState);

    if (!payload?.nonce || !payload?.stateId) {
      return null;
    }

    return {
      ...payload,
      state: formState
    };
  } catch (error) {
    return null;
  }
}

function sendOAuthPopupResponse(response, payload) {
  const message = {
    type: "cave:auth:complete",
    ok: Boolean(payload.ok),
    returnTo: safeReturnTo(payload.returnTo || "/account"),
    error: payload.error || "",
    message: payload.message || ""
  };
  const scriptPayload = JSON.stringify(message).replace(/</g, "\\u003c");
  const fallbackUrl = message.ok
    ? message.returnTo
    : `/login?auth=${encodeURIComponent(message.error || "error")}&message=${encodeURIComponent(message.message || "")}`;

  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Returning to Cave Modern Pilates</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #202322;
        color: #fff;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100% - 40px, 440px);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 2rem;
        font-weight: 420;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Returning to Cave.</h1>
      <p>You can close this window if it does not close automatically.</p>
    </main>
    <script>
      (function () {
        var payload = ${scriptPayload};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
          window.close();
        }
        window.setTimeout(function () {
          window.location.replace(${JSON.stringify(fallbackUrl)});
        }, 700);
      })();
    </script>
  </body>
</html>`);
}

async function exchangeOAuthCode(code, codeVerifier = "") {
  const {
    oauthClientId,
    oauthClientSecret,
    oauthRedirectUri,
    oauthIncludeSubscriberId,
    oauthScope,
    oauthSubscriberId,
    oauthTokenUrl
  } = getBookingConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: oauthClientId,
    code,
    redirect_uri: oauthRedirectUri,
    scope: oauthScope
  });

  if (oauthIncludeSubscriberId && oauthSubscriberId) {
    body.set("subscriberId", oauthSubscriberId);
  }

  if (oauthClientSecret) {
    body.set("client_secret", oauthClientSecret);
  }

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(oauthTokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: body.toString(),
      signal: controller.signal
    });
    const text = await response.text();
    const data = parseResponseBody(text);

    if (!response.ok) {
      const message = data?.error_description || data?.message || data?.Message || "Mindbody OAuth token exchange failed.";
      const error = httpError(response.status, message);
      error.data = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOAuthSession(data, options = {}) {
  const accessToken = data?.access_token || "";
  const idClaims = parseJwtClaims(data?.id_token || options.authorizationIdToken);
  const accessClaims = parseJwtClaims(accessToken);
  const claims = { ...accessClaims, ...idClaims };

  if (!accessToken) {
    throw httpError(502, "Mindbody OAuth did not return an access token.");
  }

  if (options.expectedNonce && idClaims.nonce && idClaims.nonce !== options.expectedNonce) {
    throw httpError(401, "Mindbody OAuth nonce verification failed.");
  }

  return {
    authMode: "oauth",
    accessToken,
    consumerIdentityToken: accessToken,
    refreshToken: data?.refresh_token || "",
    tokenType: data?.token_type || "Bearer",
    expiresAt: data?.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : "",
    clientId: extractOAuthClientIdFromClaims(claims),
    oauthSubject: claims.sub || "",
    user: {
      id: claims.sub || "",
      firstName: claims.given_name || claims.firstName || "",
      lastName: claims.family_name || claims.lastName || "",
      email: claims.email || "",
      username: claims.email || claims.preferred_username || ""
    }
  };
}

async function readHydratedSession(request, response) {
  const session = readSession(request);

  if (!session) {
    return null;
  }

  const hydrated = await hydrateOAuthSession(session);

  if (hydrated !== session) {
    setSessionCookie(response, hydrated);
  }

  return hydrated;
}

async function hydrateOAuthSession(session) {
  if (!shouldHydrateOAuthSession(session)) {
    return session;
  }

  const profile = await fetchOAuthClientProfile(session).catch(() => null);
  const hydratedAt = new Date().toISOString();

  if (!profile) {
    return { ...session, hydratedAt };
  }

  return {
    ...mergeSessionClientProfile(session, profile),
    hydratedAt
  };
}

function shouldHydrateOAuthSession(session) {
  if (!session || session.authMode !== "oauth" || (!session.consumerIdentityToken && !session.accessToken)) {
    return false;
  }

  const hydratedAt = Date.parse(session.hydratedAt || "");
  const isFresh = hydratedAt && Date.now() - hydratedAt < OAUTH_PROFILE_REFRESH_MS;

  return !isFresh || !session.clientId || !session.user?.email;
}

async function fetchOAuthClientProfile(session) {
  const consumerToken = session.consumerIdentityToken || session.accessToken || "";
  const config = getBookingConfig();
  const email = session.user?.email || session.user?.username || "";
  const oauthSub = session.oauthSubject || "";
  const attempts = [];

  if (consumerToken && session.clientId) {
    attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { ClientId: session.clientId } }]);
  }

  if (consumerToken) {
    attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: {} }]);
  }

  if (consumerToken && oauthSub && oauthSub !== session.clientId) {
    attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { ClientId: oauthSub } }]);
  }

  if (consumerToken && email) {
    // With Mindbody.Api.Public.v6 scope, the access token can be used as a Public API bearer
    // to search for the client by email — covers the case where the consumer identity and studio
    // client record haven't been linked by Mindbody (e.g., staff-added client who later logs in via OAuth)
    attempts.push(["/client/clients", { token: consumerToken, params: { SearchText: email } }]);
    attempts.push(["/client/clients", { token: consumerToken, params: { SearchText: email, CrossRegionalLookup: true } }]);
  }

  if (consumerToken) {
    attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { CrossRegionalLookup: true } }]);
  }

  if (config.actionTokenConfigured && session.clientId) {
    try {
      const staffToken = await getMindbodyActionToken("OAuth profile lookup");
      attempts.push(["/client/clients", { token: staffToken, params: { ClientIds: session.clientId } }]);
    } catch (_) { /* proceed without this attempt */ }
  }

  if (config.actionTokenConfigured && oauthSub && oauthSub !== session.clientId) {
    try {
      const staffToken = await getMindbodyActionToken("OAuth profile lookup");
      attempts.push(["/client/clients", { token: staffToken, params: { ClientIds: oauthSub } }]);
    } catch (_) { /* proceed without this attempt */ }
  }

  if (config.actionTokenConfigured && email) {
    try {
      const staffToken = await getMindbodyActionToken("OAuth profile lookup");
      attempts.push(["/client/clients", { token: staffToken, params: { SearchText: email } }]);
    } catch (_) { /* proceed without this attempt */ }
  }

  for (const [path, options] of attempts) {
    try {
      const data = await bookingRequest(path, {
        ...options,
        params: compactObject(options.params || {})
      });
      const profile = extractClientProfile(data, email);

      if (profile?.clientId || profile?.email) {
        return profile;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

function mergeSessionClientProfile(session, profile) {
  const user = session.user || {};

  return {
    ...session,
    clientId: profile.clientId || session.clientId || "",
    user: {
      ...user,
      id: profile.clientId || user.id || session.oauthSubject || "",
      firstName: profile.firstName || user.firstName || "",
      lastName: profile.lastName || user.lastName || "",
      email: profile.email || user.email || "",
      username: profile.username || profile.email || user.username || ""
    }
  };
}

function extractOAuthClientIdFromClaims(claims = {}) {
  return firstNonEmpty(
    claims.mindbody_client_id,
    claims.mindbodyClientId,
    claims.studio_client_id,
    claims.studioClientId,
    claims.clientId,
    claims.ClientId,
    claims.ClientID,
    claims.contact_id,
    claims.contactId,
    claims.ContactId,
    claims.consumer_client_id,
    claims.consumerClientId,
    /^\d+$/.test(String(claims.sub || "")) ? claims.sub : ""
  );
}

function extractClientProfile(data, preferredEmail = "") {
  const preferred = String(preferredEmail || "").trim().toLowerCase();
  const candidates = [
    data?.Client,
    data?.Clients,
    data?.ClientCompleteInfo?.Client,
    data?.ClientInfo?.Client,
    data?.ClientProfile,
    data?.Profile,
    data
  ].flatMap((candidate) => (Array.isArray(candidate) ? candidate : [candidate]));
  const normalized = candidates
    .filter((candidate) => candidate && typeof candidate === "object")
    .map(normalizeClientProfile)
    .filter((profile) => profile.clientId || profile.email);

  if (preferred) {
    const emailMatch = normalized.find((profile) => profile.email.toLowerCase() === preferred);

    if (emailMatch) {
      return emailMatch;
    }
  }

  return normalized[0] || null;
}

function normalizeClientProfile(client) {
  const clientId = firstNonEmpty(client.Id, client.ClientId, client.UniqueId, client.UniqueClientId, client.ContactId);
  const email = firstNonEmpty(client.Email, client.email, client.UserName, client.Username, client.username);

  return {
    clientId,
    firstName: firstNonEmpty(client.FirstName, client.firstName, client.GivenName, client.given_name),
    lastName: firstNonEmpty(client.LastName, client.lastName, client.FamilyName, client.family_name),
    email,
    username: firstNonEmpty(client.Username, client.UserName, client.username, email)
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();

    if (text && text !== "0") {
      return text;
    }
  }

  return "";
}

async function addClient(payload) {
  // Try consumer mode first — no staff token required per Mindbody docs.
  // "Omitting the token will create a client and respect Consumer Mode required fields."
  try {
    return await bookingRequest("/client/addclient", {
      method: "POST",
      body: payload
    });
  } catch (consumerError) {
    // Consumer mode failed; if staff credentials are configured, fall back to business mode.
    const config = getBookingConfig();
    if (!config.actionTokenConfigured || !(consumerError.status >= 400 && consumerError.status < 500)) {
      throw consumerError;
    }
  }

  const staffToken = await getMindbodyActionToken("Client account creation");

  return bookingRequest("/client/addclient", {
    method: "POST",
    token: staffToken,
    body: payload
  }).catch((error) => {
    if (error.status && error.status >= 400 && error.status < 500) {
      return bookingRequest("/client/addclient", {
        method: "POST",
        token: staffToken,
        body: { Client: payload }
      });
    }

    throw error;
  });
}

async function getMindbodyActionToken(actionName) {
  const config = getBookingConfig();
  const mode = getMindbodyActionTokenMode(config);

  if (mode === "none") {
    const error = httpError(
      501,
      `${actionName} requires BOOKING_SOURCE_NAME and BOOKING_SOURCE_PASSWORD from Mindbody Public API Source Credentials. Mindbody OAuth consumer tokens only work with GET /client/clientcompleteinfo; booking, buying, canceling, and profile updates must use a server-side Source Credentials user token.`
    );
    error.data = { action: actionName };
    throw error;
  }

  if (mode === "static-token") {
    return config.staffToken;
  }

  const credentialName = mode === "staff-credentials" ? config.staffUsername : config.sourceName;
  const cacheKey = createHash("sha256").update(`${config.apiKey}:${config.siteId}:${mode}:${credentialName}`).digest("hex");

  if (actionTokenCache.key === cacheKey && actionTokenCache.token && actionTokenCache.expiresAt > Date.now() + 60_000) {
    return actionTokenCache.token;
  }

  const issued =
    mode === "staff-credentials"
      ? await issueMindbodyStaffUserToken(config.staffUsername, config.staffPassword)
      : await issueMindbodySourceUserToken(config.sourceName, config.sourcePassword, config.siteId);
  const token = extractMindbodyUserToken(issued);

  if (!token) {
    const error = httpError(502, "Mindbody did not return a usable server-side user token.");
    error.data = issued;
    throw error;
  }

  actionTokenCache.key = cacheKey;
  actionTokenCache.token = token;
  actionTokenCache.expiresAt = extractMindbodyTokenExpiry(issued);

  return token;
}

function getMindbodyActionTokenMode(config = getBookingConfig()) {
  if (config.sourceName && config.sourcePassword) {
    return "source-credentials";
  }

  if (config.staffUsername && config.staffPassword) {
    return "staff-credentials";
  }

  if (config.staffToken) {
    return "static-token";
  }

  return "none";
}

function issueMindbodyStaffUserToken(username, password) {
  return bookingRequest("/usertoken/issue", {
    method: "POST",
    body: {
      Username: username,
      Password: password
    }
  });
}

async function issueMindbodySourceUserToken(sourceName, sourcePassword, siteId) {
  const numericSiteId = Number(siteId);
  const siteValue = Number.isFinite(numericSiteId) ? numericSiteId : siteId;
  const attempts = [
    {
      label: "SourceCredentials.SiteIDs",
      body: {
        SourceCredentials: {
          SourceName: sourceName,
          Password: sourcePassword,
          SiteIDs: [siteValue]
        }
      }
    },
    {
      label: "SourceCredentials.SiteIds",
      body: {
        SourceCredentials: {
          SourceName: sourceName,
          Password: sourcePassword,
          SiteIds: [siteValue]
        }
      }
    },
    {
      label: "source-name-as-username",
      body: {
        Username: sourceName,
        Password: sourcePassword
      }
    }
  ];
  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await bookingRequest("/usertoken/issue", {
        method: "POST",
        body: attempt.body
      });
    } catch (error) {
      lastError = error;

      if (!isActionTokenCredentialError(error)) {
        throw error;
      }
    }
  }

  const error = httpError(lastError?.status || 401, "Mindbody rejected the configured source credentials.");
  error.data = {
    mode: "source-credentials",
    attempted: attempts.map((attempt) => attempt.label),
    message: sanitizeActionTokenError(lastError)
  };
  throw error;
}

function isActionTokenCredentialError(error) {
  return [400, 401, 403].includes(Number(error?.status));
}

function sanitizeActionTokenError(error) {
  const message = String(error?.message || "");

  if (/staff identity authentication failed/i.test(message)) {
    return "Mindbody rejected the server-side user token. Confirm BOOKING_SOURCE_NAME and BOOKING_SOURCE_PASSWORD match the Public API Source Credentials exactly.";
  }

  if (/source/i.test(message) || /credential/i.test(message)) {
    return message;
  }

  return message || "Mindbody could not issue the server-side action token.";
}

function extractMindbodyUserToken(data) {
  return firstStringValue(data, [
    "AccessToken",
    "access_token",
    "Token",
    "token",
    "UserToken",
    "userToken",
    "StaffToken",
    "staffToken"
  ]);
}

function extractMindbodyTokenExpiry(data) {
  const explicitDate = firstStringValue(data, ["Expires", "ExpirationDateTime", "expires_at", "ExpiresAt"]);
  const explicitTime = Date.parse(explicitDate || "");

  if (explicitTime && explicitTime > Date.now()) {
    return explicitTime;
  }

  const expiresIn = Number(firstStringValue(data, ["ExpiresIn", "expires_in", "TokenExpiresIn"]));

  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + Math.max(60, expiresIn - 60) * 1000;
  }

  return Date.now() + 25 * 60 * 1000;
}

function firstStringValue(data, keys) {
  const queue = [data];

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== "object") {
      continue;
    }

    for (const key of keys) {
      const value = current[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

async function bookClientIntoClass(session, classId) {
  const clientId = await resolveSessionClientId(session);

  if (!clientId) {
    throw httpError(400, "We could not match this login to a studio client account yet.");
  }

  const staffToken = await getMindbodyActionToken("Class booking");

  return bookingRequest("/class/addclienttoclass", {
    method: "POST",
    token: staffToken,
    body: {
      ClientId: clientId,
      ClassId: classId,
      Test: process.env.BOOKING_TEST_MODE === "true",
      RequirePayment: true,
      Waitlist: false,
      SendEmail: true
    }
  });
}

async function purchaseStoreItem(session, item, body) {
  const clientId = await resolveSessionClientId(session);

  if (!clientId) {
    throw httpError(400, "We could not match this login to a studio client account yet.");
  }

  if (item.kind === "contract") {
    return purchaseContractItem(session, clientId, item, body);
  }

  if (item.kind === "service") {
    return checkoutServiceItem(clientId, item, body);
  }

  throw httpError(400, "Unsupported pricing item type.");
}

async function purchaseContractItem(session, clientId, item, body) {
  const staffToken = await getMindbodyActionToken("Membership purchase");
  const paymentPayload = buildContractPaymentPayload(body);

  if (!Object.keys(paymentPayload).length) {
    throw paymentRequiredError("A saved payment method is required before this membership can be bought on-site.");
  }

  const { locationId, paymentAuthenticationCallbackUrl } = getBookingConfig();

  return bookingRequest("/sale/purchasecontract", {
    method: "POST",
    token: staffToken,
    body: {
      Test: process.env.BOOKING_TEST_MODE === "true",
      ClientId: clientId,
      ContractId: Number(item.id),
      LocationId: Number(locationId),
      SendNotifications: true,
      ...compactObject({
        PaymentAuthenticationCallbackUrl: paymentAuthenticationCallbackUrl
      }),
      ...paymentPayload
    }
  });
}

async function checkoutServiceItem(clientId, item, body) {
  const staffToken = await getMindbodyActionToken("Service checkout");

  const paymentPayload = buildCheckoutPaymentPayload(item, body);

  if (!Object.keys(paymentPayload).length) {
    throw paymentRequiredError("A saved payment method is required before this package can be bought on-site.");
  }

  return bookingRequest("/sale/checkoutshoppingcart", {
    method: "POST",
    token: staffToken,
    body: {
      Test: process.env.BOOKING_TEST_MODE === "true",
      ClientId: clientId,
      CartItems: [
        {
          Item: {
            Type: "Service",
            Metadata: {
              Id: Number(item.id)
            }
          },
          Quantity: 1
        }
      ],
      ...paymentPayload
    }
  });
}

function buildContractPaymentPayload(body) {
  if (body.useAccountCredit) {
    return { UseAccountCredit: true };
  }

  if (body.useDirectDebit) {
    return { UseDirectDebit: true };
  }

  const lastFour = normalizeStoredCardLastFour(body);

  if (lastFour) {
    return {
      StoredCardInfo: {
        LastFour: lastFour
      }
    };
  }

  return {};
}

function buildCheckoutPaymentPayload(item, body) {
  if (body.useAccountCredit) {
    return { UseAccountCredit: true };
  }

  if (body.useDirectDebit) {
    return { UseDirectDebit: true };
  }

  const lastFour = normalizeStoredCardLastFour(body);

  if (!lastFour) {
    return {};
  }

  return {
    Payments: [
      {
        Type: "StoredCard",
        Metadata: {
          Amount: itemPaymentAmount(item),
          LastFour: lastFour
        }
      }
    ]
  };
}

function normalizeStoredCardLastFour(body) {
  const value = String(body.storedCardLastFour || body.paymentLastFour || "").replace(/\D/g, "");

  if (value.length === 4) {
    return value;
  }

  const legacyValue = String(body.storedCardId || "").trim();

  if (/^\d{4}$/.test(legacyValue)) {
    return legacyValue;
  }

  return "";
}

function itemPaymentAmount(item) {
  const value = String(item.price || item.amount || item.onlinePrice || "").replace(/[^\d.-]/g, "");
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError(400, "This pricing option is missing a valid checkout amount.");
  }

  return amount.toFixed(2);
}

function paymentRequiredError(message) {
  const { paymentSetupUrl } = getBookingConfig();
  const error = httpError(402, message);
  error.data = compactObject({ paymentSetupUrl: paymentSetupUrl || null });
  return error;
}

async function validateAddCardUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function buildPaymentSetupResponse(session, returnTo) {
  const { paymentSetupUrl, publicBaseUrl } = getBookingConfig();

  if (!paymentSetupUrl) {
    const error = httpError(501, "Secure add-card setup is not configured yet.");
    error.data = {
      missing: ["BOOKING_PAYMENT_SETUP_URL"],
      note:
        "Set this to a Mindbody-approved hosted payment/card-on-file URL or tokenized payment setup page. Cave does not collect raw card numbers."
    };
    throw error;
  }

  const safeReturn = safeReturnTo(returnTo);
  const returnUrl = new URL(safeReturn, publicBaseUrl).toString();
  const user = session?.user || {};
  const replacements = {
    returnTo: returnUrl,
    returnUrl,
    email: user.email || "",
    clientId: session?.clientId || ""
  };

  return {
    paymentSetupUrl: applyPaymentSetupPlaceholders(paymentSetupUrl, replacements),
    returnTo: safeReturn
  };
}

function applyPaymentSetupPlaceholders(template, replacements) {
  let output = String(template || "").trim();

  for (const [key, value] of Object.entries(replacements)) {
    const encodedValue = encodeURIComponent(String(value || ""));
    output = output
      .replaceAll(`{${key}}`, encodedValue)
      .replaceAll(`{{${key}}}`, encodedValue);
  }

  return output;
}

function assertNoRawCardPayload(value, path = "") {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawCardPayload(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      const keyPath = path ? `${path}.${key}` : key;

      if (isRawCardFieldName(key) && hasPresentValue(nestedValue)) {
        throw httpError(400, "Raw card numbers and security codes cannot be sent to Cave. Use a saved studio card or a Mindbody-approved tokenized payment method.");
      }

      assertNoRawCardPayload(nestedValue, keyPath);
    }

    return;
  }

  if (typeof value === "string" && containsLikelyCardNumber(value)) {
    throw httpError(400, "Raw card numbers cannot be sent to Cave. Use a saved studio card or a Mindbody-approved tokenized payment method.");
  }
}

function isRawCardFieldName(key) {
  const normalized = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  return [
    "cardnumber",
    "creditcardnumber",
    "ccnumber",
    "pan",
    "cvv",
    "cvc",
    "cvv2",
    "securitycode",
    "cardsecuritycode",
    "expiration",
    "expirationdate",
    "expiry",
    "expmonth",
    "expyear",
    "trackdata",
    "rawcard",
    "magstripe"
  ].includes(normalized);
}

function hasPresentValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return value !== null && value !== undefined && String(value).trim() !== "";
}

function containsLikelyCardNumber(value) {
  const candidates = String(value).match(/(?:\d[ -]?){13,19}/g) || [];

  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
  });
}

function luhnCheck(digits) {
  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum > 0 && sum % 10 === 0;
}

async function resolveSessionClientId(session) {
  if (session.clientId) {
    return session.clientId;
  }

  const hydrated = await hydrateOAuthSession(session);

  if (hydrated.clientId) {
    session.clientId = hydrated.clientId;
    session.user = hydrated.user;
    return hydrated.clientId;
  }

  if (!session.consumerIdentityToken) {
    return "";
  }

  const completeInfo = await bookingRequest("/client/clientcompleteinfo", {
    consumerIdentityToken: session.consumerIdentityToken
  });

  return extractClientId(completeInfo);
}

function readStoreCache() {
  if (!existsSync(STORE_CACHE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(STORE_CACHE_FILE, "utf-8"));
  } catch (error) {
    return {};
  }
}

async function readStoreCacheWithFreshSchedule() {
  const cache = readStoreCache();
  const { apiKey, siteId } = getBookingConfig();

  if (!apiKey) {
    return cache;
  }

  const cacheKey = `${siteId}:public-schedule`;

  if (publicScheduleCache.key === cacheKey && publicScheduleCache.expiresAt > Date.now()) {
    return {
      ...cache,
      generatedAt: publicScheduleCache.generatedAt || cache.generatedAt,
      schedule: publicScheduleCache.schedule
    };
  }

  try {
    const schedule = await fetchFreshPublicSchedule();

    if (!schedule.length) {
      return cache;
    }

    const generatedAt = new Date().toISOString();
    publicScheduleCache.key = cacheKey;
    publicScheduleCache.expiresAt = Date.now() + PUBLIC_SCHEDULE_REFRESH_TTL_MS;
    publicScheduleCache.generatedAt = generatedAt;
    publicScheduleCache.schedule = schedule;

    return {
      ...cache,
      generatedAt,
      schedule
    };
  } catch (error) {
    return {
      ...cache,
      scheduleRefresh: {
        ok: false,
        message: error.message || "Schedule refresh failed."
      }
    };
  }
}

async function fetchFreshPublicSchedule() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setDate(future.getDate() + 45);

  const allClasses = [];
  const limit = 100;
  let offset = 0;

  while (offset < 1000) {
    const data = await bookingRequest("/class/classes", {
      params: {
        "request.startDateTime": formatApiDate(today),
        "request.endDateTime": formatApiDate(future),
        "request.limit": limit,
        "request.offset": offset
      }
    });
    const classes = firstListByKey(data, "Classes");

    if (!classes.length) {
      break;
    }

    allClasses.push(...classes);

    const pagination = data?.PaginationResponse || {};
    const totalResults = Number(pagination.TotalResults);
    const pageSize = Number(pagination.PageSize || classes.length || limit);

    offset += Number.isFinite(pageSize) && pageSize > 0 ? pageSize : classes.length;

    if ((Number.isFinite(totalResults) && allClasses.length >= totalResults) || classes.length < limit) {
      break;
    }
  }

  return normalizePublicSchedule(allClasses);
}

function isStudioConnectionApiMessage(value) {
  return /source credential|staff identity|server-side user token|source credentials user token|usertoken\/issue|user token site id|requested site|studio client account|mindbody rejected|could not match/i.test(String(value || ""));
}

function normalizeClassFull(item) {
  const startsAt = parseScheduleDate(item.StartDateTime);
  const endsAt = parseScheduleDate(item.EndDateTime);

  if (!startsAt) return null;

  const maxCapacity = Number(firstDefined(item.MaxCapacity, item.WebCapacity) || 0);
  const totalBooked = Number(firstDefined(item.TotalBooked, item.WebBooked) || 0);
  const maxWaitlist = Number(item.MaxWaitListSize || 0);
  const waitlistCount = Number(item.TotalWaitlistedClients || 0);
  const spotsRemaining = maxCapacity > 0 ? Math.max(maxCapacity - totalBooked, 0) : null;
  const waitlistAvailable = maxWaitlist > 0 && waitlistCount < maxWaitlist;
  const isCanceled = Boolean(item.IsCanceled);
  const isAvailable = item.IsAvailable !== false;

  let status = "Available";
  let canBook = true;
  let canWaitlist = false;

  if (isCanceled) {
    status = "Canceled";
    canBook = false;
  } else if (!isAvailable) {
    status = "Unavailable";
    canBook = false;
  } else if (spotsRemaining !== null && spotsRemaining <= 0) {
    canBook = false;
    if (waitlistAvailable) {
      status = "Join Waitlist";
      canWaitlist = true;
    } else {
      status = "Full";
    }
  } else if (spotsRemaining !== null && spotsRemaining <= 5) {
    status = `Only ${spotsRemaining} ${spotsRemaining === 1 ? "spot" : "spots"} left`;
  }

  const classDesc = item.ClassDescription || {};
  const staff = item.Staff;
  const instructor = staff
    ? `${staff.FirstName || ""} ${staff.LastName || ""}`.trim() || "Varies"
    : "Varies";

  return {
    id: item.Id,
    classId: item.ClassId || item.Id,
    classDescriptionId: classDesc.Id || item.ClassDescriptionId,
    classScheduleId: item.ClassScheduleId,
    name: classDesc.Name || item.Name || "Class",
    description: classDesc.Description || "",
    instructor,
    staffId: staff?.Id,
    startTime: item.StartDateTime,
    endTime: item.EndDateTime,
    duration: startsAt && endsAt ? Math.round((endsAt - startsAt) / 60000) : null,
    location: item.Location?.Name || "",
    locationId: item.Location?.Id,
    maxCapacity,
    totalBooked,
    waitlistSize: waitlistCount,
    maxWaitlistSize: maxWaitlist,
    spotsRemaining: spotsRemaining ?? "",
    isAvailable,
    isCanceled,
    status,
    canBook,
    canWaitlist,
    date: formatScheduleDate(startsAt),
    time: formatScheduleTime(startsAt)
  };
}

async function fetchLiveClasses(locationId) {
  const { siteId } = getBookingConfig();
  const cacheKey = `${siteId}:live-classes`;
  const now = Date.now();

  if (liveClassesCache.key === cacheKey && liveClassesCache.expiresAt > now) {
    return liveClassesCache.data;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setDate(future.getDate() + 30);

  const params = {
    "request.startDateTime": formatApiDate(today),
    "request.endDateTime": formatApiDate(future),
    "request.hideCanceledClasses": "false",
    "request.schedulingWindow": "true",
    "request.limit": "200"
  };

  if (locationId) {
    params["request.locationIds"] = locationId;
  }

  const data = await bookingRequest("/class/classes", { params });
  const classes = firstListByKey(data, "Classes");

  const normalized = classes
    .filter((item) => item && typeof item === "object")
    .map(normalizeClassFull)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

  liveClassesCache.key = cacheKey;
  liveClassesCache.data = normalized;
  liveClassesCache.expiresAt = now + liveClassesCache.TTL_MS;

  return normalized;
}

async function fetchClientCompleteInfo(clientId, session) {
  const data = await bookingRequest("/client/clientcompleteinfo", {
    consumerIdentityToken: session?.consumerIdentityToken || session?.accessToken,
    params: { clientId, showActiveOnly: "true" }
  });

  const client = data?.Client || {};
  const rawServices = Array.isArray(client.ClientServices)
    ? client.ClientServices
    : Array.isArray(data?.ClientServices)
    ? data.ClientServices
    : [];
  const rawMemberships = Array.isArray(client.ClientMemberships)
    ? client.ClientMemberships
    : Array.isArray(data?.ClientMemberships)
    ? data.ClientMemberships
    : [];

  const usableServices = rawServices.filter((s) => {
    if (!s) return false;
    const remaining = s.Remaining;
    if (remaining !== undefined && remaining !== null && Number(remaining) <= 0) return false;
    return true;
  });

  const hasUsablePricingOption = usableServices.length > 0 || rawMemberships.length > 0;
  const defaultClientServiceId = usableServices.length > 0 ? usableServices[0].Id : null;

  return {
    clientId,
    activeServices: usableServices.map((s) => ({
      id: s.Id,
      name: s.Name || s.ProductName || "",
      remaining: s.Remaining,
      expirationDate: s.ExpirationDate
    })),
    activeMemberships: rawMemberships.map((m) => ({
      id: m.Id,
      name: m.Name || "",
      status: m.MembershipStatus || m.Status || ""
    })),
    hasUsablePricingOption,
    defaultClientServiceId
  };
}

async function bookClassWithValidation(session, classId, clientServiceId) {
  const clientId = await resolveSessionClientId(session);

  if (!clientId) {
    const err = httpError(400, "We could not match your login to a studio account. Please sign out and try again.");
    err.bookingCode = "NO_CLIENT_ID";
    throw err;
  }

  const { apiKey } = getBookingConfig();

  if (!apiKey) {
    const err = httpError(503, "Online booking is not yet configured.");
    err.bookingCode = "MINDBODY_AUTH_MISSING";
    throw err;
  }

  const classData = await bookingRequest("/class/classes", {
    params: { "request.classIds": classId, "request.schedulingWindow": "true" }
  });
  const classes = firstListByKey(classData, "Classes");
  const classItem = classes.find((c) => c.Id === classId) || classes[0];

  if (!classItem) {
    const err = httpError(404, "This class could not be found.");
    err.bookingCode = "NO_CLASS_ID";
    throw err;
  }

  if (classItem.IsCanceled) {
    const err = httpError(400, "This class has been canceled.");
    err.bookingCode = "BOOKING_UNAVAILABLE";
    throw err;
  }

  if (classItem.IsAvailable === false) {
    const err = httpError(400, "This class is not available for booking at this time.");
    err.bookingCode = "BOOKING_UNAVAILABLE";
    throw err;
  }

  const maxCapacity = Number(firstDefined(classItem.MaxCapacity, classItem.WebCapacity) || 0);
  const totalBooked = Number(firstDefined(classItem.TotalBooked, classItem.WebBooked) || 0);

  if (maxCapacity > 0 && maxCapacity - totalBooked <= 0) {
    const maxWaitlist = Number(classItem.MaxWaitListSize || 0);
    const waitlistCount = Number(classItem.TotalWaitlistedClients || 0);
    const canWaitlist = maxWaitlist > 0 && waitlistCount < maxWaitlist;
    const err = httpError(409, "This class is full.");
    err.bookingCode = "CLASS_FULL";
    err.canWaitlist = canWaitlist;
    throw err;
  }

  let resolvedServiceId = clientServiceId || null;

  try {
    const clientInfo = await fetchClientCompleteInfo(clientId, session);

    if (!clientInfo.hasUsablePricingOption) {
      const err = httpError(402, "You need an active class pack or membership before booking. Visit the Pricing page to get started.");
      err.bookingCode = "NO_VALID_SERVICE";
      throw err;
    }

    if (!resolvedServiceId) {
      resolvedServiceId = clientInfo.defaultClientServiceId;
    }
  } catch (serviceErr) {
    if (serviceErr.bookingCode === "NO_VALID_SERVICE") throw serviceErr;
    console.warn("[book-class] Could not verify client services, proceeding:", serviceErr.message);
  }

  const staffToken = await getMindbodyActionToken("Class booking");
  const bookingBody = {
    ClientId: clientId,
    ClassId: classId,
    RequirePayment: true,
    SendEmail: true,
    Waitlist: false,
    Test: process.env.BOOKING_TEST_MODE === "true"
  };

  if (resolvedServiceId) {
    bookingBody.ClientServiceId = resolvedServiceId;
  }

  liveClassesCache.expiresAt = 0;

  return bookingRequest("/class/addclienttoclass", {
    method: "POST",
    token: staffToken,
    body: bookingBody
  });
}

function normalizePublicSchedule(classes) {
  return classes
    .filter((item) => item && typeof item === "object" && !item.IsCanceled)
    .map((item) => {
      const startsAt = parseScheduleDate(item.StartDateTime);

      if (!startsAt) {
        return null;
      }

      const capacity = firstDefined(item.WebCapacity, item.MaxCapacity, item.Capacity);
      const booked = firstDefined(item.WebBooked, item.TotalBooked, item.Booked, 0);
      const spotsLeft = calculateSpotsLeft(capacity, booked);

      return {
        id: item.Id,
        classScheduleId: item.ClassScheduleId,
        date: formatScheduleDate(startsAt),
        time: formatScheduleTime(startsAt),
        startDateTime: item.StartDateTime,
        className: publicClassName(item),
        instructor: nestedPublicName(item.Staff, "Varies"),
        spotsLeft,
        bookUrl: item.Id ? `/schedule?classId=${item.Id}` : "/schedule"
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.startDateTime || "") - Date.parse(b.startDateTime || ""));
}

function firstListByKey(data, preferredKey) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data[preferredKey])) {
    return data[preferredKey];
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function parseScheduleDate(value) {
  const date = new Date(String(value || ""));

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatApiDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatScheduleDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatScheduleTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function publicClassName(item) {
  const description = item.ClassDescription;

  if (description && typeof description === "object") {
    return String(description.Name || item.Name || "Class");
  }

  return String(item.Name || description || "Class");
}

function nestedPublicName(value, fallback = "") {
  if (value && typeof value === "object") {
    return String(value.Name || [value.FirstName, value.LastName].filter(Boolean).join(" ") || fallback);
  }

  return String(value || fallback);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function calculateSpotsLeft(capacity, booked) {
  const capacityNumber = Number(capacity);
  const bookedNumber = Number(booked || 0);

  if (!Number.isFinite(capacityNumber)) {
    return "";
  }

  return Math.max(capacityNumber - (Number.isFinite(bookedNumber) ? bookedNumber : 0), 0);
}

function publicStoreGroups(store) {
  return {
    newbie: publicStoreItems(store?.newbie || store?.starter || []),
    memberships: publicStoreItems(store?.memberships || []),
    classPacks: publicStoreItems(store?.classPacks || [])
  };
}

function publicStoreItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(isPublicStoreItem);
}

function isPublicStoreItem(item) {
  const name = String(item?.name || item?.sourceName || "").toLowerCase().replace(/\s+/g, " ").trim();
  const category = String(item?.category || "").toLowerCase();
  const kind = String(item?.kind || "").toLowerCase();

  if (!name || item?.sellOnline === false) {
    return false;
  }

  if (/\bcave\s*1\b|\btest\b|\btraining\b/.test(name)) {
    return false;
  }

  if (category === "newbie" || category === "starter") {
    return /\b(new client|newbie|starter|intro)\b/.test(name);
  }

  if (category === "classpacks" || kind === "service") {
    return /\b(new client|newbie|starter|intro)\b/.test(name) || /\bdrop[- ]?in\b/.test(name) || /\b\d+\s*class\s*(pack|package)?\b/.test(name);
  }

  return true;
}

function findStoreItem(itemId, kind) {
  const id = String(itemId || "");
  const expectedKind = String(kind || "");
  const store = publicStoreGroups(readStoreCache().store || {});
  const items = Object.values(store).flatMap((group) => (Array.isArray(group) ? group : []));

  return items.find((item) => String(item.id) === id && (!expectedKind || item.kind === expectedKind)) || null;
}

function extractClientId(data) {
  return extractClientProfile(data)?.clientId || "";
}

function sessionFromCreatedClient(created, payload) {
  const client = created?.Client || created?.Clients?.[0] || created?.ClientResponse?.Client || {};
  const clientId = client?.Id || client?.ClientId || client?.UniqueId || "";

  return {
    signedIn: true,
    authMode: "created-client",
    clientId,
    user: {
      id: clientId,
      firstName: client?.FirstName || payload.FirstName || "",
      lastName: client?.LastName || payload.LastName || "",
      email: client?.Email || payload.Email || "",
      username: client?.Username || payload.Username || payload.Email || ""
    }
  };
}

function requiredSignupFields(body) {
  return ["firstName", "lastName", "email", "phone", "addressLine1", "city", "state", "postalCode"].filter(
    (key) => !String(body[key] || "").trim()
  );
}

function clientPayload(body, waiver) {
  const payload = compactObject({
    FirstName: body.firstName,
    LastName: body.lastName,
    Email: String(body.email || "").trim().toLowerCase(),
    MobilePhone: body.phone,
    AddressLine1: body.addressLine1,
    AddressLine2: body.addressLine2,
    City: body.city,
    State: body.state,
    PostalCode: body.postalCode,
    BirthDate: body.birthDate,
    EmergencyContactInfoName: body.emergencyContactName,
    EmergencyContactInfoPhone: body.emergencyContactPhone,
    EmergencyContactInfoRelationship: body.emergencyContactRelationship,
    ReferredBy: body.referredBy
  });

  if (isSignedWaiver(waiver)) {
    payload.Liability = { LiabilityRelease: true };
  }

  const customFields = waiverCustomClientFields(waiver);

  if (customFields.length) {
    payload.CustomClientFields = customFields;
  }

  return payload;
}

function normalizeWaiverPayload(waiver = {}) {
  return {
    title: String(waiver.title || "Cave Pilates, LLC Waiver and Release of Liability").trim(),
    version: String(waiver.version || "2026-06-14").trim(),
    participantName: String(waiver.participantName || waiver.waiverParticipantName || "").trim(),
    birthDate: String(waiver.birthDate || "").trim(),
    address: String(waiver.address || "").trim(),
    phone: String(waiver.phone || "").trim(),
    email: String(waiver.email || "").trim().toLowerCase(),
    signature: String(waiver.signature || waiver.waiverSignature || "").trim(),
    signedDate: String(waiver.signedDate || waiver.waiverDate || new Date().toISOString().slice(0, 10)).trim(),
    parentGuardianName: String(waiver.parentGuardianName || waiver.guardianName || "").trim(),
    parentGuardianSignature: String(waiver.parentGuardianSignature || waiver.guardianSignature || "").trim(),
    mediaOptOut: Boolean(waiver.mediaOptOut),
    accepted: Boolean(waiver.accepted || waiver.acceptWaiver),
    acceptedAt: String(waiver.acceptedAt || new Date().toISOString()).trim()
  };
}

function isSignedWaiver(waiver) {
  return Boolean(waiver?.accepted && waiver?.participantName && waiver?.signature && waiver?.signedDate);
}

function publicWaiver(waiver) {
  return {
    title: waiver.title,
    version: waiver.version,
    participantName: waiver.participantName,
    signedDate: waiver.signedDate,
    acceptedAt: waiver.acceptedAt,
    mediaOptOut: waiver.mediaOptOut
  };
}

function waiverSummary(waiver) {
  return [
    `${waiver.title} (${waiver.version})`,
    `Participant: ${waiver.participantName}`,
    waiver.birthDate ? `DOB: ${waiver.birthDate}` : "",
    waiver.email ? `Email: ${waiver.email}` : "",
    waiver.phone ? `Phone: ${waiver.phone}` : "",
    waiver.address ? `Address: ${waiver.address}` : "",
    `Signature: ${waiver.signature}`,
    `Signed Date: ${waiver.signedDate}`,
    waiver.parentGuardianName ? `Parent/Guardian: ${waiver.parentGuardianName}` : "",
    waiver.parentGuardianSignature ? `Parent/Guardian Signature: ${waiver.parentGuardianSignature}` : "",
    `Media opt-out: ${waiver.mediaOptOut ? "Yes" : "No"}`,
    `Accepted At: ${waiver.acceptedAt}`
  ].filter(Boolean).join("\n");
}

function waiverCustomClientFields(waiver) {
  if (!waiver) {
    return [];
  }

  const fieldMap = [
    [configuredEnvValue("BOOKING_WAIVER_CUSTOM_FIELD_ID", "MINDBODY_WAIVER_CUSTOM_FIELD_ID"), waiverSummary(waiver)],
    [configuredEnvValue("BOOKING_WAIVER_SIGNATURE_FIELD_ID", "MINDBODY_WAIVER_SIGNATURE_FIELD_ID"), waiver.signature],
    [configuredEnvValue("BOOKING_WAIVER_DATE_FIELD_ID", "MINDBODY_WAIVER_DATE_FIELD_ID"), waiver.signedDate],
    [configuredEnvValue("BOOKING_WAIVER_VERSION_FIELD_ID", "MINDBODY_WAIVER_VERSION_FIELD_ID"), waiver.version]
  ];

  return fieldMap
    .filter(([id, value]) => id && value)
    .map(([id, value]) => ({
      Id: Number.isNaN(Number(id)) ? String(id) : Number(id),
      Value: String(value)
    }));
}

async function attachClientWaiver(session, waiver) {
  const clientId = await resolveSessionClientId(session).catch(() => "");
  const consumerToken = session?.consumerIdentityToken || session?.accessToken || "";
  const customFields = waiverCustomClientFields(waiver);
  const errors = [];

  if (!clientId && !consumerToken) {
    return {
      accepted: true,
      storedInMindbody: false,
      message: "Waiver captured by the site."
    };
  }

  // Always set the built-in Liability.LiabilityRelease field — works with consumer
  // identity token (no staff credentials required, ReleasedBy = null = client-initiated).
  const liabilityBody = {
    Client: compactObject({
      Id: clientId || undefined,
      Liability: { LiabilityRelease: true }
    })
  };

  let liabilityStored = false;

  if (consumerToken) {
    try {
      await bookingRequest("/client/updateclient", {
        method: "POST",
        consumerIdentityToken: consumerToken,
        body: liabilityBody
      });
      liabilityStored = true;
    } catch (consumerError) {
      errors.push(`Consumer liability update: ${consumerError.message}`);
    }
  }

  // If consumer update failed or no consumer token, try with staff token
  if (!liabilityStored && clientId) {
    try {
      const staffToken = await getMindbodyActionToken("Waiver liability sync");
      await bookingRequest("/client/updateclient", {
        method: "POST",
        token: staffToken,
        body: liabilityBody
      });
      liabilityStored = true;
    } catch (staffError) {
      errors.push(`Staff liability update: ${staffError.message}`);
    }
  }

  // Sync waiver text into custom fields when IDs are configured and a staff token is available
  let customFieldsStored = false;

  if (customFields.length && clientId) {
    try {
      const staffToken = await getMindbodyActionToken("Waiver custom fields sync");
      await bookingRequest("/client/updateclient", {
        method: "POST",
        token: staffToken,
        body: {
          Client: {
            Id: clientId,
            CustomClientFields: customFields
          }
        }
      });
      customFieldsStored = true;
    } catch (fieldsError) {
      errors.push(`Custom fields sync: ${fieldsError.message}`);
    }
  }

  return {
    accepted: true,
    storedInMindbody: liabilityStored,
    customFieldsStored,
    errors: errors.length ? errors : undefined
  };
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function bookingRequest(path, { method = "GET", body, params, token, consumerIdentityToken } = {}) {
  const { apiKey, siteId } = getBookingConfig();
  const authToken = token || consumerIdentityToken;

  if (!apiKey) {
    throw httpError(500, "Booking API key is not configured.");
  }

  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Api-Key": apiKey,
        SiteId: siteId,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(consumerIdentityToken ? { "consumer-identity-token": consumerIdentityToken } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const data = parseResponseBody(text);

    if (!response.ok) {
      const message = data?.Message || data?.Error?.Message || data?.Errors?.[0]?.Message || "Booking API request failed.";
      const error = httpError(response.status, message);
      error.data = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponseBody(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw_response: text };
  }
}

function publicSession(session) {
  if (!session) {
    return null;
  }

  return {
    signedIn: true,
    authMode: session.authMode || "",
    clientId: session.clientId || "",
    hasStudioClient: Boolean(session.clientId),
    expiresAt: session.expiresAt || "",
    user: session.user || {},
    waiver: session.waiver || null
  };
}

function parseJwtClaims(token) {
  const [, payload] = String(token || "").split(".");

  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    return {};
  }
}

function readJsonBody(request) {
  return readRawBody(request).then((body) => {
    if (!body) {
      return {};
    }

    try {
      return JSON.parse(body);
    } catch (error) {
      throw httpError(400, "Invalid JSON body.");
    }
  });
}

function readFormBody(request) {
  return readRawBody(request).then((body) => Object.fromEntries(new URLSearchParams(body)));
}

function readRawBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        rejectBody(httpError(413, "Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

function readSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const value = readChunkedCookie(cookies, SESSION_COOKIE);

  if (!value) {
    return null;
  }

  try {
    return unseal(value);
  } catch (error) {
    return null;
  }
}

function readOAuthSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const value = cookies[OAUTH_COOKIE];

  if (!value) {
    return null;
  }

  try {
    return unseal(value);
  } catch (error) {
    return null;
  }
}

function setPendingOAuthState(payload) {
  cleanupPendingOAuthStates();
  pendingOAuthStates.set(payload.state, {
    ...payload,
    exp: Date.now() + OAUTH_TTL_SECONDS * 1000
  });
}

function takePendingOAuthState(state) {
  cleanupPendingOAuthStates();

  if (!state || !pendingOAuthStates.has(state)) {
    return null;
  }

  const session = pendingOAuthStates.get(state);
  pendingOAuthStates.delete(state);

  if (!session?.exp || session.exp < Date.now()) {
    return null;
  }

  return session;
}

function cleanupPendingOAuthStates() {
  const now = Date.now();

  for (const [state, session] of pendingOAuthStates.entries()) {
    if (!session?.exp || session.exp < now) {
      pendingOAuthStates.delete(state);
    }
  }
}

function setSessionCookie(response, session) {
  const value = seal({
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });

  setChunkedCookie(response, SESSION_COOKIE, value, {
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

function clearSessionCookie(response) {
  clearChunkedCookie(response, SESSION_COOKIE, "/");
}

function readChunkedCookie(cookies, name) {
  if (cookies[name]) {
    return cookies[name];
  }

  const chunks = [];

  for (let index = 0; index < SESSION_COOKIE_MAX_CHUNKS; index += 1) {
    const chunk = cookies[`${name}_${index}`];

    if (!chunk) {
      break;
    }

    chunks.push(chunk);
  }

  return chunks.length ? chunks.join("") : "";
}

function setChunkedCookie(response, name, value, { path, maxAge }) {
  const { secureCookies } = getBookingConfig();
  const sameSite = secureCookies ? "SameSite=None" : "SameSite=Lax";
  const chunks = [];

  for (let index = 0; index < value.length; index += SESSION_COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(index, index + SESSION_COOKIE_CHUNK_SIZE));
  }

  if (chunks.length > SESSION_COOKIE_MAX_CHUNKS) {
    throw httpError(500, "The secure sign-in session is too large to store.");
  }

  if (chunks.length === 1) {
    appendSetCookie(response, buildCookie(name, chunks[0], { path, maxAge, sameSite, secure: secureCookies }));
  } else {
    appendSetCookie(response, buildCookie(name, "", { path, maxAge: 0, sameSite, secure: secureCookies }));
    chunks.forEach((chunk, index) => {
      appendSetCookie(response, buildCookie(`${name}_${index}`, chunk, { path, maxAge, sameSite, secure: secureCookies }));
    });
  }

  for (let index = chunks.length; index < SESSION_COOKIE_MAX_CHUNKS; index += 1) {
    appendSetCookie(response, buildCookie(`${name}_${index}`, "", { path, maxAge: 0, sameSite, secure: secureCookies }));
  }
}

function clearChunkedCookie(response, name, path) {
  const { secureCookies } = getBookingConfig();
  const sameSite = secureCookies ? "SameSite=None" : "SameSite=Lax";

  appendSetCookie(response, buildCookie(name, "", { path, maxAge: 0, sameSite, secure: secureCookies }));

  for (let index = 0; index < SESSION_COOKIE_MAX_CHUNKS; index += 1) {
    appendSetCookie(response, buildCookie(`${name}_${index}`, "", { path, maxAge: 0, sameSite, secure: secureCookies }));
  }
}

function buildCookie(name, value, { path, maxAge, sameSite, secure }) {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    "HttpOnly",
    sameSite,
    `Max-Age=${maxAge}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setOAuthCookie(response, payload) {
  const value = seal({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS
  });
  const { secureCookies } = getBookingConfig();
  const sameSite = secureCookies ? "SameSite=None" : "SameSite=Lax";
  const cookie = [
    `${OAUTH_COOKIE}=${value}`,
    "Path=/api/auth",
    "HttpOnly",
    sameSite,
    `Max-Age=${OAUTH_TTL_SECONDS}`,
    secureCookies ? "Secure" : ""
  ].filter(Boolean).join("; ");

  appendSetCookie(response, cookie);
}

function clearOAuthCookie(response) {
  const { secureCookies } = getBookingConfig();
  const sameSite = secureCookies ? "SameSite=None" : "SameSite=Lax";
  const cookie = [
    `${OAUTH_COOKIE}=`,
    "Path=/api/auth",
    "HttpOnly",
    sameSite,
    "Max-Age=0",
    secureCookies ? "Secure" : ""
  ].filter(Boolean).join("; ");

  appendSetCookie(response, cookie);
}

function appendSetCookie(response, cookie) {
  const current = response.getHeader("Set-Cookie");

  if (!current) {
    response.setHeader("Set-Cookie", cookie);
    return;
  }

  response.setHeader("Set-Cookie", Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

function redirect(response, location) {
  response.statusCode = 303;
  response.setHeader("Location", location);
  response.end();
}

function safeReturnTo(value) {
  const fallback = "/account";
  const text = String(value || fallback).trim();

  if (!text || text.includes("://") || text.startsWith("//")) {
    return fallback;
  }

  const clean = text
    .replace(/^\/?index\.html(?=([?#]|$))/, "/")
    .replace(/\.html(?=([?#]|$))/g, "");

  return clean.startsWith("/") ? clean : `/${clean}`;
}

function seal(payload) {
  const { sessionSecret } = getBookingConfig();

  if (!sessionSecret) {
    throw httpError(500, "SESSION_SECRET is not configured.");
  }

  const key = createHash("sha256").update(sessionSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function unseal(value) {
  const { sessionSecret } = getBookingConfig();
  const [ivText, tagText, encryptedText] = String(value).split(".");

  if (!sessionSecret || !ivText || !tagText || !encryptedText) {
    throw new Error("Invalid session.");
  }

  const key = createHash("sha256").update(sessionSecret).digest();
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const encrypted = Buffer.from(encryptedText, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);

  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const payload = JSON.parse(decrypted.toString("utf8"));

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Session expired.");
  }

  return payload;
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function enforceSameOrigin(request) {
  const origin = request.headers.origin;

  if (!origin) {
    return;
  }

  let originHost;
  try {
    originHost = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
    throw httpError(403, "Cross-origin request blocked.");
  }

  const rawHost = String(request.headers.host || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  const config = getBookingConfig();
  let allowedHost = "";
  try {
    allowedHost = new URL(config.publicBaseUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {}

  if (rawHost !== originHost && allowedHost !== originHost) {
    throw httpError(403, "Cross-origin request blocked.");
  }
}

function enforceRateLimit(request) {
  const ip = request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const key = `${ip}:${request.url}`;
  const current = rateLimitHits.get(key) || { count: 0, resetAt: now + AUTH_RATE_LIMIT.windowMs };

  if (current.resetAt < now) {
    current.count = 0;
    current.resetAt = now + AUTH_RATE_LIMIT.windowMs;
  }

  current.count += 1;
  rateLimitHits.set(key, current);

  if (current.count > AUTH_RATE_LIMIT.count) {
    throw httpError(429, "Too many attempts. Please wait and try again.");
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function publicApiErrorMessage(error) {
  const message = String(error?.message || "");

  if (isMindbodySetupErrorMessage(message)) {
    return "Online booking is almost ready. Please contact Cave to finish this for now.";
  }

  if (/staff identity authentication failed/i.test(message)) {
    return "Online booking is almost ready. Please contact Cave to finish this for now.";
  }

  return message || "Request failed.";
}

function isMindbodySetupErrorMessage(message) {
  return /source credential|staff identity|server-side user token|source credentials user token|usertoken\/issue|user token site id|requested site|studio client account|mindbody rejected|could not match/i.test(String(message || ""));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

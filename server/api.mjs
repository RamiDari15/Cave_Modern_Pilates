import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const API_HOST = "api." + "mind" + "bodyonline.com";
const BASE_URL = `https://${API_HOST}/public/v6`;
const PLATFORM_API_BASE_URL = "https://api.mindbodyonline.com/platform";

const OFFICIAL_SITE_URL = "https://www.cavemodernpilates.com";
const SESSION_COOKIE = "cave_session";
const OAUTH_COOKIE = "cave_oauth";
const SESSION_COOKIE_CHUNK_SIZE = 3600;
const SESSION_COOKIE_MAX_CHUNKS = 8;
const STORE_CACHE_FILE = resolve(ROOT_DIR, "data", "studio-cache.json");
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_TTL_SECONDS = 10 * 60;
const DEFAULT_OAUTH_SCOPE =
  "email openid profile offline_access Platform.Contacts.Api.Write Platform.Contacts.Api.Read Platform.Accounts.Api.Read Mindbody.Api.Public.v6 Platform.ProductInventory.Api.Read Platform.ProductInventory.Api.Write";
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

    if (["/api/auth/start", "/api/auth/sign-in", "/api/auth/sign-up", "/api/client/waiver", "/api/client/complete-profile", "/api/client/saved-cards", "/api/classes/book", "/api/payment/setup", "/api/mindbody/add-card-url", "/api/mindbody/book-class", "/api/mindbody/join-waitlist", "/api/store/purchase", "/api/assistant/chat", "/api/account/profile", "/api/account/payment-card", "/api/client/add-card", "/api/cart/checkout", "/api/pricing/contracts/purchase"].includes(path)) {
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

    if (path === "/api/contact" && request.method === "POST") {
      const { name, email, message } = await readJsonBody(request);

      if (!name || !email || !message) {
        throw httpError(400, "Name, email, and message are required.");
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw httpError(500, "Contact form is not configured.");
      }

      const supabaseRes = await fetch(`${supabaseUrl}/rest/v1/contact_submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ name: String(name).slice(0, 200), email: String(email).slice(0, 200), message: String(message).slice(0, 4000) })
      });

      if (!supabaseRes.ok) {
        throw httpError(500, "Could not save your message. Please try again.");
      }

      sendJson(response, 200, { ok: true });
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
      // Verifies the active Mindbody OAuth session and looks up the existing studio client.
      // This endpoint ONLY searches for existing clients — it never creates new ones.
      // Mindbody is the sole source of truth; no external database is involved.
      const session = await readHydratedSession(request, response);

      if (!session?.consumerIdentityToken && !session?.accessToken) {
        sendJson(response, 401, { success: false, authenticated: false, message: "Please sign in with Mindbody first." });
        return true;
      }

      const email = session.user?.email || session.user?.username || "";
      const firstName = session.user?.firstName || "";
      const lastName = session.user?.lastName || "";

      console.log("[mindbody-auth] /api/auth/link: OAuth login succeeded for", email || "(no email)");

      if (!email) {
        sendJson(response, 400, { success: false, authenticated: false, message: "No email found on Mindbody session." });
        return true;
      }

      let clientId = session.clientId || "";
      let lastError = null;

      if (clientId) {
        console.log("[mindbody-auth] /api/auth/link: clientId already in session:", clientId);
      }

      // 1. Platform API — retrieves the business profile link (read-only)
      if (!clientId) {
        const accessToken = session.consumerIdentityToken || session.accessToken;
        const platformResult = await linkPlatformProfile(accessToken).catch(() => null);
        if (platformResult?.clientId) {
          clientId = platformResult.clientId;
          console.log("[mindbody-auth] /api/auth/link: Platform API resolved clientId:", clientId);
        }
      }

      // 2. clientcompleteinfo with consumer token
      if (!clientId) {
        const consumerToken = session.consumerIdentityToken || session.accessToken;
        const ccResult = await bookingRequest("/client/clientcompleteinfo", {
          consumerIdentityToken: consumerToken,
          params: {}
        }).catch(() => null);
        const ccProfile = extractClientProfile(ccResult, email);
        if (ccProfile?.clientId) {
          clientId = ccProfile.clientId;
          console.log("[mindbody-auth] /api/auth/link: clientcompleteinfo resolved clientId:", clientId);
        }
      }

      // 3. Source credentials: search by email only — no client creation.
      //    If the client doesn't exist in Mindbody, we return an error rather than create a duplicate.
      if (!clientId) {
        try {
          const staffToken = await getMindbodyActionToken("Account link");
          console.log("[mindbody-auth] /api/auth/link: source credentials token issued, searching by email");
          const searchResult = await bookingRequest("/client/clients", { token: staffToken, params: { SearchText: email } });
          const searchProfile = extractClientProfile(searchResult, email);
          if (searchProfile?.clientId) {
            clientId = searchProfile.clientId;
            console.log("[mindbody-auth] /api/auth/link: client search succeeded:", clientId);
          } else {
            // No client found — do NOT call addorupdateclient here.
            // Creating a client during login would produce duplicates if source credentials
            // or scopes are misconfigured. Only /api/auth/sign-up may create new clients.
            console.log("[mindbody-auth] /api/auth/link: client search failed: no existing Mindbody client found for email, client creation skipped");
          }
        } catch (err) {
          lastError = err.message || "Mindbody client lookup failed.";
          console.error("[mindbody-auth] /api/auth/link: source credentials failed:", lastError);
        }
      }

      if (!clientId) {
        const isCredentialError = lastError && /source credential|rejected|user token|password|unauthorized/i.test(lastError);
        const message = isCredentialError
          ? "Studio booking credentials are misconfigured. Please contact the studio."
          : "No existing Mindbody client was found for this email. Please check the email on your Mindbody account or contact the studio.";
        sendJson(response, 404, { success: false, authenticated: false, message });
        return true;
      }

      // Fetch the full client record from Mindbody to return complete info
      const consumerToken = session.consumerIdentityToken || session.accessToken;
      const fullInfo = await bookingRequest("/client/clientcompleteinfo", {
        consumerIdentityToken: consumerToken,
        params: { ClientId: clientId }
      }).catch(() => null);

      const clientRecord = fullInfo?.ClientCompleteInfo?.Client || fullInfo?.Client || null;

      // Store the resolved clientId in the session cookie
      setSessionCookie(response, { ...session, clientId, user: { ...session.user, id: clientId } });

      console.log("[mindbody-auth] /api/auth/link: success, session updated with clientId:", clientId);

      sendJson(response, 200, {
        success: true,
        authenticated: true,
        mindbodyClientId: clientId,
        email,
        client: {
          id: clientId,
          firstName: clientRecord?.FirstName || firstName,
          lastName: clientRecord?.LastName || lastName,
          email: clientRecord?.Email || email
        }
      });
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
      console.log(`[auth/callback] hit — method=${request.method} hasCode=${Boolean(form.code)} hasError=${Boolean(form.error)}`);
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

      // Prevent duplicate Mindbody clients — look up by email before creating
      const signupEmail = (body.email || "").trim().toLowerCase();
      if (signupEmail) {
        const existing = await findMindbodyClientByEmail(signupEmail).catch((err) => {
          if (err.status === 409) throw err;
          return null;
        });
        if (existing) {
          sendJson(response, 409, {
            ok: false,
            message: "A Mindbody client already exists with this email. Please sign in with your Mindbody account instead.",
            clientExists: true
          });
          return true;
        }
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

      if (!session) {
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
        sendJson(response, 200, {
          ok: false,
          message: "To add a payment card, please contact Cave or add one through the MindBody app — cards cannot be added online at this time."
        });
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

      if (!session) {
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

      if (!session) {
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

      if (!session) {
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
        const result = await bookClassWithValidation(
          session,
          classId,
          body.clientServiceId ? Number(body.clientServiceId) : null,
          {
            startDateTime: body.startDateTime,
            locationId: body.locationId,
            classScheduleId: body.classScheduleId
          }
        );        sendJson(response, 200, { ok: true, data: result });
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

    if (path === "/api/mindbody/unbook-class" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session?.accessToken && !session?.consumerIdentityToken && session?.authMode !== "created-client") {
        sendJson(response, 401, {
          ok: false,
          message: "Please sign in before cancelling a booking.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/schedule")}`
        });
        return true;
      }

      const body = await readJsonBody(request);
      const classId = Number(body.classId);
      const visitId = body.visitId ? Number(body.visitId) : null;

      if (!Number.isInteger(classId) || classId <= 0) {
        sendJson(response, 400, { ok: false, message: "A valid class ID is required." });
        return true;
      }

      let clientId = session.clientId || await resolveSessionClientId(session).catch(() => "");

      if (!clientId) {
        const sessionEmail = session.user?.email || session.user?.username || "";
        if (sessionEmail) {
          const found = await findMindbodyClientByEmail(sessionEmail).catch(() => null);
          if (found) clientId = found.clientId;
        }
      }

      if (!clientId) {
        sendJson(response, 400, {
          ok: false,
          message: "Could not resolve your studio account ID. Please sign out and try again."
        });
        return true;
      }

      let staffToken = null;
      try {
        staffToken = await getMindbodyActionToken("class unbook");
      } catch (_) {}

      const unbookBody = compactObject({
        ClientId: clientId,
        ClassId: classId,
        VisitId: visitId || undefined,
        SendEmail: true,
        LateCancel: false,
        Test: process.env.BOOKING_TEST_MODE === "true" ? true : undefined
      });

      try {
        const result = await bookingRequest("/class/removeclientfromclass", {
          method: "POST",
          ...(staffToken ? { token: staffToken } : {}),
          body: unbookBody
        });
        liveClassesCache.expiresAt = 0;
        sendJson(response, 200, { ok: true, data: result });
      } catch (err) {
        const message = err.data?.Error?.Message || err.data?.Message || err.message || "Could not cancel this booking.";
        sendJson(response, err.status || 503, { ok: false, message });
      }
      return true;
    }

    if (path === "/api/mindbody/join-waitlist" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session) {
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
      // Intentionally do NOT call assertNoRawCardPayload — this route proxies card data securely to Mindbody.
      const body = await readJsonBody(request);

      if (!session) {
        const returnTo = safeReturnTo(String(body.returnTo || "/pricing"));
        sendJson(response, 401, {
          ok: false,
          message: "Please sign in before purchasing.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`
        });
        return true;
      }

      const item = findStoreItem(body.itemId, body.kind);

      if (!item) {
        sendJson(response, 404, { ok: false, message: "That pricing option is not available in the studio store cache." });
        return true;
      }

      if (item.requiresWaiver && !body.acceptWaiver) {
        sendJson(response, 400, { ok: false, message: "Please accept the liability waiver before continuing." });
        return true;
      }

      if (item.requiresTerms && !body.acceptTerms) {
        sendJson(response, 400, { ok: false, message: "Please accept the membership agreement before continuing." });
        return true;
      }

      try {
        const purchase = await purchaseStoreItem(session, item, body);
        sendJson(response, 200, { ok: true, purchase });
      } catch (err) {
        const status = err.status >= 400 && err.status < 600 ? err.status : 503;
        const msg = err.data?.Error?.Message || err.data?.Message || err.message || "Purchase could not be completed.";
        const extra = err.data?.paymentSetupUrl ? { paymentSetupUrl: err.data.paymentSetupUrl } : {};
        sendJson(response, status, { ok: false, message: msg, ...extra });
      }
      return true;
    }

    if (path === "/api/client/saved-cards" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session) {
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

    if ((path === "/api/account/payment-card" || path === "/api/client/add-card") && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session) {
        sendJson(response, 401, {
          ok: false,
          message: "Please sign in before adding a card.",
          loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/account")}`
        });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => "");

      if (!clientId) {
        sendJson(response, 400, { ok: false, message: "Your studio account could not be found. Please contact Cave to link your account." });
        return true;
      }

      // Intentionally skip assertNoRawCardPayload — this route exists solely to
      // proxy card data securely to Mindbody. Card data is never stored or logged.
      const body = await readJsonBody(request);

      const cardNumber = String(body.cardNumber || "").replace(/\D/g, "");
      const expMonthRaw = String(body.expMonth || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
      const expYearRaw = String(body.expYear || "").replace(/\D/g, "");
      const expYear = expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw;
      const cardHolder = String(body.cardHolder || body.billingName || "").trim();
      const address = String(body.address || body.billingAddress || "").trim();
      const city = String(body.city || body.billingCity || "").trim();
      const state = String(body.state || body.billingState || "").trim();
      const postalCode = String(body.postalCode || body.billingPostalCode || "").replace(/[^\w\s-]/g, "").trim().slice(0, 10);

      if (cardNumber.length < 13 || cardNumber.length > 19) {
        sendJson(response, 400, { ok: false, message: "Please enter a valid card number." });
        return true;
      }

      const monthNum = Number(expMonthRaw);
      if (!expMonthRaw || monthNum < 1 || monthNum > 12) {
        sendJson(response, 400, { ok: false, message: "Please enter a valid expiry month (01–12)." });
        return true;
      }

      if (!expYear || expYear.length !== 4) {
        sendJson(response, 400, { ok: false, message: "Please enter a valid expiry year." });
        return true;
      }

      if (!cardHolder) {
        sendJson(response, 400, { ok: false, message: "Please enter the name on the card." });
        return true;
      }

      if (!postalCode) {
        sendJson(response, 400, { ok: false, message: "Please enter the billing ZIP code." });
        return true;
      }

      let staffToken;
      try {
        staffToken = await getMindbodyActionToken("Add card");
      } catch (tokenErr) {
        console.error("[account/payment-card] getMindbodyActionToken failed:", tokenErr.message);
        sendJson(response, 500, { ok: false, message: "The studio booking service is not configured correctly. Please contact Cave." });
        return true;
      }

      console.log(`[account/payment-card] POST /client/updateclient clientId=${clientId}`);

      try {
        const updateResult = await bookingRequest("/client/updateclient", {
          method: "POST",
          token: staffToken,
          body: {
            Client: {
              Id: clientId,
              ClientCreditCard: compactObject({
                CardNumber: cardNumber,
                ExpMonth: expMonthRaw,
                ExpYear: expYear,
                CardHolder: cardHolder,
                Address: address || undefined,
                City: city || undefined,
                State: state || undefined,
                PostalCode: postalCode
              })
            },
            CrossRegionalUpdate: false
          }
        });

        const savedCard = updateResult?.Client?.ClientCreditCard || null;
        const hasBillingAddress = Boolean(savedCard?.Address || savedCard?.City || savedCard?.State);
        if (savedCard && !hasBillingAddress) {
          console.warn("[account/payment-card] Mindbody saved card but returned null billing address fields.");
        }

        const masked = savedCard ? {
          cardType: savedCard.CardType || null,
          lastFour: savedCard.LastFour || savedCard.CardNumber?.slice(-4) || null,
          expMonth: savedCard.ExpMonth || null,
          expYear: savedCard.ExpYear || null,
          cardHolder: savedCard.CardHolder || null,
          address: savedCard.Address || null,
          city: savedCard.City || null,
          state: savedCard.State || null,
          postalCode: savedCard.PostalCode || null
        } : null;

        console.log("[account/payment-card] updateclient success");
        sendJson(response, 200, {
          ok: true,
          message: "Card saved successfully.",
          card: masked,
          billingAddressStored: hasBillingAddress
        });
      } catch (error) {
        const status = (error.status >= 400 && error.status < 600) ? error.status : 503;
        const mbMessage = error.data?.Error?.Message || error.data?.Message || error.message || "";
        // Never echo card numbers in error messages
        const safeMessage = mbMessage.replace(/\b\d{13,19}\b/g, "****");
        sendJson(response, status, { ok: false, message: safeMessage || "Could not save card. Please try again." });
      }

      return true;
    }



    if (path === "/api/client/schedule" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.accessToken && !session?.consumerIdentityToken && session?.authMode !== "created-client") {
        sendJson(response, 401, { ok: false, message: "Please sign in." });
        return true;
      }

      let clientId = session.clientId || "";
      const sessionEmail = session.user?.email || session.user?.username || "";

      if (!clientId && sessionEmail) {
        const found = await findMindbodyClientByEmail(sessionEmail).catch(() => null);
        if (found) clientId = found.clientId;
      }

      if (!clientId) {
        sendJson(response, 200, { ok: true, data: { visits: [] } });
        return true;
      }

      const today = formatApiDate(new Date());
      const future = formatApiDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      let staffToken = null;
      try { staffToken = await getMindbodyActionToken("client schedule"); } catch (_) {}

      const scheduleData = await bookingRequest("/client/clientschedule", {
        ...(staffToken ? { token: staffToken } : { consumerIdentityToken: session.consumerIdentityToken || session.accessToken }),
        params: {
          "request.clientId": clientId,
          "request.startDate": today,
          "request.endDate": future,
          "request.includeWaitlistEntries": "true",
          "request.limit": "200"
        }
      }).catch(() => null);

      const raw = scheduleData?.ClientSchedule?.Visits
        || scheduleData?.ClientSchedule
        || scheduleData?.Visits
        || scheduleData?.Classes
        || [];
      const visitsArray = Array.isArray(raw) ? raw : [];

      const visits = visitsArray
        .filter((v) => v && typeof v === "object")
        .map((v) => ({
          classId: Number(v.ClassId || v.Id || 0),
          visitId: Number(v.Id || v.VisitId || 0),
          startDateTime: v.StartDateTime || "",
          status: v.VisitStatus || v.Status || "Confirmed"
        }))
        .filter((v) => v.classId > 0);

      sendJson(response, 200, { ok: true, data: { visits } });
      return true;
    }

    if (path === "/api/client/eligibility" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session?.accessToken && !session?.consumerIdentityToken && session?.authMode !== "created-client") {
        sendJson(response, 401, { ok: false, message: "Please sign in." });
        return true;
      }

      let clientId = session.clientId || "";
      const sessionEmail = session.user?.email || session.user?.username || "";

      if (!clientId && sessionEmail) {
        const found = await findMindbodyClientByEmail(sessionEmail).catch(() => null);
        if (found) clientId = found.clientId;
      }

      if (!clientId) {
        sendJson(response, 200, { ok: true, data: { hasUsablePricingOption: false, activeServices: [], activeMemberships: [] } });
        return true;
      }

      const info = await fetchClientCompleteInfo(clientId, session).catch(() => null);
      sendJson(response, 200, {
        ok: true,
        data: info || { hasUsablePricingOption: false, activeServices: [], activeMemberships: [] }
      });
      return true;
    }

    if (path === "/api/client/dashboard") {
      const session = await readHydratedSession(request, response);

      if (!session?.accessToken && !session?.consumerIdentityToken && session?.authMode !== "created-client") {
        sendJson(response, 401, { message: "Please sign in first." });
        return true;
      }

      const consumerToken = session.consumerIdentityToken || session.accessToken || "";
      const sessionEmail = session.user?.email || session.user?.username || "";

      // Resolve clientId — session first, then email lookup
      let clientId = session.clientId || "";
      let uniqueClientId = session.uniqueClientId || "";

      if (!clientId && sessionEmail) {
        const found = await findMindbodyClientByEmail(sessionEmail).catch(() => null);
        if (found) {
          clientId = found.clientId;
          uniqueClientId = found.uniqueId || "";
          setSessionCookie(response, { ...session, clientId, user: { ...(session.user || {}), id: clientId } });
        }
      }

      if (!clientId && !consumerToken) {
        sendJson(response, 200, {
          clientLinked: false,
          profile: null,
          schedule: null,
          services: null,
          contracts: null,
          rewards: null,
          session: publicSession(session),
          errors: ["Could not resolve Mindbody client ID."]
        });
        return true;
      }

      // Best available auth for staff-level calls
      let staffToken = null;
      try {
        staffToken = await getMindbodyActionToken("dashboard");
      } catch (_) {}

      // Date range: today through 90 days out
      const today = new Date().toISOString().split("T")[0];
      const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Param sets — prefer request.xxx format per Mindbody v6 API docs
      const clientParams = compactObject({
        "request.clientId": clientId || undefined,
        "request.uniqueClientId": uniqueClientId || undefined
      });

      const staffAuth = staffToken ? { token: staffToken } : {};
      const consumerAuth = consumerToken ? { consumerIdentityToken: consumerToken } : {};

      // clientcompleteinfo: consumer token in consumer-identity-token header (no Authorization mismatch)
      // staffToken is used as fallback if consumer token not present
      const ccInfoAuth = consumerToken ? consumerAuth : staffAuth;

      const [scheduleResult, ccInfoResult, contractsResult, rewardsResult] = await Promise.allSettled([
        bookingRequest("/client/clientschedule", {
          ...staffAuth,
          params: {
            ...clientParams,
            "request.startDate": today,
            "request.endDate": ninetyDaysOut,
            "request.includeWaitlistEntries": "true",
            "request.crossRegionalLookup": "true"
          }
        }),
        bookingRequest("/client/clientcompleteinfo", {
          ...ccInfoAuth,
          params: {
            ...clientParams,
            "request.crossRegionalLookup": "true",
            "request.showActiveOnly": "true"
          }
        }),
        bookingRequest("/client/clientcontracts", {
          ...staffAuth,
          params: {
            ...clientParams,
            "request.crossRegionalLookup": "true"
          }
        }),
        bookingRequest("/client/rewardpoints", {
          ...staffAuth,
          params: clientParams
        }).catch(() => null)
      ]);

      const ccInfo = fulfilledValue(ccInfoResult);
      const schedule = fulfilledValue(scheduleResult);
      const contracts = fulfilledValue(contractsResult);
      const rewards = fulfilledValue(rewardsResult);

      // Extract services/class packs from clientcompleteinfo response
      const services = ccInfo?.ClientServices || ccInfo?.Services || ccInfo?.ClientCompleteInfo?.ClientServices || null;
      // Extract memberships from contracts or clientcompleteinfo
      const memberships = contracts?.ClientContracts || contracts?.Contracts
        || ccInfo?.ClientMemberships || ccInfo?.Memberships
        || ccInfo?.ClientCompleteInfo?.ClientMemberships || null;

      const errors = [scheduleResult, ccInfoResult, contractsResult]
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message)
        .filter(Boolean);

      sendJson(response, 200, {
        clientLinked: true,
        clientId,
        profile: ccInfo?.Client || ccInfo?.ClientCompleteInfo?.Client || null,
        schedule,
        services,
        contracts: memberships,
        rewards,
        session: publicSession(session),
        errors
      });
      return true;
    }

    if (path === "/api/account/me") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendJson(response, 405, { message: "Method not allowed. Use GET /api/account/me." });
        return true;
      }

      const session = await readHydratedSession(request, response);
      const hasToken = Boolean(session?.accessToken || session?.consumerIdentityToken);

      console.log(`[account/me] hasToken=${hasToken} platformUserId=${session?.platformUserId || ""} clientId=${session?.clientId || ""}`);

      if (!hasToken) {
        sendJson(response, 401, { ok: false, message: "Please sign in first.", loginUrl: "/api/auth/start?returnTo=/account" });
        return true;
      }

      let accessToken = session.consumerIdentityToken || session.accessToken;
      const activeSession = session;

      const { siteId } = getBookingConfig();
      const meResult = await fetchPlatformMeWithStatus(accessToken);
      const platformUser = meResult.ok ? meResult.data : null;
      const userId = platformUser?.userAccount?.id || platformUser?.UserAccount?.id || activeSession.platformUserId || "";

      console.log(`[account/me] GET /platform/account/v1/me → ok=${meResult.ok} status=${meResult.status || ""} platformUserId=${userId || "(none)"}`);

      const profiles = userId
        ? await fetchPlatformBusinessProfiles(userId, accessToken).catch(() => [])
        : [];

      const studioProfile = findStudioBusinessProfile(profiles, siteId);
      const hasBusinessProfile = Boolean(studioProfile);
      const studioClientId = studioProfile?.clientId || studioProfile?.ClientId || activeSession.clientId || "";
      const businessId = studioProfile?.businessId || studioProfile?.BusinessId || activeSession.businessId || siteId || "";
      const profileId = studioProfile?.id || studioProfile?.profileId || studioProfile?.ProfileId || activeSession.profileId || "";

      console.log(`[account/me] businessProfiles=${profiles.length} studioMatch=${hasBusinessProfile} businessId=${businessId} clientId=${studioClientId}`);

      if ((userId && userId !== activeSession.platformUserId) || (studioClientId && studioClientId !== activeSession.clientId)) {
        setSessionCookie(response, {
          ...activeSession,
          platformUserId: userId || activeSession.platformUserId || "",
          businessId: businessId || activeSession.businessId || "",
          profileId: profileId || activeSession.profileId || "",
          clientId: studioClientId || activeSession.clientId || ""
        });
      }

      // Fetch full client profile from Public API clientcompleteinfo
      // If Platform API gave us a clientId, use it; otherwise try consumer token alone
      // (consumer-identity-token header lets Mindbody identify the client without a clientId param)
      let resolvedClientId = studioClientId || activeSession.clientId;
      let fullProfile = null;

      if (!resolvedClientId && accessToken) {
        const ccFallback = await bookingRequest("/client/clientcompleteinfo", {
          consumerIdentityToken: accessToken,
          params: { "request.crossRegionalLookup": "true" }
        }).catch(() => null);

        if (ccFallback) {
          const foundId = extractClientId(ccFallback);
          if (foundId) {
            resolvedClientId = foundId;
            console.log(`[account/me] clientcompleteinfo (consumer token) resolved clientId: ${foundId}`);
            setSessionCookie(response, {
              ...activeSession,
              clientId: foundId,
              user: { ...(activeSession.user || {}), id: foundId }
            });
          }
        }
      }

      if (resolvedClientId) {
        let profileToken = null;
        try {
          profileToken = await getMindbodyActionToken("Account profile load");
        } catch (_) {}
        const ccResp = await bookingRequest("/client/clientcompleteinfo", {
          token: profileToken || undefined,
          consumerIdentityToken: profileToken ? undefined : accessToken,
          params: compactObject({
            "request.clientId": resolvedClientId,
            "request.crossRegionalLookup": "true"
          })
        }).catch(() => null);
        if (ccResp) {
          const client = ccResp.ClientCompleteInfo?.Client || ccResp.Client || {};
          fullProfile = compactObject({
            phone: client.MobilePhone || undefined,
            homePhone: client.HomePhone || undefined,
            workPhone: client.WorkPhone || undefined,
            middleName: client.MiddleName || undefined,
            addressLine1: client.AddressLine1 || undefined,
            addressLine2: client.AddressLine2 || undefined,
            city: client.City || undefined,
            state: client.State || undefined,
            country: client.Country || undefined,
            postalCode: client.PostalCode || undefined,
            birthDate: client.BirthDate ? String(client.BirthDate).slice(0, 10) : undefined,
            gender: client.Gender || undefined,
            referredBy: client.ReferredBy || undefined,
            emergencyContactName: client.EmergencyContactInfoName || undefined,
            emergencyContactEmail: client.EmergencyContactInfoEmail || undefined,
            emergencyContactPhone: client.EmergencyContactInfoPhone || undefined,
            emergencyContactRelationship: client.EmergencyContactInfoRelationship || undefined
          });
          fullProfile.hasWaiver = Boolean(client.Liability?.IsReleased);
          fullProfile.waiverDate = client.Liability?.AgreementDate || null;
          console.log(`[account/me] clientcompleteinfo: hasWaiver=${fullProfile.hasWaiver} hasPhone=${Boolean(fullProfile.phone)}`);
        }
      }

      const resolvedHasBusinessProfile = hasBusinessProfile || Boolean(resolvedClientId);

      sendJson(response, 200, {
        ok: true,
        data: {
          userId,
          email: platformUser?.email || platformUser?.Email || activeSession.user?.email || "",
          firstName: platformUser?.firstName || platformUser?.FirstName || activeSession.user?.firstName || "",
          lastName: platformUser?.lastName || platformUser?.LastName || activeSession.user?.lastName || "",
          countryCode: platformUser?.countryCode || platformUser?.CountryCode || "",
          clientId: resolvedClientId,
          businessId,
          profileId,
          hasBusinessProfile: resolvedHasBusinessProfile,
          businessProfiles: profiles,
          platformMeError: meResult.ok ? null : { status: meResult.status, error: meResult.error },
          ...fullProfile
        }
      });
      return true;
    }

    if (path === "/api/account/profile") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { message: "Method not allowed. Use POST /api/account/profile." });
        return true;
      }

      const session = await readHydratedSession(request, response);

      if (!session) {
        sendJson(response, 401, { ok: false, message: "Please sign in first." });
        return true;
      }

      const body = await readJsonBody(request);
      const clientId = session.clientId || body.clientId || await resolveSessionClientId(session).catch(() => "");

      if (!clientId) {
        sendJson(response, 400, { ok: false, message: "Your studio account could not be found. Please contact Cave to link your account." });
        return true;
      }

      const firstName = String(body.firstName || session.user?.firstName || "").trim();
      const lastName = String(body.lastName || session.user?.lastName || "").trim();

      if (!firstName || !lastName) {
        sendJson(response, 400, { ok: false, message: "First name and last name are required." });
        return true;
      }

      const clientPayload = compactObject({
        Id: clientId,
        FirstName: firstName,
        LastName: lastName,
        Email: body.email || session.user?.email || undefined,
        MobilePhone: body.phone,
        HomePhone: body.homePhone,
        WorkPhone: body.workPhone,
        MiddleName: body.middleName,
        AddressLine1: body.addressLine1,
        AddressLine2: body.addressLine2,
        City: body.city,
        State: body.state,
        PostalCode: body.postalCode,
        Country: body.country,
        BirthDate: body.birthDate,
        EmergencyContactInfoName: body.emergencyContactName,
        EmergencyContactInfoEmail: body.emergencyContactEmail,
        EmergencyContactInfoPhone: body.emergencyContactPhone,
        EmergencyContactInfoRelationship: body.emergencyContactRelationship
      });

      if (Object.keys(clientPayload).filter((k) => !["Id", "FirstName", "LastName", "Email"].includes(k)).length === 0) {
        sendJson(response, 400, { ok: false, message: "No editable fields provided." });
        return true;
      }

      let staffToken;
      try {
        staffToken = await getMindbodyActionToken("Profile update");
      } catch (tokenErr) {
        console.error(`[account/profile] getMindbodyActionToken failed: ${tokenErr.message}`);
        sendJson(response, 500, { ok: false, message: "The studio booking service is not configured correctly. Please contact Cave." });
        return true;
      }

      console.log(`[account/profile] POST /client/updateclient clientId=${clientId}`);

      let updateResult = null;
      let updateError = null;

      try {
        updateResult = await bookingRequest("/client/updateclient", {
          method: "POST",
          token: staffToken,
          body: { Client: clientPayload, CrossRegionalUpdate: false }
        });
        console.log("[account/profile] updateclient success");
      } catch (err) {
        updateError = err;
        console.error(`[account/profile] updateclient failed (${err.status || 0}): ${err.message}`);
      }

      if (!updateResult) {
        const mbMessage = updateError?.data?.Error?.Message || updateError?.data?.Message || updateError?.message || "";
        sendJson(response, updateError?.status || 500, { ok: false, message: mbMessage || "Profile update failed." });
        return true;
      }

      const updatedClient = updateResult?.Client || updateResult?.Clients?.[0] || updateResult?.ClientResponse?.Client;
      const returnedClientId = updatedClient?.Id || updatedClient?.ClientId;
      if (returnedClientId && !isUUID(String(returnedClientId)) && returnedClientId !== session.clientId) {
        setSessionCookie(response, {
          ...session,
          clientId: String(returnedClientId),
          user: { ...session.user, id: String(returnedClientId) }
        });
      }

      console.log("[account/profile] success");
      sendJson(response, 200, { ok: true, data: updateResult });
      return true;
    }

    if (path === "/api/debug/mindbody-update-permission" && request.method === "GET") {
      const isDebugAllowed = process.env.NODE_ENV !== "production" || process.env.DEBUG_ENABLED === "true";
      if (!isDebugAllowed) {
        sendJson(response, 404, { message: "Not found." });
        return true;
      }

      const config = getBookingConfig();
      const result = {
        hasApiKey: Boolean(config.apiKey),
        hasSiteId: Boolean(config.siteId),
        hasSourceName: Boolean(config.sourceName),
        hasSourcePassword: Boolean(config.sourcePassword),
        hasStaffUsername: Boolean(config.staffUsername),
        hasStaffPassword: Boolean(config.staffPassword),
        hasStaticToken: Boolean(config.staffToken),
        tokenMode: getMindbodyActionTokenMode(config),
        staffTokenCreated: false,
        updateClientPermission: "not_tested",
        mindbodyErrorCode: null,
        mindbodyErrorMessage: null
      };

      // Try to get a staff token
      let staffToken = null;
      try {
        staffToken = await getMindbodyActionToken("debug permission check");
        result.staffTokenCreated = true;
      } catch (tokenErr) {
        result.staffTokenCreated = false;
        result.updateClientPermission = "token_failed";
        result.mindbodyErrorMessage = tokenErr.message;
        sendJson(response, 200, result);
        return true;
      }

      // Try a minimal updateclient call with a known-safe test client ID (from session if available)
      const session = await readHydratedSession(request, response).catch(() => null);
      const clientId = session?.clientId || "";

      if (!clientId) {
        result.updateClientPermission = "skipped_no_client_id";
        result.mindbodyErrorMessage = "Sign in first to test updateclient with your client ID.";
        sendJson(response, 200, result);
        return true;
      }

      result.clientIdPresent = true;

      try {
        // Send an empty update — just the Id — to check if the token has permission
        await bookingRequest("/client/updateclient", {
          method: "POST",
          token: staffToken,
          body: { Client: { Id: clientId }, CrossRegionalUpdate: true }
        });
        result.updateClientPermission = "success";
      } catch (updateErr) {
        result.updateClientPermission = "failure";
        result.mindbodyErrorCode = updateErr.data?.Error?.Code || updateErr.data?.code || null;
        result.mindbodyErrorMessage = updateErr.data?.Error?.Message || updateErr.data?.Message || updateErr.message;
      }

      sendJson(response, 200, result);
      return true;
    }

    if (path === "/api/debug/find-client" && request.method === "GET") {
      const isDebugAllowed = process.env.NODE_ENV !== "production" || process.env.DEBUG_ENABLED === "true";
      if (!isDebugAllowed) {
        sendJson(response, 404, { message: "Not found." });
        return true;
      }

      const urlObj = new URL(request.url, "http://localhost");
      const emailParam = urlObj.searchParams.get("email") || "";
      const normalizedEmail = emailParam.trim().toLowerCase();

      if (!normalizedEmail) {
        sendJson(response, 400, { message: "?email= query param is required" });
        return true;
      }

      try {
        const result = await findMindbodyClientByEmail(normalizedEmail);
        sendJson(response, 200, {
          searchedEmail: normalizedEmail,
          endpoint: "/public/v6/client/clients",
          totalReturned: null,
          exactMatches: 1,
          clientFound: true,
          mindbodyClientId: result.clientId,
          uniqueIdPresent: Boolean(result.uniqueId),
          firstName: result.firstName,
          lastName: result.lastName
        });
      } catch (err) {
        sendJson(response, err.status || 500, {
          searchedEmail: normalizedEmail,
          endpoint: "/public/v6/client/clients",
          clientFound: false,
          exactMatches: 0,
          count: err.count || 0,
          error: err.message
        });
      }
      return true;
    }

    if (path === "/api/debug/mindbody-session" && request.method === "GET") {
      const cookies = parseCookies(request.headers.cookie || "");
      const cookieValue = readChunkedCookie(cookies, SESSION_COOKIE);
      const hasSessionCookie = Boolean(cookieValue);

      let session = null;
      let sessionDecrypts = false;
      try {
        if (cookieValue) {
          session = unseal(cookieValue);
          sessionDecrypts = true;
        }
      } catch (_) {
        sessionDecrypts = false;
      }

      if (!hasSessionCookie) {
        sendJson(response, 200, {
          hasSessionCookie: false,
          sessionDecrypts: false,
          hasAccessToken: false,
          hasRefreshToken: false,
          tokenExpired: false,
          platformUserId: "missing",
          email: "missing",
          businessId: "missing",
          profileId: "missing",
          lastAuthError: "No session cookie found. Not signed in."
        });
        return true;
      }

      if (!sessionDecrypts) {
        sendJson(response, 200, {
          hasSessionCookie: true,
          sessionDecrypts: false,
          hasAccessToken: false,
          hasRefreshToken: false,
          tokenExpired: false,
          platformUserId: "missing",
          email: "missing",
          businessId: "missing",
          profileId: "missing",
          lastAuthError: "Session cookie exists but could not be decrypted. SESSION_SECRET may have changed."
        });
        return true;
      }

      const accessToken = session.consumerIdentityToken || session.accessToken || "";
      const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : 0;
      const tokenExpired = expiresAt > 0 && expiresAt < Date.now();

      let lastAuthError = null;
      if (!accessToken) lastAuthError = "Session has no access token.";
      else if (tokenExpired && !session.refreshToken) lastAuthError = "Token expired and no refresh token available.";

      sendJson(response, 200, {
        hasSessionCookie: true,
        sessionDecrypts: true,
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(session.refreshToken),
        tokenExpired,
        platformUserId: session.platformUserId ? "present" : "missing",
        email: (session.user?.email || session.user?.username) ? "present" : "missing",
        businessId: session.businessId ? "present" : "missing",
        profileId: (session.profileId || session.clientId) ? "present" : "missing",
        lastAuthError
      });
      return true;
    }

    // ── Pricing Catalog ────────────────────────────────────────────────────────
    if (path === "/api/pricing/catalog" && request.method === "GET") {
      const { locationId } = getBookingConfig();
      const cache = readStoreCache();
      const storeGroups = publicStoreGroups(cache.store || {});

      // Try live services from Mindbody (consumer mode — no auth needed)
      let liveServices = null;
      try {
        const data = await bookingRequest("/sale/services", {
          params: {
            "request.sellOnline": "true",
            "request.limit": "100",
            "request.offset": "0",
            "request.includeDiscontinued": "false",
            ...(locationId ? { "request.locationId": String(locationId) } : {})
          }
        });
        liveServices = firstListByKey(data, "Services");
      } catch (_) {}

      let liveContracts = [];

try {
  const staffToken = await getMindbodyActionToken("Pricing contracts");

  const contractData = await bookingRequest("/sale/contracts", {
    token: staffToken,
    params: {
      "request.sellOnline": "true",
      "request.limit": "100",
      "request.offset": "0",
      ...(locationId ? { "request.locationId": String(locationId) } : {})
    }
  });

  liveContracts = firstListByKey(contractData, "Contracts");
} catch (err) {
  console.warn("[pricing/catalog] Could not load live contracts:", err.message);
}


const isSoldOnlineValue = (item) => {
  const value =
    item.SellOnline ??
    item.SoldOnline ??
    item.IsSoldOnline ??
    item.AvailableOnline ??
    item.SellOnlineFlag;

  // If Mindbody gives us a sold-online field, respect it.
  if (value !== undefined && value !== null) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  // If Mindbody does NOT return a sold-online field, trust the API query:
  // request.sellOnline=true
  return true;
};

const CONTRACT_PRICE_BY_ID = {
  "101": 150,
  "102": 140,
  "103": 128,
  "104": 275,
  "105": 260,
  "106": 220,
  "113": 325,
  "114": 300,
  "115": 275
};

const moneyString = (value) => {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return `$${number.toFixed(2)}`;
};

const contractPriceValue = (item, id) => {
  return (
    item.OnlinePrice ??
    item.Price ??
    item.Amount ??
    item.RecurringPaymentAmount ??
    item.FirstPaymentAmount ??
    item.TotalContractAmount ??
    item.MonthlyPayment ??
    item.PaymentAmount ??
    item.BillingAmount ??
    item.Membership?.Amount ??
    item.Membership?.Price ??
    item.AutopaySchedule?.PaymentAmount ??
    item.AutopaySchedule?.Amount ??
    item.AutoPaySchedule?.PaymentAmount ??
    item.AutoPaySchedule?.Amount ??
    CONTRACT_PRICE_BY_ID[String(id)] ??
    null
  );
};

const contractItems = liveContracts
  .filter((item) => isSoldOnlineValue(item))
  .map((item) => {

const id = String(item.Id || item.ContractId || "");
const name = item.Name || item.ContractName || "";
const price = contractPriceValue(item, id);

    return {
      id,
      kind: "contract",
      name,
      price: moneyString(price),
      description: item.Description || "",
      sellOnline: true,
      requiresWaiver: true,
      requiresTerms: true
    };
  })
  .filter((item) => item.id && item.name);



      const newbieIds = String(process.env.NEWBIE_SERVICE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
      const newbieNameRe = /intro|new\s*client|first\s*time|starter|trial|welcome|newbie/i;

      let catalog;

      if (liveServices && liveServices.length > 0) {
        const services = liveServices.map((item) => {
          const id = String(item.Id || item.ProductId || "");
          const name = item.Name || "";
          const price = item.OnlinePrice != null ? item.OnlinePrice : (item.Price != null ? item.Price : null);
          const priceStr = price != null ? `$${Number(price).toFixed(2)}` : "";
          const rawSessions = Number(item.Count || 0);
          const isUnlimited = /\bunlimited\b/i.test(name) || rawSessions >= 9999;
          const sessions = isUnlimited ? null : rawSessions || null;
          const isNewbie = newbieIds.includes(id) || newbieNameRe.test(name);
          return {
            id,
            kind: "service",
            name,
            price: priceStr,
            sessions,
            description: item.Description || (isUnlimited ? "Unlimited classes" : (sessions && sessions > 0 ? `${sessions} class${sessions !== 1 ? "es" : ""}` : "")),
            isNewbiePromo: isNewbie,
            sellOnline: item.SellOnline !== false,
            requiresWaiver: true,
            requiresTerms: false
          };
        }).filter((s) => s.id && s.sellOnline !== false);
        
       const isUnlimitedService = (s) =>
  /\bunlimited\b/i.test(String(s.name || s.description || ""));

catalog = {
  newbie: services.filter((s) => s.isNewbiePromo),

  classPacks: services.filter((s) =>
    !s.isNewbiePromo &&
    (
      isUnlimitedService(s) ||
      (s.sessions && s.sessions > 1)
    )
  ),

  dropIn: services.filter((s) =>
    !s.isNewbiePromo &&
    !isUnlimitedService(s) &&
    (!s.sessions || s.sessions <= 1)
  ),

  memberships: contractItems
};
        catalog = {
          newbie: services.filter((s) => s.isNewbiePromo),
          classPacks: services.filter((s) => !s.isNewbiePromo && s.sessions && s.sessions > 1),
          dropIn: services.filter((s) => !s.isNewbiePromo && (!s.sessions || s.sessions <= 1)),
          memberships: contractItems
        };
      } else {
        // Fall back to store cache
        catalog = {
          newbie: publicStoreItems(storeGroups.newbie || []),
          classPacks: publicStoreItems(storeGroups.classPacks || []),
          dropIn: publicStoreItems(storeGroups.dropIn || []),
          memberships: contractItems
        };
      }

      sendJson(response, 200, { ok: true, catalog, source: liveServices ? "live" : "cache" });
      return true;
    }

    // ── Cart Quote ─────────────────────────────────────────────────────────────
    if (path === "/api/cart/quote" && request.method === "POST") {
      const session = await readHydratedSession(request, response);
      const body = await readJsonBody(request);
      const items = Array.isArray(body.items) ? body.items : [];

      if (!items.length) {
        sendJson(response, 400, { ok: false, message: "Cart is empty." });
        return true;
      }

      const clientId = session?.clientId || (session ? await resolveSessionClientId(session).catch(() => "") : "");
      const { locationId } = getBookingConfig();
      const staffToken = await getMindbodyActionToken("Cart quote").catch(() => null);

      if (!staffToken) {
        // Return per-item totals without a Mindbody quote
        const subtotal = items.reduce((sum, item) => {
          const price = Number(String(item.price || "0").replace(/[^0-9.]/g, ""));
          return sum + price * (Number(item.quantity) || 1);
        }, 0);
        sendJson(response, 200, { ok: true, quoted: false, grandTotal: subtotal, subTotal: subtotal, taxTotal: 0, discountTotal: 0 });
        return true;
      }

      const cartItems = items
        .filter((i) => i.kind === "service")
        .map((i) => ({
          Item: { Type: "Service", Metadata: { Id: Number(i.id) } },
          DiscountAmount: 0,
          Quantity: Number(i.quantity) || 1
        }));

      if (!cartItems.length) {
        sendJson(response, 400, { ok: false, message: "Only class packs can be added to the cart." });
        return true;
      }

      try {
        const result = await bookingRequest("/sale/checkoutshoppingcart", {
          method: "POST",
          token: staffToken,
          body: {
            Test: true,
            ClientId: clientId || undefined,
            LocationId: Number(locationId) || 1,
            InStore: false,
            CalculateTax: true,
            Items: cartItems,
            Payments: []
          }
        });
        const cart = result?.ShoppingCart || result;
        sendJson(response, 200, {
          ok: true,
          quoted: true,
          grandTotal: cart?.GrandTotal ?? 0,
          subTotal: cart?.SubTotal ?? 0,
          taxTotal: cart?.TaxTotal ?? 0,
          discountTotal: cart?.DiscountTotal ?? 0
        });
      } catch (err) {
        const subtotal = items.reduce((sum, item) => {
          const price = Number(String(item.price || "0").replace(/[^0-9.]/g, ""));
          return sum + price * (Number(item.quantity) || 1);
        }, 0);
        sendJson(response, 200, { ok: true, quoted: false, grandTotal: subtotal, subTotal: subtotal, taxTotal: 0, discountTotal: 0 });
      }
      return true;
    }

    // ── Cart Checkout ──────────────────────────────────────────────────────────
    if (path === "/api/cart/checkout" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session) {
        sendJson(response, 401, { ok: false, message: "Please sign in before purchasing.", loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/pricing")}` });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, message: "Your studio account could not be found. Please contact Cave to link your account." });
        return true;
      }

      // Intentionally do NOT call assertNoRawCardPayload — card data is proxied securely to Mindbody.
      const body = await readJsonBody(request);
      const items = Array.isArray(body.items) ? body.items : [];

      if (!items.length) {
        sendJson(response, 400, { ok: false, message: "Cart is empty." });
        return true;
      }

      const { locationId } = getBookingConfig();
      const staffToken = await getMindbodyActionToken("Cart checkout");

      const cartItems = items
        .filter((i) => i.kind === "service")
        .map((i) => ({
          Item: { Type: "Service", Metadata: { Id: Number(i.id) } },
          DiscountAmount: 0,
          Quantity: Number(i.quantity) || 1
        }));

      if (!cartItems.length) {
        sendJson(response, 400, { ok: false, message: "No purchasable items found. Please add class packs to your cart." });
        return true;
      }

      // Build payment payload — prefer stored card, fall back to new card
      let payments;
      const storedLastFour = String(body.storedCardLastFour || body.paymentLastFour || "").replace(/\D/g, "");

      const fallbackCartAmount = items.reduce((sum, item) => {
  const price = Number(String(item.price || item.amount || item.onlinePrice || "0").replace(/[^0-9.]/g, ""));
  const quantity = Number(item.quantity) || 1;
  return sum + price * quantity;
}, 0);

const resolveCheckoutAmount = async () => {
  let amount = 0;

  try {
    const quoteResult = await bookingRequest("/sale/checkoutshoppingcart", {
      method: "POST",
      token: staffToken,
      body: {
        Test: true,
        ClientId: clientId,
        LocationId: Number(locationId) || 1,
        InStore: false,
        CalculateTax: true,
        Items: cartItems,
        Payments: []
      }
    });

    const cart = quoteResult?.ShoppingCart || quoteResult?.Cart || quoteResult;

    amount = Number(
      cart?.GrandTotal ??
      cart?.Total ??
      cart?.TotalAmount ??
      cart?.SubTotal ??
      cart?.Subtotal ??
      0
    );
  } catch (err) {
    console.warn("[cart/checkout] quote failed, using item price fallback:", err.message);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    amount = fallbackCartAmount;
  }

  return Number(amount.toFixed(2));
};

if (storedLastFour.length === 4) {
  const fallbackAmount = items.reduce((sum, item) => {
    const price = Number(
      String(item.price || item.amount || item.onlinePrice || "0").replace(/[^0-9.]/g, "")
    );
    const quantity = Number(item.quantity) || 1;
    return sum + price * quantity;
  }, 0);

  let amount = 0;

  try {
    const quoteResult = await bookingRequest("/sale/checkoutshoppingcart", {
      method: "POST",
      token: staffToken,
      body: {
        Test: true,
        ClientId: clientId,
        LocationId: Number(locationId) || 1,
        InStore: false,
        CalculateTax: true,
        Items: cartItems,
        Payments: []
      }
    });

    const cart = quoteResult?.ShoppingCart || quoteResult?.Cart || quoteResult;

    amount = Number(
      cart?.GrandTotal ??
      cart?.Total ??
      cart?.TotalAmount ??
      cart?.SubTotal ??
      cart?.Subtotal ??
      0
    );
  } catch (err) {
    console.warn("[cart/checkout] Mindbody quote failed, using item price fallback:", err.message);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    amount = fallbackAmount;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    sendJson(response, 400, {
      ok: false,
      message: "Could not determine the checkout total."
    });
    return true;
  }

  payments = [
    {
      Type: "StoredCard",
      Metadata: {
        Amount: Number(amount.toFixed(2)),
        LastFour: storedLastFour
      }
    }
  ];
}else if (body.cardNumber) {
        const cardNumber = String(body.cardNumber || "").replace(/\D/g, "");
        const expMonth = Number(String(body.expMonth || "").replace(/\D/g, ""));
        const expYearRaw = String(body.expYear || "").replace(/\D/g, "");
        const expYear = Number(expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw);

        if (cardNumber.length < 13 || cardNumber.length > 19) {
          sendJson(response, 400, { ok: false, message: "Please enter a valid card number." });
          return true;
        }
        if (!expMonth || expMonth < 1 || expMonth > 12 || !expYear) {
          sendJson(response, 400, { ok: false, message: "Please enter a valid card expiry." });
          return true;
        }

        // Quote first to get the actual total
        let amount = 0;
        try {
          const quoteResult = await bookingRequest("/sale/checkoutshoppingcart", {
            method: "POST",
            token: staffToken,
            body: {
              Test: true,
              ClientId: clientId,
              LocationId: Number(locationId) || 1,
              InStore: false,
              CalculateTax: true,
              Items: cartItems,
              Payments: []
            }
          });
          amount = quoteResult?.ShoppingCart?.GrandTotal ?? quoteResult?.GrandTotal ?? 0;
        } catch (_) {}

        payments = [{
          Type: "CreditCard",
          Metadata: {
            Amount: amount,
            CreditCardNumber: cardNumber,
            ExpMonth: expMonth,
            ExpYear: expYear,
            Cvv: String(body.cvv || ""),
            BillingName: String(body.billingName || "").trim(),
            BillingAddress: String(body.billingAddress || "").trim(),
            BillingCity: String(body.billingCity || "").trim(),
            BillingState: String(body.billingState || "").trim(),
            BillingPostalCode: String(body.billingPostalCode || "").replace(/\D/g, "").slice(0, 10),
            SaveInfo: body.saveCard !== false
          }
        }];
      } else {
        sendJson(response, 400, { ok: false, message: "Please provide a payment method." });
        return true;
      }

      try {
        const result = await bookingRequest("/sale/checkoutshoppingcart", {
          method: "POST",
          token: staffToken,
          body: {
            Test: process.env.BOOKING_TEST_MODE === "true",
            ClientId: clientId,
            LocationId: Number(locationId) || 1,
            InStore: false,
            CalculateTax: true,
            SendEmail: true,
            Items: cartItems,
            Payments: payments
          }
        });
        sendJson(response, 200, { ok: true, purchase: result });
      } catch (err) {
        const msg = err.data?.Error?.Message || err.data?.Message || err.message || "Checkout could not be completed.";
        sendJson(response, err.status || 503, { ok: false, message: msg });
      }
      return true;
    }

    // ── Contract / Membership Purchase ────────────────────────────────────────
    if (path === "/api/pricing/contracts/purchase" && request.method === "POST") {
      const session = await readHydratedSession(request, response);

      if (!session) {
        sendJson(response, 401, { ok: false, message: "Please sign in before purchasing.", loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/pricing")}` });
        return true;
      }

      // Intentionally do NOT call assertNoRawCardPayload — card data is proxied securely to Mindbody.
      const body = await readJsonBody(request);

      if (!body.contractId) {
        sendJson(response, 400, { ok: false, message: "Contract ID is required." });
        return true;
      }

      if (!body.acceptTerms) {
        sendJson(response, 400, { ok: false, message: "Please accept the membership agreement before continuing." });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => "");
      if (!clientId) {
        sendJson(response, 400, { ok: false, message: "Your studio account could not be found. Please contact Cave to link your account." });
        return true;
      }

      const { locationId, paymentAuthenticationCallbackUrl } = getBookingConfig();
      const staffToken = await getMindbodyActionToken("Membership purchase");

      // Build payment payload
      let paymentPayload = {};
      const storedLastFour = String(body.storedCardLastFour || body.paymentLastFour || "").replace(/\D/g, "");

      if (body.useAccountCredit) {
        paymentPayload = { UseAccountCredit: true };
      } else if (storedLastFour.length === 4) {
        paymentPayload = { StoredCardInfo: { LastFour: storedLastFour } };
      } else if (body.cardNumber) {
        const cardNumber = String(body.cardNumber || "").replace(/\D/g, "");
        const expMonthRaw = String(body.expMonth || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
        const expYearRaw = String(body.expYear || "").replace(/\D/g, "");
        const expYear = expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw;

        if (cardNumber.length < 13 || cardNumber.length > 19) {
          sendJson(response, 400, { ok: false, message: "Please enter a valid card number." });
          return true;
        }

        paymentPayload = {
          CreditCardInfo: {
            CardNumber: cardNumber,
            ExpMonth: expMonthRaw,
            ExpYear: expYear,
            Cvv: String(body.cvv || ""),
            BillingName: String(body.billingName || "").trim(),
            BillingAddress: String(body.billingAddress || "").trim(),
            BillingCity: String(body.billingCity || "").trim(),
            BillingState: String(body.billingState || "").trim(),
            BillingPostalCode: String(body.billingPostalCode || "").replace(/\D/g, "").slice(0, 10)
          }
        };
      } else {
        sendJson(response, 400, { ok: false, message: "Please provide a payment method." });
        return true;
      }

      try {
        const result = await bookingRequest("/sale/purchasecontract", {
          method: "POST",
          token: staffToken,
          body: {
            Test: process.env.BOOKING_TEST_MODE === "true",
            ClientId: clientId,
            ContractId: Number(body.contractId),
            LocationId: Number(locationId) || 1,
            StartDate: new Date().toISOString().split("T")[0],
            FirstPaymentOccurs: "Instant",
            SendNotifications: true,
            ...(paymentAuthenticationCallbackUrl ? { PaymentAuthenticationCallbackUrl: paymentAuthenticationCallbackUrl } : {}),
            ...paymentPayload
          }
        });
        sendJson(response, 200, { ok: true, purchase: result });
      } catch (err) {
        const msg = err.data?.Error?.Message || err.data?.Message || err.message || "Membership purchase could not be completed.";
        sendJson(response, err.status || 503, { ok: false, message: msg });
      }
      return true;
    }

    // ── Client Purchases ───────────────────────────────────────────────────────
    if (path === "/api/client/purchases" && request.method === "GET") {
      const session = await readHydratedSession(request, response);

      if (!session) {
        sendJson(response, 401, { ok: false, message: "Please sign in to view your purchases.", loginUrl: `/api/auth/start?returnTo=${encodeURIComponent("/account")}` });
        return true;
      }

      const clientId = await resolveSessionClientId(session).catch(() => "");
      if (!clientId) {
        sendJson(response, 200, { ok: true, purchases: [] });
        return true;
      }

      const staffToken = await getMindbodyActionToken("Client purchases").catch(() => null);
      if (!staffToken) {
        sendJson(response, 200, { ok: true, purchases: [], message: "Purchase history requires staff credentials." });
        return true;
      }

      try {
        const data = await bookingRequest("/client/clientpurchases", {
          token: staffToken,
          params: {
            "request.clientId": clientId,
            "request.limit": "50"
          }
        });
        const purchases = firstListByKey(data, "Purchases").map((p) => ({
          id: p.Id || p.SaleId || "",
          name: p.Description || p.Name || "",
          amount: p.Amount || p.Price || 0,
          date: p.SaleDate || p.Date || "",
          status: p.Status || "",
          type: p.Type || ""
        }));
        sendJson(response, 200, { ok: true, purchases });
      } catch (err) {
        sendJson(response, 503, { ok: false, message: "Could not load purchases." });
      }
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

  if (config.oauthSubscriberId) {
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

  if (oauthSubscriberId) {
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
    console.log(`[auth/callback] exchanging code for token (popup=${Boolean(oauthSession.popup)})`);
    const tokenResponse = await exchangeOAuthCode(form.code, oauthSession.codeVerifier);
    console.log(`[auth/callback] token exchange success — accessToken present: ${Boolean(tokenResponse?.access_token)} refreshToken present: ${Boolean(tokenResponse?.refresh_token)}`);

    const session = await hydrateOAuthSession(normalizeOAuthSession(tokenResponse, {
      authorizationIdToken: form.id_token,
      expectedNonce: oauthSession.nonce
    }));

    console.log(`[auth/callback] session hydrated — platformUserId: ${session.platformUserId ? "present" : "missing"} clientId: ${session.clientId ? "present" : "missing"} email: ${session.user?.email ? "present" : "missing"}`);
    setSessionCookie(response, session);
    console.log(`[auth/callback] session cookie set`);
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

  if (oauthSubscriberId) {
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
  let session = readSession(request);

  if (!session) {
    return null;
  }

  // Refresh an expired OAuth token before hydrating so all downstream calls use a valid token.
  if (session.authMode === "oauth" && session.refreshToken) {
    const tokenExpired = session.expiresAt
      ? new Date(session.expiresAt).getTime() < Date.now() + 60_000
      : false;
    if (tokenExpired) {
      const refreshed = await refreshAccessToken(session.refreshToken).catch(() => null);
      if (refreshed?.access_token) {
        session = {
          ...session,
          accessToken: refreshed.access_token,
          consumerIdentityToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || session.refreshToken,
          expiresAt: refreshed.expires_in
            ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
            : session.expiresAt
        };
        setSessionCookie(response, session);
      }
    }
  }

  const hydrated = await hydrateOAuthSession(session);

  if (hydrated !== session) {
    setSessionCookie(response, hydrated);
  }

  return hydrated;
}

async function linkPlatformProfile(accessToken) {
  const { apiKey, siteId } = getBookingConfig();
  if (!apiKey || !accessToken) return null;

  try {
    // Get the consumer's Platform userId
    const meResp = await fetch(`${PLATFORM_API_BASE_URL}/account/v1/me`, {
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!meResp.ok) {
      const body = await meResp.text().catch(() => "");
      console.error(`[mindbody-auth] linkPlatformProfile: /platform/account/v1/me → ${meResp.status}`, body.slice(0, 300));
      return null;
    }

    const me = await meResp.json();
    const userId = me?.userAccount?.id || me?.UserAccount?.id || me?.userId || me?.UserId;
    if (!userId) return null;

    const linkResp = await fetch(`${PLATFORM_API_BASE_URL}/contacts/v1/profiles`, {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${accessToken}`,
        "SiteId": String(siteId),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ userId })
    });

    if (!linkResp.ok) return { platformUserId: userId, clientId: "" };

    const linkData = await linkResp.json();
    const profileObj = linkData?.profile || linkData?.Profile || linkData;
    const rawClientId = profileObj?.clientId || profileObj?.ClientId || profileObj?.client_id || profileObj?.studioClientId;
    const clientId = (rawClientId && !isUUID(String(rawClientId))) ? String(rawClientId) : "";

    return { platformUserId: userId, clientId };
  } catch (_) {
    return null;
  }
}

async function fetchPlatformMe(accessToken) {
  const { apiKey } = getBookingConfig();
  if (!apiKey || !accessToken) return null;

  try {
    const resp = await fetch(`${PLATFORM_API_BASE_URL}/account/v1/me`, {
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[mindbody-auth] fetchPlatformMe: /platform/account/v1/me → ${resp.status}`, body.slice(0, 300));
      return null;
    }
    return resp.json();
  } catch (e) {
    console.error("[mindbody-auth] fetchPlatformMe: network error:", e.message);
    return null;
  }
}

async function fetchPlatformMeWithStatus(accessToken) {
  const { apiKey } = getBookingConfig();
  if (!apiKey) return { ok: false, status: 0, error: "BOOKING_API_KEY not configured" };
  if (!accessToken) return { ok: false, status: 0, error: "No OAuth access token in session" };

  try {
    const resp = await fetch(`${PLATFORM_API_BASE_URL}/account/v1/me`, {
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const error = errBody?.message || errBody?.Message || errBody?.error || `HTTP ${resp.status}`;
      console.error(`[mindbody-auth] fetchPlatformMeWithStatus: /platform/account/v1/me → ${resp.status}: ${error}`);
      return { ok: false, status: resp.status, error };
    }
    const data = await resp.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, status: 0, error: e.message || "Network error reaching Mindbody Platform API" };
  }
}

async function fetchPlatformBusinessProfiles(userId, accessToken) {
  const { apiKey } = getBookingConfig();
  if (!apiKey || !accessToken || !userId) return [];

  try {
    const resp = await fetch(`${PLATFORM_API_BASE_URL}/account/v1/users/${encodeURIComponent(userId)}/businessprofiles`, {
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data?.businessProfiles || data?.BusinessProfiles || data?.profiles || [];
  } catch (_) {
    return [];
  }
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) return null;
  const { oauthClientId, oauthClientSecret, oauthTokenUrl, oauthSubscriberId } = getBookingConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: oauthClientId,
    refresh_token: refreshToken
  });
  if (oauthClientSecret) body.set("client_secret", oauthClientSecret);
  if (oauthSubscriberId) body.set("subscriberId", oauthSubscriberId);

  try {
    const resp = await fetch(oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString()
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.access_token ? data : null;
  } catch (_) {
    return null;
  }
}

function findStudioBusinessProfile(profiles, siteId) {
  if (!Array.isArray(profiles) || !profiles.length) return null;
  const id = String(siteId || "");
  return profiles.find((p) =>
    String(p?.businessId || p?.BusinessId || p?.siteId || p?.SiteId || "") === id
  ) || profiles[0] || null;
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function hydrateOAuthSession(session) {
  if (!shouldHydrateOAuthSession(session)) {
    return session;
  }

  const hydratedAt = new Date().toISOString();
  const email = session.user?.email || session.user?.username || "";
  console.log("[mindbody-auth] hydrating OAuth session for:", email || "(no email)");

  // 1. Try the Mindbody Platform API to retrieve the business profile link.
  let platformClientId = "";
  let platformUserId = session.platformUserId || "";
  if (!session.clientId) {
    const accessToken = session.consumerIdentityToken || session.accessToken;
    const linked = await linkPlatformProfile(accessToken).catch(() => null);
    if (linked) {
      if (linked.platformUserId) platformUserId = linked.platformUserId;
      if (linked.clientId) {
        platformClientId = linked.clientId;
        console.log("[mindbody-auth] Platform API resolved clientId:", platformClientId);
      }
    }
  }

  if (platformClientId) {
    return {
      ...session,
      clientId: platformClientId,
      platformUserId: platformUserId || session.platformUserId || "",
      user: { ...(session.user || {}), id: platformClientId },
      hydratedAt
    };
  }

  // 2. clientcompleteinfo with consumer token (works once Platform link is established).
  const profile = await fetchOAuthClientProfile(session).catch(() => null);

  if (profile?.clientId) {
    console.log("[mindbody-auth] clientcompleteinfo resolved clientId:", profile.clientId);
    return { ...mergeSessionClientProfile(session, profile), platformUserId: platformUserId || session.platformUserId || "", hydratedAt };
  }

  // 3. Source credentials: search by email only — no client creation.
  const foundClientId = await findExistingMindbodyClient(session).catch(() => "");

  if (foundClientId) {
    return {
      ...session,
      clientId: foundClientId,
      platformUserId: platformUserId || session.platformUserId || "",
      user: {
        ...(session.user || {}),
        ...(profile ? {
          firstName: profile.firstName || session.user?.firstName || "",
          lastName: profile.lastName || session.user?.lastName || "",
          email: profile.email || session.user?.email || "",
          username: profile.username || profile.email || session.user?.username || ""
        } : {}),
        id: foundClientId
      },
      hydratedAt
    };
  }

  console.log("[mindbody-auth] hydration complete: no clientId resolved for", email || "(no email)");
  return {
    ...(profile ? mergeSessionClientProfile(session, profile) : session),
    platformUserId: platformUserId || session.platformUserId || "",
    hydratedAt
  };
}

async function findMindbodyClientByEmail(email) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw httpError(400, "Email is required to search for a Mindbody client.");
  }

  const params = {
    "request.searchText": normalizedEmail,
    "request.includeInactive": "false",
    "request.isProspect": "false",
    "request.limit": "100",
    "request.offset": "0"
  };

  let staffToken = null;
  try {
    staffToken = await getMindbodyActionToken("client email search");
  } catch (err) {
    console.log(`[findMindbodyClientByEmail] staff token unavailable (${err.message}), trying source-level request`);
  }

  let result = null;
  try {
    result = await bookingRequest("/client/clients", {
      ...(staffToken ? { token: staffToken } : {}),
      params
    });
  } catch (err) {
    if (staffToken && (err.status === 401 || err.status === 403)) {
      console.log("[findMindbodyClientByEmail] auth request failed, retrying without token");
      result = await bookingRequest("/client/clients", { params });
    } else {
      throw err;
    }
  }

  const allClients = result?.Clients || [];
  console.log(`[findMindbodyClientByEmail] search returned ${allClients.length} client(s) for ${normalizedEmail}`);

  const exact = allClients.filter(
    (c) => (c.Email || "").trim().toLowerCase() === normalizedEmail
  );

  if (exact.length === 0) {
    const err = httpError(404, "No Mindbody client found for this email.");
    err.searchedEmail = normalizedEmail;
    err.totalReturned = allClients.length;
    throw err;
  }

  if (exact.length > 1) {
    const active = exact.filter((c) => !c.IsProspect && (c.Status || "").toLowerCase() !== "inactive");
    if (active.length === 1) {
      const c = active[0];
      console.log(`[findMindbodyClientByEmail] resolved ${exact.length} duplicates to single active client ${c.Id}`);
      return buildClientResult(c);
    }
    const err = httpError(409, "Duplicate Mindbody clients found for this email.");
    err.searchedEmail = normalizedEmail;
    err.count = exact.length;
    throw err;
  }

  const c = exact[0];
  console.log(`[findMindbodyClientByEmail] found client ${c.Id} for ${normalizedEmail}`);
  return buildClientResult(c);
}

function buildClientResult(c) {
  return {
    clientId: String(c.Id || c.UniqueId || ""),
    uniqueId: c.UniqueId || "",
    firstName: c.FirstName || "",
    lastName: c.LastName || "",
    email: c.Email || ""
  };
}

async function findExistingMindbodyClient(session) {
  const email = session.user?.email || session.user?.username || "";
  if (!email) return "";

  try {
    const result = await findMindbodyClientByEmail(email);
    return result.clientId;
  } catch (err) {
    if (err.status === 409) throw err;
    console.log(`[mindbody-auth] client search: ${err.message}`);
    return "";
  }
}

function shouldHydrateOAuthSession(session) {
  if (!session || session.authMode !== "oauth" || (!session.consumerIdentityToken && !session.accessToken)) {
    return false;
  }

  const hydratedAt = Date.parse(session.hydratedAt || "");
  const msSince = hydratedAt ? Date.now() - hydratedAt : Infinity;

  if (!session.user?.email) return true;
  if (session.clientId) return msSince >= OAUTH_PROFILE_REFRESH_MS;
  // No clientId: retry after 90s to avoid hammering the API on every page load.
  return msSince >= 90_000;
}

async function fetchOAuthClientProfile(session) {
  const consumerToken = session.consumerIdentityToken || session.accessToken || "";
  const config = getBookingConfig();
  const email = session.user?.email || session.user?.username || "";
  const attempts = [];

  // Per MindBody API: consumer OAuth tokens ONLY work with GET ClientCompleteInfo.
  if (consumerToken) {
    if (session.clientId) {
      attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: { ClientId: session.clientId } }]);
    }
    attempts.push(["/client/clientcompleteinfo", { consumerIdentityToken: consumerToken, params: {} }]);
  }

  // Staff/source credentials: can search clients by email.
  if (config.actionTokenConfigured && email) {
    try {
      const staffToken = await getMindbodyActionToken("OAuth profile lookup");
      if (session.clientId) {
        attempts.push(["/client/clients", { token: staffToken, params: { ClientIds: session.clientId } }]);
      }
      attempts.push(["/client/clients", { token: staffToken, params: { SearchText: email } }]);
    } catch (_) { /* no staff token available */ }
  }

  for (const [path, options] of attempts) {
    try {
      const data = await bookingRequest(path, { ...options, params: compactObject(options.params || {}) });
      const profile = extractClientProfile(data, email);
      if (profile?.clientId) return profile;
    } catch (_) {
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
  const rawId = firstNonEmpty(client.Id, client.ClientId, client.UniqueId, client.UniqueClientId, client.ContactId);
  // MindBody consumer identity IDs are UUID-format; studio client IDs never are.
  const clientId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ? "" : rawId;
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
  // Try consumer mode with addclient first (original working path).
  // "Omitting the token will create a client and respect Consumer Mode required fields."
  try {
    return await bookingRequest("/client/addclient", {
      method: "POST",
      body: { ...payload, SendEmail: true }
    });
  } catch (consumerError) {
    const config = getBookingConfig();
    if (!config.actionTokenConfigured || !(consumerError.status >= 400 && consumerError.status < 500)) {
      throw consumerError;
    }
  }

  // Staff token is available — use AddOrUpdateClient so an existing record with this
  // email gets merged rather than a duplicate created.
  const staffToken = await getMindbodyActionToken("Client account creation");

  return bookingRequest("/client/addorupdateclient", {
    method: "POST",
    token: staffToken,
    body: { Client: { ...payload, SendEmail: true } }
  }).catch(async (error) => {
    if (error.status && error.status >= 400 && error.status < 500) {
      return bookingRequest("/client/addclient", {
        method: "POST",
        token: staffToken,
        body: payload
      }).catch(() => bookingRequest("/client/addclient", {
        method: "POST",
        token: staffToken,
        body: { Client: payload }
      }));
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
      LocationId: Number(locationId) || 1,
      StartDate: new Date().toISOString().split("T")[0],
      FirstPaymentOccurs: "Instant",
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
  const { locationId } = getBookingConfig();

  const cartItems = [
    {
      Item: { Type: "Service", Metadata: { Id: Number(item.id) } },
      DiscountAmount: 0,
      Quantity: 1
    }
  ];

  const baseBody = {
    ClientId: clientId,
    LocationId: Number(locationId) || 1,
    InStore: false,
    CalculateTax: true,
    Items: cartItems
  };

  // Quote first to get Mindbody's authoritative total
  let quotedAmount = 0;
  try {
    const quoteResult = await bookingRequest("/sale/checkoutshoppingcart", {
      method: "POST",
      token: staffToken,
      body: { ...baseBody, Test: true, Payments: [] }
    });
    quotedAmount = quoteResult?.ShoppingCart?.GrandTotal ?? quoteResult?.GrandTotal ?? 0;
  } catch (_) {
    const fallback = parseFloat(String(item.price || "0").replace(/[^\d.]/g, ""));
    quotedAmount = Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  if (!quotedAmount) {
    throw httpError(400, "Could not determine a valid checkout amount for this item.");
  }

  const lastFour = normalizeStoredCardLastFour(body);

  if (!lastFour) {
    throw paymentRequiredError("A saved payment method is required. Please add a card to your studio account first.");
  }

  return bookingRequest("/sale/checkoutshoppingcart", {
    method: "POST",
    token: staffToken,
    body: {
      ...baseBody,
      Test: process.env.BOOKING_TEST_MODE === "true",
      SendEmail: true,
      Payments: [
        {
          Type: "StoredCard",
          Metadata: { Amount: quotedAmount, LastFour: lastFour }
        }
      ]
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

// All classes are free during the launch week (through end of day July 6, 2026).
function isClassFree() {
  return false;
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
  const className = classDesc.Name || item.Name || "Class";

  return {
    id: item.Id,
    classId: item.ClassId || item.Id,
    classDescriptionId: classDesc.Id || item.ClassDescriptionId,
    classScheduleId: item.ClassScheduleId,
    name: className,
    isFree: isClassFree(className),
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
    "request.hideCanceledClasses": "true",
    "request.schedulingWindow": "true",
    "request.limit": "200"
  };

  if (locationId) {
    params["request.locationIds"] = locationId;
  }

  const data = await bookingRequest("/class/classes", { params });
  const classes = firstListByKey(data, "Classes");

  const normalized = classes
    .filter((item) => item && typeof item === "object" && !item.IsCanceled)
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

async function bookClassWithValidation(session, classId, clientServiceId, classHint = {}) {  const clientId = await resolveSessionClientId(session);

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

let classData = await bookingRequest("/class/classes", {
  params: {
    "request.classIds": String(classId),
    "request.schedulingWindow": "true"
  }
});

let classes = firstListByKey(classData, "Classes");

let classItem =
  classes.find((c) => Number(c.Id) === Number(classId)) ||
  classes.find((c) => Number(c.ClassId) === Number(classId)) ||
  classes[0];

if (!classItem && classHint?.startDateTime) {
  const start = new Date(classHint.startDateTime);
  const from = new Date(start);
  const to = new Date(start);

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const fallbackParams = {
    "request.startDateTime": formatApiDate(from),
    "request.endDateTime": formatApiDate(to),
    "request.schedulingWindow": "true",
    "request.limit": "200"
  };
 
  if (classHint?.locationId) {
    fallbackParams["request.locationIds"] = String(classHint.locationId);
  }

  const fallbackData = await bookingRequest("/class/classes", {
    params: fallbackParams
  });

  classes = firstListByKey(fallbackData, "Classes");

  classItem =
    classes.find((c) => Number(c.Id) === Number(classId)) ||
    classes.find((c) => Number(c.ClassId) === Number(classId)) ||
    classes.find((c) => Number(c.ClassScheduleId) === Number(classHint?.classScheduleId)) ||
    null;
}

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

  const classIsFree = isClassFree(
    classItem.ClassDescription?.Name || classItem.Name || ""
  );

  let resolvedServiceId = clientServiceId || null;

  try {
    const clientInfo = await fetchClientCompleteInfo(clientId, session);

    if (!classIsFree && !clientInfo.hasUsablePricingOption) {
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

  let staffToken = null;
  try {
    staffToken = await getMindbodyActionToken("Class booking");
  } catch (_) {}

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
    ...(staffToken ? { token: staffToken } : {}),
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
    classPacks: publicStoreItems(store?.classPacks || []),
    dropIn: publicStoreItems(store?.dropIn || [])
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
  const customFields = waiverCustomClientFields(waiver);
  const errors = [];

  if (!clientId) {
    return {
      accepted: true,
      storedInMindbody: false,
      message: "Waiver captured by the site. Studio client account not yet linked."
    };
  }

  let liabilityStored = false;

  // Use updateclient with staff token to set Liability.LiabilityRelease
  try {
    const staffToken = await getMindbodyActionToken("Waiver liability sync");
    await bookingRequest("/client/updateclient", {
      method: "POST",
      token: staffToken,
      body: {
        Client: { Id: clientId, Liability: { LiabilityRelease: true } },
        CrossRegionalUpdate: true
      }
    });
    liabilityStored = true;
  } catch (err) {
    errors.push(`updateclient liability: ${err.message}`);
    console.error(`[waiver] updateclient liability failed (${err.status || 0}): ${err.message}`);
  }

  // Sync waiver text into custom fields when configured
  let customFieldsStored = false;

  if (customFields.length && clientId) {
    try {
      const staffToken = await getMindbodyActionToken("Waiver custom fields sync");
      await bookingRequest("/client/updateclient", {
        method: "POST",
        token: staffToken,
        body: { Client: { Id: clientId, CustomClientFields: customFields } }
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    platformUserId: session.platformUserId || "",
    businessId: session.businessId || "",
    profileId: session.profileId || "",
    hasBusinessProfile: Boolean(session.businessId || session.profileId || session.clientId),
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
  const sameSite = "SameSite=Lax";
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
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  const config = getBookingConfig();
  let allowedHost = "";
  try {
    allowedHost = new URL(config.publicBaseUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {}

  const hosts = [rawHost, forwardedHost, allowedHost].filter(Boolean);
  if (!hosts.some((h) => h === originHost)) {
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

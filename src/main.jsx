import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, CalendarDays, ChevronLeft, ChevronRight, Instagram, Menu, MessageCircle, Minus, Plus, Search, Send, X } from "lucide-react";
import { FALLBACK_CACHE } from "./studioCache";
import homeHeroPoster from "../assets/cave-home-hero.jpeg";
import homeHeroVideo from "../assets/cave-home-hero-video.mp4";
import "./styles.css";

const ROUTES = {
  home: "/",
  pricing: "/pricing",
  newbie: "/newbie",
  memberships: "/memberships",
  classPacks: "/class-packs",
  dropIn: "/drop-in",
  schedule: "/schedule",
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  login: "/login",
  signup: "/signup",
  account: "/account",
  terms: "/terms",
  policies: "/policies"
};

const NAV_ITEMS = [
  { label: "Home", href: ROUTES.home, page: "home" },
  { label: "Pricing", href: ROUTES.pricing, page: "pricing" },
  { label: "Schedule", href: ROUTES.schedule, page: "schedule" },
  { label: "About Us", href: ROUTES.about, page: "about" },
  { label: "Contact Us", href: ROUTES.contact, page: "contact" },
  { label: "FAQ", href: ROUTES.faq, page: "faq" }
];

const FOOTER_LINKS = [
  { label: "About Us", href: ROUTES.about, page: "about" },
  { label: "Contact Us", href: ROUTES.contact, page: "contact" },
  { label: "FAQ", href: ROUTES.faq, page: "faq" },
  { label: "TOS", href: ROUTES.terms, page: "terms" },
  { label: "Policies", href: ROUTES.policies, page: "policies" }
];

const PAGE_TITLES = {
  home: "Cave Modern Pilates",
  pricing: "Pricing | Cave Modern Pilates",
  newbie: "Newbie Promo | Cave Modern Pilates",
  memberships: "Memberships | Cave Modern Pilates",
  "class-packs": "Class Packs | Cave Modern Pilates",
  "drop-in": "Drop In | Cave Modern Pilates",
  schedule: "Schedule | Cave Modern Pilates",
  about: "About Us | Cave Modern Pilates",
  contact: "Contact | Cave Modern Pilates",
  faq: "FAQ | Cave Modern Pilates",
  login: "Login | Cave Modern Pilates",
  signup: "Sign Up | Cave Modern Pilates",
  account: "Account | Cave Modern Pilates",
  terms: "TOS | Cave Modern Pilates",
  policies: "Policies | Cave Modern Pilates"
};

const PAGE_DESCRIPTIONS = {
  home: "Cave Modern Pilates is a modern reformer Pilates studio in Orland Park for high-intensity, low-impact strength, control, and confidence.",
  pricing: "View Cave Modern Pilates pricing, newbie intro offers, monthly memberships, and class packs loaded from the studio booking system.",
  newbie: "Newbie intro offers for first-time Cave Modern Pilates clients.",
  memberships: "Monthly Cave Modern Pilates memberships with current options from the studio booking system.",
  "class-packs": "Cave Modern Pilates class packs with current pricing from the studio booking system.",
  "drop-in": "Drop in to Cave Modern Pilates for a single reformer Pilates class. No commitment required.",
  schedule: "View the Cave Modern Pilates class schedule and book reformer Pilates classes online.",
  about: "Learn about Cave Modern Pilates, its mission, and founder Hala.",
  contact: "Contact Cave Modern Pilates in Orland Park for class, private session, and membership questions.",
  faq: "Answers to Cave Modern Pilates booking, cancellation, membership, refund, privacy, and studio policy questions.",
  login: "Sign in to your Cave Modern Pilates account.",
  signup: "Create your Cave Modern Pilates client account and complete the first-class liability waiver.",
  account: "View your Cave Modern Pilates account, bookings, credits, and memberships.",
  terms: "Cave Modern Pilates terms of service and membership terms.",
  policies: "Cave Modern Pilates studio policies, cancellation rules, privacy policy, and liability waiver."
};

const SITE_URL = "https://www.cavemodernpilates.com";
const STUDIO_CACHE_POLL_MS = 5 * 60 * 1000;
const CONTACT_EMAIL = "support@cavemodernpilates.com";
const CONTACT_PHONE = "7085715730";
const CONTACT_PHONE_DISPLAY = "(708) 571-5730";
const INSTAGRAM_URL = "https://www.instagram.com/cavemodernpilates/";
const TIKTOK_URL = "https://www.tiktok.com/@cavemodernpilates";
const SOCIAL_HANDLE = "@cavemodernpilates";

const PRICING_CATEGORIES = [
  {
    key: "memberships",
    page: "memberships",
    href: ROUTES.memberships,
    title: "Memberships",
    eyebrow: "Monthly rhythm"
  },
  {
    key: "classPacks",
    page: "class-packs",
    href: ROUTES.classPacks,
    title: "Class Packs",
    eyebrow: "Flexible credits"
  },
  {
    key: "dropIn",
    page: "drop-in",
    href: ROUTES.dropIn,
    title: "Drop In",
    eyebrow: "No commitment"
  },
  {
    key: "newbie",
    page: "newbie",
    href: ROUTES.newbie,
    title: "Newbie Promo",
    eyebrow: "First visit"
  }
];

const FAQ_CATEGORIES = ["All", "Getting Started", "Booking", "Memberships", "Purchases", "Studio Policy", "Privacy"];

const FAQ_ITEMS = [
  {
    id: "welcome",
    category: "Getting Started",
    question: "What is Cave Modern Pilates?",
    answer: [
      "Cave Modern Pilates was created to provide a modern, empowering, results-driven fitness experience where movement, strength, and community come together.",
      "Classes are designed to challenge and support all fitness levels through intentional programming, expert instruction, and a focused studio environment."
    ]
  },
  {
    id: "first-class",
    category: "Getting Started",
    question: "Do I need Pilates experience before my first class?",
    answer: [
      "No. Our classes are built to meet you where you are. If you are new, arrive early so the instructor can help you get comfortable with the reformer and studio flow.",
      "If you want extra setup time, a private session can be a good first step."
    ]
  },
  {
    id: "grip-socks",
    category: "Studio Policy",
    question: "Are grip socks required?",
    answer: [
      "Yes. Grip socks are required for the safety and hygiene of everyone in the studio. Barefoot participation is not permitted."
    ]
  },
  {
    id: "cancel-class",
    category: "Booking",
    question: "What is the class cancellation window?",
    answer: [
      "Classes must be canceled at least 12 hours before the scheduled class start time.",
      "Reservations canceled within 12 hours of class start time are considered late cancellations."
    ]
  },
  {
    id: "late-cancel",
    category: "Booking",
    question: "What happens if I late cancel?",
    answer: [
      "Drop-in guests, package holders, and members will be charged a $20 late cancellation fee if the cancellation is made within 12 hours of your scheduled class.",
      "Unlimited members with a 6-month contract receive 1 late cancellation exemption per term. Unlimited members with a 12-month contract receive 2 late cancellation exemptions per term.",
      "Once all exemptions have been used, each additional late cancellation will result in a $20 late cancellation fee."
    ]
  },
  {
    id: "no-show",
    category: "Booking",
    question: "What happens if I no-show a class?",
    answer: [
      "If you do not attend your scheduled class and do not cancel before class begins, you will be considered a no-show.",
      "Drop-In Guests: You will forfeit the full cost of the class you booked. No refunds will be issued.",
      "Class Package Members: One class credit will be forfeited.",
      "Unlimited Members (6-Month): You receive one (1) no-show exemption during your membership term. After your exemption has been used, each additional no-show will incur a $30 no-show fee.",
      "Unlimited Members (12-Month): You receive two (2) no-show exemptions during your membership term. After both exemptions have been used, each additional no-show will incur a $30 no-show fee.",
      "Repeated no-shows may result in temporary booking restrictions at management's discretion."
    ]
  },
  {
    id: "membership-classes",
    category: "Memberships",
    question: "How do 4-class and 8-class memberships work?",
    answer: [
      "A 4-Class Membership includes four classes per month. An 8-Class Membership includes eight classes per month.",
      "Unused classes expire at the end of each billing cycle and do not roll over into future months.",
      "Memberships are set to auto-renew each month for the duration of your commitment term."
    ]
  },
  {
    id: "unlimited",
    category: "Memberships",
    question: "How does unlimited membership work?",
    answer: [
      "Unlimited Membership holders may attend one class per day.",
      "Multiple classes in the same calendar day are not permitted unless approved by management.",
      "Unlimited memberships are set to auto-renew monthly for the duration of the commitment term."
    ]
  },
  {
    id: "auto-renewal",
    category: "Memberships",
    question: "Do memberships auto-renew?",
    answer: [
      "Yes. All memberships are set to auto-renew. Membership fees are automatically billed each month for the duration of your agreement.",
      "To stop renewal after your commitment term ends, you must provide written notice at least 30 days before your next billing date."
    ]
  },
  {
    id: "cancel-membership",
    category: "Memberships",
    question: "How do I cancel my membership?",
    answer: [
      "After completing the selected commitment term, members must provide written notice at least 30 days before the next billing date.",
      "Members who cancel before completing their commitment term remain responsible for the remaining payments due under the agreement."
    ]
  },
  {
    id: "renewal-notice",
    category: "Memberships",
    question: "What if I do not want to renew?",
    answer: [
      "Please send written notice at least 30 days before your next billing date if you do not plan to renew a membership or package.",
      "If notice is not received in time, the next scheduled renewal may still process."
    ]
  },
  {
    id: "purchase-policy",
    category: "Purchases",
    question: "Can memberships or class packages be shared or transferred?",
    answer: [
      "No. Memberships and class packages are personal to the purchaser and may not be transferred, shared, exchanged, or assigned to another individual.",
      "Purchases become active on the purchase date unless otherwise specified."
    ]
  },
  {
    id: "refunds",
    category: "Purchases",
    question: "What is the return and refund policy?",
    answer: [
      "All sales are final. Membership fees, class packages, workshops, events, retail purchases, enrollment fees, and promotional purchases are non-refundable and non-transferable.",
      "No refunds or credits are issued for unused classes, missed appointments, schedule conflicts, change of residence, change of employment, personal preference, or failure to use purchased services."
    ]
  },
  {
    id: "medical-freeze",
    category: "Purchases",
    question: "Can my membership be frozen for medical reasons?",
    answer: [
      "In the event of a documented medical condition that prevents participation, Cave may, at its sole discretion, consider a temporary membership freeze or account credit.",
      "Supporting documentation may be required."
    ]
  },
  {
    id: "payment-method",
    category: "Purchases",
    question: "Do I need a payment method on file?",
    answer: [
      "Members are responsible for maintaining a valid payment method on file.",
      "By enrolling in a membership, members authorize Cave to charge the payment method provided for recurring membership fees, late cancellation fees, no-show fees, and other authorized account charges."
    ]
  },
  {
    id: "conduct",
    category: "Studio Policy",
    question: "What conduct is expected in the studio?",
    answer: [
      "Members and guests are expected to act respectfully toward instructors, staff, and fellow clients at all times.",
      "Cave reserves the right to refuse service or terminate memberships without refund for behavior deemed disruptive, inappropriate, unsafe, or in violation of studio policies."
    ]
  },
  {
    id: "schedule-changes",
    category: "Studio Policy",
    question: "Can schedules, instructors, or policies change?",
    answer: [
      "Yes. Cave Modern Pilates may modify schedules, instructors, class offerings, operating hours, services, and studio policies at any time.",
      "While every effort is made to maintain consistency, Cave does not guarantee the availability of any specific instructor, class format, or class time."
    ]
  },
  {
    id: "fitness-risk",
    category: "Studio Policy",
    question: "What should I know about fitness risk and medical conditions?",
    answer: [
      "All participants acknowledge that fitness activities involve inherent risks, including muscle strain, injury, illness, or other physical complications.",
      "Members are encouraged to consult a physician before beginning any fitness program and to stop immediately if they experience pain, dizziness, shortness of breath, or any concerning symptoms."
    ]
  },
  {
    id: "privacy",
    category: "Privacy",
    question: "How does Cave use my personal information?",
    answer: [
      "Cave may collect information such as your name, address, phone number, email address, payment information, emergency contact information, and health-related information voluntarily provided by you.",
      "This information is used to manage memberships, process payments, communicate studio updates, schedule classes, improve customer experience, and comply with legal obligations."
    ]
  },
  {
    id: "privacy-share",
    category: "Privacy",
    question: "Does Cave sell or share my personal information?",
    answer: [
      "Cave does not sell, rent, or share personal information with third parties for marketing purposes.",
      "Information may be shared with trusted service providers necessary for payment processing, scheduling, customer support, or legal compliance."
    ]
  }
];

const LIABILITY_WAIVER_SECTIONS = [
  {
    title: "Acknowledgment of Risks",
    paragraphs: [
      "Participant understands and acknowledges that participation in Pilates classes, fitness instruction, stretching, exercise activities, use of exercise equipment, and related activities at Cave Pilates involves inherent risks, including but not limited to:",
      "Participant acknowledges that these risks may result from Participant's own actions, the actions of others, the condition of the premises or equipment, or the negligence of Cave Pilates and its owners, employees, contractors, instructors, agents, or affiliates."
    ],
    bullets: [
      "Muscle strains, sprains, tears, and soreness",
      "Slips, falls, and other accidents",
      "Aggravation of pre-existing medical conditions",
      "Cardiovascular events, including heart attack or stroke",
      "Serious bodily injury, disability, paralysis, or death"
    ]
  },
  {
    title: "Assumption of Risk",
    paragraphs: [
      "Participant voluntarily assumes all risks associated with participation in any activities at Cave Pilates, whether known or unknown, foreseeable or unforeseeable, including risks arising from ordinary negligence.",
      "Participant certifies that they are physically capable of participating in fitness activities and have no medical condition that would prevent safe participation. Participant understands that Cave Pilates does not provide medical advice and recommends consulting a physician before beginning any exercise program."
    ]
  },
  {
    title: "Waiver and Release",
    paragraphs: [
      "To the fullest extent permitted by Illinois law, Participant hereby waives, releases, discharges, and covenants not to sue Cave Pilates, LLC, its owners, members, managers, employees, instructors, contractors, agents, affiliates, successors, landlords, and assigns (collectively, the Released Parties) from any and all claims, liabilities, demands, actions, damages, costs, or expenses arising out of or related to:"
    ],
    bullets: [
      "Personal injury",
      "Illness or medical complications",
      "Property damage",
      "Disability",
      "Death",
      "Any other loss or harm arising from or connected with Participant's use of the facilities, participation in classes or activities, or presence on the premises, including claims arising from the ordinary negligence of the Released Parties."
    ]
  },
  {
    title: "Indemnification",
    paragraphs: [
      "Participant agrees to indemnify and hold harmless the Released Parties from and against any claims, damages, liabilities, costs, or attorney's fees arising out of Participant's actions, conduct, or participation in activities at Cave Pilates."
    ]
  },
  {
    title: "Medical Treatment Authorization",
    paragraphs: [
      "Participant authorizes Cave Pilates to obtain emergency medical treatment on Participant's behalf if deemed necessary. Participant understands and agrees that they are solely responsible for any medical expenses incurred."
    ]
  },
  {
    title: "Pregnancy and Medical Conditions",
    paragraphs: [
      "Participant acknowledges that if pregnant, recently postpartum, injured, or suffering from any medical condition, Participant has consulted with a healthcare provider before participating and assumes all associated risks."
    ]
  },
  {
    title: "Photography and Media Release",
    paragraphs: [
      "Participant grants Cave Pilates permission to photograph or record Participant during classes or events and to use such images or recordings for promotional, advertising, and social media purposes without compensation, unless Participant provides written notice opting out."
    ]
  },
  {
    title: "Governing Law",
    paragraphs: [
      "This Agreement shall be governed by and construed in accordance with the laws of the State of Illinois."
    ]
  },
  {
    title: "Severability",
    paragraphs: [
      "If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall remain in full force and effect."
    ]
  },
  {
    title: "Entire Agreement",
    paragraphs: [
      "This Agreement constitutes the entire agreement between the parties relating to the subject matter herein and supersedes all prior discussions or understandings."
    ]
  },
  {
    title: "Acknowledgment and Voluntary Execution",
    paragraphs: [
      "Participant acknowledges that they have carefully read this Agreement, fully understand its contents, understand that they are waiving substantial legal rights, and sign it voluntarily and without inducement."
    ]
  }
];

function getPageFromPath() {
  const leaf = window.location.pathname.split("/").filter(Boolean).pop() || "index";
  const name = leaf.replace(".html", "");

  if (name === "index") {
    return "home";
  }

  if (name === "starter") {
    return "newbie";
  }

  return ["pricing", "newbie", "memberships", "class-packs", "drop-in", "schedule", "about", "contact", "faq", "login", "signup", "account", "terms", "policies"].includes(name) ? name : "home";
}

function cleanInternalUrl(value, fallback = ROUTES.home) {
  const text = String(value || fallback).trim();

  if (!text || text.includes("://") || text.startsWith("//") || text.startsWith("mailto:") || text.startsWith("tel:") || text.startsWith("#")) {
    return text;
  }

  let clean = text
    .replace(/^\/?index\.html(?=([?#]|$))/, "/")
    .replace(/\.html(?=([?#]|$))/g, "");

  if (!clean.startsWith("/") && !clean.startsWith("/api/")) {
    clean = `/${clean}`;
  }

  return clean;
}

function normalizeStudioCache(rawCache) {
  const source = rawCache && typeof rawCache === "object" ? rawCache : FALLBACK_CACHE;
  const booking = source.booking || {};
  const waiver = source.waiver || FALLBACK_CACHE.waiver || {};
  const location = source.location || FALLBACK_CACHE.location || {};
  const schedule = Array.isArray(source.schedule) ? source.schedule : [];
  const memberships = Array.isArray(source.memberships) ? source.memberships : [];

  return {
    ...source,
    booking: {
      ...booking,
      scheduleUrl: cleanInternalUrl(booking.scheduleUrl || ROUTES.schedule, ROUTES.schedule)
    },
    memberships: filterPublicPricingItems(memberships),
    store: normalizeStoreGroups(source.store || {}),
    waiver: {
      ...waiver,
      url: cleanInternalUrl(waiver.url || `${ROUTES.policies}#liability-waiver`, `${ROUTES.policies}#liability-waiver`)
    },
    schedule: schedule.map((item) => ({
      ...item,
      bookUrl: cleanInternalUrl(item.bookUrl || (item.id ? `${ROUTES.schedule}?classId=${item.id}` : ROUTES.schedule), ROUTES.schedule)
    })),
    location: {
      ...location,
      email: CONTACT_EMAIL,
      phone: CONTACT_PHONE,
      phoneDisplay: CONTACT_PHONE_DISPLAY
    }
  };
}

function normalizeStoreGroups(store) {
  const allClassPacks = filterPublicPricingItems(store.classPacks || []);
  return {
    ...store,
    newbie: filterPublicPricingItems(store.newbie || store.starter || []),
    memberships: filterPublicPricingItems(store.memberships || []),
    classPacks: allClassPacks.filter((item) => !isDropInItem(item)),
    dropIn: allClassPacks.filter((item) => isDropInItem(item))
  };
}

function isDropInItem(item) {
  return /\bdrop[- ]?in\b/.test(String(item?.name || item?.sourceName || "").toLowerCase());
}

function filterPublicPricingItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(isPublicPricingItem).map((item) => ({
    ...item,
    category: item.category === "starter" ? "newbie" : item.category,
    requiresWaiver: item.requiresWaiver !== false,
    sellOnline: item.sellOnline !== false
  }));
}

function isPublicPricingItem(item) {
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

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    error.loginUrl = data.loginUrl;
    error.details = data.details;
    error.data = data;
    throw error;
  }

  return data;
}

function friendlyApiErrorMessage(error, fallback = "That request could not be completed.") {
  const message = error?.message || "";

  if (isStudioConnectionMessage(message)) {
    return "Online booking is almost ready. Please contact Cave to finish this for now.";
  }

  if (error?.status === 402) {
    const setupUrl = paymentSetupUrlFromError(error);
    return `${genericRequestFailed(message) ? "A saved payment method is required." : message || "A saved payment method is required."} Use a saved studio card${setupUrl ? " or open Add Card first" : ""}.`;
  }

  if (error?.status === 501) {
    return "This secure step is almost ready. Please contact Cave to finish this for now.";
  }

  if (error?.status === 401) {
    return message || "Please sign in first.";
  }

  return genericRequestFailed(message) ? fallback : message || fallback;
}

function friendlyAddCardErrorMessage(error) {
  if (error?.status === 501) {
    return "Add Card is almost ready. Please contact Cave to save a card for now.";
  }

  if (error?.status === 401) {
    return "Please sign in before adding a card.";
  }

  return friendlyApiErrorMessage(error, "The secure add-card page could not be opened.");
}

function paymentSetupUrlFromError(error) {
  return error?.details?.paymentSetupUrl || error?.data?.details?.paymentSetupUrl || error?.data?.paymentSetupUrl || "";
}

function genericRequestFailed(value) {
  return /^request failed\.?$/i.test(String(value || "").trim());
}

function isStudioConnectionMessage(value) {
  return /source credential|staff identity|server-side user token|source credentials user token|usertoken\/issue|user token site id|requested site|studio client account|mindbody rejected|could not match/i.test(String(value || ""));
}

function normalizeLiveClassForDisplay(item) {
  return {
    id: item.id,
    classScheduleId: item.classScheduleId,
    date: item.date,
    time: item.time,
    startDateTime: item.startTime,
    className: item.name || "Class",
    instructor: item.instructor || "Varies",
    spotsLeft: typeof item.spotsRemaining === "number" ? item.spotsRemaining : "",
    status: item.status || "",
    canBook: Boolean(item.canBook),
    canWaitlist: Boolean(item.canWaitlist),
    duration: item.duration,
    location: item.location || "",
    isFree: Boolean(item.isFree)
  };
}

function useStudioCache(activePage) {
  const [cache, setCache] = useState(() => normalizeStudioCache(FALLBACK_CACHE));
  const [cacheLoading, setCacheLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let pollTimer;

    async function loadCache() {
      if (window.location.protocol === "file:") {
        if (isMounted) setCacheLoading(false);
        return;
      }

      try {
        const shouldRefreshSchedule = activePage === "schedule";
        const primaryEndpoint = shouldRefreshSchedule ? "/api/studio-cache?fresh=schedule" : "/data/studio-cache.json";
        let response = await fetch(primaryEndpoint, { cache: "no-store" });

        if (!response.ok && shouldRefreshSchedule) {
          response = await fetch("/data/studio-cache.json", { cache: "no-store" });
        }

        if (!response.ok) {
          if (isMounted) setCacheLoading(false);
          return;
        }

        const freshCache = await response.json();

        if (isMounted) {
          setCache(normalizeStudioCache(freshCache));
          setCacheLoading(false);
        }
      } catch (error) {
        console.info("Using embedded studio cache snapshot.", error);
        if (isMounted) setCacheLoading(false);
      }
    }

    loadCache();
    pollTimer = window.setInterval(
      loadCache,
      activePage === "schedule" ? Math.min(STUDIO_CACHE_POLL_MS, 2 * 60 * 1000) : STUDIO_CACHE_POLL_MS
    );

    return () => {
      isMounted = false;
      window.clearInterval(pollTimer);
    };
  }, [activePage]);

  return { cache, cacheLoading };
}

function useClientSession() {
  const [clientSession, setClientSessionState] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSession = (showLoading = false) => {
      if (showLoading) {
        setIsSessionLoading(true);
      }

      apiRequest("/api/auth/session")
        .then((data) => {
          if (isMounted) {
            setClientSessionState(data.session || null);
          }
        })
        .catch(() => {
          if (isMounted) {
            setClientSessionState(null);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsSessionLoading(false);
          }
        });
    };
    const refreshOnFocus = () => loadSession(false);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        loadSession(false);
      }
    };

    loadSession(true);
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const setClientSession = (session) => {
    setIsSessionLoading(false);
    setClientSessionState(session);
  };

  return [clientSession, setClientSession, isSessionLoading];
}

function App() {
  const [page, setPage] = useState(getPageFromPath);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [clientSession, setClientSession, isSessionLoading] = useClientSession();
  const { cache, cacheLoading } = useStudioCache(page);
  const isInterior = page !== "home";

  useEffect(() => {
    const onPopState = () => {
      setPage(getPageFromPath());
      window.scrollTo({ top: 0 });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLES[page] || PAGE_TITLES.home;
    updatePageMeta(page);
    document.body.classList.toggle("interior", isInterior);
    document.body.classList.toggle("menu-open", menuOpen);

    return () => {
      document.body.classList.remove("interior", "menu-open");
    };
  }, [isInterior, menuOpen, page]);

  useEffect(() => {
    const updateHeader = () => setIsScrolled(window.scrollY > 16);

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  const bookingUrl = cleanInternalUrl(cache.booking?.scheduleUrl, ROUTES.schedule);
  const shellClass = `app-shell${isInterior ? " interior" : ""}`;

  return (
    <div className={shellClass}>
      <Header
        activePage={page}
        bookingUrl={bookingUrl}
        clientSession={clientSession}
        isScrolled={isScrolled || isInterior}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((value) => !value)}
        onCloseMenu={() => setMenuOpen(false)}
      />
      <main className={isInterior ? `page-main page-${page}` : undefined}>
        <Page
          page={page}
          cache={cache}
          bookingUrl={bookingUrl}
          clientSession={clientSession}
          setClientSession={setClientSession}
          isSessionLoading={isSessionLoading}
          cacheLoading={cacheLoading}
        />
      </main>
      <Footer location={cache.location} />
      <AiAssistant page={page} bookingUrl={bookingUrl} clientSession={clientSession} />
    </div>
  );
}

function updatePageMeta(page) {
  const title = PAGE_TITLES[page] || PAGE_TITLES.home;
  const description = PAGE_DESCRIPTIONS[page] || PAGE_DESCRIPTIONS.home;
  const canonicalPath = page === "home" ? "/" : `/${page}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  setMetaTag("description", description);
  setMetaTag("og:title", title, "property");
  setMetaTag("og:description", description, "property");
  setMetaTag("og:type", "website", "property");
  setMetaTag("og:url", canonicalUrl, "property");
  setMetaTag("twitter:card", "summary_large_image", "name");
  setMetaTag("twitter:title", title, "name");
  setMetaTag("twitter:description", description, "name");
  setCanonical(canonicalUrl);
  setStructuredData(page);
}

function setMetaTag(key, content, attribute = "name") {
  if (!content) {
    return;
  }

  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function setCanonical(href) {
  let tag = document.head.querySelector('link[rel="canonical"]');

  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }

  tag.setAttribute("href", href);
}

function setStructuredData(page) {
  const id = "cave-modern-pilates-jsonld";
  let tag = document.getElementById(id);

  if (!tag) {
    tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = id;
    document.head.appendChild(tag);
  }

  tag.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "HealthClub",
    name: "Cave Modern Pilates",
    url: SITE_URL,
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE,
    address: {
      "@type": "PostalAddress",
      streetAddress: "31 Orland Square Drive, Suite B",
      addressLocality: "Orland Park",
      addressRegion: "IL",
      postalCode: "60462",
      addressCountry: "US"
    },
    sameAs: [INSTAGRAM_URL, TIKTOK_URL],
    mainEntityOfPage: page === "home" ? SITE_URL : `${SITE_URL}/${page}`
  });
}

function Header({ activePage, clientSession, isScrolled, menuOpen, onMenuToggle, onCloseMenu }) {
  const accountHref = clientSession?.signedIn ? ROUTES.account : authStartHref(ROUTES.account, { force: true });
  const accountLabel = clientSession?.signedIn ? "Account" : "Login";

  return (
    <>
      <header className={`site-header${isScrolled ? " is-scrolled" : ""}${menuOpen ? " menu-active" : ""}`}>
        <a className="wordmark" href={ROUTES.home} aria-label="Cave Modern Pilates home">
          Cave Modern Pilates
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <a key={item.page} href={item.href} aria-current={activePage === item.page ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <InstagramLink />
          <TikTokLink />
          <a className="login-button" href={accountHref} aria-current={["login", "signup", "account"].includes(activePage) ? "page" : undefined}>
            {accountLabel}
          </a>
        </div>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={onMenuToggle}
        >
          {menuOpen ? <X aria-hidden="true" size={22} strokeWidth={1.7} /> : <Menu aria-hidden="true" size={22} strokeWidth={1.7} />}
          <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>
      </header>

      <div className={`mobile-menu${menuOpen ? " is-open" : ""}`} id="mobile-menu" aria-hidden={!menuOpen} hidden={!menuOpen}>
        <nav aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => (
            <a key={item.page} href={item.href} aria-current={activePage === item.page ? "page" : undefined} onClick={onCloseMenu}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="mobile-book" href={accountHref} onClick={onCloseMenu}>
          {accountLabel}
        </a>
      </div>
    </>
  );
}

function Page({ page, cache, bookingUrl, clientSession, setClientSession, isSessionLoading, cacheLoading }) {
  if (page === "pricing") {
    return <PricingLandingPage store={cache.store || {}} memberships={cache.memberships || []} />;
  }

  const pricingCategory = PRICING_CATEGORIES.find((category) => category.page === page);

  if (pricingCategory) {
    return <PricingCategoryPage category={pricingCategory} store={cache.store || {}} memberships={cache.memberships || []} clientSession={clientSession} />;
  }

  if (page === "schedule") {
    return <SchedulePage schedule={cache.schedule || []} bookingUrl={bookingUrl} clientSession={clientSession} spotsLoading={cacheLoading} />;  }

  if (page === "about") {
    return <AboutPage />;
  }

  if (page === "contact") {
    return <ContactPage location={cache.location || {}} />;
  }

  if (page === "faq") {
    return <FaqPage />;
  }

  if (page === "login") {
    return <LoginPage bookingUrl={bookingUrl} clientSession={clientSession} setClientSession={setClientSession} />;
  }

  if (page === "signup") {
    return <SignupPage clientSession={clientSession} bookingUrl={bookingUrl} />;
  }

  if (page === "account") {
    return <AccountPage clientSession={clientSession} setClientSession={setClientSession} bookingUrl={bookingUrl} isSessionLoading={isSessionLoading} />;
  }

  if (page === "terms") {
    return <TermsPage />;
  }

  if (page === "policies") {
    return <PoliciesPage />;
  }

  return <HomePage memberships={cache.memberships || []} store={cache.store || {}} bookingUrl={bookingUrl} />;
}

function HomePage({ memberships, store, bookingUrl }) {
  const pricingPreview = getHomePricingPreview(store, memberships);

  return (
    <>
      <section className="hero" id="home" aria-label="Cave Modern Pilates home">
        <video className="hero-video" autoPlay muted loop playsInline poster={homeHeroPoster} aria-hidden="true">
          <source src={homeHeroVideo} type="video/mp4" />
        </video>
        <a className="hero-book" href={bookingUrl}>
          Book Now
        </a>

        <svg className="hero-wave" viewBox="0 0 1440 185" preserveAspectRatio="none" aria-hidden="true">
          <path className="wave-line" d="M0 54C170 18 309 42 468 70C634 100 781 133 982 111C1144 93 1272 42 1440 46" />
          <path className="wave-fill" d="M0 54C170 18 309 42 468 70C634 100 781 133 982 111C1144 93 1272 42 1440 46V185H0Z" />
        </svg>
      </section>

      <section className="home-pricing-preview section">
        <div className="section-heading center">
          <h2>Pricing</h2>
          <p>Newbie offers, memberships, and class packs.</p>
        </div>

        <div className="home-pricing-grid">
          {pricingPreview.map((category) => (
            <article className="home-pricing-card" key={category.title}>
              <div>
                <p className="home-pricing-label">{category.label}</p>
                <h3>{category.title}</h3>
              </div>
              <p className="home-pricing-from">{category.priceLabel}</p>
              <div className="home-pricing-options">
                {category.items.map((item) => (
                  <div className="home-pricing-option" key={`${category.title}-${item.name}-${item.price}`}>
                    <span>{item.name}</span>
                    <strong>{item.price}</strong>
                  </div>
                ))}
              </div>
              <a className="home-pricing-link" href={category.href}>
                View {category.title}
              </a>
            </article>
          ))}
        </div>

        <div className="button-row compact">
          <a className="pill-button black" href={ROUTES.pricing}>
            View All Pricing
          </a>
        </div>
      </section>

      <section className="booking-app app-coming-soon section">
        <div className="app-copy">
          <h2>App coming soon.</h2>
          <p>Book online for now. The Cave app is next.</p>
          <div className="app-buttons">
            <a className="pill-button black" href={bookingUrl}>
              View Schedule
            </a>
          </div>
        </div>
        <div className="phone-art" aria-hidden="true">
          <div className="phone-screen">
            <small>Coming Soon</small>
          </div>
        </div>
      </section>
    </>
  );
}

function getHomePricingPreview(store, memberships) {
  const fallbackStore = FALLBACK_CACHE.store || {};
  const classPacks = store.classPacks?.length ? store.classPacks : memberships.length ? memberships : fallbackStore.classPacks || [];
  const newbieOffers = store.newbie?.length ? store.newbie : store.starter?.length ? store.starter : fallbackStore.newbie || fallbackStore.starter || [];
  const membershipOptions = store.memberships?.length ? store.memberships : fallbackStore.memberships || [];

  const visibleClassPacks = classPacks.filter((item) => !String(item.name).toLowerCase().includes("training"));

  return [
    {
      title: "Newbie Promo",
      label: "First visit",
      href: ROUTES.newbie,
      priceLabel: priceRangeLabel(newbieOffers),
      items: previewStoreItems(newbieOffers, "newbie", 2)
    },
    {
      title: "Memberships",
      label: "Monthly",
      href: ROUTES.memberships,
      priceLabel: priceRangeLabel(membershipOptions, "/mo"),
      items: previewStoreItems(groupMembershipItems(membershipOptions), "memberships", 3)
    },
    {
      title: "Class Packs",
      label: "Flexible",
      href: ROUTES.classPacks,
      priceLabel: priceRangeLabel(visibleClassPacks),
      items: previewStoreItems(visibleClassPacks, "classPacks", 3)
    }
  ];
}

function previewStoreItems(items, categoryKey, limit) {
  return items.slice(0, limit).map((item) => ({
    name: homePricingName(item, categoryKey),
    price: item.price || "Ask studio"
  }));
}

function homePricingName(item, categoryKey) {
  if (categoryKey === "memberships") {
    if (item.sessions) {
      return `${item.sessions} classes / month`;
    }
  }

  return String(item.name || item.sourceName || "Pricing option").replace(/\s+/g, " ").trim();
}

function groupMembershipItems(items) {
  const bySessionCount = new Map();

  items.forEach((item) => {
    const key = String(item.sessions || item.name);
    const current = bySessionCount.get(key);

    if (!current || priceNumber(item.price) < priceNumber(current.price)) {
      bySessionCount.set(key, item);
    }
  });

  return [...bySessionCount.values()].sort((a, b) => Number(a.sessions || 0) - Number(b.sessions || 0));
}

function priceRangeLabel(items, suffix = "") {
  const prices = items.map((item) => item.price).filter(Boolean).sort((a, b) => priceNumber(a) - priceNumber(b));

  if (!prices.length) {
    return "Ask studio";
  }

  return `From ${compactPrice(prices[0])}${suffix}`;
}

function priceNumber(price) {
  const parsed = Number(String(price || "").replace(/[^0-9.]/g, ""));

  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compactPrice(price) {
  return String(price || "").replace(/\.00\b/, "");
}

function SimpleInfoPage({ title, kicker, copy }) {
  return (
    <>
      <section className="page-hero">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="page-intro">{copy}</p>
      </section>
    </>
  );
}

function TermsPage() {
  return (
    <>
      <section className="page-hero">
        <h1>Terms of service.</h1>
        <p className="page-intro">Memberships, class packs, and promo offers are final sale and follow the studio terms shown before checkout.</p>
      </section>
      <section className="policy-section section page-section">
        <div className="policy-copy">
          <h2>Cave Modern Pilates Membership Agreement</h2>
          <p>Memberships include the class count and commitment term shown on the pricing page. Membership fees are automatically billed each month for the duration of the agreement.</p>
          <p>Unused classes expire at the end of each billing cycle and do not roll over. Memberships are non-transferable, non-refundable, and may not be shared.</p>
          <p>Members who cancel before completing their commitment term remain responsible for the remaining payments due under the agreement.</p>
        </div>
      </section>
    </>
  );
}

function PoliciesPage() {
  return (
    <>
      <section className="page-hero">
        <h1>Policies and waiver.</h1>
        <p className="page-intro">Review studio expectations, cancellation rules, and sign the first-class liability waiver.</p>
      </section>

      <section className="waiver-document section page-section" id="liability-waiver">
        <div className="waiver-heading">
          <h2>Cave Pilates, LLC</h2>
          <p>31 Orland Square Drive, Suite B<br />Orland Park, Illinois 60462</p>
          <p>This Waiver and Release of Liability Agreement is entered into by and between Cave Pilates, LLC and the undersigned participant.</p>
        </div>

        <div className="waiver-body" id="waiver-copy">
          {LIABILITY_WAIVER_SECTIONS.map((section, index) => (
            <section className="waiver-clause" key={section.title}>
              <h3>{index + 1}. {section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="waiver-signature">
          <h3>Sign the waiver</h3>
          <StandaloneWaiverForm />
        </div>
      </section>

      <section className="policy-section section page-section">
        <div className="policy-copy">
          <h2>Cancellation and No-Show Policy</h2>
          <p>Reservations canceled less than twelve hours before class are treated as late cancellations. Package holders forfeit the reserved class credit.</p>
          <p>Clients who reserve a class and do not attend without canceling are considered no-shows.</p>
        </div>
      </section>
    </>
  );
}

function PricingLandingPage({ store, memberships }) {
  return (
    <section className="pricing-choice section page-section" aria-label="Choose a pricing category">
      <div className="pricing-choice-grid">
        {PRICING_CATEGORIES.map((category) => (
          <a className={`pricing-choice-card ${category.key}`} href={category.href} key={category.key}>
            <span className="pricing-choice-image" aria-hidden="true" />
            <span className="pricing-choice-copy">
              <strong>{category.title}</strong>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function useSavedCards(clientSession) {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!clientSession?.signedIn) {
      setCards([]);
      setLoaded(true);
      return;
    }

    let isMounted = true;
    apiRequest("/api/client/saved-cards")
      .then((data) => {
        if (isMounted) {
          setCards(Array.isArray(data.cards) ? data.cards : []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCards([]);
          setLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [clientSession, refreshTick]);

  return { cards, loaded, refresh: () => setRefreshTick((n) => n + 1) };
}

function AddCardForm({ clientSession, onSuccess, onCancel }) {
  const [form, setForm] = useState({ number: "", expiry: "", name: "", zip: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatCardNumber = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const handleChange = (field, transform) => (e) => {
    const val = transform ? transform(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", message: "" });

    const digits = form.number.replace(/\D/g, "");
    if (digits.length < 13) {
      setStatus({ type: "error", message: "Please enter a valid card number." });
      return;
    }

    const expiryMatch = form.expiry.match(/^(\d{2})\/(\d{2,4})$/);
    if (!expiryMatch) {
      setStatus({ type: "error", message: "Please enter expiry as MM/YY." });
      return;
    }
    const [, expMonth, expYearShort] = expiryMatch;
    const expYear = expYearShort.length === 2 ? `20${expYearShort}` : expYearShort;

    if (!form.name.trim()) {
      setStatus({ type: "error", message: "Please enter the name on the card." });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/api/client/add-card", {
        method: "POST",
        body: {
          cardNumber: digits,
          expMonth,
          expYear,
          billingName: form.name.trim(),
          billingPostalCode: form.zip.trim()
        }
      });
      setStatus({ type: "success", message: "Card saved. You can now select it below." });
      onSuccess?.();
    } catch (error) {
      if (error.loginUrl) { window.location.href = error.loginUrl; return; }
      setStatus({ type: "error", message: error.message || "Could not save card. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="add-card-form" onSubmit={handleSubmit} autoComplete="on">
      <p className="add-card-form-title">Add a payment card</p>
      <label className="payment-safe-field">
        <span>Card number</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={form.number}
          onChange={handleChange("number", formatCardNumber)}
          maxLength={19}
          required
        />
      </label>
      <div className="add-card-two-col">
        <label className="payment-safe-field">
          <span>Expiry</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={form.expiry}
            onChange={handleChange("expiry", formatExpiry)}
            maxLength={5}
            required
          />
        </label>
        <label className="payment-safe-field">
          <span>ZIP</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="60601"
            value={form.zip}
            onChange={handleChange("zip", (v) => v.replace(/\D/g, "").slice(0, 10))}
            maxLength={10}
          />
        </label>
      </div>
      <label className="payment-safe-field">
        <span>Name on card</span>
        <input
          type="text"
          autoComplete="cc-name"
          placeholder="Full name"
          value={form.name}
          onChange={handleChange("name")}
          required
        />
      </label>
      <p className="payment-safe-note">Card info is sent securely to the studio — Cave never stores card numbers.</p>
      <div className="add-card-actions">
        <button type="submit" className="pill-button black" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Card"}
        </button>
        {onCancel ? (
          <button type="button" className="text-button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        ) : null}
      </div>
      {status.message ? <p className={`form-status ${status.type}`}>{status.message}</p> : null}
    </form>
  );
}

function PricingCategoryPage({ category, store, memberships, clientSession }) {
  const groups = pricingStoreGroups(store, memberships);
  const items = groups[category.key] || [];
  const { cards: savedCards, loaded: cardsLoaded, refresh: refreshCards } = useSavedCards(clientSession);
  const [selectedCard, setSelectedCard] = useState("");
  const [manualLastFour, setManualLastFour] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState({});
  const [expandedTerms, setExpandedTerms] = useState({});
  const [purchaseState, setPurchaseState] = useState({ itemId: "", type: "", message: "", paymentSetupUrl: "" });

  const effectiveLastFour = selectedCard === "__manual__" ? manualLastFour : selectedCard;

  const purchaseReturnTo = (item) => `${category.href}?purchase=${encodeURIComponent(`${item.kind}-${item.id}`)}`;

  const addCardForItem = async (item) => {
    setPurchaseState({ itemId: item.id, type: "loading", message: "Checking secure card setup...", paymentSetupUrl: "" });

    try {
      const data = await apiRequest("/api/mindbody/add-card-url");

      if (!data.ok || !data.url) {
        setPurchaseState({
          itemId: item.id,
          type: "error",
          message: data.message || "Online card setup is being configured. Please contact the studio or try again later.",
          paymentSetupUrl: ""
        });
        return;
      }

      window.open(data.url, "_blank", "noopener");
      setPurchaseState({ itemId: item.id, type: "info", message: "Add your card in the tab that just opened, then come back and refresh.", paymentSetupUrl: data.url });
    } catch (error) {
      if (error.loginUrl) {
        window.location.href = error.loginUrl;
        return;
      }

      setPurchaseState({
        itemId: item.id,
        type: "error",
        message: "Online card setup is being configured. Please contact the studio or try again later.",
        paymentSetupUrl: ""
      });
    }
  };

  const buyItem = async (item) => {
    setPurchaseState({ itemId: item.id, type: "", message: "", paymentSetupUrl: "" });
    const storedCardLastFour = effectiveLastFour.replace(/\D/g, "");

    if (item.requiresTerms && !acceptedTerms[item.id]) {
      setPurchaseState({ itemId: item.id, type: "error", message: "Please accept the membership agreement before continuing.", paymentSetupUrl: "" });
      return;
    }

    if (!/^\d{4}$/.test(storedCardLastFour)) {
      setPurchaseState({
        itemId: item.id,
        type: "error",
        message: savedCards.length ? "Please select a saved card." : "Enter the last four digits of the saved studio card you want to use.",
        paymentSetupUrl: ""
      });
      return;
    }

    setPurchaseState({ itemId: item.id, type: "loading", message: "Starting checkout...", paymentSetupUrl: "" });

    try {
      await apiRequest("/api/store/purchase", {
        method: "POST",
        body: {
          itemId: item.id,
          kind: item.kind,
          acceptWaiver: true,
          acceptTerms: Boolean(item.requiresTerms ? acceptedTerms[item.id] : true),
          storedCardLastFour,
          returnTo: purchaseReturnTo(item)
        }
      });

      setPurchaseState({
        itemId: item.id,
        type: "success",
        message: "Purchase complete. Check your account for confirmation.",
        paymentSetupUrl: ""
      });
    } catch (error) {
      if (error.loginUrl) {
        window.location.href = error.loginUrl;
        return;
      }

      setPurchaseState({
        itemId: item.id,
        type: "error",
        message: friendlyApiErrorMessage(error, "Checkout could not be completed."),
        paymentSetupUrl: paymentSetupUrlFromError(error)
      });
    }
  };

  return (
    <>
      <section className={`pricing-category-heading section page-section ${category.key}`}>
        <h1>{category.title}</h1>
      </section>

      <section className="pricing-store pricing-store-page section" id="purchase-options" aria-label={`${category.title} purchase options`}>
        <PricingStoreSection
          id={`pricing-${category.page}`}
          title={category.title}
          items={items}
          category={category}
          purchaseState={purchaseState}
          savedCards={savedCards}
          cardsLoaded={cardsLoaded}
          selectedCard={selectedCard}
          manualLastFour={manualLastFour}
          acceptedTerms={acceptedTerms}
          expandedTerms={expandedTerms}
          clientSession={clientSession}
          onCardSelect={setSelectedCard}
          onManualLastFourChange={setManualLastFour}
          onToggleTerms={(itemId) => setExpandedTerms((current) => ({ ...current, [itemId]: !current[itemId] }))}
          onAcceptTerms={(itemId, value) => setAcceptedTerms((current) => ({ ...current, [itemId]: value }))}
          onCardAdded={refreshCards}
          onBuy={buyItem}
        />
      </section>
    </>
  );
}

function pricingStoreGroups(store, legacyMemberships) {
  const fallback = FALLBACK_CACHE.store || {};
  const groups = {
    newbie: Array.isArray(store?.newbie) && store.newbie.length ? store.newbie : Array.isArray(store?.starter) && store.starter.length ? store.starter : fallback.newbie || fallback.starter || [],
    memberships: Array.isArray(store?.memberships) && store.memberships.length ? store.memberships : fallback.memberships || [],
    classPacks: Array.isArray(store?.classPacks) && store.classPacks.length ? store.classPacks : fallback.classPacks || [],
    dropIn: Array.isArray(store?.dropIn) && store.dropIn.length ? store.dropIn : fallback.dropIn || []
  };

  if (!groups.classPacks.length && legacyMemberships?.length) {
    const allLegacy = legacyMemberships.map((item) => ({
      ...item,
      kind: "service",
      category: "classPacks",
      requiresWaiver: true,
      requiresTerms: false
    }));
    groups.dropIn = allLegacy.filter((item) => isDropInItem(item));
    groups.classPacks = allLegacy.filter((item) => !isDropInItem(item));
  }

  groups.memberships = sortMembershipItems(groups.memberships);
  groups.classPacks = sortBySessionsAsc(groups.classPacks);

  return groups;
}

function sortMembershipItems(items) {
  return [...items].sort((a, b) => {
    const sessA = Number(a.sessions) || 9999;
    const sessB = Number(b.sessions) || 9999;
    if (sessA !== sessB) return sessA - sessB;
    return (Number(a.commitmentMonths) || 0) - (Number(b.commitmentMonths) || 0);
  });
}

function sortBySessionsAsc(items) {
  return [...items].sort((a, b) => (Number(a.sessions) || 0) - (Number(b.sessions) || 0));
}

function PricingStoreSection({ id, title, items, category, purchaseState, savedCards, cardsLoaded, selectedCard, manualLastFour, acceptedTerms, expandedTerms, clientSession, onCardSelect, onManualLastFourChange, onToggleTerms, onAcceptTerms, onCardAdded, onBuy }) {
  return (
    <div className="pricing-store-section" id={id}>
      <div className="pricing-store-heading">
        <h2>{title}</h2>
      </div>

      {items.length ? (
        <div className={`pricing-card-grid ${category.key}`}>
          {items.map((item) => (
            <PricingCard
              item={item}
              category={category}
              purchaseState={purchaseState}
              savedCards={savedCards}
              cardsLoaded={cardsLoaded}
              selectedCard={selectedCard}
              manualLastFour={manualLastFour}
              acceptedTerms={acceptedTerms}
              expandedTerms={expandedTerms}
              clientSession={clientSession}
              onCardSelect={onCardSelect}
              onManualLastFourChange={onManualLastFourChange}
              onToggleTerms={onToggleTerms}
              onAcceptTerms={onAcceptTerms}
              onCardAdded={onCardAdded}
              onBuy={onBuy}
              key={`${item.kind}-${item.id}-${item.name}`}
            />
          ))}
        </div>
      ) : (
        <p className="empty-schedule">No online pricing options are available in this category right now.</p>
      )}
    </div>
  );
}

function PricingCard({ item, category, purchaseState, savedCards, cardsLoaded, selectedCard, manualLastFour, acceptedTerms, expandedTerms, clientSession, onCardSelect, onManualLastFourChange, onToggleTerms, onAcceptTerms, onCardAdded, onBuy }) {
  const isLoading = purchaseState.itemId === item.id && purchaseState.type === "loading";
  const message = purchaseState.itemId === item.id ? purchaseState.message : "";
  const messageType = purchaseState.itemId === item.id ? purchaseState.type : "";
  const paymentSetupUrl = purchaseState.itemId === item.id ? purchaseState.paymentSetupUrl : "";
  const titleLines = pricingTitleLines(item, category);
  const isTermsExpanded = Boolean(expandedTerms?.[item.id]);
  const hasAcceptedTerms = Boolean(acceptedTerms?.[item.id]);
  const [showCardForm, setShowCardForm] = useState(false);

  return (
    <article className={`pricing-card ${category.key}`}>
      <div>
        <p className="pricing-card-price">{item.price || "Ask studio"}</p>
        <h3>
          {titleLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h3>
        {item.description ? <p className="pricing-card-desc">{item.description}</p> : null}
      </div>

      <div className="pricing-card-actions">
        {!clientSession?.signedIn ? (
          <a className="pill-button black" href={`/api/auth/start?returnTo=${encodeURIComponent(category.href)}`}>
            Sign In to Buy
          </a>
        ) : (
          <>
            <div className="payment-safe-box">
              {cardsLoaded && savedCards.length > 0 ? (
                <>
                  <label className="payment-safe-field">
                    <span>Saved card</span>
                    <select
                      value={selectedCard}
                      onChange={(event) => onCardSelect(event.target.value)}
                      aria-label="Select saved card"
                    >
                      <option value="">Select a card</option>
                      {savedCards.map((card) => (
                        <option key={card.lastFour} value={card.lastFour}>
                          {card.cardType ? `${card.cardType} ` : ""}ending in {card.lastFour}
                          {card.expMonth && card.expYear ? ` (exp ${card.expMonth}/${card.expYear})` : ""}
                        </option>
                      ))}
                      <option value="__manual__">Enter last 4 manually</option>
                    </select>
                  </label>
                  {selectedCard === "__manual__" ? (
                    <label className="payment-safe-field">
                      <span>Last 4 digits</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        placeholder="1234"
                        value={manualLastFour}
                        onChange={(event) => onManualLastFourChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        aria-label="Last four digits of card"
                      />
                    </label>
                  ) : null}
                </>
              ) : (
                <label className="payment-safe-field">
                  <span>Card on file — last 4</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="Last 4"
                    value={manualLastFour}
                    onChange={(event) => onManualLastFourChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    aria-label={`Last four digits for ${item.name}`}
                  />
                </label>
              )}
              <p className="payment-safe-note">Full card numbers never touch this site.</p>
              {showCardForm ? (
                <AddCardForm
                  clientSession={clientSession}
                  onSuccess={() => { setShowCardForm(false); onCardAdded?.(); }}
                  onCancel={() => setShowCardForm(false)}
                />
              ) : (
                <button className="payment-add-card" type="button" disabled={isLoading} onClick={() => setShowCardForm(true)}>
                  {cardsLoaded && savedCards.length === 0 ? "Add Card to Studio Account" : "Add / Update Card"}
                </button>
              )}
            </div>

            {item.requiresTerms && item.agreementTerms ? (
              <div className="agreement-box">
                <button
                  className="agreement-toggle"
                  type="button"
                  onClick={() => onToggleTerms?.(item.id)}
                  aria-expanded={isTermsExpanded}
                >
                  {isTermsExpanded ? "Hide" : "View"} Membership Agreement
                </button>
                {isTermsExpanded ? (
                  <div className="agreement-text">{item.agreementTerms}</div>
                ) : null}
                <label className="agreement-accept">
                  <input
                    type="checkbox"
                    checked={hasAcceptedTerms}
                    onChange={(event) => onAcceptTerms?.(item.id, event.target.checked)}
                  />
                  <span>I have read and agree to the membership agreement</span>
                </label>
              </div>
            ) : null}

            <button
              className="book-class"
              type="button"
              disabled={isLoading || !item.id || item.sellOnline === false}
              onClick={() => onBuy(item)}
            >
              {isLoading ? "Starting..." : "Buy Now"}
            </button>
          </>
        )}

        {message ? <p className={`row-status ${messageType}`}>{message}</p> : null}
        {paymentSetupUrl ? (
          <a className="payment-setup-link" href={paymentSetupUrl} target="_blank" rel="noopener noreferrer">
            Open secure add-card page
          </a>
        ) : null}
      </div>
    </article>
  );
}

function cleanPricingName(name) {
  return String(name || "").replace(/\s+/g, " ").replace(/\bpack-/i, "pack - ").trim();
}

function pricingTitleLines(item, category) {
  const cleanName = cleanPricingName(item.name);

  if (category.key !== "memberships") {
    return [cleanName];
  }

  const match = cleanName.match(/^(.+?)\s*-\s*(.+)$/);

  if (!match) {
    return [cleanName];
  }

  return [match[1].trim(), match[2].trim()];
}

function SchedulePage({ schedule, bookingUrl, clientSession, spotsLoading }) {
  return (
    <section className="schedule section page-section">
      <ScheduleList schedule={schedule} bookingUrl={bookingUrl} clientSession={clientSession} spotsLoading={spotsLoading} />
    </section>
  );
}

function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <h1>Built for women who show up for themselves.</h1>
          <p>
            Cave Modern Pilates is a focused studio for intentional movement, full-body strength,
            and the kind of confidence that follows you outside the room.
          </p>
        </div>
      </section>

      <section className="about-mission">
        <div className="about-mission-copy">
          <p className="about-mission-lead">
            Our mission is simple: empower women through movement.
          </p>
          <div className="about-mission-body">
            <p>
              We believe fitness is about more than physical transformation. It is about confidence,
              resilience, strength, and showing up for yourself even on the hardest days.
            </p>
            <p>
              Cave was created to be a space where women can challenge themselves, grow stronger,
              and become part of a supportive community. Whether you're celebrating a win, navigating
              a difficult season, or simply showing up for yourself one workout at a time, we want
              you to leave every class feeling better than when you walked in.
            </p>
            <p>
              Our goal is to help you build strength that extends beyond the studio walls. We want
              every woman who enters Cave to feel seen, supported, and capable of more than she
              thought possible.
            </p>
          </div>
        </div>
      </section>

      <section className="about-founder">
        <div className="about-founder-image" aria-label="Cave Modern Pilates founder Hala" />
        <div className="about-founder-copy">
          <h2>Meet Hala.</h2>
          <p className="about-founder-lead">
            Founder of Cave Modern Pilates, Hala built the studio from a personal belief that
            movement can help women feel stronger, steadier, and more connected to themselves.
          </p>
          <div className="about-founder-story">
            <p>
              Her fitness journey began long before Pilates. During one of the hardest seasons of
              her life, training became the thing that helped her get out of bed, rebuild
              confidence, and create structure when she needed it most.
            </p>
            <p>
              After years of strength training, she found Modern Pilates and connected with the
              intentional pace, mind-body focus, controlled tension, and full-body challenge.
            </p>
            <p>
              Cave was created for women who want to challenge themselves, support one another,
              and leave each class feeling more capable than when they walked in.
            </p>
          </div>
          <p className="about-welcome">No matter what season you're in, there's a place for you at Cave.</p>
        </div>
      </section>
    </div>
  );
}

function ContactPage({ location }) {
  const contact = getContactDetails(location);
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(contact.mapQuery)}&output=embed`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact.mapQuery)}`;

  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });

  const updateField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setStatus({ type: "error", message: "Please fill in all fields." });
      return;
    }
    setStatus({ type: "loading", message: "" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ type: "error", message: data.message || "Something went wrong. Please try again." });
      } else {
        setStatus({ type: "success", message: "Message sent! We’ll get back to you soon." });
        setForm({ name: "", email: "", message: "" });
      }
    } catch {
      setStatus({ type: "error", message: "Could not send your message. Please try again." });
    }
  };

  return (
    <>
      <section className="contact-hero">
        <div className="contact-hero-copy">
          <h1>Contact Us</h1>
          <p>Questions before class, private sessions, or memberships? Send us a note and we’ll get back to you.</p>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>
        </div>
        <form className="contact-form-card" onSubmit={handleSubmit} noValidate aria-label="Contact form">
          <label>
            Name
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={updateField}
              autoComplete="name"
              required
              placeholder="Your name"
              disabled={status.type === "loading" || status.type === "success"}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={updateField}
              autoComplete="email"
              required
              placeholder="you@example.com"
              disabled={status.type === "loading" || status.type === "success"}
            />
          </label>
          <label className="message-line">
            Message
            <textarea
              name="message"
              value={form.message}
              onChange={updateField}
              required
              rows={4}
              placeholder="How can we help?"
              disabled={status.type === "loading" || status.type === "success"}
            />
          </label>
          {status.message ? (
            <p className={`contact-form-status contact-form-status--${status.type}`}>{status.message}</p>
          ) : null}
          {status.type !== "success" ? (
            <button className="pill-button black" type="submit" disabled={status.type === "loading"}>
              {status.type === "loading" ? "Sending…" : "Send Message"}
            </button>
          ) : null}
        </form>
      </section>

      <section className="contact-location" aria-label="Studio location">
        <div className="contact-map" aria-label={`Map for ${contact.address}`}>
          <iframe
            title="Cave Modern Pilates location map"
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="contact-location-copy">
          <h2>Location</h2>
          <p>{contact.address}</p>
          {contact.parking ? <p className="contact-note">{contact.parking}</p> : null}
          <a className="pill-button black" href={mapsUrl}>
            Open in Maps
          </a>
        </div>
      </section>
    </>
  );
}

function FaqPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [openId, setOpenId] = useState("");

  const filteredItems = FAQ_ITEMS.filter((item) => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const searchable = [item.question, item.category, ...item.answer].join(" ").toLowerCase();
    const matchesQuery = searchable.includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <>
      <section className="faq-hero">
        <div className="faq-hero-copy">
          <h1>What to know before class.</h1>
          <p>Find quick answers about booking, memberships, cancellations, refunds, and studio policies.</p>
        </div>
        <div className="faq-hero-card" aria-label="Policy highlights">
          <span>12-hour cancellation window</span>
          <span>$28 no-show fee</span>
          <span>30-day notice for non-renewals</span>
        </div>
      </section>

      <section className="faq-interactive section page-section" aria-label="Frequently asked questions">
        <div className="faq-tools">
          <label className="faq-search">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">Search FAQ</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cancellation, memberships, refunds..."
              type="search"
            />
          </label>
          <div className="faq-tabs" aria-label="FAQ categories">
            {FAQ_CATEGORIES.map((category) => (
              <button
                className={activeCategory === category ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setActiveCategory(category);
                  setOpenId("");
                }}
                key={category}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="faq-layout">
          <aside className="faq-policy-panel" aria-label="Quick policy guide">
            <p className="kicker">Quick Guide</p>
            <strong>Book with confidence.</strong>
            <p>Most questions come down to three rules: cancel early, keep payment current, and treat the studio like a shared focused space.</p>
            <a className="pill-button black" href={ROUTES.schedule}>View Schedule</a>
          </aside>

          <div className="faq-list">
            {filteredItems.length ? (
              filteredItems.map((item) => {
                const isOpen = openId === item.id;
                return (
                  <article className={`faq-item ${isOpen ? "is-open" : ""}`} key={item.id}>
                    <div className="faq-question">
                      <span className="faq-question-title">{item.question}</span>
                      <button
                        className="faq-toggle"
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${item.id}`}
                        onClick={() => setOpenId(isOpen ? "" : item.id)}
                      >
                        <span className="sr-only">{isOpen ? "Hide" : "Show"} answer for {item.question}</span>
                        {isOpen ? <Minus size={22} aria-hidden="true" /> : <Plus size={22} aria-hidden="true" />}
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="faq-answer" id={`faq-answer-${item.id}`}>
                        {item.answer.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="faq-empty">
                <strong>No exact match.</strong>
                <p>Try a shorter search like "cancel", "refund", "membership", or "privacy".</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function oauthStatusFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get("auth");
  const explicitMessage = params.get("message");
  const authMessages = {
    "not-ready": "Online account login will turn on once the OAuth credentials are fully approved.",
    state: "We could not verify the sign-in session. Please try again.",
    "missing-code": "The secure sign-in did not return a code. Please try again.",
    provider: "The secure sign-in could not be completed. Please try again.",
    error: "We could not complete sign-in. Please try again."
  };

  if (!authStatus) {
    return { type: "", message: "" };
  }

  return {
    type: authStatus === "not-ready" ? "success" : "error",
    message: explicitMessage || authMessages[authStatus] || authMessages.error
  };
}

function normalizeLocalReturnTo(value) {
  const text = cleanInternalUrl(value || ROUTES.account, ROUTES.account);

  if (!text || text.includes("://") || text.startsWith("//")) {
    return ROUTES.account;
  }

  return text.startsWith("/") ? text : `/${text}`;
}

function authStartHref(returnTo = ROUTES.account, options = {}) {
  const params = new URLSearchParams({ returnTo: normalizeLocalReturnTo(returnTo) });

  if (options.force) {
    params.set("force", "1");
  }

  return `/api/auth/start?${params.toString()}`;
}

function switchAccount(returnTo = ROUTES.account) {
  apiRequest("/api/auth/sign-out", { method: "POST" }).finally(() => {
    window.location.href = authStartHref(returnTo, { force: true });
  });
}

function startOAuthRedirect(returnTo = ROUTES.account) {
  window.location.href = authStartHref(returnTo);
}

function LoginPage({ bookingUrl, clientSession, setClientSession }) {
  const [status, setStatus] = useState(oauthStatusFromQuery);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== "cave:auth:complete") {
        return;
      }

      if (!event.data.ok) {
        setStatus({
          type: "error",
          message: event.data.message || "We could not complete sign-in. Please try again."
        });
        return;
      }

      setStatus({ type: "success", message: "Signed in. Taking you to your account." });

      try {
        const data = await apiRequest("/api/auth/session");
        setClientSession(data.session || null);
      } catch (error) {
        setStatus({ type: "error", message: friendlyApiErrorMessage(error, "We could not refresh your account session.") });
        return;
      }

      window.location.href = normalizeLocalReturnTo(event.data.returnTo);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setClientSession]);

  const signOut = () => {
    apiRequest("/api/auth/sign-out", { method: "POST" }).finally(() => {
      setClientSession(null);
      setStatus({ type: "success", message: "Signed out. Choose an account to continue." });
    });
  };

  const signedInUser = clientSession?.user || {};

  return (
    <>
      <section className="login-page">
        <div className="login-copy">
          <h1>{clientSession?.signedIn ? `You're signed in${signedInUser.firstName ? `, ${signedInUser.firstName}` : ""}.` : "Sign in to your Cave account."}</h1>
          <p>{clientSession?.signedIn ? signedInUser.email || "Manage your Cave account from here." : "Use your studio account to book classes, review credits, and manage your Cave details in one place."}</p>
        </div>

        <div className="login-panel">
          {clientSession?.signedIn ? (
            <>
              <a className="pill-button black" href={ROUTES.account}>Go to Account</a>
              <button className="pill-button outline" type="button" onClick={() => switchAccount(ROUTES.account)}>Switch Account</button>
              <button className="pill-button outline" type="button" onClick={signOut}>Sign Out</button>
            </>
          ) : (
            <>
              <a className="pill-button black" href={authStartHref(ROUTES.account, { force: true })}>Sign In</a>
              <a className="pill-button outline" href={ROUTES.signup}>
                Create Account
              </a>
            </>
          )}
          <a className="pill-button outline" href={bookingUrl}>
            View Schedule
          </a>
          {status.message ? <p className={`form-status ${status.type}`}>{status.message}</p> : null}
        </div>
      </section>
    </>
  );
}

function defaultWaiverDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildWaiverPayload(form) {
  return {
    version: FALLBACK_CACHE.waiver?.version || "2026-06-14",
    title: FALLBACK_CACHE.waiver?.title || "Cave Pilates, LLC Waiver and Release of Liability",
    participantName: String(form.waiverParticipantName || `${form.firstName || ""} ${form.lastName || ""}`).trim(),
    birthDate: form.birthDate || "",
    address: [form.addressLine1, form.addressLine2, form.city, form.state, form.postalCode].filter(Boolean).join(", "),
    phone: form.phone || "",
    email: form.email || "",
    signature: form.waiverSignature || "",
    signedDate: form.waiverDate || defaultWaiverDate(),
    parentGuardianName: form.guardianName || "",
    parentGuardianSignature: form.guardianSignature || "",
    mediaOptOut: Boolean(form.mediaOptOut),
    accepted: Boolean(form.acceptWaiver),
    acceptedAt: new Date().toISOString()
  };
}

function SignupPage({ clientSession, bookingUrl }) {
  if (clientSession?.signedIn) {
    window.location.replace(ROUTES.account);
    return null;
  }

  return (
    <section className="login-page signup-page">
      <div className="login-copy">
        <h1>Start your Cave account.</h1>
        <p>Sign in or create a Mindbody account, then complete your studio profile to book classes and sign the liability waiver.</p>
      </div>
      <div className="login-panel">
        <a className="pill-button black" href={authStartHref(ROUTES.account)}>Create Account</a>
        <a className="pill-button outline" href={ROUTES.login}>Already Have an Account</a>
        {bookingUrl && <a className="pill-button outline" href={bookingUrl}>View Schedule</a>}
      </div>
    </section>
  );
}

function LiabilityWaiverForm({ form, onChange }) {
  return (
    <div className="waiver-form-block" id="liability-waiver">
      <div className="waiver-form-copy">
        <strong>Waiver and release</strong>
        <p>Type your legal name to sign the Cave Pilates, LLC waiver before your first class.</p>
      </div>
      <div className="form-grid two">
        <FormField label="Participant Legal Name" name="waiverParticipantName" value={form.waiverParticipantName} onChange={onChange} required />
        <FormField label="Signature Date" name="waiverDate" type="date" value={form.waiverDate} onChange={onChange} required />
      </div>
      <FormField label="Participant Signature" name="waiverSignature" value={form.waiverSignature} onChange={onChange} required />
      <div className="form-grid two">
        <FormField label="Parent/Guardian Name, If Under 18" name="guardianName" value={form.guardianName} onChange={onChange} />
        <FormField label="Parent/Guardian Signature" name="guardianSignature" value={form.guardianSignature} onChange={onChange} />
      </div>
      <label className="check-row waiver-consent">
        <input name="acceptWaiver" type="checkbox" checked={form.acceptWaiver} onChange={onChange} required />
        <span>
          I have read and agree to the <a href={`${ROUTES.policies}#waiver-copy`}>Waiver and Release of Liability</a>.
        </span>
      </label>
      <label className="check-row">
        <input name="mediaOptOut" type="checkbox" checked={form.mediaOptOut} onChange={onChange} />
        <span>I do not want my photo or video used for studio marketing.</span>
      </label>
    </div>
  );
}

function StandaloneWaiverForm() {
  const [form, setForm] = useState({
    waiverParticipantName: "",
    birthDate: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
    email: "",
    waiverSignature: "",
    waiverDate: defaultWaiverDate(),
    guardianName: "",
    guardianSignature: "",
    mediaOptOut: false,
    acceptWaiver: false
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const waiver = buildWaiverPayload(form);

    if (!waiver.participantName || !waiver.signature || !waiver.accepted) {
      setStatus({ type: "error", message: "Please complete and sign the waiver." });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    try {
      await apiRequest("/api/client/waiver", {
        method: "POST",
        body: { waiver }
      });
      setStatus({ type: "success", message: "Waiver saved to your studio account." });
    } catch (error) {
      if (error.loginUrl) {
        window.location.href = error.loginUrl;
        return;
      }

      setStatus({ type: "error", message: friendlyApiErrorMessage(error, "Waiver could not be saved right now.") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-panel waiver-panel" onSubmit={submit}>
      <FormField label="Date of Birth" name="birthDate" type="date" value={form.birthDate} onChange={updateField} required />
      <FormField label="Email" name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required />
      <FormField label="Phone" name="phone" type="tel" value={form.phone} onChange={updateField} autoComplete="tel" required />
      <FormField label="Address" name="addressLine1" value={form.addressLine1} onChange={updateField} autoComplete="address-line1" required />
      <div className="form-grid three">
        <FormField label="City" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" required />
        <FormField label="State" name="state" value={form.state} onChange={updateField} autoComplete="address-level1" required />
        <FormField label="Zip" name="postalCode" value={form.postalCode} onChange={updateField} autoComplete="postal-code" required />
      </div>
      <LiabilityWaiverForm form={form} onChange={updateField} />
      <button className="pill-button black" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving Waiver..." : "Save Waiver"}
      </button>
      {status.message ? <p className={`form-status ${status.type}`}>{status.message}</p> : null}
    </form>
  );
}

function AccountPage({ clientSession, setClientSession, bookingUrl, isSessionLoading }) {
  const [accountData, setAccountData] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!clientSession?.signedIn) return;
    let isMounted = true;

    setAccountLoading(true);
    setDashboardLoading(true);

    Promise.all([
      apiRequest("/api/account/me").catch(() => null),
      apiRequest("/api/client/dashboard").catch(() => null)
    ]).then(([acct, dash]) => {
      if (!isMounted) return;
      if (acct?.data) setAccountData(acct.data);
      if (dash) {
        if (dash.session?.signedIn) setClientSession(dash.session);
        setDashboard(dash);
      }
    }).finally(() => {
      if (!isMounted) return;
      setAccountLoading(false);
      setDashboardLoading(false);
    });

    return () => { isMounted = false; };
  }, [clientSession?.signedIn]);

  const signOut = () => {
    apiRequest("/api/auth/sign-out", { method: "POST" }).finally(() => {
      setClientSession(null);
      window.location.href = ROUTES.login;
    });
  };

  if (isSessionLoading) {
    return (
      <section className="login-page">
        <div className="login-copy">
          <p className="kicker">Account</p>
          <h1>Loading your account.</h1>
          <p>Checking the secure studio session.</p>
        </div>
      </section>
    );
  }

  if (!clientSession?.signedIn) {
    return (
      <section className="login-page">
        <div className="login-copy">
          <p className="kicker">Account</p>
          <h1>Please sign in.</h1>
          <p>Your account page shows bookings, class credits, and memberships once connected.</p>
        </div>
        <div className="login-panel">
          <a className="pill-button black" href={authStartHref(ROUTES.account, { force: true })}>Sign In</a>
          <a className="pill-button outline" href={ROUTES.signup}>Create Account</a>
          <a className="pill-button outline" href={bookingUrl}>View Schedule</a>
        </div>
      </section>
    );
  }

  const user = clientSession.user || {};

  return (
    <section className="account-page">
      <div className="account-header">
        <div>
          <p className="kicker">Account</p>
          <h1>{user.firstName ? `Hi, ${user.firstName}.` : "Your Cave account."}</h1>
          <p>{user.email || user.username}</p>
        </div>
        <div className="account-actions">
          <button className="pill-button outline" type="button" onClick={() => switchAccount(ROUTES.account)}>Switch Account</button>
          <button className="pill-button outline" type="button" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      {accountLoading && (
        <p className="account-link-note">Loading your Mindbody profile\u2026</p>
      )}

      {!accountLoading && accountData !== null && !accountData.hasBusinessProfile && (
        <CompleteStudioProfile
          accountData={accountData}
          clientSession={clientSession}
          onComplete={(updated) => setAccountData(updated)}
        />
      )}

      {!accountLoading && accountData?.hasBusinessProfile && (
        <>
          <div className="account-info-section">
            <div className="account-info-grid">
              <AccountInfoField label="First Name" value={accountData.firstName || user.firstName} />
              <AccountInfoField label="Last Name" value={accountData.lastName || user.lastName} />
              <AccountInfoField label="Email" value={accountData.email || user.email} />
              <AccountInfoField label="Phone" value={accountData.phone} />
              <AccountInfoField label="Address" value={accountData.addressLine1} />
              <AccountInfoField label="City" value={accountData.city} />
              {accountData.userId && <AccountInfoField label="Mindbody User ID" value={accountData.userId} mono />}
              {accountData.clientId && <AccountInfoField label="Studio Client ID" value={accountData.clientId} mono />}
            </div>
            <button
              className="pill-button outline account-edit-toggle"
              type="button"
              onClick={() => setEditOpen((v) => !v)}
            >
              {editOpen ? "Cancel Edit" : "Edit Profile"}
            </button>
          </div>

          {!accountLoading && accountData.hasWaiver === false && (
            <AccountWaiverSection
              accountData={accountData}
              onSigned={(updated) => setAccountData((prev) => ({ ...prev, hasWaiver: true, ...updated }))}
            />
          )}

          {editOpen && (
            <EditProfileSection
              accountData={accountData}
              clientSession={clientSession}
              onSaved={() => setEditOpen(false)}
            />
          )}
        </>
      )}

      <div className="account-grid">
        <AccountCard title="Upcoming Bookings" type="schedule" data={dashboard?.schedule} loading={dashboardLoading} empty="No upcoming bookings. Head to the schedule to reserve a spot." />
        <AccountCard title="Class Credits" type="services" data={dashboard?.services} loading={dashboardLoading} empty="No class credits on file. Visit Pricing to get started." />
        <AccountCard title="Memberships" type="contracts" data={dashboard?.contracts} loading={dashboardLoading} empty="No active memberships. View Memberships to learn more." />
        <AccountCard title="Rewards" type="rewards" data={dashboard?.rewards} loading={dashboardLoading} empty="No reward points on file." />
      </div>

      <a className="pill-button outline account-edit-toggle" href={bookingUrl}>View Schedule</a>
    </section>
  );
}

function AccountWaiverSection({ accountData, onSigned }) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const submit = async (e) => {
    e.preventDefault();
    if (!accepted) {
      setStatus({ type: "error", message: "Please check the box to accept the waiver." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      const waiver = {
        accepted: true,
        participantName: `${accountData.firstName || ""} ${accountData.lastName || ""}`.trim(),
        signature: `${accountData.firstName || ""} ${accountData.lastName || ""}`.trim(),
        signedDate: new Date().toISOString().slice(0, 10),
        acceptedAt: new Date().toISOString()
      };
      await apiRequest("/api/client/waiver", { method: "POST", body: { waiver } });
      setStatus({ type: "success", message: "Liability waiver signed and saved." });
      if (onSigned) onSigned({ hasWaiver: true });
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Could not save waiver. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-waiver-section">
      <strong>Liability Waiver Required</strong>
      <p>You must sign the Cave Modern Pilates liability waiver before booking classes.</p>
      <a className="account-waiver-link" href="/assets/cave-modern-pilates-liability-waiver.pdf" target="_blank" rel="noopener noreferrer">Read the full waiver (PDF)</a>
      <form onSubmit={submit} className="account-waiver-form">
        <label className="waiver-checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          I have read and agree to the Cave Modern Pilates liability waiver.
        </label>
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
        <button className="pill-button black" type="submit" disabled={saving || !accepted}>
          {saving ? "Saving\u2026" : "Sign Waiver"}
        </button>
      </form>
    </div>
  );
}

function AccountInfoField({ label, value, mono }) {
  if (!value) return null;
  return (
    <div className="account-info-field">
      <span className="account-info-label">{label}</span>
      <span className={`account-info-value${mono ? " account-info-mono" : ""}`}>{value}</span>
    </div>
  );
}

function CompleteStudioProfile({ accountData, clientSession, onComplete }) {
  const user = clientSession?.user || {};
  const [form, setForm] = useState({
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    birthDate: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    gender: "",
    referredBy: ""
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  const updateField = (e) => {
    const { name, value } = e.target;
    setForm((c) => ({ ...c, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      const result = await apiRequest("/api/account/profile", {
        method: "POST",
        body: {
          clientId: accountData?.clientId,
          ...form
        }
      });

      if (result.ok) {
        // Reload account data with updated profile
        const updated = await apiRequest("/api/account/me").catch(() => null);
        if (updated?.data) {
          onComplete(updated.data);
        } else {
          onComplete({ ...accountData, hasBusinessProfile: true, clientId: result.clientId || accountData?.clientId });
        }
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Profile could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="complete-profile-banner">
      <div className="complete-profile-header">
        <strong>Complete your Cave studio profile</strong>
        <p>Add your contact details to finish linking your Mindbody account to this studio and enable booking.</p>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid two">
          <FormField label="Mobile Phone" name="phone" type="tel" value={form.phone} onChange={updateField} autoComplete="tel" required />
          <FormField label="Birth Date" name="birthDate" type="date" value={form.birthDate} onChange={updateField} />
        </div>
        <FormField label="Address" name="addressLine1" value={form.addressLine1} onChange={updateField} autoComplete="address-line1" required />
        <FormField label="Apt, Suite (Optional)" name="addressLine2" value={form.addressLine2} onChange={updateField} autoComplete="address-line2" />
        <div className="form-grid three">
          <FormField label="City" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" required />
          <FormField label="State" name="state" value={form.state} onChange={updateField} autoComplete="address-level1" required />
          <FormField label="Zip" name="postalCode" value={form.postalCode} onChange={updateField} autoComplete="postal-code" required />
        </div>
        <div className="form-grid two">
          <FormField label="Emergency Contact Name" name="emergencyContactName" value={form.emergencyContactName} onChange={updateField} />
          <FormField label="Emergency Contact Phone" name="emergencyContactPhone" type="tel" value={form.emergencyContactPhone} onChange={updateField} />
        </div>
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
        <button className="pill-button black" type="submit" disabled={saving}>
          {saving ? "Saving\u2026" : "Complete Studio Profile"}
        </button>
      </form>
    </div>
  );
}

function EditProfileSection({ accountData, clientSession, onSaved }) {
  const [form, setForm] = useState({
    phone: accountData?.phone || "",
    homePhone: accountData?.homePhone || "",
    addressLine1: accountData?.addressLine1 || "",
    addressLine2: accountData?.addressLine2 || "",
    city: accountData?.city || "",
    state: accountData?.state || "",
    country: accountData?.country || accountData?.countryCode || "",
    postalCode: accountData?.postalCode || "",
    birthDate: accountData?.birthDate || "",
    gender: accountData?.gender || "",
    referredBy: accountData?.referredBy || "",
    middleName: accountData?.middleName || "",
    emergencyContactName: accountData?.emergencyContactName || "",
    emergencyContactEmail: accountData?.emergencyContactEmail || "",
    emergencyContactPhone: accountData?.emergencyContactPhone || "",
    emergencyContactRelationship: accountData?.emergencyContactRelationship || ""
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  const updateField = (e) => {
    const { name, value } = e.target;
    setForm((c) => ({ ...c, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      await apiRequest("/api/account/profile", {
        method: "POST",
        body: {
          clientId: accountData?.clientId,
          ...form
        }
      });
      setStatus({ type: "success", message: "Profile updated." });
      if (onSaved) setTimeout(onSaved, 1200);
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Profile could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-profile-section">
      <h2>Edit Profile</h2>
      <p className="edit-profile-note">Name, email, and external ID are managed by Mindbody and cannot be changed here.</p>
      <form onSubmit={submit}>
        <div className="form-grid two">
          <FormField label="Mobile Phone" name="phone" type="tel" value={form.phone} onChange={updateField} autoComplete="tel" />
          <FormField label="Home Phone" name="homePhone" type="tel" value={form.homePhone} onChange={updateField} />
        </div>
        <div className="form-grid two">
          <FormField label="Middle Name" name="middleName" value={form.middleName} onChange={updateField} />
          <FormField label="Birth Date" name="birthDate" type="date" value={form.birthDate} onChange={updateField} />
        </div>
        <FormField label="Address Line 1" name="addressLine1" value={form.addressLine1} onChange={updateField} autoComplete="address-line1" />
        <FormField label="Address Line 2" name="addressLine2" value={form.addressLine2} onChange={updateField} autoComplete="address-line2" />
        <div className="form-grid three">
          <FormField label="City" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" />
          <FormField label="State" name="state" value={form.state} onChange={updateField} autoComplete="address-level1" />
          <FormField label="Zip / Postal Code" name="postalCode" value={form.postalCode} onChange={updateField} autoComplete="postal-code" />
        </div>
        <div className="form-grid two">
          <FormField label="Country" name="country" value={form.country} onChange={updateField} autoComplete="country-name" />
          <FormField label="Referred By" name="referredBy" value={form.referredBy} onChange={updateField} />
        </div>
        <div className="edit-profile-group">
          <p className="edit-profile-group-label">Emergency Contact</p>
          <div className="form-grid two">
            <FormField label="Name" name="emergencyContactName" value={form.emergencyContactName} onChange={updateField} />
            <FormField label="Relationship" name="emergencyContactRelationship" value={form.emergencyContactRelationship} onChange={updateField} />
          </div>
          <div className="form-grid two">
            <FormField label="Phone" name="emergencyContactPhone" type="tel" value={form.emergencyContactPhone} onChange={updateField} />
            <FormField label="Email" name="emergencyContactEmail" type="email" value={form.emergencyContactEmail} onChange={updateField} />
          </div>
        </div>
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
        <button className="pill-button black" type="submit" disabled={saving}>
          {saving ? "Saving\u2026" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

function CompleteProfileBanner({ pendingProfile, clientSession, setClientSession, onDone }) {
  const [form, setForm] = useState({
    phone: pendingProfile.phone || "",
    addressLine1: pendingProfile.addressLine1 || "",
    addressLine2: pendingProfile.addressLine2 || "",
    city: pendingProfile.city || "",
    state: pendingProfile.state || "",
    postalCode: pendingProfile.postalCode || "",
    birthDate: pendingProfile.birthDate || "",
    waiverParticipantName: pendingProfile.waiver?.participantName || `${clientSession?.user?.firstName || ""} ${clientSession?.user?.lastName || ""}`.trim(),
    waiverSignature: pendingProfile.waiver?.signature || "",
    waiverDate: pendingProfile.waiver?.signedDate || defaultWaiverDate(),
    guardianName: pendingProfile.waiver?.parentGuardianName || "",
    guardianSignature: pendingProfile.waiver?.parentGuardianSignature || "",
    mediaOptOut: Boolean(pendingProfile.waiver?.mediaOptOut),
    acceptWaiver: Boolean(pendingProfile.waiver?.accepted)
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const updateField = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((c) => ({ ...c, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    const waiver = buildWaiverPayload({ ...form, firstName: clientSession?.user?.firstName || "", lastName: clientSession?.user?.lastName || "", email: clientSession?.user?.email || "" });

    try {
      const data = await apiRequest("/api/client/complete-profile", {
        method: "POST",
        body: {
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          birthDate: form.birthDate,
          waiver
        }
      });

      if (data.session?.signedIn) {
        setClientSession(data.session);
      }

      onDone();
    } catch (error) {
      setStatus({ type: "error", message: friendlyApiErrorMessage(error, "Profile could not be saved right now. You can update it later.") });
      setTimeout(() => onDone(), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="complete-profile-banner">
      <div className="complete-profile-header">
        <strong>Complete your Cave profile</strong>
        <p>Add your address and sign the studio waiver to finish setting up your account.</p>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid two">
          <FormField label="Mobile Phone" name="phone" type="tel" value={form.phone} onChange={updateField} autoComplete="tel" required />
          <FormField label="Birth Date" name="birthDate" type="date" value={form.birthDate} onChange={updateField} />
        </div>
        <FormField label="Address" name="addressLine1" value={form.addressLine1} onChange={updateField} autoComplete="address-line1" required />
        <FormField label="Apt, Suite, Optional" name="addressLine2" value={form.addressLine2} onChange={updateField} autoComplete="address-line2" />
        <div className="form-grid three">
          <FormField label="City" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" required />
          <FormField label="State" name="state" value={form.state} onChange={updateField} autoComplete="address-level1" required />
          <FormField label="Zip" name="postalCode" value={form.postalCode} onChange={updateField} autoComplete="postal-code" required />
        </div>
        <LiabilityWaiverForm form={form} onChange={updateField} />
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
        <div className="complete-profile-actions">
          <button className="pill-button black" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Profile"}</button>
          <button className="pill-button outline" type="button" onClick={onDone}>Skip for now</button>
        </div>
      </form>
    </div>
  );
}

function AccountCard({ title, data, empty, type, loading }) {
  const items = normalizeAccountItems(data, type);

  return (
    <article className="account-card">
      <h2>{title}</h2>
      {loading ? (
        <p className="account-empty account-loading">Loading&hellip;</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((item, index) => (
            <div className="account-list-item" key={`${title}-${item.title}-${index}`}>
              <strong>{item.title}</strong>
              {item.detail ? <span>{item.detail}</span> : null}
              {item.meta ? <small>{item.meta}</small> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="account-empty">{empty}</p>
      )}
    </article>
  );
}

function normalizeAccountItems(data, type) {
  const rows = firstArrayFromAccountData(data, accountPreferredKeys(type));

  if (!rows.length) {
    return [];
  }

  return rows.slice(0, 6).map((item) => {
    if (type === "schedule") {
      const title = firstText(
        item.ClassDescription?.Name,
        item.ClassName,
        item.Name,
        item.SessionType?.Name,
        "Booked class"
      );
      const when = formatAccountDate(firstText(item.StartDateTime, item.StartDate, item.AppointmentStartDateTime, item.Date));
      const instructor = firstText(item.Staff?.Name, item.StaffName, item.InstructorName);
      const status = firstText(item.Status, item.BookingStatus, item.VisitStatus);

      return {
        title,
        detail: [when, instructor].filter(Boolean).join(" with "),
        meta: status
      };
    }

    if (type === "services") {
      const title = firstText(item.Name, item.ServiceName, item.Program?.Name, item.SessionType?.Name, "Class credit");
      const remaining = firstText(item.Remaining, item.RemainingClasses, item.Count, item.Current, item.Balance, item.VisitsRemaining);
      const expiration = formatAccountDate(firstText(item.ExpirationDate, item.Expires, item.ExpiryDate));

      return {
        title,
        detail: remaining ? `${remaining} remaining` : "",
        meta: expiration ? `Expires ${expiration}` : ""
      };
    }

    if (type === "rewards") {
      const name = firstText(item.Name, item.RewardType, item.ProgramName, "Reward Points");
      const balance = firstText(item.PointBalance, item.Balance, item.Points, item.Total);
      return {
        title: name,
        detail: balance !== null && balance !== undefined ? `${balance} points` : "",
        meta: ""
      };
    }

    const title = firstText(item.ContractName, item.Name, item.MembershipName, item.AgreementName, "Membership");
    const status = firstText(item.Status, item.ContractStatus, item.Active === true ? "Active" : "");
    const starts = formatAccountDate(firstText(item.StartDate, item.StartDateTime));
    const ends = formatAccountDate(firstText(item.EndDate, item.EndDateTime, item.ExpirationDate));

    return {
      title,
      detail: [status, starts ? `Started ${starts}` : ""].filter(Boolean).join(" · "),
      meta: ends ? `Renews or ends ${ends}` : ""
    };
  });
}

function accountPreferredKeys(type) {
  if (type === "schedule") {
    return ["ClientSchedule", "Schedule", "Classes", "Appointments", "Visits"];
  }

  if (type === "services") {
    return ["ClientServices", "Services", "Packages", "Credits"];
  }

  if (type === "rewards") {
    return ["RewardPoints", "LoyaltyPoints", "Points", "Rewards"];
  }

  return ["ClientContracts", "Contracts", "Memberships", "Agreements"];
}

function firstArrayFromAccountData(data, preferredKeys = []) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === "object");
  }

  if (typeof data !== "object") {
    return [];
  }

  for (const key of preferredKeys) {
    if (Array.isArray(data[key])) {
      return data[key].filter((item) => item && typeof item === "object");
    }
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === "object");
    }
  }

  for (const value of Object.values(data)) {
    const nested = firstArrayFromAccountData(value, preferredKeys);

    if (nested.length) {
      return nested;
    }
  }

  return [];
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text && text !== "0") {
      return text;
    }
  }

  return "";
}

function formatAccountDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const hasTime = /T|\d:\d/.test(String(value));

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {})
  });
}

function FormField({ label, name, type = "text", value, onChange, required = false, autoComplete }) {
  return (
    <label>
      {label}
      <input name={name} type={type} value={value} onChange={onChange} required={required} autoComplete={autoComplete} />
    </label>
  );
}

function MembershipGrid({ memberships }) {
  const visibleMemberships = memberships.length ? memberships : FALLBACK_CACHE.memberships;
  const knownPriceFallbacks = {
    "4 class pack": "$150.00"
  };

  return (
    <div className="membership-grid" aria-live="polite">
      {visibleMemberships.map((item) => {
        const displayPrice = item.price || knownPriceFallbacks[String(item.name).toLowerCase()] || "";

        return (
          <article className="membership-card" key={`${item.name}-${item.sessions}`}>
            <div className="membership-photo" style={{ "--image-position": item.imagePosition || "center" }} />
            <h3>{item.name}</h3>
            <p className="price">{displayPrice}</p>
            <p className="sessions">
              {item.sessions} {Number(item.sessions) === 1 ? "session" : "sessions"}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function ScheduleList({ schedule, bookingUrl, clientSession, spotsLoading }) {
  const cachedRows = schedule.length ? schedule : FALLBACK_CACHE.schedule;
  const [liveClasses, setLiveClasses] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState(null);
  const [bookingState, setBookingState] = useState({ classId: null, type: "", message: "", canWaitlist: false });
  const autoBookTriggered = React.useRef(false);
  const visibleDayCount = useScheduleDayCount();
  const requestedClassId = new URLSearchParams(window.location.search).get("classId");

  useEffect(() => {
    let cancelled = false;
    setLiveLoading(true);
    fetch("/api/mindbody/classes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok && Array.isArray(data.data?.classes)) {
          setLiveClasses(data.data.classes.map(normalizeLiveClassForDisplay));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLiveLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!clientSession?.signedIn) { setClientInfo(null); return; }
    let cancelled = false;
    fetch("/api/mindbody/client-info", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.ok) setClientInfo(data.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clientSession?.signedIn]);

  const rows = liveClasses ?? cachedRows;
  const groupedDays = rows.reduce((days, classItem) => {
    const key = getScheduleDateKey(classItem);

    if (!key) {
      return days;
    }

    const existing = days.find((day) => day.key === key);

    if (existing) {
      existing.classes.push(classItem);
      return days;
    }

    days.push({
      key,
      label: formatScheduleDay(key),
      shortLabel: formatScheduleShortDay(key),
      classes: [classItem]
    });

    return days;
  }, []);
  const sortedDays = groupedDays
    .map((day) => ({
      ...day,
      classes: day.classes.slice().sort((a, b) => new Date(a.startDateTime || 0) - new Date(b.startDateTime || 0))
    }))
    .sort((a, b) => new Date(a.key) - new Date(b.key));
  const requestedDayIndex = sortedDays.findIndex((day) => day.classes.some((classItem) => String(classItem.id) === requestedClassId));
  const [activeDayIndex, setActiveDayIndex] = useState(Math.max(requestedDayIndex, 0));
  const [isCalendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonthKey, setCalendarMonthKey] = useState(() => {
    const initialDay = sortedDays[Math.max(requestedDayIndex, 0)] || sortedDays[0];
    return initialDay?.key.slice(0, 7) || new Date().toISOString().slice(0, 7);
  });
  const activeDay = sortedDays[activeDayIndex] || sortedDays[0];
  const visibleDays = getVisibleScheduleDays(sortedDays, activeDayIndex, visibleDayCount);
  const classCount = activeDay?.classes.length || 0;
  const scheduleDayMap = new Map(sortedDays.map((day, index) => [day.key, { ...day, index }]));
  const calendarDays = getCalendarMonthDays(calendarMonthKey, scheduleDayMap);
  const firstMonthKey = sortedDays[0]?.key.slice(0, 7);
  const lastMonthKey = sortedDays[sortedDays.length - 1]?.key.slice(0, 7);

  useEffect(() => {
    if (!sortedDays.length) {
      return;
    }

    setActiveDayIndex((currentIndex) => Math.min(currentIndex, sortedDays.length - 1));
  }, [sortedDays.length]);

  useEffect(() => {
    if (!activeDay?.key || !firstMonthKey || !lastMonthKey) {
      return;
    }

    const activeMonthKey = activeDay.key.slice(0, 7);

    setCalendarMonthKey((currentMonthKey) =>
      currentMonthKey < firstMonthKey || currentMonthKey > lastMonthKey ? activeMonthKey : currentMonthKey
    );
  }, [activeDay?.key, firstMonthKey, lastMonthKey]);

  useEffect(() => {
    if (!requestedClassId || !clientSession?.signedIn || autoBookTriggered.current) return;
    const classItem = rows.find((c) => String(c.id) === requestedClassId);
    if (!classItem) return;
    autoBookTriggered.current = true;
    bookClass(classItem);
    window.history.replaceState(null, "", window.location.pathname);
  }, [clientSession?.signedIn, rows.length]);

  if (!sortedDays.length) {
    return <p className="empty-schedule">No upcoming classes are available right now.</p>;
  }

  const goToDay = (nextIndex) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), sortedDays.length - 1);
    const nextDay = sortedDays[boundedIndex];
    setBookingState({ classId: null, type: "", message: "", canWaitlist: false });
    setActiveDayIndex(boundedIndex);
    if (nextDay?.key) setCalendarMonthKey(nextDay.key.slice(0, 7));
  };

  const goToCalendarMonth = (offset) => {
    const nextMonthKey = addMonthsToKey(calendarMonthKey, offset);
    if ((firstMonthKey && nextMonthKey < firstMonthKey) || (lastMonthKey && nextMonthKey > lastMonthKey)) return;
    setCalendarMonthKey(nextMonthKey);
  };

  const selectCalendarDay = (day) => {
    if (day.scheduleIndex === null) return;
    goToDay(day.scheduleIndex);
    setCalendarOpen(false);
  };

  const refreshLiveClasses = () => {
    fetch("/api/mindbody/classes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.data?.classes)) {
          setLiveClasses(data.data.classes.map(normalizeLiveClassForDisplay));
        }
      })
      .catch(() => {});
  };

  const bookClass = async (classItem) => {
    const classId = classItem.id;

    if (!classId) {
      setBookingState({ classId: null, type: "error", message: "This class is missing a booking ID.", canWaitlist: false });
      return;
    }

    if (!clientSession?.signedIn) {
      window.location.href = `/api/auth/start?returnTo=${encodeURIComponent(`${ROUTES.schedule}?classId=${classId}`)}`;
      return;
    }

    if (clientInfo && !clientInfo.hasUsablePricingOption && !classItem.isFree) {
      setBookingState({ classId, type: "error", message: "You need an active class pack or membership before booking. Visit the Pricing page to get started.", canWaitlist: false });
      return;
    }

    setBookingState({ classId, type: "loading", message: "Booking...", canWaitlist: false });

    try {
      await apiRequest("/api/mindbody/book-class", {
        method: "POST",
        body: { classId, clientServiceId: clientInfo?.defaultClientServiceId || undefined }
      });
      setBookingState({ classId, type: "success", message: "Booked! Check your account for confirmation.", canWaitlist: false });
      refreshLiveClasses();
    } catch (error) {
      if (error.loginUrl) { window.location.href = error.loginUrl; return; }
      const canWaitlist = Boolean(error.data?.canWaitlist);
      setBookingState({ classId, type: "error", message: error.data?.message || error.message || "Booking could not be completed.", canWaitlist });
    }
  };

  const joinWaitlist = async (classItem) => {
    const classId = classItem.id;

    if (!clientSession?.signedIn) {
      window.location.href = `/api/auth/start?returnTo=${encodeURIComponent(`${ROUTES.schedule}?classId=${classId}`)}`;
      return;
    }

    setBookingState({ classId, type: "loading", message: "Joining waitlist...", canWaitlist: false });

    try {
      await apiRequest("/api/mindbody/join-waitlist", { method: "POST", body: { classId } });
      setBookingState({ classId, type: "success", message: "You're on the waitlist! We'll notify you if a spot opens.", canWaitlist: false });
      refreshLiveClasses();
    } catch (error) {
      if (error.loginUrl) { window.location.href = error.loginUrl; return; }
      setBookingState({ classId, type: "error", message: error.data?.message || error.message || "Could not join waitlist.", canWaitlist: false });
    }
  };

  const isLiveDataLoading = liveLoading && !liveClasses;

  return (
    <div className="schedule-browser" aria-live="polite">
      <div className="schedule-panel">
        <div>
          <h2>{activeDay.label}</h2>
          <p>
            {classCount} {classCount === 1 ? "class" : "classes"} available
          </p>
        </div>

        <div className="schedule-controls" aria-label="Schedule day controls">
          <button
            className="schedule-arrow"
            type="button"
            aria-label="Previous day"
            disabled={activeDayIndex === 0}
            onClick={() => goToDay(activeDayIndex - 1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            className="schedule-arrow"
            type="button"
            aria-label="Next day"
            disabled={activeDayIndex >= sortedDays.length - 1}
            onClick={() => goToDay(activeDayIndex + 1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <div className="calendar-picker">
            <button
              className="calendar-trigger"
              type="button"
              aria-expanded={isCalendarOpen}
              aria-controls="schedule-calendar"
              onClick={() => setCalendarOpen((value) => !value)}
            >
              <CalendarDays size={18} aria-hidden="true" />
              <span>Choose Date</span>
            </button>
            {isCalendarOpen ? (
              <div className="calendar-popover" id="schedule-calendar">
                <div className="calendar-header">
                  <button
                    className="calendar-nav"
                    type="button"
                    aria-label="Previous month"
                    disabled={Boolean(firstMonthKey && calendarMonthKey <= firstMonthKey)}
                    onClick={() => goToCalendarMonth(-1)}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <strong>{formatCalendarMonth(calendarMonthKey)}</strong>
                  <button
                    className="calendar-nav"
                    type="button"
                    aria-label="Next month"
                    disabled={Boolean(lastMonthKey && calendarMonthKey >= lastMonthKey)}
                    onClick={() => goToCalendarMonth(1)}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className="calendar-weekdays" aria-hidden="true">
                  {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>

                <div className="calendar-grid">
                  {calendarDays.map((day) => (
                    <button
                      className={`calendar-day${day.isCurrentMonth ? "" : " is-muted"}${day.isCurrentMonth && day.scheduleIndex === activeDayIndex ? " is-active" : ""}`}
                      key={day.key}
                      type="button"
                      disabled={!day.isCurrentMonth || day.scheduleIndex === null}
                      aria-label={`${day.label}${day.isCurrentMonth && day.classCount ? `, ${day.classCount} ${day.classCount === 1 ? "class" : "classes"}` : ", no classes"}`}
                      onClick={() => selectCalendarDay(day)}
                    >
                      <span>{day.dayNumber}</span>
                      {day.isCurrentMonth && day.classCount ? <em>{day.classCount}</em> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="schedule-day-strip" aria-label="Choose a schedule date">
        {visibleDays.map((day) => (
          <button
            className={`schedule-day ${day.index === activeDayIndex ? "is-active" : ""}`}
            key={day.key}
            type="button"
            aria-label={`${day.label}, ${day.classes.length} ${day.classes.length === 1 ? "class" : "classes"}`}
            onClick={() => goToDay(day.index)}
          >
            <span>{day.shortLabel.weekday}</span>
            <strong>{day.shortLabel.day}</strong>
            <em>
              {day.classes.length} {day.classes.length === 1 ? "class" : "classes"}
            </em>
          </button>
        ))}
      </div>

      <div className="schedule-list">
        {activeDay.classes.map((classItem, index) => {
        const liveStatus = classItem.status || "";
        const isThisLoading = bookingState.classId === classItem.id && bookingState.type === "loading";
        const isThisSuccess = bookingState.classId === classItem.id && bookingState.type === "success";

        // Spots badge
        const isDataLoading = isLiveDataLoading || (!liveClasses && spotsLoading);
        const spotsNum = typeof classItem.spotsLeft === "number" ? classItem.spotsLeft : null;
        let spotsClass = "spots-badge spots-open";
        let spotsText = liveStatus || "Open";

        if (isDataLoading) {
          spotsClass = "spots-badge spots-loading";
          spotsText = "Checking\u2026";
        } else if (liveStatus === "Full" || liveStatus === "Canceled" || liveStatus === "Unavailable") {
          spotsClass = "spots-badge spots-full";
        } else if (liveStatus === "Join Waitlist" || liveStatus?.startsWith("Only")) {
          spotsClass = "spots-badge spots-low";
        } else if (liveStatus === "Booked" || isThisSuccess) {
          spotsClass = "spots-badge spots-booked";
          spotsText = "Booked";
        } else if (!liveStatus && spotsNum !== null) {
          spotsText = spotsNum === 0 ? "Full" : `${spotsNum} left`;
          spotsClass = spotsNum === 0 ? "spots-badge spots-full" : spotsNum <= 3 ? "spots-badge spots-low" : "spots-badge spots-open";
        }

        // Book/Waitlist button
        const effectiveStatus = isThisSuccess ? "Booked" : liveStatus;
        let actionButton;
        if (effectiveStatus === "Booked") {
          actionButton = <button className="book-class" type="button" disabled>Booked</button>;
        } else if (effectiveStatus === "Canceled") {
          actionButton = <button className="book-class" type="button" disabled>Canceled</button>;
        } else if (effectiveStatus === "Full") {
          actionButton = <button className="book-class" type="button" disabled>Full</button>;
        } else if (effectiveStatus === "Unavailable") {
          actionButton = <button className="book-class" type="button" disabled>Unavailable</button>;
        } else if (effectiveStatus === "Join Waitlist" || (bookingState.classId === classItem.id && bookingState.canWaitlist)) {
          actionButton = (
            <button className="book-class waitlist-btn" type="button" disabled={isThisLoading} onClick={() => joinWaitlist(classItem)}>
              {isThisLoading ? "Joining..." : "Join Waitlist"}
            </button>
          );
        } else {
          actionButton = (
            <button className="book-class" type="button" disabled={isThisLoading} onClick={() => bookClass(classItem)}>
              {isThisLoading ? "Booking..." : "Book Class"}
            </button>
          );
        }

        return (
          <article className="schedule-row" key={`${classItem.id || classItem.classScheduleId || index}-${classItem.startDateTime || classItem.time}`}>
            <div>
              <span>Date</span>
              <strong>{classItem.date}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{classItem.time}</strong>
            </div>
            <div>
              <span>Class</span>
              <strong>{classItem.className}</strong>
            </div>
            <div>
              <span>Instructor</span>
              <strong>{classItem.instructor || "Varies"}</strong>
            </div>
            <div>
              <span>Spots</span>
              <strong><span className={spotsClass}>{spotsText}</span></strong>
            </div>
            <div className="schedule-booking">
              {actionButton}
              {bookingState.classId === classItem.id && bookingState.message ? (
                <p className={`row-status ${bookingState.type}`}>{bookingState.message}</p>
              ) : null}
            </div>
          </article>
        );
      })}
      </div>
    </div>
  );
}

function useScheduleDayCount() {
  const [dayCount, setDayCount] = useState(() => getScheduleDayCount());

  useEffect(() => {
    const updateDayCount = () => setDayCount(getScheduleDayCount());

    window.addEventListener("resize", updateDayCount);
    return () => window.removeEventListener("resize", updateDayCount);
  }, []);

  return dayCount;
}

function getScheduleDayCount() {
  if (window.innerWidth <= 420) {
    return 2;
  }

  if (window.innerWidth <= 640) {
    return 3;
  }

  if (window.innerWidth <= 820) {
    return 4;
  }

  if (window.innerWidth <= 1050) {
    return 5;
  }

  return 7;
}

function getScheduleDateKey(classItem) {
  if (classItem.startDateTime && /^\d{4}-\d{2}-\d{2}/.test(classItem.startDateTime)) {
    return classItem.startDateTime.slice(0, 10);
  }

  const date = new Date(classItem.startDateTime || classItem.date);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatScheduleDay(key) {
  const date = new Date(`${key}T12:00:00`);

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatScheduleShortDay(key) {
  const date = new Date(`${key}T12:00:00`);

  return {
    weekday: date.toLocaleDateString([], { weekday: "short" }),
    day: date.toLocaleDateString([], { day: "numeric" })
  };
}

function formatCalendarMonth(key) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString([], {
    month: "long",
    year: "numeric"
  });
}

function addMonthsToKey(key, offset) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCalendarMonthDays(monthKey, scheduleDayMap) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthIndex = month - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    const key = getDateKeyFromDate(date);
    const scheduleDay = scheduleDayMap.get(key);

    return {
      key,
      label: formatScheduleDay(key),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      scheduleIndex: scheduleDay?.index ?? null,
      classCount: scheduleDay?.classes.length || 0
    };
  });
}

function getDateKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getVisibleScheduleDays(days, activeIndex, windowSize) {
  const maxStart = Math.max(days.length - windowSize, 0);
  const start = Math.min(Math.floor(activeIndex / windowSize) * windowSize, maxStart);

  return days.slice(start, start + windowSize).map((day, offset) => ({
    ...day,
    index: start + offset
  }));
}

function getContactDetails(location) {
  const fallbackAddress = "31 Orland Square Drive, Suite B, Orland Park, IL 60462";
  const rawAddress = String(location?.address || fallbackAddress);
  const normalizedAddress = rawAddress
    .replace(/\s+/g, " ")
    .replace(/31 Orland Square Drive\s+suite b,\s*Orland Park IL 60462,\s*Orland Park,\s*IL,?\s*60462/i, fallbackAddress)
    .replace(/\bsuite\s+b\b/i, "Suite B")
    .trim();

  return {
    address: normalizedAddress || fallbackAddress,
    mapQuery: normalizedAddress || fallbackAddress,
    parking: location?.parking && !/coming soon/i.test(location.parking) ? location.parking : "",
    email: location?.email || CONTACT_EMAIL,
    phone: location?.phone || CONTACT_PHONE,
    phoneDisplay: location?.phoneDisplay || CONTACT_PHONE_DISPLAY
  };
}

function LocationDetails({ location }) {
  const details = {
    address: location.address || "Launch address coming soon",
    parking: location.parking || "Parking details coming soon.",
    hours: location.hours || "Hours coming soon.",
    email: location.email || CONTACT_EMAIL,
    phoneDisplay: location.phoneDisplay || CONTACT_PHONE_DISPLAY
  };

  return (
    <div className="contact-details">
      <p>
        <strong>Address</strong>
        {details.address}
      </p>
      <p>
        <strong>Parking</strong>
        {details.parking}
      </p>
      <p>
        <strong>Hours</strong>
        {details.hours}
      </p>
      <p>
        <strong>Email</strong>
        {details.email}
      </p>
      <p>
        <strong>Phone</strong>
        {details.phoneDisplay}
      </p>
    </div>
  );
}

function cleanFooterAddress(address) {
  return String(address || "")
    .replace(/\s+/g, " ")
    .replace(/\bsuite\s+b\b/i, "Suite B")
    .replace(/,\s*Orland Park,\s*IL,?\s*60462$/i, "")
    .trim();
}

function Footer({ location }) {
  const address = cleanFooterAddress(location?.address) || "Launch address coming soon";
  const email = location?.email || CONTACT_EMAIL;
  const phone = location?.phone || CONTACT_PHONE;
  const phoneDisplay = location?.phoneDisplay || CONTACT_PHONE_DISPLAY;
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <a className="footer-title" href={ROUTES.home}>
            Cave Modern Pilates
          </a>
          <p className="footer-address">
            <span>Studio</span>
            {address}
          </p>
        </div>

        <div className="footer-meta">
          <nav className="footer-nav" aria-label="Footer navigation">
            <span className="footer-label">Links</span>
            <div className="footer-link-list">
              {FOOTER_LINKS.map((item) => (
                <a key={item.page} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="footer-contact">
            <span className="footer-label">Contact</span>
            <div className="footer-contact-list">
              <a className="footer-social" href={INSTAGRAM_URL} aria-label="Cave Modern Pilates Instagram">
                <Instagram aria-hidden="true" size={22} strokeWidth={1.8} />
                <span>{SOCIAL_HANDLE}</span>
              </a>
              <a className="footer-social" href={TIKTOK_URL} aria-label="Cave Modern Pilates TikTok">
                <span className="tiktok-mark" aria-hidden="true">♪</span>
                <span>TikTok</span>
              </a>
              <a href={`tel:${phone}`}>{phoneDisplay}</a>
              <a href={`mailto:${email}`}>{email}</a>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>Copyright © {year} Cave Modern Pilates. All rights reserved.</span>
      </div>
    </footer>
  );
}

const ASSISTANT_QUICK_PROMPTS = [
  "Help me book a class",
  "Show pricing",
  "New client offer",
  "Cancellation policy"
];

function AiAssistant({ page, bookingUrl, clientSession }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I’m the Cave assistant. I can help with booking, pricing, memberships, policies, or getting in touch."
    }
  ]);

  const sendMessage = async (text = input) => {
    const message = String(text || "").trim();

    if (!message || isSending) {
      return;
    }

    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setIsSending(true);

    try {
      const result = await apiRequest("/api/assistant/chat", {
        method: "POST",
        body: {
          message,
          page,
          signedIn: Boolean(clientSession?.signedIn),
          returnTo: page === "schedule" ? ROUTES.schedule : window.location.pathname
        }
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: result.reply || "I can help with booking, pricing, memberships, policies, and contact info.",
          actions: Array.isArray(result.actions) ? result.actions : []
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "I’m having trouble connecting right now. You can still book, view pricing, or contact the studio from the links below.",
          actions: [
            { label: "Schedule", href: bookingUrl || ROUTES.schedule },
            { label: "Pricing", href: ROUTES.pricing },
            { label: "Contact", href: ROUTES.contact }
          ]
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  return (
    <aside className={`ai-assistant ${isOpen ? "is-open" : ""}`} aria-label="Cave virtual assistant">
      <button
        className="ai-assistant-trigger"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-label={isOpen ? "Close Cave assistant" : "Open Cave assistant"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X aria-hidden="true" size={23} /> : <MessageCircle aria-hidden="true" size={24} />}
      </button>

      {isOpen && (
        <section className="ai-assistant-panel">
          <div className="ai-assistant-header">
            <span className="ai-assistant-mark" aria-hidden="true">
              <Bot size={22} />
            </span>
            <div>
              <strong>Cave Assistant</strong>
              <span>Virtual studio help</span>
            </div>
          </div>

          <div className="ai-assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                <p>{message.text}</p>
                {message.actions?.length ? (
                  <div className="ai-message-actions">
                    {message.actions.map((action) => (
                      <a key={`${action.label}-${action.href}`} href={cleanInternalUrl(action.href, ROUTES.home)}>
                        {action.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {isSending ? (
              <div className="ai-message assistant ai-thinking">
                <p>Checking that for you...</p>
              </div>
            ) : null}
          </div>

          <div className="ai-quick-prompts" aria-label="Quick assistant prompts">
            {ASSISTANT_QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form className="ai-assistant-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-assistant-input">Ask the Cave assistant</label>
            <input
              id="ai-assistant-input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about classes, pricing, policies..."
              maxLength={280}
            />
            <button type="submit" aria-label="Send message" disabled={isSending || !input.trim()}>
              <Send aria-hidden="true" size={18} />
            </button>
          </form>
        </section>
      )}
    </aside>
  );
}

function InstagramLink() {
  return (
    <a className="social-icon-link" href={INSTAGRAM_URL} aria-label="Instagram">
      <Instagram aria-hidden="true" size={23} strokeWidth={1.8} />
    </a>
  );
}

function TikTokLink() {
  return (
    <a className="social-icon-link tiktok-link" href={TIKTOK_URL} aria-label="TikTok">
      <span aria-hidden="true">♪</span>
    </a>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

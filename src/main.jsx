import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, ChevronLeft, ChevronRight, Instagram, Menu, Minus, Plus, Search, X } from "lucide-react";
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
  "class-packs": "Cave Modern Pilates drop-ins and class packs with current pricing from the studio booking system.",
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

const SITE_URL = "https://cavemodernpilates.com";
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
      "Yes. Grip socks are required for safety and studio hygiene."
    ]
  },
  {
    id: "cancel-class",
    category: "Booking",
    question: "What is the class cancellation window?",
    answer: [
      "Classes must be canceled at least twelve hours before the scheduled class start time.",
      "Reservations canceled within twelve hours of class start time are considered late cancellations."
    ]
  },
  {
    id: "late-cancel",
    category: "Booking",
    question: "What happens if I late cancel?",
    answer: [
      "Package holders forfeit the class credit used to reserve the class.",
      "Unlimited members are charged the applicable late cancellation fee."
    ]
  },
  {
    id: "no-show",
    category: "Booking",
    question: "What happens if I no-show a class?",
    answer: [
      "Clients who reserve a class and do not attend without canceling are considered a no-show.",
      "Package holders forfeit the class credit used to reserve the class. Unlimited members are charged a $28 no-show fee.",
      "Repeated no-shows may result in temporary booking restrictions at management's discretion."
    ]
  },
  {
    id: "membership-classes",
    category: "Memberships",
    question: "How do 4-class and 8-class memberships work?",
    answer: [
      "A 4-Class Membership includes four classes per month. An 8-Class Membership includes eight classes per month.",
      "Unused classes expire at the end of each billing cycle and do not roll over into future months."
    ]
  },
  {
    id: "unlimited",
    category: "Memberships",
    question: "How does unlimited membership work?",
    answer: [
      "Unlimited Membership holders may attend one class per day.",
      "Multiple classes in the same calendar day are not permitted unless approved by management."
    ]
  },
  {
    id: "cancel-membership",
    category: "Memberships",
    question: "How do I cancel my membership?",
    answer: [
      "After completing the selected commitment term, members must provide written notice at least fourteen days before the next billing date.",
      "Members who cancel before completing their commitment term remain responsible for the remaining payments due under the agreement."
    ]
  },
  {
    id: "renewal-notice",
    category: "Memberships",
    question: "What if I do not want to renew?",
    answer: [
      "Please send written notice at least fourteen days before your next billing date if you do not plan to renew a membership or package.",
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

  return ["pricing", "newbie", "memberships", "class-packs", "schedule", "about", "contact", "faq", "login", "signup", "account", "terms", "policies"].includes(name) ? name : "home";
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

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
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
    throw error;
  }

  return data;
}

function useStudioCache() {
  const [cache, setCache] = useState(FALLBACK_CACHE);

  useEffect(() => {
    let isMounted = true;
    let pollTimer;

    async function loadCache() {
      if (window.location.protocol === "file:") {
        return;
      }

      try {
        const response = await fetch("data/studio-cache.json", { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const freshCache = await response.json();

        if (isMounted) {
          setCache(freshCache);
        }
      } catch (error) {
        console.info("Using embedded studio cache snapshot.", error);
      }
    }

    loadCache();
    pollTimer = window.setInterval(loadCache, STUDIO_CACHE_POLL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(pollTimer);
    };
  }, []);

  return { cache };
}

function useClientSession() {
  const [clientSession, setClientSessionState] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

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

    return () => {
      isMounted = false;
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
  const { cache } = useStudioCache();
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
        />
      </main>
      <Footer location={cache.location} />
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
  const accountHref = clientSession?.signedIn ? ROUTES.account : ROUTES.login;
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
          <a href={INSTAGRAM_URL} onClick={onCloseMenu}>
            Instagram
          </a>
          <a href={TIKTOK_URL} onClick={onCloseMenu}>
            TikTok
          </a>
        </nav>
        <a className="mobile-book" href={accountHref} onClick={onCloseMenu}>
          {accountLabel}
        </a>
      </div>
    </>
  );
}

function Page({ page, cache, bookingUrl, clientSession, setClientSession, isSessionLoading }) {
  if (page === "pricing") {
    return <PricingLandingPage store={cache.store || {}} memberships={cache.memberships || []} />;
  }

  const pricingCategory = PRICING_CATEGORIES.find((category) => category.page === page);

  if (pricingCategory) {
    return <PricingCategoryPage category={pricingCategory} store={cache.store || {}} memberships={cache.memberships || []} />;
  }

  if (page === "schedule") {
    return <SchedulePage schedule={cache.schedule || []} bookingUrl={bookingUrl} clientSession={clientSession} />;
  }

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
    return <SignupPage setClientSession={setClientSession} />;
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

function PricingCategoryPage({ category, store, memberships }) {
  const groups = pricingStoreGroups(store, memberships);
  const items = groups[category.key] || [];
  const [acceptWaiver] = useState(true);
  const [purchaseState, setPurchaseState] = useState({ itemId: "", type: "", message: "" });

  const buyItem = async (item) => {
    setPurchaseState({ itemId: item.id, type: "", message: "" });
    const waiverAccepted = item.requiresWaiver ? true : acceptWaiver;
    const termsAccepted = item.requiresTerms ? true : false;

    if (item.requiresWaiver && !waiverAccepted) {
      setPurchaseState({ itemId: item.id, type: "error", message: "Please accept the liability waiver first." });
      return;
    }

    setPurchaseState({ itemId: item.id, type: "loading", message: "Starting checkout..." });

    try {
      await apiRequest("/api/store/purchase", {
        method: "POST",
        body: {
          itemId: item.id,
          kind: item.kind,
          acceptWaiver: waiverAccepted,
          acceptTerms: termsAccepted,
          returnTo: `${category.href}?purchase=${item.kind}-${item.id}`
        }
      });

      setPurchaseState({ itemId: item.id, type: "success", message: "Purchase complete. Check your account for confirmation." });
    } catch (error) {
      if (error.loginUrl) {
        window.location.href = error.loginUrl;
        return;
      }

      setPurchaseState({ itemId: item.id, type: "error", message: error.message });
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
    classPacks: Array.isArray(store?.classPacks) && store.classPacks.length ? store.classPacks : fallback.classPacks || []
  };

  if (!groups.classPacks.length && legacyMemberships?.length) {
    groups.classPacks = legacyMemberships.map((item) => ({
      ...item,
      kind: "service",
      category: "classPacks",
      requiresWaiver: true,
      requiresTerms: false
    }));
  }

  return groups;
}

function PricingStoreSection({ id, title, items, category, purchaseState, onBuy }) {
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

function PricingCard({ item, category, purchaseState, onBuy }) {
  const isLoading = purchaseState.itemId === item.id && purchaseState.type === "loading";
  const message = purchaseState.itemId === item.id ? purchaseState.message : "";
  const titleLines = pricingTitleLines(item, category);

  return (
    <article className={`pricing-card ${category.key}`}>
      <div>
        <p className="pricing-card-price">{item.price || "Ask studio"}</p>
        <h3>
          {titleLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h3>
      </div>
      <div className="pricing-card-actions">
        <button className="book-class" type="button" disabled={isLoading || !item.id || item.sellOnline === false} onClick={() => onBuy(item)}>
          {isLoading ? "Starting..." : "Buy Now"}
        </button>
        {message ? <p className={`row-status ${purchaseState.type}`}>{message}</p> : null}
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

  const [packName, contractName] = cleanName.split(/\s+-\s+/);

  if (!contractName) {
    return [cleanName];
  }

  return [packName, contractName];
}

function SchedulePage({ schedule, bookingUrl, clientSession }) {
  return (
    <section className="schedule section page-section">
      <ScheduleList schedule={schedule} bookingUrl={bookingUrl} clientSession={clientSession} />
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

  return (
    <>
      <section className="contact-hero">
        <div className="contact-hero-copy">
          <h1>Contact Us</h1>
          <p>Questions before class, private sessions, or memberships? Send us a note and we’ll get back to you.</p>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>
        </div>
        <div className="contact-form-card" aria-label="Contact form preview">
          <label>
            Name
            <span />
          </label>
          <label>
            Email
            <span />
          </label>
          <label className="message-line">
            Message
            <span />
          </label>
          <a className="pill-button black" href={`mailto:${contact.email}`}>
            Contact Studio
          </a>
        </div>
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
          <span>$28 no-show fee for unlimited members</span>
          <span>14-day notice for non-renewals</span>
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

function LoginPage({ bookingUrl, clientSession, setClientSession }) {
  const [status, setStatus] = useState(oauthStatusFromQuery);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (clientSession?.signedIn) {
      window.location.href = ROUTES.account;
    }
  }, [clientSession]);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== "cave:auth:complete") {
        return;
      }

      setIsSigningIn(false);

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
        setStatus({ type: "error", message: error.message });
        return;
      }

      window.location.href = normalizeLocalReturnTo(event.data.returnTo);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setClientSession]);

  const startSignIn = () => {
    const returnTo = ROUTES.account;
    const popupUrl = `/api/auth/start?returnTo=${encodeURIComponent(returnTo)}&popup=1`;
    const fallbackUrl = `/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`;
    const width = 560;
    const height = 760;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(
      popupUrl,
      "caveSecureSignIn",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      window.location.href = fallbackUrl;
      return;
    }

    popup.focus();
    setIsSigningIn(true);
    setStatus({
      type: "success",
      message: "Secure sign-in opened. Finish there and this page will update automatically."
    });
  };

  return (
    <>
      <section className="login-page">
        <div className="login-copy">
          <h1>Sign in to your Cave account.</h1>
          <p>Use your studio account to book classes, review credits, and manage your Cave details in one place.</p>
        </div>

        <div className="login-panel">
          <button className="pill-button black" type="button" onClick={startSignIn} disabled={isSigningIn}>
            {isSigningIn ? "Waiting for Sign In..." : "Sign In"}
          </button>
          <a className="pill-button outline" href={ROUTES.signup}>
            Create Account
          </a>
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

function SignupPage({ setClientSession }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    birthDate: "",
    waiverParticipantName: "",
    waiverSignature: "",
    waiverDate: defaultWaiverDate(),
    guardianName: "",
    guardianSignature: "",
    mediaOptOut: false,
    acceptWaiver: false,
    acceptPolicies: false
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    if (form.password !== form.confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    const waiver = buildWaiverPayload(form);

    if (!waiver.participantName || !waiver.signature || !waiver.accepted) {
      setStatus({ type: "error", message: "Please complete and sign the liability waiver." });
      return;
    }

    if (!form.acceptPolicies) {
      setStatus({ type: "error", message: "Please accept the studio terms and policies." });
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await apiRequest("/api/auth/sign-up", {
        method: "POST",
        body: { ...form, waiver }
      });

      if (data.session?.signedIn) {
        setClientSession(data.session);
        window.location.href = ROUTES.account;
        return;
      }

      setStatus({ type: "success", message: "Account created. You are signed in on this site." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="login-page signup-page">
      <div className="login-copy">
        <h1>Start your Cave account.</h1>
        <p>Create your studio profile, complete the first-class waiver, and use the same account for booking.</p>
      </div>

      <form className="login-panel signup-panel" onSubmit={submit}>
        <div className="form-grid two">
          <FormField label="First Name" name="firstName" value={form.firstName} onChange={updateField} autoComplete="given-name" required />
          <FormField label="Last Name" name="lastName" value={form.lastName} onChange={updateField} autoComplete="family-name" required />
        </div>
        <FormField label="Email" name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required />
        <FormField label="Mobile Phone" name="phone" type="tel" value={form.phone} onChange={updateField} autoComplete="tel" required />
        <div className="form-grid two">
          <FormField label="Password" name="password" type="password" value={form.password} onChange={updateField} autoComplete="new-password" required />
          <FormField label="Confirm Password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={updateField} autoComplete="new-password" required />
        </div>
        <FormField label="Address" name="addressLine1" value={form.addressLine1} onChange={updateField} autoComplete="address-line1" required />
        <FormField label="Apt, Suite, Optional" name="addressLine2" value={form.addressLine2} onChange={updateField} autoComplete="address-line2" />
        <div className="form-grid three">
          <FormField label="City" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" required />
          <FormField label="State" name="state" value={form.state} onChange={updateField} autoComplete="address-level1" required />
          <FormField label="Zip" name="postalCode" value={form.postalCode} onChange={updateField} autoComplete="postal-code" required />
        </div>
        <FormField label="Birth Date" name="birthDate" type="date" value={form.birthDate} onChange={updateField} />
        <LiabilityWaiverForm form={form} onChange={updateField} />
        <label className="check-row">
          <input name="acceptPolicies" type="checkbox" checked={form.acceptPolicies} onChange={updateField} required />
          <span>
            I agree to the <a href={ROUTES.terms}>terms</a> and <a href={ROUTES.policies}>studio policies</a>.
          </span>
        </label>
        <button className="pill-button black" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating Account..." : "Create Account"}
        </button>
        <a className="pill-button outline" href={ROUTES.login}>
          Already Have an Account
        </a>
        {status.message ? <p className={`form-status ${status.type}`}>{status.message}</p> : null}
      </form>
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

      setStatus({ type: "error", message: error.message });
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
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      if (!clientSession?.signedIn) {
        return;
      }

      if (!clientSession.clientId) {
        setStatus({ type: "success", message: "Signed in. Client details will appear after the account ID is returned by the studio API." });
        return;
      }

      try {
        const data = await apiRequest("/api/client/dashboard");

        if (isMounted) {
          setDashboard(data);
          setStatus(data.errors?.length ? { type: "error", message: data.errors.join(" ") } : { type: "", message: "" });
        }
      } catch (error) {
        if (isMounted) {
          setStatus({ type: "error", message: error.message });
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [clientSession]);

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
          <a className="pill-button black" href={ROUTES.login}>Sign In</a>
          <a className="pill-button outline" href={ROUTES.signup}>Create Account</a>
          <a className="pill-button outline" href={bookingUrl}>View Schedule</a>
        </div>
      </section>
    );
  }

  const user = clientSession.user || {};

  return (
    <section className="account-page section">
      <div className="account-header">
        <div>
          <p className="kicker">Account</p>
          <h1>{user.firstName ? `Hi, ${user.firstName}.` : "Your Cave account."}</h1>
          <p>{user.email || user.username}</p>
        </div>
        <button className="pill-button outline" type="button" onClick={signOut}>Sign Out</button>
      </div>

      <div className="account-grid">
        <AccountCard title="Upcoming Bookings" data={dashboard?.schedule} empty="Upcoming bookings will appear here." />
        <AccountCard title="Class Credits" data={dashboard?.services} empty="Class credits will appear here." />
        <AccountCard title="Memberships" data={dashboard?.contracts} empty="Membership details will appear here." />
      </div>

      {status.message ? <p className={`form-status ${status.type}`}>{status.message}</p> : null}
      <a className="pill-button black" href={bookingUrl}>View Schedule</a>
    </section>
  );
}

function AccountCard({ title, data, empty }) {
  const preview = JSON.stringify(data || {}, null, 2);

  return (
    <article className="account-card">
      <h2>{title}</h2>
      {data ? <pre>{preview.length > 700 ? `${preview.slice(0, 700)}...` : preview}</pre> : <p>{empty}</p>}
    </article>
  );
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

function ScheduleList({ schedule, bookingUrl, clientSession }) {
  const rows = schedule.length ? schedule : FALLBACK_CACHE.schedule;
  const [bookingState, setBookingState] = useState({ classId: null, type: "", message: "" });
  const visibleDayCount = useScheduleDayCount();
  const requestedClassId = new URLSearchParams(window.location.search).get("classId");
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

  if (!sortedDays.length) {
    return <p className="empty-schedule">No upcoming classes are available right now.</p>;
  }

  const goToDay = (nextIndex) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), sortedDays.length - 1);
    const nextDay = sortedDays[boundedIndex];

    setBookingState({ classId: null, type: "", message: "" });
    setActiveDayIndex(boundedIndex);

    if (nextDay?.key) {
      setCalendarMonthKey(nextDay.key.slice(0, 7));
    }
  };

  const goToCalendarMonth = (offset) => {
    const nextMonthKey = addMonthsToKey(calendarMonthKey, offset);

    if ((firstMonthKey && nextMonthKey < firstMonthKey) || (lastMonthKey && nextMonthKey > lastMonthKey)) {
      return;
    }

    setCalendarMonthKey(nextMonthKey);
  };

  const selectCalendarDay = (day) => {
    if (day.scheduleIndex === null) {
      return;
    }

    goToDay(day.scheduleIndex);
    setCalendarOpen(false);
  };

  const bookClass = async (classItem) => {
    const classId = classItem.id;

    if (!classId) {
      setBookingState({ classId: null, type: "error", message: "This class is missing a booking ID." });
      return;
    }

    if (!clientSession?.signedIn) {
      window.location.href = `/api/auth/start?returnTo=${encodeURIComponent(`${ROUTES.schedule}?classId=${classId}`)}`;
      return;
    }

    setBookingState({ classId, type: "loading", message: "Booking..." });

    try {
      await apiRequest("/api/classes/book", {
        method: "POST",
        body: { classId }
      });
      setBookingState({ classId, type: "success", message: "Booked. Check your account for confirmation." });
    } catch (error) {
      if (error.loginUrl) {
        window.location.href = error.loginUrl;
        return;
      }

      setBookingState({ classId, type: "error", message: error.message });
    }
  };

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
        const spotsText =
          classItem.spotsLeft === "" || classItem.spotsLeft === null || classItem.spotsLeft === undefined
            ? "Check availability"
            : `${classItem.spotsLeft} left`;

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
              <strong>{spotsText}</strong>
            </div>
            <div className="schedule-booking">
              <button
                className="book-class"
                type="button"
                disabled={bookingState.classId === classItem.id && bookingState.type === "loading"}
                onClick={() => bookClass(classItem)}
              >
                {bookingState.classId === classItem.id && bookingState.type === "loading" ? "Booking..." : "Book"}
              </button>
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

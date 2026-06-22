export const FALLBACK_CACHE = {
  generatedAt: "2026-06-10T09:00:00-04:00",
  source: "fallback studio cache snapshot",
  booking: {
    scheduleUrl: "/schedule",
    accountUrl: "https://clients.mindbodyonline.com/classic/ws?studioid=5753835&stype=-7&sView=week&sLoc=0",
    mode: "booking-api-cache"
  },
  memberships: [
    {
      name: "Drop in",
      sourceName: "Drop in",
      sessions: 1,
      serviceType: "Classes",
      serviceCategory: "CAVE MODERN PILATES",
      price: "$45.00",
      sellOnline: true,
      imagePosition: "48% 76%"
    },
    {
      name: "4 class pack",
      sourceName: "4 class pack-3 months contract",
      sessions: 4,
      serviceType: "Classes",
      serviceCategory: "CAVE MODERN PILATES",
      price: "$150.00",
      sellOnline: false,
      imagePosition: "34% 42%"
    },
    {
      name: "5 class pack",
      sourceName: "5 class pack",
      sessions: 5,
      serviceType: "Classes",
      serviceCategory: "CAVE MODERN PILATES",
      price: "$190.00",
      sellOnline: true,
      imagePosition: "72% 48%"
    },
    {
      name: "10 class pack",
      sourceName: "10 class pack",
      sessions: 10,
      serviceType: "Classes",
      serviceCategory: "CAVE MODERN PILATES",
      price: "$350.00",
      sellOnline: true,
      imagePosition: "60% 72%"
    }
  ],
  store: {
    newbie: [
      {
        id: "100006",
        kind: "service",
        category: "newbie",
        name: "New Client Drop in",
        price: "$22.50",
        sessions: 1,
        description: "Expires in 1 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      },
      {
        id: "100007",
        kind: "service",
        category: "newbie",
        name: "New Client 3 class package",
        price: "$65.00",
        sessions: 3,
        description: "Expires in 1 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      }
    ],
    memberships: [
      {
        id: "101",
        kind: "contract",
        category: "memberships",
        name: "4 class pack-3 months contract",
        price: "$150.00",
        sessions: 4,
        commitmentMonths: 3,
        description: "4 classes/month",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: true
      },
      {
        id: "104",
        kind: "contract",
        category: "memberships",
        name: "8 class pack-3 months contract",
        price: "$275.00",
        sessions: 8,
        commitmentMonths: 3,
        description: "8 classes/month",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: true
      }
    ],
    classPacks: [
      {
        id: "100031",
        kind: "service",
        category: "classPacks",
        name: "Cave1",
        price: "$30.00",
        sessions: 1,
        description: "Expires in 12 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      },
      {
        id: "100004",
        kind: "service",
        category: "classPacks",
        name: "Drop in",
        price: "$45.00",
        sessions: 1,
        description: "Expires in 1 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      },
      {
        id: "100008",
        kind: "service",
        category: "classPacks",
        name: "5 class pack",
        price: "$190.00",
        sessions: 5,
        description: "Expires in 1 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      },
      {
        id: "100009",
        kind: "service",
        category: "classPacks",
        name: "10 class pack",
        price: "$350.00",
        sessions: 10,
        description: "Expires in 1 months",
        sellOnline: true,
        requiresWaiver: true,
        requiresTerms: false
      }
    ]
  },
  waiver: {
    title: "Cave Pilates, LLC Waiver and Release of Liability",
    url: "/policies#liability-waiver",
    version: "2026-06-14",
    requiredBeforeFirstClass: true
  },
  schedule: [
    {
      date: "Thu Jun 11",
      time: "7:00 AM",
      className: "Modern Reformer",
      instructor: "Ari",
      spotsLeft: 4
    },
    {
      date: "Thu Jun 11",
      time: "9:30 AM",
      className: "Cave Foundations",
      instructor: "Maya",
      spotsLeft: 2
    },
    {
      date: "Thu Jun 11",
      time: "5:30 PM",
      className: "Power Control",
      instructor: "Jordan",
      spotsLeft: 1
    }
  ],
  location: {
    address: "Launch address coming soon",
    parking: "Parking details coming soon.",
    hours: "",
    email: "support@cavemodernpilates.com",
    phone: "7085715730",
    phoneDisplay: "(708) 571-5730"
  }
};

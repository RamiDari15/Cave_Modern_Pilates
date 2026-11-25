import React, { useEffect, useState } from "react";
import { BLACK_FRIDAY_WINDOW } from "./promotionWindows";
import "./blackFriday.css";

// Sitewide Black Friday surfaces. Each one is only rendered while
// isBlackFridaySaleActive() is true, so the site returns to normal on its own
// when the window in promotionWindows.js closes.

const DEALS = [
  { group: "newbie", price: "$59", title: "The Cave Intro", detail: "14 days unlimited · new clients" },
  { group: "packs", price: "+1 free", title: "5 Class Pack", detail: "Buy 5, get 6 classes" },
  { group: "packs", price: "+2 free", title: "10 Class Pack", detail: "Buy 10, get 12 classes" },
  { group: "memberships", price: "$30 off", title: "3-Month Membership", detail: "Off your first month" },
  { group: "memberships", price: "1st month free", title: "12-Month Membership", detail: "Your first month is on us" }
];

const CATEGORY_CALLOUTS = {
  newbie: { group: "newbie", text: <>Black Friday: <strong>The Cave Intro is $59</strong> for 14 days unlimited.</> },
  classPacks: { group: "packs", text: <>Black Friday: <strong>buy 5, get 1 free</strong> and <strong>buy 10, get 2 free</strong>.</> },
  memberships: { group: "memberships", text: <>Black Friday: <strong>$30 off</strong> your first month on 3-month plans, <strong>first month free</strong> on 12-month plans.</> }
};

export function useSaleCountdown(endsAt = BLACK_FRIDAY_WINDOW.endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return formatSaleCountdown(endsAt - now);
}

export function formatSaleCountdown(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function BlackFridayHomeBand() {
  const left = useSaleCountdown();
  return <section className="bf-home" aria-labelledby="bf-home-title">
    <div className="bf-home-inner">
      <div className="bf-home-head">
        <p className="bf-eyebrow">Cave Modern Pilates · November 23–30</p>
        <h2 id="bf-home-title">Black Friday <em>Sale</em></h2>
        <p className="bf-home-lede">Our best price of the year for new clients, plus a deal on every class pack and membership.</p>
        <div className="bf-home-actions">
          <a className="bf-home-cta" href="/black-friday">Shop the sale <span aria-hidden="true">↗</span></a>
          <span className="bf-home-timer" aria-live="off">Ends in <strong>{left}</strong></span>
        </div>
      </div>
      <a className="bf-home-hero-deal" href="/black-friday#newbie">
        <span className="bf-eyebrow">New clients · best deal</span>
        <strong>$59</strong>
        <span>14 days of unlimited reformer classes</span>
      </a>
    </div>
    <ul className="bf-home-deals">
      {DEALS.slice(1).map(deal => <li key={deal.title}><a href={`/black-friday#${deal.group}`}><span className="bf-home-deal-price">{deal.price}</span><span className="bf-home-deal-title">{deal.title}</span><span className="bf-home-deal-detail">{deal.detail}</span></a></li>)}
    </ul>
  </section>;
}

export function BlackFridayCategoryCallout({ categoryKey }) {
  const callout = CATEGORY_CALLOUTS[categoryKey];
  if (!callout) return null;
  return <a className="bf-callout" href={`/black-friday#${callout.group}`}>
    <span>{callout.text}</span>
    <span className="bf-callout-link">See the deal <span aria-hidden="true">↗</span></span>
  </a>;
}

export function BlackFridayCompactBand() {
  const left = useSaleCountdown();
  return <section className="bf-compact" aria-label="Black Friday sale">
    <div><p className="bf-eyebrow">Black Friday · ends in {left}</p><h2>$59 for 14 days unlimited.</h2><p>Plus free classes on packs and first-month deals on memberships.</p></div>
    <a className="bf-home-cta" href="/black-friday">Shop the sale <span aria-hidden="true">↗</span></a>
  </section>;
}

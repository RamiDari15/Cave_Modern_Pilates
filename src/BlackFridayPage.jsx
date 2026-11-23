import React from "react";
import blackFridayArtwork from "../assets/black-friday-bubble-source.png";
import "./blackFriday.css";

const groups = [
  { id: "newbie", title: "Newbie Deals", note: "For your first classes at Cave.", offers: [
    ["The Cave Intro", "$59", "14 days unlimited", "New clients only."]
  ] },
  { id: "packs", title: "Class Pack Deals", note: "Extra classes, included.", offers: [
    ["Buy 5, Get 1 Free", "$159", "6 classes", "5 classes + 1 free."],
    ["Buy 10, Get 2 Free", "$279", "12 classes", "10 classes + 2 free."]
  ] },
  { id: "memberships", title: "Membership Deals", note: "4 classes, 8 classes, or unlimited.", offers: [
    ["3-Month Memberships", "$30 off", "Your first month", "Regular monthly pricing after month one."],
    ["12-Month Memberships", "First month free", "12-month commitment", "Regular monthly pricing after month one."]
  ] }
];

export default function BlackFridayPage({ active = false, expired = false, liveOffers = [], renderOffer }) {
  if (expired) return <div className="bf-page"><header className="bf-hero"><div className="bf-hero-body"><div><h1>The sale has ended.</h1><a href="/pricing">View regular pricing →</a></div></div></header></div>;
  return <div className="bf-page">
    <header className="bf-hero">
      <div className="bf-hero-meta"><p className="bf-eyebrow">Cave Modern Pilates</p><span>November 23–30</span></div>
      <div className="bf-hero-body"><div><p className="bf-sale-label">The Cave sale</p><h1>Black Friday</h1><span className="bf-status">{active ? "Through November 30" : "Opens November 23"}</span></div><div className="bf-hero-art bf-bubble" aria-hidden="true"><img src={blackFridayArtwork} alt="" /></div></div>
      <nav className="bf-tabs" aria-label="Black Friday deals">
        {groups.map(group => <a key={group.id} href={`#${group.id}`}>{group.title}<span aria-hidden="true">↓</span></a>)}
      </nav>
    </header>
    {groups.map(group => <section className="bf-group" id={group.id} key={group.id}>
      <div className="bf-heading"><h2>{group.title}</h2><p>{group.note}</p></div>
      <div className="bf-offers">{active && liveOffers.filter(item => group.id === "memberships" ? item.kind === "contract" : group.id === "newbie" ? String(item.id) === "100066" : ["100067", "100068"].includes(String(item.id))).length > 0 ? liveOffers.filter(item => group.id === "memberships" ? item.kind === "contract" : group.id === "newbie" ? String(item.id) === "100066" : ["100067", "100068"].includes(String(item.id))).map(renderOffer) : group.offers.map(([name, price, detail, copy]) => <article className="bf-offer" key={name}>
        <p className="bf-eyebrow">Black Friday</p><h3>{name}</h3><p className="bf-price">{price}</p><strong>{detail}</strong><p>{copy}</p>
        <button disabled type="button">{active ? "Not available online yet" : "Opens November 23"}</button>
      </article>)}</div>
    </section>)}
    <a className="bf-back" href="/pricing">View regular pricing →</a>
  </div>;
}

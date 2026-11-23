import React from "react";
import "./blackFriday.css";

const groups = [
  { id: "newbie", title: "Newbie Deals", note: "A little more time to make Cave your own.", offers: [
    ["The Cave Intro", "$59", "14 days unlimited", "For new clients. Unlimited reformer classes for two weeks."]
  ] },
  { id: "packs", title: "Class Pack Deals", note: "Your usual pack, with a few extra visits.", offers: [
    ["Buy 5, Get 1 Free", "$159", "6 classes", "One bonus class included."],
    ["Buy 10, Get 2 Free", "$279", "12 classes", "Two bonus classes included."]
  ] },
  { id: "memberships", title: "Membership Deals", note: "Choose your commitment. Enjoy a little extra at the start.", offers: [
    ["3-Month Memberships", "$30 off", "Your first month", "Available on 4-class, 8-class, and unlimited memberships. Regular monthly pricing follows."],
    ["12-Month Memberships", "First month free", "12-month commitment", "Available on 4-class, 8-class, and unlimited memberships. Regular monthly pricing follows."]
  ] }
];

export default function BlackFridayPage() {
  return <div className="bf-page">
    <header className="bf-hero">
      <p className="bf-eyebrow">Cave Modern Pilates · November 26–December 3</p>
      <h1>Black Friday</h1>
      <p>More time at Cave. A little less on you.</p>
      <span className="bf-status">Sale preview · Purchases not open yet</span>
      <nav className="bf-tabs" aria-label="Black Friday deals">
        {groups.map(group => <a key={group.id} href={`#${group.id}`}>{group.title}<span aria-hidden="true">↓</span></a>)}
      </nav>
    </header>
    {groups.map(group => <section className="bf-group" id={group.id} key={group.id}>
      <div className="bf-heading"><h2>{group.title}</h2><p>{group.note}</p></div>
      <div className="bf-offers">{group.offers.map(([name, price, detail, copy]) => <article className="bf-offer" key={name}>
        <p className="bf-eyebrow">Black Friday</p><h3>{name}</h3><p className="bf-price">{price}</p><strong>{detail}</strong><p>{copy}</p>
        <button disabled type="button">Purchases not open yet</button>
      </article>)}</div>
    </section>)}
    <a className="bf-back" href="/pricing">View regular pricing →</a>
  </div>;
}

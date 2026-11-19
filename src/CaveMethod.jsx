import React from "react";
import sections from "./reformerContent.json";
const images = import.meta.glob("../assets/reformer-*.jpg", { eager: true, query: "?url", import: "default" });
export default function CaveMethod() {
  return <div className="reformer-page">
    <section className="reformer-hero"><p className="reformer-kicker">The Cave Method</p><h1>Get to know our<br />reformer.</h1><p>Every Cave class is built on one machine. Here is every part of our customized Cave reformer so you can walk in on day one knowing exactly where to step, what to hold, and what each strap is for.</p></section>
    {sections.map(section => <section className="reformer-section" key={section.image}>
      <img src={images[`../assets/${section.image}`]} alt={section.alt} loading="lazy" />
      <div><p className="reformer-kicker">{section.eyebrow}</p><h2>{section.title}</h2><dl>{section.terms.map(term => <div key={term.title}><dt>{term.title}</dt><dd>{term.body}</dd></div>)}</dl></div>
    </section>)}
    <section className="reformer-outro"><h2>Ready to meet it in person?</h2><p>Arrive 10 minutes early for your first class and your instructor will help you get comfortable on the reformer.</p><a className="pill-button black" href="/newbie">See the new client offer</a> <a className="pill-button" href="/schedule">View the schedule</a></section>
  </div>;
}

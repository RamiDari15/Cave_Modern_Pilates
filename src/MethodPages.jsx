import React, { useEffect, useRef } from "react";
import "./methodPages.css";

// Fades sections in as they scroll into view. Everything stays visible when
// motion is reduced or IntersectionObserver isn't available.
export function useMethodReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const items = [...root.querySelectorAll("[data-reveal]")];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.classList.add("is-in"));
      return undefined;
    }
    root.classList.add("can-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return ref;
}

function MethodHero({ title, lead, children }) {
  return (
    <header className="method-hero">
      <p className="method-kicker">The Cave Method</p>
      <h1>{title}</h1>
      <p className="method-lead">{lead}</p>
      {children}
    </header>
  );
}

const CLASSES = [
  {
    name: "Cave Signature",
    minutes: 50,
    level: "All levels",
    focus: "Full body",
    description:
      "Cave Signature is our 50-minute, all-levels class on the custom Cave reformer. Expect a low-impact, high-intensity, full-body workout built around slow, controlled movements. Your instructor will guide you through each exercise and offer modifications or ways to increase the challenge, so you can work at a level that feels right for you. Each class ends with a mindful stretch and a moment to thank your body for the work it’s done."
  },
  {
    name: "Cave Intro",
    minutes: 50,
    level: "New to Cave",
    focus: "First class",
    description:
      "New to Cave and feeling a little nervous about your first reformer class? Cave Intro is a 50-minute class that gives you time to get comfortable. Your instructor will walk you through our custom Cave reformer, then guide you slowly through each movement, explaining how to set up and what you should feel. You’ll have time to practice and ask questions so you feel ready for our all-levels Cave Signature class."
  },
  {
    name: "Cave Intensified",
    minutes: 50,
    level: "Advanced",
    focus: "Coordination",
    description:
      "A 50-minute advanced class for clients with previous reformer experience. Each sequence challenges your coordination by engaging multiple muscle groups at once. Intensified spring loads and more demanding body positions build on the skills you’ve developed in Cave Signature."
  },
  {
    name: "Cave Power Hour",
    minutes: 60,
    level: "Advanced",
    focus: "Strength",
    description:
      "A 60-minute advanced reformer class that builds on Cave’s signature low-impact, high-intensity, full-body strength workout. Expect slow, controlled movement with more challenging body positions and spring settings from the start. This class is designed for experienced clients who are comfortable on the reformer and ready to move through class without instructor-led modifications."
  },
  {
    name: "Cave Stretch",
    minutes: 50,
    level: "All levels",
    focus: "Mobility",
    description:
      "Cave Stretch is a 50-minute, all-levels class that gives you time to slow down, unwind, and work on flexibility and mobility. Your instructor will guide you through gentle stretches, giving you time to breathe, settle into each position, and move at your own pace. It’s a great way to release tension after a Cave Signature class or enjoy a lighter movement day on its own."
  },
  {
    name: "Ass & Abs",
    minutes: 50,
    level: "All levels",
    focus: "Glutes & core",
    description:
      "A 50-minute reformer class focused on your glutes and core. Expect slow, controlled movements that challenge your glutes, holds that fire up your abs, and exercises that bring both together. You’ll build strength and stability with the low-impact, high-intensity style you know from Cave Signature."
  },
  {
    name: "Yalla Move x Cave",
    minutes: 50,
    level: "All levels",
    focus: "High energy",
    description:
      "Yalla Move x Cave is an upbeat, 50-minute reformer class that pairs the Cave Signature format with Middle Eastern beats. The playlist keeps the energy high as you move through a low-impact, high-intensity workout at Cave’s signature slow, controlled pace."
  }
];

const PATH = [
  ["Start", "Cave Intro", "Learn the reformer at an easy pace."],
  ["Build", "Cave Signature", "Our all-levels class, any day of the week."],
  ["Advance", "Intensified & Power Hour", "Heavier springs, harder positions."]
];

export function ClassTypes() {
  const ref = useMethodReveal();
  return (
    <div className="method-page" ref={ref}>
      <MethodHero title="Class types" lead="Find your pace. Make it your practice. Every class runs on the custom Cave reformer, low impact and high intensity.">
        <div className="method-actions">
          <a className="method-button is-dark" href="/schedule">View the schedule</a>
          <a className="method-button" href="/newbie">New client offer</a>
        </div>
      </MethodHero>

      <section className="method-path" data-reveal aria-label="Where to start">
        {PATH.map(([step, name, text], index) => (
          <div className="method-path-step" key={step} style={{ "--i": index }}>
            <span>{step}</span>
            <strong>{name}</strong>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="method-class-grid">
        {CLASSES.map((item, index) => (
          <article className="method-class-card" key={item.name} data-reveal style={{ "--i": index % 2 }}>
            <div className="method-class-top">
              <span className="method-duration">
                <b>{item.minutes}</b> min
              </span>
            </div>
            <h2>{item.name}</h2>
            <ul className="method-tags">
              <li>{item.level}</li>
              <li>{item.focus}</li>
            </ul>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="method-cta" data-reveal>
        <h2>Not sure where to start?</h2>
        <p>Book Cave Intro for your first class. Your instructor will walk you through the reformer before you move on to Cave Signature.</p>
        <div className="method-actions">
          <a className="method-button is-light" href="/schedule">Book a class</a>
          <a className="method-button is-ghost" href="/meet-your-reformer">Meet the reformer</a>
        </div>
      </section>
    </div>
  );
}

const BEFORE = [
  "Ask your OB-GYN or midwife whether reformer Pilates is right for you.",
  "Tell your instructor how far along you are or how recently you gave birth.",
  "Share any exercise guidance or restrictions from your care team."
];

const STAGES = [
  {
    id: "first",
    label: "First trimester",
    points: [
      "Choose a pace that lets you carry on a conversation.",
      "When cleared, continue familiar movements that feel comfortable.",
      "Keep water nearby, ask for modifications, and take breaks as needed."
    ]
  },
  {
    id: "second",
    label: "Second trimester",
    points: [
      "No exercises on the back platform of the reformer.",
      "All spring loads will be modified. You can also use a smaller range of motion or change positions for comfort.",
      "We swap crunches and twisting exercises for supported core work, such as a plank."
    ]
  },
  {
    id: "third",
    label: "Third trimester",
    points: [
      "Continue the second-trimester modifications, including adjusted springs and front-of-reformer work.",
      "We replace planks on the toes with more supported positions, such as forearms and knees.",
      "Modified spring loads. You can also use a smaller range of motion or change positions for comfort."
    ]
  },
  {
    id: "after",
    label: "Returning after birth",
    note: "Welcome back!",
    points: [
      "Get your doctor’s clearance before returning to reformer classes, especially after a C-section or birth complications.",
      "Start with gentle breathing, pelvic tilts, and supported floor or kneeling exercises, similar to the third trimester.",
      "As you feel stronger and more comfortable, slowly add longer holds, twists, and lunges on the moving carriage."
    ]
  }
];

const MOVEMENTS = [
  ["Inner thighs", "Strengthen the muscles that draw your legs together and help you control your hips as you shift your weight."],
  ["Supported squats & floor lunges", "Works your glutes and legs for everyday tasks like climbing stairs or getting up from the floor."],
  ["Chest openers & rows", "Works your shoulders and upper back, building strength for holding and carrying your baby."],
  ["Breath & core connection", "Helps you practice breathing through effort and feel how your core and pelvis move together."]
];

const PAUSE = [
  ["During pregnancy", "Stop exercising and contact your maternity care team promptly if you experience vaginal bleeding, leaking fluid, painful regular contractions, or dizziness."],
  ["After birth", "Pause if a movement causes pain, pelvic heaviness, or bladder leakage. Ask your provider or a pelvic floor physical therapist for guidance."],
  ["During pregnancy or postpartum", "Seek immediate medical care for chest pain or trouble breathing."]
];

export function PrenatalPostnatal() {
  const ref = useMethodReveal();
  return (
    <div className="method-page" ref={ref}>
      <MethodHero title={<>Prenatal &amp; postnatal</>} lead="Movement that meets you where you are. How we adapt Cave classes through each trimester and after birth.">
        <div className="method-jump" aria-label="Jump to a stage">
          {STAGES.map((stage) => (
            <a key={stage.id} href={`#${stage.id}`}>{stage.label}</a>
          ))}
        </div>
      </MethodHero>

      <section className="method-block" data-reveal>
        <div className="method-block-head">
          <p className="method-kicker">Start here</p>
          <h2>Before your first class</h2>
        </div>
        <ol className="method-steps">
          {BEFORE.map((text, index) => (
            <li key={text} style={{ "--i": index }}>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="method-block">
        <div className="method-block-head" data-reveal>
          <p className="method-kicker">Stage by stage</p>
          <h2>How we adapt your class</h2>
        </div>
        <div className="method-timeline">
          {STAGES.map((stage, index) => (
            <article className="method-stage" id={stage.id} key={stage.id} data-reveal>
              <div className="method-stage-label">
                <h3>{stage.label}</h3>
                {stage.note && <p className="method-stage-note">{stage.note}</p>}
              </div>
              <ul>
                {stage.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="method-block method-panel" data-reveal>
        <div className="method-block-head">
          <p className="method-kicker">Pregnancy &amp; postpartum</p>
          <h2>Supporting movements</h2>
        </div>
        <div className="method-moves">
          {MOVEMENTS.map(([title, text], index) => (
            <article key={title} style={{ "--i": index }}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="method-block" data-reveal>
        <div className="method-block-head">
          <p className="method-kicker">Listen to your body</p>
          <h2>When to pause</h2>
        </div>
        <div className="method-pause">
          {PAUSE.map(([title, text], index) => (
            <article key={title} className={index === 2 ? "is-urgent" : undefined}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <p className="method-disclaimer">
          This guide doesn’t replace medical advice. Your care team’s guidance always comes first.
        </p>
      </section>

      <section className="method-cta" data-reveal>
        <h2>Questions before you book?</h2>
        <p>Tell us where you are in your pregnancy or recovery and we’ll help you choose a class.</p>
        <div className="method-actions">
          <a className="method-button is-light" href="/contact">Talk to the Cave team</a>
          <a className="method-button is-ghost" href="/class-types">See class types</a>
        </div>
      </section>
    </div>
  );
}

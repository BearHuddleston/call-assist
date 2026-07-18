"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CallOutcome,
  CallPlan,
  CallRequest,
  TranscriptTurn,
} from "@/lib/contracts";
import { DEMO_DESTINATIONS } from "@/lib/safety";

type Stage = "setup" | "review" | "call" | "outcome";
type CallStatus = "connecting" | "connected" | "ending";
type ScriptTurn = Omit<TranscriptTurn, "id"> & { approvalGate?: string };

const steps: Array<{ id: Stage; label: string }> = [
  { id: "setup", label: "Set up" },
  { id: "review", label: "Review" },
  { id: "call", label: "Call" },
  { id: "outcome", label: "Outcome" },
];

const boundaryOptions = [
  "Ask me before making any reservation or commitment.",
  "Do not share my date of birth, address, or account credentials.",
  "Do not agree to charges, payments, or purchases.",
] as const;

function scriptedCall(destinationId: string): ScriptTurn[] {
  if (destinationId === "lakeside-center") {
    return [
      { speaker: "agent", text: "Hello, I’m an AI accessibility assistant calling for Maya. Maya is following with live captions. May we continue with live transcription?" },
      { speaker: "business", text: "Yes, that’s okay. How can I help?" },
      { speaker: "agent", text: "Thank you. Maya would like to know whether the Tuesday evening beginner pottery class still has space." },
      { speaker: "business", text: "There are two spaces left. The class begins Tuesday at 6:30 PM and materials are included." },
      { speaker: "agent", text: "Is registration free, and is there an accessible entrance near the studio?" },
      { speaker: "business", text: "Registration is free for members. The north entrance is step-free. I can register Maya now if she’d like.", approvalGate: "Register for the Tuesday pottery class" },
      { speaker: "agent", text: "Maya has approved the registration. Please go ahead." },
      { speaker: "business", text: "All set. Her confirmation code is LCC-6318. Please arrive ten minutes early." },
      { speaker: "agent", text: "Thank you. I’ll share that confirmation and arrival note with Maya. Goodbye." },
    ];
  }

  return [
    { speaker: "agent", text: "Hello, I’m an AI accessibility assistant calling for Maya. Maya is following with live captions. May we continue with live transcription?" },
    { speaker: "business", text: "Yes, that’s fine. How can I help today?" },
    { speaker: "agent", text: "Thank you. Maya would like to reserve a quiet study room next Tuesday at 2:00 PM for two people." },
    { speaker: "business", text: "Let me check. We have a quiet room available from 2:00 to 4:00 PM." },
    { speaker: "agent", text: "Great. Is there a fee, and what should Maya bring when she arrives?" },
    { speaker: "business", text: "There’s no fee. She should bring a library card or photo ID. I can hold the room now.", approvalGate: "Reserve the room Tuesday from 2:00 to 4:00 PM" },
    { speaker: "agent", text: "Maya has approved the reservation. Please hold the room." },
    { speaker: "business", text: "It’s reserved. The confirmation number is WSL-2481." },
    { speaker: "agent", text: "Thank you. I’ll give Maya the confirmation number and arrival details. Goodbye." },
  ];
}

function speakerLabel(speaker: TranscriptTurn["speaker"]): string {
  if (speaker === "agent") return "Call Assist";
  if (speaker === "business") return "Business";
  if (speaker === "user") return "You";
  return "Call status";
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [destinationId, setDestinationId] = useState("westside-library");
  const [goal, setGoal] = useState(
    "Reserve a quiet study room next Tuesday at 2:00 PM for two people",
  );
  const [facts, setFacts] = useState(
    "Preferred time: Tuesday at 2:00 PM\nTwo people\nName to use: Maya",
  );
  const [boundaries, setBoundaries] = useState<string[]>([...boundaryOptions]);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [plan, setPlan] = useState<CallPlan | null>(null);
  const [activeRequest, setActiveRequest] = useState<CallRequest | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("connecting");
  const [paused, setPaused] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [captions, setCaptions] = useState<TranscriptTurn[]>([]);
  const [guidance, setGuidance] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [approvedDecision, setApprovedDecision] = useState(false);
  const captionEndRef = useRef<HTMLDivElement | null>(null);
  const guidanceRef = useRef<HTMLInputElement | null>(null);
  const endingRef = useRef(false);

  const selectedDestination = useMemo(
    () =>
      DEMO_DESTINATIONS.find((destination) => destination.id === destinationId) ??
      DEMO_DESTINATIONS[0],
    [destinationId],
  );
  const script = useMemo(() => scriptedCall(destinationId), [destinationId]);
  const activeStep = steps.findIndex((step) => step.id === stage);

  useEffect(() => {
    captionEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [captions, pendingApproval]);

  const finishCall = useCallback(
    async (status: CallOutcome["status"]) => {
      if (endingRef.current || !activeRequest) return;
      endingRef.current = true;
      setCallStatus("ending");
      setPaused(true);
      setPendingApproval(null);

      try {
        const response = await fetch("/api/outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: activeRequest, transcript: captions, status }),
        });
        const data = (await response.json()) as CallOutcome & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not create the outcome.");
        setOutcome(data);
        setCaptions([]);
        setStage("outcome");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not create the outcome.");
        endingRef.current = false;
        setCallStatus("connected");
        setPaused(false);
      }
    },
    [activeRequest, captions],
  );

  useEffect(() => {
    if (stage !== "call" || callStatus !== "connecting") return;
    const timer = window.setTimeout(() => setCallStatus("connected"), 900);
    return () => window.clearTimeout(timer);
  }, [stage, callStatus]);

  useEffect(() => {
    if (
      stage !== "call" ||
      callStatus !== "connected" ||
      paused ||
      pendingApproval
    ) {
      return;
    }

    if (turnIndex >= script.length) {
      const timer = window.setTimeout(() => void finishCall("completed"), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      const nextTurn = script[turnIndex];
      setCaptions((current) => [
        ...current,
        { id: `script-${turnIndex}`, speaker: nextTurn.speaker, text: nextTurn.text },
      ]);
      setTurnIndex((current) => current + 1);
      if (nextTurn.approvalGate) {
        setPendingApproval(nextTurn.approvalGate);
        setPaused(true);
      }
    }, turnIndex === 0 ? 600 : 1450);

    return () => window.clearTimeout(timer);
  }, [callStatus, finishCall, paused, pendingApproval, script, stage, turnIndex]);

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!safetyConfirmed) {
      setError("Confirm that this is a user-initiated, low-risk call before continuing.");
      return;
    }
    setLoading(true);

    const request: CallRequest = {
      destinationId: selectedDestination.id,
      destinationName: selectedDestination.name,
      phoneNumber: selectedDestination.phoneNumber,
      goal: goal.trim(),
      facts: facts.trim(),
      boundaries,
      userConfirmedLowRisk: true,
    };

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as CallPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not create the call plan.");
      setActiveRequest(request);
      setPlan(data);
      setStage("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the call plan.");
    } finally {
      setLoading(false);
    }
  }

  function toggleBoundary(boundary: string) {
    setBoundaries((current) =>
      current.includes(boundary)
        ? current.filter((item) => item !== boundary)
        : [...current, boundary],
    );
  }

  function startDemoCall() {
    setError("");
    setCaptions([
      {
        id: "system-connected",
        speaker: "system",
        text: "Secure demo call starting. No audio is recorded.",
      },
    ]);
    setTurnIndex(0);
    setPaused(false);
    setPendingApproval(null);
    setApprovedDecision(false);
    setCallStatus("connecting");
    endingRef.current = false;
    setStage("call");
  }

  function handleApproval(approved: boolean) {
    if (!pendingApproval) return;
    setApprovedDecision(approved);
    setCaptions((current) => [
      ...current,
      {
        id: `approval-${Date.now()}`,
        speaker: "user",
        text: approved
          ? `Approved the reservation: ${pendingApproval}`
          : `Did not approve: ${pendingApproval}`,
      },
    ]);
    setPendingApproval(null);
    setPaused(false);

    if (!approved) {
      setCaptions((current) => [
        ...current,
        {
          id: `decline-${Date.now()}`,
          speaker: "agent",
          text: "Maya does not want to make that commitment today. Thank you for the information.",
        },
      ]);
      window.setTimeout(() => void finishCall("partial"), 500);
    }
  }

  function sendGuidance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = guidance.trim();
    if (!message) return;

    setCaptions((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        speaker: "user",
        text: correctionMode ? `Correction: ${message}` : `Say this: ${message}`,
      },
      {
        id: `agent-guidance-${Date.now()}`,
        speaker: "agent",
        text: correctionMode ? `A correction from Maya: ${message}` : message,
      },
    ]);
    setGuidance("");
    setCorrectionMode(false);
  }

  function beginCorrection() {
    setCorrectionMode(true);
    setPaused(true);
    window.setTimeout(() => guidanceRef.current?.focus(), 0);
  }

  function resetCall() {
    setStage("setup");
    setPlan(null);
    setOutcome(null);
    setActiveRequest(null);
    setCaptions([]);
    setTurnIndex(0);
    setPendingApproval(null);
    setPaused(false);
    setSafetyConfirmed(false);
    setError("");
    endingRef.current = false;
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <div className="brand-lockup" aria-label="Call Assist">
          <span className="brand-mark" aria-hidden="true"><span>CA</span></span>
          <span>
            <strong>Call Assist</strong>
            <small>Calls you can read and control</small>
          </span>
        </div>
        <div className="demo-badge"><span aria-hidden="true" /> Safe demo mode</div>
      </header>

      <div className="workspace" id="main-content">
        <nav className="stepper" aria-label="Call progress">
          {steps.map((step, index) => (
            <div
              className={`step ${index === activeStep ? "is-active" : ""} ${index < activeStep ? "is-complete" : ""}`}
              key={step.id}
              aria-current={index === activeStep ? "step" : undefined}
            >
              <span className="step-number" aria-hidden="true">{index < activeStep ? "✓" : index + 1}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </nav>

        {error && (
          <div className="error-banner" role="alert">
            <strong>Something needs attention.</strong> {error}
          </div>
        )}

        {stage === "setup" && (
          <section className="setup-layout" aria-labelledby="setup-heading">
            <div className="intro-panel">
              <p className="eyebrow">Supervised calling copilot</p>
              <h1 id="setup-heading">Tell us what you need from the call.</h1>
              <p className="lede">You set the goal and limits. Call Assist handles the conversation while you follow every word.</p>
              <div className="promise-list" aria-label="Your controls">
                <div><span aria-hidden="true">1</span><p><strong>Review first</strong><br />Nothing starts until you approve the plan.</p></div>
                <div><span aria-hidden="true">2</span><p><strong>Stay in control</strong><br />Pause, correct, type a message, or hang up anytime.</p></div>
                <div><span aria-hidden="true">3</span><p><strong>Approve commitments</strong><br />The assistant stops before booking or sharing sensitive facts.</p></div>
              </div>
              <div className="privacy-note"><span aria-hidden="true">●</span><p><strong>Privacy by default</strong><br />No audio recording. The demo transcript disappears after the outcome is created.</p></div>
            </div>

            <form className="setup-card" onSubmit={handlePlan}>
              <div className="field-group">
                <label htmlFor="destination">Who should we call?</label>
                <select
                  id="destination"
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                >
                  {DEMO_DESTINATIONS.map((destination) => (
                    <option key={destination.id} value={destination.id}>{destination.name}</option>
                  ))}
                </select>
                <p className="field-hint">Allowlisted demo destination · {selectedDestination.displayNumber}</p>
              </div>

              <div className="field-group">
                <label htmlFor="goal">What should the call accomplish?</label>
                <textarea id="goal" rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} required minLength={8} />
              </div>

              <div className="field-group">
                <label htmlFor="facts">Facts Call Assist may share</label>
                <textarea id="facts" rows={4} value={facts} onChange={(event) => setFacts(event.target.value)} />
                <p className="field-hint">One fact per line. Only include what the business needs.</p>
              </div>

              <fieldset className="boundary-fieldset">
                <legend>Always stop and ask me before…</legend>
                {boundaryOptions.map((boundary) => (
                  <label className="check-row" key={boundary}>
                    <input type="checkbox" checked={boundaries.includes(boundary)} onChange={() => toggleBoundary(boundary)} />
                    <span className="fake-check" aria-hidden="true">✓</span>
                    <span>{boundary}</span>
                  </label>
                ))}
              </fieldset>

              <label className="safety-check">
                <input type="checkbox" checked={safetyConfirmed} onChange={(event) => setSafetyConfirmed(event.target.checked)} required />
                <span className="fake-check" aria-hidden="true">✓</span>
                <span><strong>This is a user-initiated, low-risk call.</strong><small>Not an emergency, payment, medical decision, financial transaction, or marketing call.</small></span>
              </label>

              <button className="primary-button full-width" type="submit" disabled={loading || boundaries.length === 0}>
                {loading ? "Creating a safe plan…" : "Create call plan"}<span aria-hidden="true">→</span>
              </button>
            </form>
          </section>
        )}

        {stage === "review" && plan && activeRequest && (
          <section className="review-section" aria-labelledby="review-heading">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Ready for your review</p>
                <h1 id="review-heading">Check the plan before anything happens.</h1>
              </div>
              <span className="mode-chip">{plan.mode === "ai" ? "GPT-5.6 plan" : "Judge-safe simulation"}</span>
            </div>

            <div className="review-grid">
              <article className="plan-card plan-main">
                <div className="card-kicker">Call objective</div>
                <h2>{plan.objective}</h2>
                <div className="destination-line"><span aria-hidden="true">☎</span><span><strong>{plan.destination}</strong><small>{selectedDestination.displayNumber} · allowlisted</small></span></div>
                <div className="script-preview"><span>Opening disclosure</span><p>“{plan.openingScript}”</p></div>
              </article>

              <article className="plan-card">
                <div className="card-kicker">Conversation path</div>
                <ol className="path-list">
                  {plan.conversationPath.map((item, index) => (
                    <li key={`${item.label}-${index}`}><span>{index + 1}</span><p><strong>{item.label}</strong><br />{item.detail}</p></li>
                  ))}
                </ol>
              </article>

              <article className="plan-card approval-card">
                <div className="card-kicker">Your approval gates</div>
                <h2>Call Assist will pause before:</h2>
                <ul className="shield-list">
                  {plan.approvalGates.map((item) => <li key={item}><span aria-hidden="true">◆</span>{item}</li>)}
                </ul>
              </article>

              <article className="plan-card">
                <div className="card-kicker">Success looks like</div>
                <ul className="success-list">
                  {plan.successCriteria.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
                </ul>
                <div className="stop-box"><strong>Automatic stop</strong><p>{plan.stopConditions[1] ?? plan.stopConditions[0]}</p></div>
              </article>
            </div>

            <div className="review-actions">
              <button className="secondary-button" type="button" onClick={() => setStage("setup")}>← Edit details</button>
              <div><p><span aria-hidden="true">●</span> This demo does not place a real phone call</p><button className="primary-button" type="button" onClick={startDemoCall}>Start supervised demo call <span aria-hidden="true">→</span></button></div>
            </div>
          </section>
        )}

        {stage === "call" && activeRequest && (
          <section className="call-section" aria-labelledby="call-heading">
            <div className="call-header">
              <div className="call-party">
                <span className="party-avatar" aria-hidden="true">W</span>
                <div><p className="eyebrow">Calling</p><h1 id="call-heading">{activeRequest.destinationName}</h1><p>{selectedDestination.displayNumber}</p></div>
              </div>
              <div className={`call-state ${callStatus}`} role="status" aria-live="polite">
                <span aria-hidden="true" /> {callStatus === "connecting" ? "Connecting…" : callStatus === "ending" ? "Ending call…" : paused ? "Paused by you" : "Live demo"}
              </div>
              <button className="end-call-button" type="button" onClick={() => void finishCall("ended")} disabled={callStatus === "ending"}><span aria-hidden="true">⌕</span> End call</button>
            </div>

            <div className="call-grid">
              <div className="caption-panel">
                <div className="caption-toolbar"><div><span className="speaker-key agent-key" /> Call Assist <span className="speaker-key business-key" /> Business</div><span>Live captions</span></div>
                <div className="caption-stream" aria-live="polite" aria-relevant="additions text">
                  {captions.map((turn) => (
                    <article className={`caption ${turn.speaker}`} key={turn.id}>
                      <div className="caption-speaker">{speakerLabel(turn.speaker)}</div>
                      <p>{turn.text}</p>
                    </article>
                  ))}
                  {callStatus === "connecting" && <div className="typing-indicator" aria-label="Connecting"><span /><span /><span /></div>}
                  <div ref={captionEndRef} />
                </div>
              </div>

              <aside className="control-panel" aria-label="Call controls">
                {pendingApproval ? (
                  <div className="approval-gate" role="alertdialog" aria-labelledby="approval-heading" aria-describedby="approval-detail">
                    <div className="approval-icon" aria-hidden="true">!</div>
                    <p className="eyebrow">Your approval is required</p>
                    <h2 id="approval-heading">Should Call Assist commit to this?</h2>
                    <p id="approval-detail">{pendingApproval}</p>
                    <div className="approval-actions"><button type="button" className="approve-button" onClick={() => handleApproval(true)}>Yes, approve</button><button type="button" className="decline-button" onClick={() => handleApproval(false)}>No, don’t</button></div>
                    <small>Nothing will happen until you choose.</small>
                  </div>
                ) : (
                  <>
                    <div className="control-intro"><p className="eyebrow">You’re in control</p><h2>{paused ? "The assistant is paused." : "Following the conversation."}</h2><p>{paused ? "Type a correction or resume when you’re ready." : "Jump in at any moment without speaking."}</p></div>
                    <button className={`pause-button ${paused ? "resume" : ""}`} type="button" onClick={() => { setPaused((current) => !current); setCorrectionMode(false); }}>
                      <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume Call Assist" : "Pause Call Assist"}
                    </button>
                    <button className="correction-button" type="button" onClick={beginCorrection}><span aria-hidden="true">✎</span> Correct a detail</button>
                  </>
                )}

                <form className={`guidance-box ${correctionMode ? "correction" : ""}`} onSubmit={sendGuidance}>
                  <label htmlFor="guidance">{correctionMode ? "Type the correction" : "Type what Call Assist should say"}</label>
                  <div><input ref={guidanceRef} id="guidance" value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder={correctionMode ? "My name is spelled…" : "Could you also ask…"} /><button type="submit" disabled={!guidance.trim()} aria-label="Send typed guidance">↑</button></div>
                  <small>{correctionMode ? "The call stays paused until you resume it." : "Call Assist will say this at the next safe opening."}</small>
                </form>

                <div className="call-safety"><span aria-hidden="true">●</span><p><strong>No audio recording</strong><br />Captions are temporary and cleared after the outcome.</p></div>
                {approvedDecision && <p className="approved-note" role="status">✓ Your approval was added to the call.</p>}
              </aside>
            </div>
          </section>
        )}

        {stage === "outcome" && outcome && (
          <section className="outcome-section" aria-labelledby="outcome-heading">
            <div className="outcome-hero">
              <span className="outcome-check" aria-hidden="true">✓</span>
              <p className="eyebrow">Call complete</p>
              <h1 id="outcome-heading">{outcome.headline}</h1>
              <p>{outcome.summary}</p>
              {outcome.referenceNumber && <div className="reference-number"><span>Confirmation</span><strong>{outcome.referenceNumber}</strong></div>}
            </div>

            <div className="outcome-grid">
              <article className="outcome-card"><div className="card-kicker">Confirmed</div><ul className="success-list">{outcome.confirmed.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul></article>
              <article className="outcome-card"><div className="card-kicker">Next step</div><ul className="next-list">{outcome.nextSteps.map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}</ul>{outcome.unresolved.length > 0 && <div className="unresolved"><strong>Still unresolved</strong>{outcome.unresolved.map((item) => <p key={item}>{item}</p>)}</div>}</article>
              <article className="outcome-card privacy-outcome"><div className="privacy-symbol" aria-hidden="true">●</div><div><div className="card-kicker">Privacy check</div><h2>Transcript cleared</h2><p>The temporary captions were discarded after this structured outcome was created. No audio was recorded.</p></div></article>
            </div>

            <div className="outcome-actions"><button className="primary-button" type="button" onClick={resetCall}>Plan another call <span aria-hidden="true">→</span></button><span>{outcome.mode === "ai" ? "Outcome structured by GPT-5.6" : "Judge-safe simulated outcome"}</span></div>
          </section>
        )}
      </div>
    </main>
  );
}

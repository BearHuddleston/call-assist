"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CallCommand,
  CallOutcome,
  CallPlan,
  CallRequest,
  TranscriptTurn,
} from "@/lib/contracts";
import {
  CallPlanSchema,
  LiveCallEventsResponseSchema,
  LiveCallStartResponseSchema,
  LiveServiceStatusSchema,
  PlanServiceStatusSchema,
} from "@/lib/contracts";
import {
  browserStatus,
  projectLiveEvents,
  upsertCaptions,
  type BrowserCallStatus,
  type LiveApproval,
} from "@/lib/live-call";
import {
  DEMO_PLAN_PHASE_DURATION_MS,
  DEMO_PLAN_PHASES,
  planningStatusMessage,
  type PlanningExperience,
} from "@/lib/plan-simulation";
import { DEMO_DESTINATIONS } from "@/lib/safety";

type Stage = "setup" | "review" | "call" | "outcome";
type CallMode = "demo" | "live";
type LiveAvailability = "checking" | "ready" | "unavailable";
type ScriptTurn = Omit<TranscriptTurn, "id"> & { approvalGate?: string };

const steps: Array<{ id: Stage; label: string }> = [
  { id: "setup", label: "Set up" },
  { id: "review", label: "Review" },
  { id: "call", label: "Call" },
  { id: "outcome", label: "Outcome" },
];

const boundaryOptions = [
  "Ask me before making any reservation, appointment, registration, or cancellation.",
  "Do not share my date of birth, address, or account credentials.",
  "Do not agree to charges, payments, or purchases.",
] as const;

function scriptedCall(
  destinationId: string,
  request: CallRequest | null,
  plan: CallPlan | null,
): ScriptTurn[] {
  if (destinationId === "live-custom" && request) {
    const approvalGate = plan?.approvalGates[0] ?? "Confirm the requested next step";
    return [
      { speaker: "agent", text: "Hello, I’m Call Assist, an AI accessibility assistant helping someone follow this phone call through live captions. Is it okay to continue with live transcription and keep a temporary text transcript for their review afterward?" },
      { speaker: "business", text: "Yes, that’s okay. How can I help?" },
      { speaker: "agent", text: `Thank you. The user has already shared the details I need, and the goal is: ${request.goal}.` },
      { speaker: "business", text: "I can help with that. Before I confirm the requested next step, should I proceed?", approvalGate },
      { speaker: "agent", text: "The user has approved that next step. Please proceed within the limits we shared." },
      { speaker: "business", text: "Understood. The requested next step is confirmed for this supervised demonstration. The demo reference is CA-2048." },
      { speaker: "agent", text: "Thank you. I’ll share that confirmation with the user. Goodbye." },
    ];
  }

  if (destinationId === "lakeside-center") {
    return [
      { speaker: "agent", text: "Hello, I’m Call Assist, an AI accessibility assistant helping Maya follow this phone call through live captions. Is it okay to continue with live transcription and keep a temporary text transcript for her review afterward?" },
      { speaker: "business", text: "Yes, that’s okay. How can I help?" },
      { speaker: "agent", text: "Thank you. Maya would like to know whether the Tuesday evening beginner pottery class still has space." },
      { speaker: "business", text: "There are two spaces left. The class begins Tuesday at 6:30 PM and materials are included." },
      { speaker: "agent", text: "That sounds like the best fit. Before Maya decides, could you confirm whether the studio has a step-free entrance?" },
      { speaker: "business", text: "Yes. The north entrance is step-free, and registration is free for members. I can register Maya now if she’d like.", approvalGate: "Register for the Tuesday pottery class" },
      { speaker: "agent", text: "Maya has approved the registration. Please go ahead." },
      { speaker: "business", text: "All set. Her confirmation code is LCC-6318. Please arrive ten minutes early." },
      { speaker: "agent", text: "Thank you. I’ll share that confirmation and arrival note with Maya. Goodbye." },
    ];
  }

  return [
    { speaker: "agent", text: "Hello, I’m Call Assist, an AI accessibility assistant helping Maya follow this phone call through live captions. Is it okay to continue with live transcription and keep a temporary text transcript for her review afterward?" },
    { speaker: "business", text: "Yes, that’s fine. How can I help today?" },
    { speaker: "agent", text: "Thank you. Maya would like to reserve a quiet study room next Tuesday at 2:00 PM for two people." },
    { speaker: "business", text: "Let me check. We have a quiet room available from 2:00 to 4:00 PM." },
    { speaker: "agent", text: "That sounds like the right match. Before Maya decides, could you tell me what she should bring when she arrives?" },
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

function phoneLabel(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phoneNumber;
}

function callStatusLabel(
  status: BrowserCallStatus,
  paused: boolean,
  mode: CallMode | null,
): string {
  if (paused) return "Paused by you";
  if (status === "connecting") return mode === "live" ? "Starting call…" : "Connecting…";
  if (status === "ringing") return "Ringing…";
  if (status === "ending") return "Ending call…";
  if (status === "ended") return "Call ended";
  if (status === "failed") return "Call disconnected";
  return mode === "live" ? "Live call" : "Live demo";
}

async function sendLiveCommand(callId: string, command: CallCommand): Promise<void> {
  const response = await fetch(`/api/live/${callId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The call command could not be sent.");
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Plan creation canceled.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Plan creation canceled.", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function runDemoPlanningSequence(
  signal: AbortSignal,
  setPhase: (phase: number) => void,
): Promise<void> {
  for (let phase = 0; phase < DEMO_PLAN_PHASES.length; phase += 1) {
    setPhase(phase);
    await waitForDelay(DEMO_PLAN_PHASE_DURATION_MS, signal);
  }
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [destinationId, setDestinationId] = useState("westside-library");
  const [liveDestinationName, setLiveDestinationName] = useState("");
  const [livePhoneNumber, setLivePhoneNumber] = useState("");
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
  const [planningElapsedSeconds, setPlanningElapsedSeconds] = useState(0);
  const [planningExperience, setPlanningExperience] = useState<PlanningExperience>("checking");
  const [demoPlanningPhase, setDemoPlanningPhase] = useState<number | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const [callMode, setCallMode] = useState<CallMode | null>(null);
  const [liveAvailability, setLiveAvailability] = useState<LiveAvailability>("checking");
  const [liveCallId, setLiveCallId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<BrowserCallStatus>("connecting");
  const [paused, setPaused] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<LiveApproval | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [captions, setCaptions] = useState<TranscriptTurn[]>([]);
  const [guidance, setGuidance] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [approvedDecision, setApprovedDecision] = useState(false);
  const captionEndRef = useRef<HTMLDivElement | null>(null);
  const guidanceRef = useRef<HTMLInputElement | null>(null);
  const approvalRef = useRef<HTMLDivElement | null>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const captionsRef = useRef<TranscriptTurn[]>([]);
  const eventCursorRef = useRef(0);
  const endingRef = useRef(false);
  const planningAbortRef = useRef<AbortController | null>(null);
  const planningAttemptRef = useRef(0);
  const planInFlightRef = useRef(false);

  const selectedDestination = useMemo(
    () =>
      DEMO_DESTINATIONS.find((destination) => destination.id === destinationId) ??
      DEMO_DESTINATIONS[0],
    [destinationId],
  );
  const isLiveDestination = destinationId === "live-custom";
  const currentDestinationName = isLiveDestination
    ? liveDestinationName.trim()
    : selectedDestination.name;
  const currentPhoneNumber = isLiveDestination
    ? livePhoneNumber.trim()
    : selectedDestination.phoneNumber;
  const script = useMemo(
    () => scriptedCall(destinationId, activeRequest, plan),
    [activeRequest, destinationId, plan],
  );
  const activeStep = steps.findIndex((step) => step.id === stage);

  useEffect(() => {
    captionsRef.current = captions;
  }, [captions]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/live/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => LiveServiceStatusSchema.parse(await response.json()))
      .then((status) => setLiveAvailability(status.available ? "ready" : "unavailable"))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setLiveAvailability("unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/plan", { cache: "no-store", signal: controller.signal })
      .then(async (response) => PlanServiceStatusSchema.parse(await response.json()))
      .then((status) => setPlanningExperience(status.mode))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setPlanningExperience("checking");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    captionEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [captions, pendingApproval]);

  useEffect(() => {
    if (!pendingApproval) return;
    const timer = window.setTimeout(() => approvalRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [pendingApproval]);

  useEffect(() => {
    if (!loading || stage !== "setup") return;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setPlanningElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [loading, stage]);

  useEffect(() => {
    if (stage !== "review") return;
    const timer = window.setTimeout(() => reviewHeadingRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const finishCall = useCallback(
    async (
      status: CallOutcome["status"],
      options: { endProvider?: boolean } = {},
    ) => {
      if (endingRef.current || !activeRequest) return;
      endingRef.current = true;
      setCallStatus("ending");
      setPaused(true);
      setPendingApproval(null);

      try {
        if (callMode === "live" && liveCallId && options.endProvider !== false) {
          await sendLiveCommand(liveCallId, { type: "call.end" });
        }
        const response = await fetch("/api/outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: activeRequest,
            transcript: captionsRef.current,
            status,
          }),
        });
        const data = (await response.json()) as CallOutcome & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not create the outcome.");
        if (callMode === "live" && liveCallId) {
          await fetch(`/api/live/${liveCallId}/transcript`, {
            method: "DELETE",
            signal: AbortSignal.timeout(2_000),
          }).catch(() => undefined);
        }
        setOutcome(data);
        setStage("outcome");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not create the outcome.");
        endingRef.current = false;
        setCallStatus(callMode === "live" ? "failed" : "live");
        setPaused(false);
      }
    },
    [activeRequest, callMode, liveCallId],
  );

  useEffect(() => {
    if (stage !== "call" || callMode !== "demo" || callStatus !== "connecting") return;
    const timer = window.setTimeout(() => setCallStatus("live"), 900);
    return () => window.clearTimeout(timer);
  }, [stage, callMode, callStatus]);

  useEffect(() => {
    if (
      stage !== "call" ||
      callMode !== "demo" ||
      callStatus !== "live" ||
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
        setPendingApproval({
          id: `demo-${turnIndex}`,
          commitment: nextTurn.approvalGate,
          reason: "The business is asking Call Assist to make a commitment.",
        });
        setPaused(true);
      }
    }, turnIndex === 0 ? 600 : 1450);

    return () => window.clearTimeout(timer);
  }, [callMode, callStatus, finishCall, paused, pendingApproval, script, stage, turnIndex]);

  useEffect(() => {
    if (stage !== "call" || callMode !== "live" || !liveCallId) return;
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/live/${liveCallId}/events?after=${eventCursorRef.current}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json() as unknown;
        if (!response.ok) {
          const message = typeof body === "object" && body && "error" in body
            ? String(body.error)
            : "Live call updates are unavailable.";
          throw new Error(message);
        }

        const batch = LiveCallEventsResponseSchema.parse(body);
        if (batch.events.length > 0) {
          eventCursorRef.current = Math.max(
            eventCursorRef.current,
            ...batch.events.map((event) => event.cursor),
          );
          const projection = projectLiveEvents(batch.events);
          if (projection.captions.length > 0) {
            setCaptions((current) => {
              const next = upsertCaptions(current, projection.captions);
              captionsRef.current = next;
              return next;
            });
          }
          if (projection.approval !== undefined) setPendingApproval(projection.approval);
          if (projection.paused !== undefined) setPaused(projection.paused);
          if (projection.status) setCallStatus(projection.status);
          if (projection.error) setError(projection.error);
          if (projection.terminalOutcome && !endingRef.current) {
            window.setTimeout(
              () => void finishCall(projection.terminalOutcome!, { endProvider: false }),
              250,
            );
          }
        }
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Live call updates are unavailable.");
        }
      } finally {
        if (!stopped) timer = window.setTimeout(() => void poll(), 750);
      }
    };

    void poll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [callMode, finishCall, liveCallId, stage]);

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (planInFlightRef.current) return;
    setError("");
    if (!safetyConfirmed) {
      setError("Confirm that this is a user-initiated, low-risk call before continuing.");
      return;
    }

    const attemptId = planningAttemptRef.current + 1;
    planningAttemptRef.current = attemptId;
    planInFlightRef.current = true;
    const controller = new AbortController();
    planningAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 65_000);
    setPlanningElapsedSeconds(0);
    setDemoPlanningPhase(null);
    setLoading(true);

    const request: CallRequest = {
      destinationId: isLiveDestination ? "live-custom" : selectedDestination.id,
      destinationName: currentDestinationName,
      phoneNumber: currentPhoneNumber,
      goal: goal.trim(),
      facts: facts.trim(),
      boundaries,
      userConfirmedLowRisk: true,
    };

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body
          ? String(body.error)
          : "Could not create the call plan.";
        throw new Error(message);
      }
      const parsedPlan = CallPlanSchema.safeParse(body);
      if (!parsedPlan.success) {
        throw new Error("The plan response was incomplete. Please try again.");
      }
      setPlanningExperience(parsedPlan.data.mode);
      if (parsedPlan.data.mode === "demo") {
        await runDemoPlanningSequence(controller.signal, setDemoPlanningPhase);
      }
      if (controller.signal.aborted || attemptId !== planningAttemptRef.current) return;
      setActiveRequest(request);
      setPlan(parsedPlan.data);
      setStage("review");
    } catch (caught) {
      if (attemptId !== planningAttemptRef.current) return;
      if (controller.signal.aborted) {
        setError(
          controller.signal.reason === "timeout"
            ? "The plan took too long to generate. Your details are still here; please try again."
            : "Plan creation canceled. Your details are still here.",
        );
      } else {
        setError(caught instanceof Error ? caught.message : "Could not create the call plan.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (attemptId === planningAttemptRef.current) {
        planInFlightRef.current = false;
        planningAbortRef.current = null;
        setDemoPlanningPhase(null);
        setLoading(false);
      }
    }
  }

  function cancelPlan() {
    const controller = planningAbortRef.current;
    if (!controller) return;
    planningAttemptRef.current += 1;
    planInFlightRef.current = false;
    planningAbortRef.current = null;
    controller.abort("canceled");
    setPlanningElapsedSeconds(0);
    setDemoPlanningPhase(null);
    setLoading(false);
    setError("Plan creation canceled. Your details are still here.");
  }

  function toggleBoundary(boundary: string) {
    setBoundaries((current) =>
      current.includes(boundary)
        ? current.filter((item) => item !== boundary)
        : [...current, boundary],
    );
  }

  function appendCaptions(...turns: TranscriptTurn[]) {
    setCaptions((current) => {
      const next = [...current, ...turns];
      captionsRef.current = next;
      return next;
    });
  }

  function startDemoCall() {
    setError("");
    const initialCaptions: TranscriptTurn[] = [
      {
        id: "system-connected",
        speaker: "system",
        text: "Secure demo call starting. No audio is recorded.",
      },
    ];
    setCaptions(initialCaptions);
    captionsRef.current = initialCaptions;
    setCallMode("demo");
    setLiveCallId(null);
    eventCursorRef.current = 0;
    setTurnIndex(0);
    setPaused(false);
    setPendingApproval(null);
    setApprovedDecision(false);
    setCallStatus("connecting");
    endingRef.current = false;
    setStage("call");
  }

  async function startLiveCall() {
    if (!activeRequest || !plan || liveAvailability !== "ready") return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: activeRequest, plan }),
      });
      const body = await response.json() as unknown;
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body
          ? String(body.error)
          : "The live call could not start.";
        throw new Error(message);
      }
      const started = LiveCallStartResponseSchema.parse(body);
      const initialCaptions: TranscriptTurn[] = [{
        id: "system-live-starting",
        speaker: "system",
        text: "Live call requested. No audio is recorded; captions remain in this tab until you clear them or leave.",
      }];
      setCaptions(initialCaptions);
      captionsRef.current = initialCaptions;
      eventCursorRef.current = 0;
      setLiveCallId(started.callId);
      setCallMode("live");
      setCallStatus(browserStatus(started.status));
      setPaused(false);
      setPendingApproval(null);
      setApprovedDecision(false);
      endingRef.current = false;
      setStage("call");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The live call could not start.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved: boolean) {
    const approval = pendingApproval;
    if (!approval || commandPending) return;
    setCommandPending(true);
    setError("");
    try {
      if (callMode === "live") {
        if (!liveCallId) throw new Error("The live call is no longer connected.");
        await sendLiveCommand(liveCallId, {
          type: "approval.resolve",
          approvalId: approval.id,
          approved,
        });
      }
      setApprovedDecision(approved);
      appendCaptions({
        id: `approval-${Date.now()}`,
        speaker: "user",
        text: approved
          ? `Approved: ${approval.commitment}`
          : `Did not approve: ${approval.commitment}`,
      });
      setPendingApproval(null);
      setPaused(false);

      if (!approved && callMode === "demo") {
        appendCaptions({
          id: `decline-${Date.now()}`,
          speaker: "agent",
          text: "Maya does not want to make that commitment today. Thank you for the information.",
        });
        window.setTimeout(() => void finishCall("partial"), 500);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The approval decision could not be sent.");
    } finally {
      setCommandPending(false);
    }
  }

  async function sendGuidance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = guidance.trim();
    if (!message || commandPending) return;
    const wasCorrection = correctionMode;
    setCommandPending(true);
    setError("");

    try {
      if (callMode === "live") {
        if (!liveCallId) throw new Error("The live call is no longer connected.");
        await sendLiveCommand(liveCallId, {
          type: wasCorrection ? "guidance.correct" : "guidance.say",
          text: message,
        });
      }
      const userTurn: TranscriptTurn = {
        id: `user-${Date.now()}`,
        speaker: "user",
        text: wasCorrection ? `Correction: ${message}` : `Say this: ${message}`,
      };
      if (callMode === "demo") {
        appendCaptions(userTurn, {
          id: `agent-guidance-${Date.now()}`,
          speaker: "agent",
          text: wasCorrection ? `A correction from Maya: ${message}` : message,
        });
      } else {
        appendCaptions(userTurn);
      }
      setGuidance("");
      setCorrectionMode(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The guidance could not be sent.");
    } finally {
      setCommandPending(false);
    }
  }

  async function togglePause(): Promise<boolean> {
    if (commandPending) return false;
    const nextPaused = !paused;
    setCommandPending(true);
    setError("");
    try {
      if (callMode === "live") {
        if (!liveCallId) throw new Error("The live call is no longer connected.");
        await sendLiveCommand(liveCallId, {
          type: nextPaused ? "call.pause" : "call.resume",
        });
      }
      setPaused(nextPaused);
      setCorrectionMode(false);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call state could not be changed.");
      return false;
    } finally {
      setCommandPending(false);
    }
  }

  async function beginCorrection() {
    if (commandPending) return;
    if (callMode === "live" && !paused && !await togglePause()) return;
    setCorrectionMode(true);
    setPaused(true);
    window.setTimeout(() => guidanceRef.current?.focus(), 0);
  }

  function clearTranscript() {
    setCaptions([]);
    captionsRef.current = [];
  }

  function resetCall() {
    setStage("setup");
    setPlan(null);
    setOutcome(null);
    setActiveRequest(null);
    setCaptions([]);
    captionsRef.current = [];
    setTurnIndex(0);
    setPendingApproval(null);
    setPaused(false);
    setCallMode(null);
    setLiveCallId(null);
    setCallStatus("connecting");
    setCommandPending(false);
    eventCursorRef.current = 0;
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
        <div className={`demo-badge ${liveAvailability === "ready" ? "live-ready" : ""}`}>
          <span aria-hidden="true" />
          {liveAvailability === "checking"
            ? "Checking live service…"
            : liveAvailability === "ready"
              ? "Live service ready"
              : "Safe demo ready"}
        </div>
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
                <div><span aria-hidden="true">3</span><p><strong>Approve commitments</strong><br />The assistant stops before a booking, registration, or cancellation.</p></div>
              </div>
              <div className="privacy-note"><span aria-hidden="true">●</span><p><strong>Privacy by default</strong><br />No audio recording. Captions stay in this tab after the call so you can review or clear them.</p></div>
            </div>

            <form className="setup-card" onSubmit={handlePlan} aria-busy={loading}>
              <div className="field-group">
                <label htmlFor="destination">Who should we call?</label>
                <select
                  id="destination"
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                  disabled={loading}
                >
                  {DEMO_DESTINATIONS.map((destination) => (
                    <option key={destination.id} value={destination.id}>{destination.name}</option>
                  ))}
                  {liveAvailability === "ready" && (
                    <option value="live-custom">Allowlisted live destination…</option>
                  )}
                </select>
                <p className="field-hint">
                  {isLiveDestination
                    ? "The server will verify this number against the private allowlist."
                    : `Allowlisted demo destination · ${selectedDestination.displayNumber}`}
                </p>
              </div>

              {isLiveDestination && (
                <div className="live-destination-fields">
                  <div className="field-group">
                    <label htmlFor="live-name">Business or service name</label>
                    <input
                      id="live-name"
                      type="text"
                      value={liveDestinationName}
                      onChange={(event) => setLiveDestinationName(event.target.value)}
                      placeholder="Neighborhood library"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="live-phone">Allowlisted phone number</label>
                    <input
                      id="live-phone"
                      type="tel"
                      value={livePhoneNumber}
                      onChange={(event) => setLivePhoneNumber(event.target.value)}
                      placeholder="+13125550100"
                      autoComplete="tel"
                      required
                      disabled={loading}
                    />
                    <p className="field-hint">Use E.164 format, including country code.</p>
                  </div>
                </div>
              )}

              <div className="field-group">
                <label htmlFor="goal">What should the call accomplish?</label>
                <textarea id="goal" rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} required minLength={8} disabled={loading} />
              </div>

              <div className="field-group">
                <label htmlFor="facts">Facts Call Assist may share</label>
                <textarea id="facts" rows={4} value={facts} onChange={(event) => setFacts(event.target.value)} disabled={loading} />
                <p className="field-hint">One fact per line. Only include what the business needs. If you want Call Assist to say you are Deaf or hard of hearing, include that here explicitly.</p>
              </div>

              <fieldset className="boundary-fieldset">
                <legend>Rules Call Assist must follow</legend>
                {boundaryOptions.map((boundary) => (
                  <label className="check-row" key={boundary}>
                    <input type="checkbox" checked={boundaries.includes(boundary)} onChange={() => toggleBoundary(boundary)} disabled={loading} />
                    <span className="fake-check" aria-hidden="true">✓</span>
                    <span>{boundary}</span>
                  </label>
                ))}
              </fieldset>

              <label className="safety-check">
                <input type="checkbox" checked={safetyConfirmed} onChange={(event) => setSafetyConfirmed(event.target.checked)} required disabled={loading} />
                <span className="fake-check" aria-hidden="true">✓</span>
                <span><strong>This is a user-initiated, low-risk call.</strong><small>Not an emergency, payment, medical decision, financial transaction, or marketing call.</small></span>
              </label>

              <button className="primary-button full-width" type="submit" disabled={loading || boundaries.length === 0}>
                {loading ? "Creating a safe plan…" : "Create call plan"}<span aria-hidden="true">→</span>
              </button>
              {loading && (
                <div className="planning-status-panel">
                  <div className="planning-status-copy">
                    <div className="planning-progress" aria-hidden="true"><span /></div>
                    <strong role="status" aria-live="polite">{planningStatusMessage(planningExperience, planningElapsedSeconds, demoPlanningPhase)}</strong>
                    {planningExperience === "demo" && demoPlanningPhase !== null && (
                      <ol className="demo-planning-phases" aria-label="Simulated GPT-5.6 planning phases">
                        {DEMO_PLAN_PHASES.map((phase, index) => (
                          <li
                            className={index < demoPlanningPhase ? "is-complete" : index === demoPlanningPhase ? "is-current" : ""}
                            key={phase}
                            aria-current={index === demoPlanningPhase ? "step" : undefined}
                          >
                            <span aria-hidden="true">{index < demoPlanningPhase ? "✓" : index + 1}</span>
                            <span>{phase}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <p aria-hidden="true">Waiting {planningElapsedSeconds} second{planningElapsedSeconds === 1 ? "" : "s"}</p>
                  </div>
                  <button className="secondary-button planning-cancel-button" type="button" onClick={cancelPlan}>Cancel</button>
                </div>
              )}
            </form>
          </section>
        )}

        {stage === "review" && plan && activeRequest && (
          <section className="review-section" aria-labelledby="review-heading">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Ready for your review</p>
                <h1 id="review-heading" ref={reviewHeadingRef} tabIndex={-1}>Check the plan before anything happens.</h1>
              </div>
              <span className="mode-chip">{plan.mode === "ai" ? "GPT-5.6 plan" : "Judge-safe simulation"}</span>
            </div>

            <div className="review-grid">
              <article className="plan-card plan-main">
                <div className="card-kicker">Call objective</div>
                <h2>{plan.objective}</h2>
                <div className="destination-line"><span aria-hidden="true">☎</span><span><strong>{plan.destination}</strong><small>{phoneLabel(activeRequest.phoneNumber)} · allowlisted</small></span></div>
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
              <div>
                <p><span aria-hidden="true">●</span> The supervised simulation never places a phone call.</p>
                <div className="start-call-actions">
                  <button className="secondary-button" type="button" onClick={startDemoCall}>Run safe demo</button>
                  {isLiveDestination && liveAvailability === "ready" && (
                    <button className="primary-button" type="button" onClick={() => void startLiveCall()} disabled={loading}>
                      {loading ? "Starting live call…" : "Start supervised live call"}<span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === "call" && activeRequest && (
          <section className="call-section" aria-labelledby="call-heading">
            <div className="call-header">
              <div className="call-party">
                <span className="party-avatar" aria-hidden="true">{activeRequest.destinationName.charAt(0).toUpperCase()}</span>
                <div><p className="eyebrow">{callMode === "live" ? "Live call" : "Demo call"}</p><h1 id="call-heading">{activeRequest.destinationName}</h1><p>{phoneLabel(activeRequest.phoneNumber)}</p></div>
              </div>
              <div className={`call-state ${callStatus}`} role="status" aria-live="polite">
                <span aria-hidden="true" /> {callStatusLabel(callStatus, paused, callMode)}
              </div>
              <button className="end-call-button" type="button" onClick={() => void finishCall("ended")} disabled={callStatus === "ending" || commandPending}><span aria-hidden="true">⌕</span> End call</button>
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
                  <div ref={approvalRef} className="approval-gate" role="alertdialog" aria-labelledby="approval-heading" aria-describedby="approval-detail approval-reason" tabIndex={-1}>
                    <div className="approval-icon" aria-hidden="true">!</div>
                    <p className="eyebrow">Your approval is required</p>
                    <h2 id="approval-heading">Should Call Assist commit to this?</h2>
                    <p id="approval-detail">{pendingApproval.commitment}</p>
                    <p className="approval-reason" id="approval-reason">{pendingApproval.reason}</p>
                    <div className="approval-actions"><button type="button" className="approve-button" onClick={() => void handleApproval(true)} disabled={commandPending}>Yes, approve</button><button type="button" className="decline-button" onClick={() => void handleApproval(false)} disabled={commandPending}>No, don’t</button></div>
                    <small>{commandPending ? "Sending your decision…" : "Nothing will happen until you choose."}</small>
                  </div>
                ) : (
                  <>
                    <div className="control-intro"><p className="eyebrow">You’re in control</p><h2>{paused ? "The assistant is paused." : "Following the conversation."}</h2><p>{paused ? "Type a correction or resume when you’re ready." : "Jump in at any moment without speaking."}</p></div>
                    <button className={`pause-button ${paused ? "resume" : ""}`} type="button" onClick={() => void togglePause()} disabled={commandPending || callStatus === "ending"}>
                      <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume Call Assist" : "Pause Call Assist"}
                    </button>
                    <button className="correction-button" type="button" onClick={() => void beginCorrection()} disabled={commandPending || callStatus === "ending"}><span aria-hidden="true">✎</span> Correct a detail</button>
                  </>
                )}

                <form className={`guidance-box ${correctionMode ? "correction" : ""}`} onSubmit={sendGuidance}>
                  <label htmlFor="guidance">{correctionMode ? "Type the correction" : "Type what Call Assist should say"}</label>
                  <div><input ref={guidanceRef} id="guidance" value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder={correctionMode ? "My name is spelled…" : "Could you also ask…"} disabled={Boolean(pendingApproval) || callStatus === "ending"} /><button type="submit" disabled={!guidance.trim() || commandPending || Boolean(pendingApproval) || callStatus === "ending"} aria-label="Send typed guidance">↑</button></div>
                  <small>{correctionMode ? "The call stays paused until you resume it." : "Call Assist will say this at the next safe opening."}</small>
                </form>

                <div className="call-safety"><span aria-hidden="true">●</span><p><strong>No audio recording</strong><br />{callMode === "live" ? "Provider audio is streamed, not stored. Captions stay in this tab after the outcome until you clear them or leave." : "Captions stay in this tab after the outcome until you clear them or leave."}</p></div>
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
              <article className="outcome-card privacy-outcome"><div className="privacy-symbol" aria-hidden="true">●</div><div><div className="card-kicker">Privacy check</div><h2>{captions.length > 0 ? "Transcript available for review" : "Transcript cleared"}</h2><p>{captions.length > 0 ? "Your review copy stays in this browser tab and is not written to durable app storage. It disappears when you clear it, refresh or close the tab, or plan another call. Temporary call-service captions are purged after the outcome or expire automatically. No audio was recorded." : "The review copy was removed from this browser tab. Temporary call-service captions are purged after the outcome or expire automatically. No audio was recorded."}</p></div></article>
              <article className="outcome-card transcript-outcome" aria-labelledby="transcript-heading">
                <div className="transcript-heading-row">
                  <div><div className="card-kicker">Your call record</div><h2 id="transcript-heading">Call transcript</h2></div>
                  <button className="secondary-button transcript-clear-button" type="button" onClick={clearTranscript} disabled={captions.length === 0}>Clear from this tab</button>
                </div>
                {captions.length > 0 ? (
                  <ol className="transcript-review-list" tabIndex={0} aria-labelledby="transcript-heading">
                    {captions.map((turn) => (
                      <li className={`transcript-review-turn ${turn.speaker}`} key={turn.id}>
                        <span>{speakerLabel(turn.speaker)}</span><p>{turn.text}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="transcript-cleared-status" role="status">Transcript cleared from this tab.</p>
                )}
              </article>
            </div>

            <div className="outcome-actions"><button className="primary-button" type="button" onClick={resetCall}>Plan another call <span aria-hidden="true">→</span></button><span>{outcome.mode === "ai" ? "Outcome structured by GPT-5.6" : "Judge-safe simulated outcome"}</span></div>
          </section>
        )}
      </div>
    </main>
  );
}

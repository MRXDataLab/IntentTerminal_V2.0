"use client";

import { useReducer, useState } from 'react';
import axios from 'axios';
import IntakeTerminal from '@/components/IntakeTerminal';
import HypothesisReview from '@/components/HypothesisReview';
import SynthesisDashboard from '@/components/SynthesisDashboard';
import DiscoveryAudit from '@/components/DiscoveryAudit';
import LLMProviderGate from '@/components/LLMProviderGate';
import type { HypothesisManifest } from '@/types/hypothesis';
import { phaseReducer, initialPhaseState } from './phaseReducer';

// Shared type for the payload passed from Module 1 → Module 2.
//
// Re-exported from this module (rather than from a sibling types file) because
// downstream components — including HypothesisReview — import the type via
// `import type { InteractionPayload } from '@/app/page'`. Moving the export
// would break that boundary.
export interface InteractionPayload {
  intent: string;
  parameters: { label: string; score: number }[];
  pillarExtractions: Record<string, any> | null;
  contextDocument: string | null;
  template: string | null;
  chatHistory: { role: 'user' | 'agent'; content: string }[];
  isRefinement: boolean;
  rejectionContext?: string;
}

const LATEST_RUN_URL = 'http://localhost:8000/api/latest-run';

/** Build a minimal InteractionPayload from a `/api/latest-run` response. */
function buildPayloadFromLatestRun(intent: string): InteractionPayload {
  return {
    intent,
    parameters: [],
    pillarExtractions: null,
    contextDocument: null,
    template: null,
    chatHistory: [],
    isRefinement: false,
  };
}

export default function Home() {
  const [state, dispatch] = useReducer(phaseReducer, initialPhaseState);
  const [providerSelected, setProviderSelected] = useState(false);
  const { phase, interactionPayload, hypothesisManifest, manifestData } = state;

  // ── Module 1 → Module 1.5 (Hypothesis Review) ────────────────────────────
  //
  // The IntakeTerminal's "Skip to Synthesis" dev bypass calls this same
  // handler with `intent === 'DEV_TEST_MOCK'`. When detected, we fetch
  // `/api/latest-run` and jump directly to the synthesis phase, hydrating
  // `hypothesisManifest` along the way (graceful `?? null` until the
  // backend exposes the field — see Sprint 4 task 15.1).
  const handleInteractionComplete = async (payload: InteractionPayload) => {
    if (payload.intent === 'DEV_TEST_MOCK') {
      try {
        const res = await axios.get(LATEST_RUN_URL);
        const data = res.data ?? {};
        const intent: string = data.intent || payload.intent;
        const manifest: HypothesisManifest | null =
          (data.hypothesis_manifest as HypothesisManifest | undefined) ?? null;
        dispatch({
          type: 'DEV_BYPASS_TO_SYNTHESIS',
          payload: buildPayloadFromLatestRun(intent),
          manifest,
        });
      } catch (err) {
        console.error('Skip to Synthesis bypass failed:', err);
        alert('Skip to Synthesis failed. Run a full live session first to capture latest_run_data.');
      }
      return;
    }

    dispatch({ type: 'INTERACTION_COMPLETE', payload });
  };

  // ── Module 1 dev bypass → Module 1.5 (Hypothesis Review) ─────────────────
  const handleSkipToHypothesisReview = async () => {
    try {
      const res = await axios.get(LATEST_RUN_URL);
      const data = res.data ?? {};
      const intent: string = data.intent || '';
      if (!intent) {
        alert('Skip to Hypothesis Review failed: no cached intent found.');
        return;
      }
      const manifest: HypothesisManifest | null =
        (data.hypothesis_manifest as HypothesisManifest | undefined) ?? null;
      dispatch({
        type: 'DEV_BYPASS_TO_HYPOTHESIS_REVIEW',
        payload: buildPayloadFromLatestRun(intent),
        manifest,
      });
    } catch (err) {
      console.error('Skip to Hypothesis Review bypass failed:', err);
      alert('Skip to Hypothesis Review failed. Run a full live session first to capture latest_run_data.');
    }
  };

  // ── Module 1.5 → Module 2 (Synthesis) ────────────────────────────────────
  const handleHypothesisManifestApproved = (manifest: HypothesisManifest) => {
    dispatch({ type: 'HYPOTHESIS_APPROVED', manifest });
  };

  // ── Module 1.5 → Module 1 (Reject — back-loop for refinement) ────────────
  const handleHypothesisManifestRejected = (rejectionContext: string) => {
    dispatch({ type: 'HYPOTHESIS_REJECTED', rejectionContext });
  };

  // ── Module 2 → Module 1 (Reject — back-loop for refinement) ──────────────
  const handleSynthesisRejected = (rejectionContext?: string) => {
    dispatch({ type: 'SYNTHESIS_REJECTED', rejectionContext });
  };

  // ── Module 2 → Module 3 (Approve — manifest is the sole bridge) ──────────
  const handleSynthesisApproved = (manifest: Record<string, any>) => {
    dispatch({ type: 'SYNTHESIS_APPROVED', manifest });
  };

  return (
    <main className="h-screen w-screen bg-black overflow-hidden flex">
      {!providerSelected ? (
        <LLMProviderGate onProviderSelected={() => setProviderSelected(true)} />
      ) : (
        <>
      {phase === 'interaction' && (
        <IntakeTerminal
          onInteractionComplete={handleInteractionComplete}
          onSkipToHypothesisReview={handleSkipToHypothesisReview}
          existingPayload={interactionPayload}
        />
      )}
      {phase === 'hypothesis_generation' && interactionPayload && (
        <HypothesisReview
          interactionPayload={interactionPayload}
          initialManifest={hypothesisManifest}
          onApprove={handleHypothesisManifestApproved}
          onReject={handleHypothesisManifestRejected}
          onBack={() => dispatch({ type: 'GO_BACK_TO', phase: 'interaction' })}
        />
      )}
      {phase === 'synthesis' && interactionPayload && (
        <SynthesisDashboard
          interactionPayload={interactionPayload}
          hypothesisManifest={hypothesisManifest}
          onComplete={handleSynthesisApproved}
          onRejected={handleSynthesisRejected}
          onBack={(resolvedIntent) =>
            dispatch({ type: 'GO_BACK_TO', phase: 'interaction', resolvedIntent })
          }
        />
      )}
      {phase === 'discovery' && manifestData && (
        <DiscoveryAudit
          manifest={manifestData}
          onBeginIngestion={() => alert('Starting full ingestion pipeline...')}
          onBack={() => dispatch({ type: 'GO_BACK_TO', phase: 'synthesis' })}
        />
      )}
        </>
      )}
    </main>
  );
}

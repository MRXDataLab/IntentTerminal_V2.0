/**
 * Pure reducer for the page-level Phase State Machine.
 *
 * Extracted from `page.tsx` so it can be property-tested in isolation
 * (see Sprint 2 task 6.3 — `Property 18: Phase state machine invariants`).
 *
 * Phase transitions (per design.md → "Phase State Machine"):
 *
 *   interaction --INTERACTION_COMPLETE--> hypothesis_generation
 *   hypothesis_generation --HYPOTHESIS_APPROVED--> synthesis
 *   hypothesis_generation --HYPOTHESIS_REJECTED--> interaction
 *   synthesis --SYNTHESIS_APPROVED--> discovery
 *   synthesis --SYNTHESIS_REJECTED--> interaction
 *
 * Persistence rules:
 *   - `interactionPayload` is never wiped while user is in any phase ≥ interaction
 *   - `hypothesisManifest` is never wiped while user is in any phase ≥ hypothesis_generation
 *   - `manifestData` is never wiped while user is in any phase ≥ synthesis
 *
 * The dev-bypass actions (DEV_BYPASS_TO_*) hydrate state from `/api/latest-run`
 * and jump directly to the requested phase.
 */

import type { HypothesisManifest } from '@/types/hypothesis';
import type { InteractionPayload } from './page';

export type Phase =
  | 'interaction'
  | 'hypothesis_generation'
  | 'synthesis'
  | 'discovery';

export interface PhaseState {
  phase: Phase;
  interactionPayload: InteractionPayload | null;
  hypothesisManifest: HypothesisManifest | null;
  manifestData: Record<string, unknown> | null;
}

export type PhaseAction =
  // User-driven transitions
  | { type: 'INTERACTION_COMPLETE'; payload: InteractionPayload }
  | { type: 'HYPOTHESIS_APPROVED'; manifest: HypothesisManifest }
  | { type: 'HYPOTHESIS_REJECTED'; rejectionContext: string }
  | { type: 'SYNTHESIS_APPROVED'; manifest: Record<string, unknown> }
  | { type: 'SYNTHESIS_REJECTED'; rejectionContext?: string }
  | { type: 'GO_BACK_TO'; phase: Phase; resolvedIntent?: string }
  // Dev-bypass jumps that hydrate state from /api/latest-run
  | {
      type: 'DEV_BYPASS_TO_HYPOTHESIS_REVIEW';
      payload: InteractionPayload;
      manifest: HypothesisManifest | null;
    }
  | {
      type: 'DEV_BYPASS_TO_SYNTHESIS';
      payload: InteractionPayload;
      manifest: HypothesisManifest | null;
    }
  | {
      type: 'DEV_BYPASS_TO_DISCOVERY';
      payload: InteractionPayload;
      manifest: HypothesisManifest | null;
      manifestData: Record<string, unknown>;
    };

export const initialPhaseState: PhaseState = {
  phase: 'interaction',
  interactionPayload: null,
  hypothesisManifest: null,
  manifestData: null,
};

export function phaseReducer(state: PhaseState, action: PhaseAction): PhaseState {
  switch (action.type) {
    case 'INTERACTION_COMPLETE':
      // When the intent text changes between completions, the cached
      // hypothesisManifest is stale and must be cleared. Otherwise we
      // preserve it so a refinement loop can hydrate the review screen
      // from the prior manifest while the engine regenerates.
      return {
        ...state,
        phase: 'hypothesis_generation',
        interactionPayload: action.payload,
        hypothesisManifest:
          state.interactionPayload?.intent === action.payload.intent
            ? state.hypothesisManifest
            : null,
      };

    case 'HYPOTHESIS_APPROVED':
      return {
        ...state,
        phase: 'synthesis',
        hypothesisManifest: action.manifest,
      };

    case 'HYPOTHESIS_REJECTED':
      return {
        ...state,
        phase: 'interaction',
        interactionPayload: state.interactionPayload
          ? {
              ...state.interactionPayload,
              isRefinement: true,
              rejectionContext: action.rejectionContext,
            }
          : null,
        // hypothesisManifest preserved across the rejection loop
      };

    case 'SYNTHESIS_APPROVED':
      return {
        ...state,
        phase: 'discovery',
        manifestData: action.manifest,
      };

    case 'SYNTHESIS_REJECTED':
      return {
        ...state,
        phase: 'interaction',
        interactionPayload: state.interactionPayload
          ? {
              ...state.interactionPayload,
              isRefinement: true,
              rejectionContext: action.rejectionContext,
            }
          : null,
        // hypothesisManifest preserved
      };

    case 'GO_BACK_TO':
      return {
        ...state,
        phase: action.phase,
        interactionPayload:
          action.phase === 'interaction' &&
          action.resolvedIntent &&
          action.resolvedIntent !== 'DEV_TEST_MOCK' &&
          state.interactionPayload
            ? { ...state.interactionPayload, intent: action.resolvedIntent }
            : state.interactionPayload,
      };

    case 'DEV_BYPASS_TO_HYPOTHESIS_REVIEW':
      return {
        ...state,
        phase: 'hypothesis_generation',
        interactionPayload: action.payload,
        hypothesisManifest: action.manifest,
      };

    case 'DEV_BYPASS_TO_SYNTHESIS':
      return {
        ...state,
        phase: 'synthesis',
        interactionPayload: action.payload,
        hypothesisManifest: action.manifest,
      };

    case 'DEV_BYPASS_TO_DISCOVERY':
      return {
        ...state,
        phase: 'discovery',
        interactionPayload: action.payload,
        hypothesisManifest: action.manifest,
        manifestData: action.manifestData,
      };

    default:
      return state;
  }
}

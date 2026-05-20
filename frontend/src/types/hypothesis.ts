/**
 * Hypothesis Engine — frontend type definitions.
 *
 * Mirrors the Pydantic schema in `backend/services/hypothesis_engine.py`
 * (HypothesisModel, CoreProblemModel, ManifestMetadataModel,
 * HypothesisManifestModel) and the Hypothesis Manifest schema (version 1.0)
 * defined in Section 5 of `UPDATE_HYPOTHESIS_GENERATION.md`.
 *
 * Source of truth is the backend Pydantic schema. If the backend schema
 * changes, update this file in lockstep.
 */

// ─── Enum-like unions ───────────────────────────────────────────────────────

/**
 * Ten structural taxonomy dimensions the GENERATOR stage must evaluate.
 * Mirrors `STRUCTURAL_DIMENSIONS` in the backend engine.
 */
export type StructuralDimension =
  | 'price'
  | 'product'
  | 'brand_perception'
  | 'distribution'
  | 'cultural_identity'
  | 'regulatory'
  | 'demographic_shift'
  | 'competitive_shift'
  | 'situational_context'
  | 'identity_expression';

/**
 * Snake-case slugs for the five Strategic Forces.
 * Mirrors `VALID_FORCES` in the backend engine.
 */
export type StrategicForce =
  | 'demand_gravity'
  | 'choice_architecture_pressure'
  | 'value_elasticity_field'
  | 'reinforcement_stability'
  | 'competitive_energy_field';

/**
 * Source of a generated hypothesis. `context_aware` and `naive` come from
 * the two-pass generator; `contrarian_pair` is reserved for hypotheses
 * synthesized purely to complete a contrarian pair.
 */
export type GenerationSource = 'context_aware' | 'naive' | 'contrarian_pair';

/**
 * Investigation priority assigned to an individual hypothesis.
 */
export type InvestigationPriority = 'high' | 'medium' | 'low';

/**
 * Priority assigned to a core problem after decomposition.
 */
export type Priority = 'primary' | 'secondary';

// ─── Object shapes ──────────────────────────────────────────────────────────

/**
 * A single structured hypothesis record within the Hypothesis Manifest.
 *
 * `id` matches the backend regex `^h_\d{3,}$|^h_merged_[a-f0-9]+$` but is
 * left as a plain `string` here — TypeScript cannot encode that pattern in
 * the type system, and runtime validation lives on the backend.
 */
export interface Hypothesis {
  id: string;
  statement: string;
  dimension: StructuralDimension;
  force_assignment: StrategicForce;
  mece_cluster_id: string;
  expected_signals: string[];
  expected_counter_signals: string[];
  contrarian_pair_id: string | null;
  investigation_priority: InvestigationPriority;
  generation_source: GenerationSource;
  rationale: string;
}

/**
 * A discrete problem decomposed from the research intent. Each Core
 * Problem owns a non-empty list of hypotheses.
 *
 * `id` matches the backend regex `^cp_\d{3,}$` but is left as a plain
 * `string` here for the same reason as `Hypothesis.id`.
 */
export interface CoreProblem {
  id: string;
  statement: string;
  priority: Priority;
  decomposed_from_intent: boolean;
  hypothesis_count: number;
  hypotheses: Hypothesis[];
}

/**
 * Manifest-level counters and audit telemetry.
 */
export interface HypothesisManifestMetadata {
  total_core_problems: number;
  total_hypotheses: number;
  total_contrarian_pairs: number;
  generation_method: string;
  mece_audit_passed: boolean;
  mece_audit_iterations: number;
  de_anchored_pass_count: number;
  dimensions_covered: StructuralDimension[];
  validation_errors?: string[] | null;
  audit_notes?: string[] | null;
}

/**
 * Top-level Hypothesis Manifest schema (version 1.0).
 *
 * Persisted by the backend at `Hypothesis_Manifest.json` and
 * `latest_run_data/latest_hypothesis_manifest.json`.
 */
export interface HypothesisManifest {
  schema_version: '1.0';
  generated_at: string;
  intent: string;
  metadata: HypothesisManifestMetadata;
  core_problems: CoreProblem[];
}

// ─── Runtime constants ──────────────────────────────────────────────────────

/**
 * Runtime list of the ten structural dimensions, in the same order as the
 * backend `STRUCTURAL_DIMENSIONS` constant. Used by `HypothesisReview` to
 * populate the dimension dropdown in the Add Hypothesis modal.
 */
export const STRUCTURAL_DIMENSIONS: readonly StructuralDimension[] = [
  'price',
  'product',
  'brand_perception',
  'distribution',
  'cultural_identity',
  'regulatory',
  'demographic_shift',
  'competitive_shift',
  'situational_context',
  'identity_expression',
];

/**
 * Runtime list of the five Strategic Force slugs. Used by
 * `HypothesisReview` to populate the force dropdown in the Add Hypothesis
 * modal.
 */
export const VALID_FORCES: readonly StrategicForce[] = [
  'demand_gravity',
  'choice_architecture_pressure',
  'value_elasticity_field',
  'reinforcement_stability',
  'competitive_energy_field',
];

/**
 * Minimum number of `expected_signals` required per hypothesis. Mirrors
 * the backend `MIN_EXPECTED_SIGNALS` constant.
 */
export const MIN_EXPECTED_SIGNALS = 3 as const;

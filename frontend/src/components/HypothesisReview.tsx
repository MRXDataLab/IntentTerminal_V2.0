'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type { InteractionPayload } from '@/app/page';
import {
  MIN_EXPECTED_SIGNALS,
  STRUCTURAL_DIMENSIONS,
  VALID_FORCES,
} from '@/types/hypothesis';
import type {
  CoreProblem,
  Hypothesis,
  HypothesisManifest,
  InvestigationPriority,
  StrategicForce,
  StructuralDimension,
} from '@/types/hypothesis';

// ─── Constants ──────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:8000/api/generate-hypotheses';
const RATE_LIMIT_RETRY_SECONDS = 30;

const FORCE_LABELS: Record<StrategicForce, string> = {
  demand_gravity: 'Demand Gravity',
  choice_architecture_pressure: 'Choice Architecture Pressure',
  value_elasticity_field: 'Value Elasticity Field',
  reinforcement_stability: 'Reinforcement Stability',
  competitive_energy_field: 'Competitive Energy Field',
};

const PRIORITY_CHIP_CLASSES: Record<InvestigationPriority, string> = {
  high: 'bg-red-500/15 text-red-300 border-red-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/50',
};

const VALID_PRIORITIES: readonly InvestigationPriority[] = ['high', 'medium', 'low'];

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * SHA-256 hex of `intent`. Falls back to a base64 prefix when SubtleCrypto
 * is unavailable (e.g. non-secure contexts in dev).
 */
export async function intentHash(intent: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(intent);
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      /* fall through */
    }
  }
  try {
    return btoa(unescape(encodeURIComponent(intent))).slice(0, 32);
  } catch {
    let h = 0;
    for (let i = 0; i < intent.length; i++) h = (h * 31 + intent.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
}

function cacheKey(hash: string): string {
  return `hypothesisManifest:${hash}`;
}

/**
 * Walk the hypothesis array and emit either a [a, b] pair-row (when both
 * sides reference each other via contrarian_pair_id) or a single-card row.
 */
export function groupHypothesesIntoPairRows(hypotheses: Hypothesis[]): Hypothesis[][] {
  const seen = new Set<string>();
  const byId = new Map<string, Hypothesis>();
  for (const h of hypotheses) byId.set(h.id, h);

  const rows: Hypothesis[][] = [];
  for (const h of hypotheses) {
    if (seen.has(h.id)) continue;
    const partner = h.contrarian_pair_id ? byId.get(h.contrarian_pair_id) : undefined;
    if (
      partner &&
      !seen.has(partner.id) &&
      partner.contrarian_pair_id === h.id
    ) {
      rows.push([h, partner]);
      seen.add(h.id);
      seen.add(partner.id);
    } else {
      rows.push([h]);
      seen.add(h.id);
    }
  }
  return rows;
}

/**
 * Pairs of hypotheses that share dimension + mece_cluster_id but are NOT
 * each other's contrarian pair — i.e. the MECE auditor flagged overlap.
 */
export function findFlaggedPairs(manifest: HypothesisManifest): Array<[Hypothesis, Hypothesis]> {
  const all = manifest.core_problems.flatMap((cp) => cp.hypotheses);
  const flagged: Array<[Hypothesis, Hypothesis]> = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (
        a.dimension === b.dimension &&
        a.mece_cluster_id === b.mece_cluster_id &&
        a.contrarian_pair_id !== b.id &&
        b.contrarian_pair_id !== a.id
      ) {
        flagged.push([a, b]);
      }
    }
  }
  return flagged;
}

/**
 * Extract hypothesis IDs cited inside an array of validation_error strings.
 * Matches both `h_001` and `h_merged_<hex>` IDs.
 */
function extractCitedHypothesisIds(errors: string[] | undefined): Set<string> {
  const cited = new Set<string>();
  if (!errors) return cited;
  const re = /\bh_(?:\d{3,}|merged_[a-f0-9]+)\b/gi;
  for (const e of errors) {
    const matches = e.match(re);
    if (matches) for (const m of matches) cited.add(m);
  }
  return cited;
}

function nextHypothesisId(manifest: HypothesisManifest): string {
  let max = 0;
  for (const cp of manifest.core_problems) {
    for (const h of cp.hypotheses) {
      const m = /^h_(\d{3,})$/.exec(h.id);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  }
  return `h_${(max + 1).toString().padStart(3, '0')}`;
}

function flattenHypotheses(manifest: HypothesisManifest): Hypothesis[] {
  return manifest.core_problems.flatMap((cp) => cp.hypotheses);
}

// ─── HypothesisReview component ─────────────────────────────────────────────

interface HypothesisReviewProps {
  interactionPayload: InteractionPayload;
  initialManifest?: HypothesisManifest | null;
  onApprove: (manifest: HypothesisManifest) => void;
  onReject: (rejectionContext: string) => void;
  onBack: () => void;
}

type ErrorType = '422' | '429' | '4xx' | '5xx' | 'network';

interface ErrorState {
  type: ErrorType;
  message: string;
  partialManifest?: HypothesisManifest;
  validationErrors?: string[];
}

interface HypothesisFormState {
  statement: string;
  dimension: StructuralDimension;
  force_assignment: StrategicForce;
  mece_cluster_id: string;
  expected_signals: string[];
  expected_counter_signals: string[];
  investigation_priority: InvestigationPriority;
  contrarian_pair_id: string | null;
  rationale: string;
  core_problem_id: string;
}

function emptyFormState(coreProblems: CoreProblem[]): HypothesisFormState {
  return {
    statement: '',
    dimension: STRUCTURAL_DIMENSIONS[0],
    force_assignment: VALID_FORCES[0],
    mece_cluster_id: '',
    expected_signals: [],
    expected_counter_signals: [],
    investigation_priority: 'medium',
    contrarian_pair_id: null,
    rationale: '',
    core_problem_id: coreProblems[0]?.id ?? '',
  };
}

function formStateFromHypothesis(h: Hypothesis, coreProblemId: string): HypothesisFormState {
  return {
    statement: h.statement,
    dimension: h.dimension,
    force_assignment: h.force_assignment,
    mece_cluster_id: h.mece_cluster_id,
    expected_signals: [...h.expected_signals],
    expected_counter_signals: [...h.expected_counter_signals],
    investigation_priority: h.investigation_priority,
    contrarian_pair_id: h.contrarian_pair_id,
    rationale: h.rationale,
    core_problem_id: coreProblemId,
  };
}

interface ValidationFailure {
  field: keyof HypothesisFormState | 'form';
  message: string;
}

function validateForm(form: HypothesisFormState): ValidationFailure[] {
  const errors: ValidationFailure[] = [];
  if (!form.statement.trim()) {
    errors.push({ field: 'statement', message: 'Statement is required.' });
  }
  if (!STRUCTURAL_DIMENSIONS.includes(form.dimension)) {
    errors.push({ field: 'dimension', message: 'Pick a valid structural dimension.' });
  }
  if (!VALID_FORCES.includes(form.force_assignment)) {
    errors.push({ field: 'force_assignment', message: 'Pick a valid force.' });
  }
  if (!form.mece_cluster_id.trim()) {
    errors.push({ field: 'mece_cluster_id', message: 'mece_cluster_id is required.' });
  }
  if (form.expected_signals.length < MIN_EXPECTED_SIGNALS) {
    errors.push({
      field: 'expected_signals',
      message: `At least ${MIN_EXPECTED_SIGNALS} expected signals are required.`,
    });
  }
  if (!form.core_problem_id) {
    errors.push({ field: 'core_problem_id', message: 'Pick a core problem.' });
  }
  if (form.contrarian_pair_id === null) {
    const r = form.rationale.toLowerCase();
    if (!r.includes('no meaningful opposite') && !r.includes('no useful contrarian')) {
      errors.push({
        field: 'rationale',
        message:
          'When no contrarian pair is selected, rationale must contain "no meaningful opposite" or "no useful contrarian".',
      });
    }
  }
  return errors;
}

export default function HypothesisReview({
  interactionPayload,
  initialManifest,
  onApprove,
  onReject,
  onBack,
}: HypothesisReviewProps) {
  const [manifest, setManifest] = useState<HypothesisManifest | null>(initialManifest ?? null);
  const [loading, setLoading] = useState<boolean>(!initialManifest);
  const [error, setError] = useState<ErrorState | null>(null);
  const [expandedRationaleIds, setExpandedRationaleIds] = useState<Set<string>>(new Set());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [rejectionPromptOpen, setRejectionPromptOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [retryCountdown, setRetryCountdown] = useState<number>(0);
  const [cacheKeyState, setCacheKeyState] = useState<string | null>(null);

  // Tracks the last intent we tried to fetch — guards StrictMode double mount.
  const fetchTokenRef = useRef<number>(0);

  const persistedManifest = manifest ?? error?.partialManifest ?? null;

  const citedIds = useMemo(
    () => extractCitedHypothesisIds(error?.validationErrors),
    [error?.validationErrors],
  );

  // ── Manifest fetch / hydrate ──────────────────────────────────────────────

  const performFetch = useCallback(
    async (forceFresh: boolean) => {
      const myToken = ++fetchTokenRef.current;
      setLoading(true);
      setError(null);

      const hash = await intentHash(interactionPayload.intent);
      const key = cacheKey(hash);
      setCacheKeyState(key);

      // sessionStorage hydrate (skipped on forceFresh)
      if (!forceFresh && typeof window !== 'undefined') {
        try {
          const cached = window.sessionStorage.getItem(key);
          if (cached) {
            const parsed = JSON.parse(cached) as HypothesisManifest;
            if (myToken === fetchTokenRef.current) {
              setManifest(parsed);
              setLoading(false);
            }
            return;
          }
        } catch {
          /* ignore corrupted cache */
        }
      } else if (forceFresh && typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }

      try {
        const res = await axios.post<HypothesisManifest>(API_URL, {
          intent: interactionPayload.intent,
          pillar_extractions: interactionPayload.pillarExtractions ?? undefined,
          pillar_scores: interactionPayload.parameters,
          context_document: interactionPayload.contextDocument ?? undefined,
          template:
            interactionPayload.template && interactionPayload.template !== 'none'
              ? interactionPayload.template
              : undefined,
          chat_history: interactionPayload.chatHistory,
        });
        if (myToken !== fetchTokenRef.current) return;
        setManifest(res.data);
        setError(null);
        try {
          window.sessionStorage.setItem(key, JSON.stringify(res.data));
        } catch {
          /* quota exceeded — non-fatal */
        }
      } catch (err: unknown) {
        if (myToken !== fetchTokenRef.current) return;
        const axiosErr = err as {
          response?: { status?: number; data?: { detail?: unknown; message?: string } };
          message?: string;
        };
        const status = axiosErr.response?.status;
        const detail = axiosErr.response?.data?.detail;
        if (status === 422) {
          let partial: HypothesisManifest | undefined;
          let errs: string[] | undefined;
          let msg = 'Manifest failed validation after 3 regeneration attempts.';
          if (detail && typeof detail === 'object') {
            const d = detail as { manifest?: HypothesisManifest; errors?: string[]; message?: string };
            partial = d.manifest;
            errs = d.errors;
            if (d.message) msg = d.message;
          }
          setManifest(partial ?? null);
          setError({
            type: '422',
            message: msg,
            partialManifest: partial,
            validationErrors: errs,
          });
        } else if (status === 429) {
          setError({
            type: '429',
            message:
              typeof detail === 'string'
                ? detail
                : 'Rate limited. The engine will retry automatically.',
          });
          setRetryCountdown(RATE_LIMIT_RETRY_SECONDS);
        } else if (status && status >= 400 && status < 500) {
          setError({
            type: '4xx',
            message:
              typeof detail === 'string'
                ? detail
                : `Request rejected (HTTP ${status}).`,
          });
        } else if (status && status >= 500) {
          setError({
            type: '5xx',
            message:
              typeof detail === 'string' ? detail : 'Engine internal error. Logs captured.',
          });
        } else {
          setError({
            type: 'network',
            message: axiosErr.message || 'Backend unreachable.',
          });
        }
      } finally {
        if (myToken === fetchTokenRef.current) setLoading(false);
      }
    },
    [
      interactionPayload.chatHistory,
      interactionPayload.contextDocument,
      interactionPayload.intent,
      interactionPayload.parameters,
      interactionPayload.pillarExtractions,
      interactionPayload.template,
    ],
  );

  // Mount: hydrate from initialManifest, sessionStorage, or POST.
  useEffect(() => {
    if (initialManifest) {
      setManifest(initialManifest);
      setLoading(false);
      // Ensure sessionStorage cache is populated with the initial manifest.
      (async () => {
        const hash = await intentHash(interactionPayload.intent);
        const key = cacheKey(hash);
        setCacheKeyState(key);
        try {
          window.sessionStorage.setItem(key, JSON.stringify(initialManifest));
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    void performFetch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 429 countdown → auto-retry once.
  useEffect(() => {
    if (error?.type !== '429' || retryCountdown <= 0) return;
    const t = window.setTimeout(() => {
      const next = retryCountdown - 1;
      if (next <= 0) {
        setRetryCountdown(0);
        void performFetch(true);
      } else {
        setRetryCountdown(next);
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [error?.type, retryCountdown, performFetch]);

  // ── Manifest mutations (Add / Edit / cache write-back) ────────────────────

  const writeManifestToCache = useCallback(
    (next: HypothesisManifest) => {
      if (!cacheKeyState) return;
      try {
        window.sessionStorage.setItem(cacheKeyState, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [cacheKeyState],
  );

  const recountMetadata = useCallback((m: HypothesisManifest): HypothesisManifest => {
    const totalHypotheses = flattenHypotheses(m).length;
    const totalContrarianPairs = flattenHypotheses(m).filter(
      (h) => h.contrarian_pair_id !== null,
    ).length / 2;
    const updatedCoreProblems = m.core_problems.map((cp) => ({
      ...cp,
      hypothesis_count: cp.hypotheses.length,
    }));
    return {
      ...m,
      core_problems: updatedCoreProblems,
      metadata: {
        ...m.metadata,
        total_core_problems: m.core_problems.length,
        total_hypotheses: totalHypotheses,
        total_contrarian_pairs: Math.floor(totalContrarianPairs),
      },
    };
  }, []);

  const handleAddSubmit = useCallback(
    (form: HypothesisFormState) => {
      if (!manifest) return;
      const newId = nextHypothesisId(manifest);
      const newHyp: Hypothesis = {
        id: newId,
        statement: form.statement.trim(),
        dimension: form.dimension,
        force_assignment: form.force_assignment,
        mece_cluster_id: form.mece_cluster_id.trim(),
        expected_signals: [...form.expected_signals],
        expected_counter_signals: [...form.expected_counter_signals],
        contrarian_pair_id: form.contrarian_pair_id,
        investigation_priority: form.investigation_priority,
        generation_source: 'context_aware',
        rationale: form.rationale.trim(),
      };
      const next: HypothesisManifest = {
        ...manifest,
        core_problems: manifest.core_problems.map((cp) =>
          cp.id === form.core_problem_id
            ? { ...cp, hypotheses: [...cp.hypotheses, newHyp] }
            : cp,
        ),
      };
      const finalManifest = recountMetadata(next);
      setManifest(finalManifest);
      writeManifestToCache(finalManifest);
      setAddModalOpen(false);
    },
    [manifest, recountMetadata, writeManifestToCache],
  );

  const handleEditSubmit = useCallback(
    (id: string, form: HypothesisFormState) => {
      if (!manifest) return;
      // Determine source core problem (where the hypothesis currently lives).
      let sourceCpId: string | null = null;
      for (const cp of manifest.core_problems) {
        if (cp.hypotheses.some((h) => h.id === id)) {
          sourceCpId = cp.id;
          break;
        }
      }
      if (sourceCpId === null) return;

      const updated: Hypothesis = {
        id,
        statement: form.statement.trim(),
        dimension: form.dimension,
        force_assignment: form.force_assignment,
        mece_cluster_id: form.mece_cluster_id.trim(),
        expected_signals: [...form.expected_signals],
        expected_counter_signals: [...form.expected_counter_signals],
        contrarian_pair_id: form.contrarian_pair_id,
        investigation_priority: form.investigation_priority,
        generation_source: 'context_aware',
        rationale: form.rationale.trim(),
      };

      const next: HypothesisManifest = {
        ...manifest,
        core_problems: manifest.core_problems.map((cp) => {
          if (cp.id === sourceCpId && cp.id === form.core_problem_id) {
            return {
              ...cp,
              hypotheses: cp.hypotheses.map((h) => (h.id === id ? updated : h)),
            };
          }
          if (cp.id === sourceCpId) {
            // Move out
            return { ...cp, hypotheses: cp.hypotheses.filter((h) => h.id !== id) };
          }
          if (cp.id === form.core_problem_id) {
            // Move in
            return { ...cp, hypotheses: [...cp.hypotheses, updated] };
          }
          return cp;
        }),
      };
      const finalManifest = recountMetadata(next);
      setManifest(finalManifest);
      writeManifestToCache(finalManifest);
      setEditingId(null);
    },
    [manifest, recountMetadata, writeManifestToCache],
  );

  // ── Action bar handlers ───────────────────────────────────────────────────

  const handleProceed = () => {
    if (!manifest) return;
    onApprove(manifest);
  };

  const handleRegen = () => {
    void performFetch(true);
  };

  const handleRejectSubmit = () => {
    onReject(rejectionReason.trim());
  };

  const handleDownloadCSV = () => {
    if (!persistedManifest) return;

    const escapeCSV = (val: string): string => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headers = [
      'Hypothesis ID',
      'Core Problem ID',
      'Core Problem Statement',
      'Hypothesis Statement',
      'Dimension',
      'Force Assignment',
      'MECE Cluster',
      'Investigation Priority',
      'Expected Signals',
      'Expected Counter Signals',
      'Contrarian Pair ID',
      'Generation Source',
      'Rationale',
    ];

    const rows: string[][] = [];
    for (const cp of persistedManifest.core_problems) {
      for (const h of cp.hypotheses) {
        rows.push([
          h.id,
          cp.id,
          escapeCSV(cp.statement),
          escapeCSV(h.statement),
          h.dimension,
          FORCE_LABELS[h.force_assignment] || h.force_assignment,
          h.mece_cluster_id,
          h.investigation_priority,
          escapeCSV(h.expected_signals.join('; ')),
          escapeCSV(h.expected_counter_signals.join('; ')),
          h.contrarian_pair_id || '',
          h.generation_source,
          escapeCSV(h.rationale),
        ]);
      }
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = persistedManifest.intent
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    link.href = url;
    link.download = `Hypothesis_Manifest_${slug}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditClick = () => {
    if (selectedCardId) setEditingId(selectedCardId);
  };

  const toggleRationale = (id: string) => {
    setExpandedRationaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToCard = (id: string) => {
    const el = document.getElementById(`hyp-card-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Flagged-pair SVG connectors ───────────────────────────────────────────

  const flaggedPairs = useMemo(() => {
    if (!persistedManifest) return [] as Array<[Hypothesis, Hypothesis]>;
    if (persistedManifest.metadata.mece_audit_passed) return [];
    return findFlaggedPairs(persistedManifest);
  }, [persistedManifest]);

  const [connectorPaths, setConnectorPaths] = useState<
    Array<{ a: Hypothesis; b: Hypothesis; d: string }>
  >([]);

  const recomputeConnectors = useCallback(() => {
    if (!flaggedPairs.length) {
      setConnectorPaths([]);
      return;
    }
    const next: Array<{ a: Hypothesis; b: Hypothesis; d: string }> = [];
    for (const [a, b] of flaggedPairs) {
      const elA = document.getElementById(`hyp-card-${a.id}`);
      const elB = document.getElementById(`hyp-card-${b.id}`);
      if (!elA || !elB) continue;
      const rA = elA.getBoundingClientRect();
      const rB = elB.getBoundingClientRect();
      const ax = rA.left + rA.width / 2;
      const ay = rA.top + rA.height / 2;
      const bx = rB.left + rB.width / 2;
      const by = rB.top + rB.height / 2;
      const cx = (ax + bx) / 2;
      const cy = (ay + by) / 2 - 40;
      next.push({ a, b, d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}` });
    }
    setConnectorPaths(next);
  }, [flaggedPairs]);

  useEffect(() => {
    recomputeConnectors();
    if (!flaggedPairs.length) return;
    const handler = () => recomputeConnectors();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recomputeConnectors());
      for (const [a, b] of flaggedPairs) {
        const elA = document.getElementById(`hyp-card-${a.id}`);
        const elB = document.getElementById(`hyp-card-${b.id}`);
        if (elA) ro.observe(elA);
        if (elB) ro.observe(elB);
      }
    }
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
      ro?.disconnect();
    };
  }, [flaggedPairs, recomputeConnectors, persistedManifest, expandedRationaleIds, editingId]);

  const auditNote = useMemo(() => {
    const notes = persistedManifest?.metadata.audit_notes;
    if (!notes || !notes.length) return '';
    return notes.join('\n');
  }, [persistedManifest?.metadata.audit_notes]);

  // ── Render: loading / error states ────────────────────────────────────────

  if (loading && !persistedManifest) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#050505] text-white items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-indigo-500/40 flex items-center justify-center">
            <RefreshCw className="text-indigo-400 animate-spin" size={28} />
          </div>
          <h2 className="text-xl font-light tracking-widest text-indigo-50">
            HYPOTHESIS ENGINE
          </h2>
          <p className="text-sm text-gray-400 font-mono">Generating hypothesis manifest...</p>
        </div>
      </div>
    );
  }

  if (error && !persistedManifest) {
    return (
      <ErrorPane
        error={error}
        retryCountdown={retryCountdown}
        onRetry={() => performFetch(true)}
        onBack={onBack}
      />
    );
  }

  if (!persistedManifest) {
    return (
      <ErrorPane
        error={{ type: 'network', message: 'No manifest available.' }}
        retryCountdown={0}
        onRetry={() => performFetch(true)}
        onBack={onBack}
      />
    );
  }

  // ── Render: full review screen ────────────────────────────────────────────

  const allHypotheses = flattenHypotheses(persistedManifest);
  const distinctClusters = new Set(allHypotheses.map((h) => h.mece_cluster_id)).size;
  const auditPassed = persistedManifest.metadata.mece_audit_passed;

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white overflow-hidden font-sans relative">
      {/* Header */}
      <div className="w-full px-6 py-4 border-b border-[#222] flex items-center justify-between z-30 bg-[#0a0a0a]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] animate-pulse" />
          <h1 className="text-lg font-medium tracking-wide text-gray-300">
            Hypothesis Engine
          </h1>
        </div>
        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">
          PHASE 1.5: HYPOTHESIS REVIEW
        </span>
      </div>

      {/* Counter row (sticky) */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#222] px-6 py-3 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CounterChip
            label="Core Problems"
            value={persistedManifest.metadata.total_core_problems}
          />
          <CounterChip
            label="Hypotheses"
            value={persistedManifest.metadata.total_hypotheses}
          />
          <CounterChip label="MECE Clusters" value={distinctClusters} />
          <CounterChip
            label="Audit Status"
            value={auditPassed ? 'PASSED' : 'FAILED'}
            icon={
              auditPassed ? (
                <Check size={14} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={14} className="text-amber-400" />
              )
            }
            tone={auditPassed ? 'pass' : 'fail'}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-32 custom-scrollbar relative z-10">
        {/* MECE failure banner */}
        {!auditPassed && (
          <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm leading-relaxed">
              <span className="font-semibold">MECE audit did not converge cleanly after 3 iterations.</span>{' '}
              Some hypotheses may have semantic overlap. Review highlighted pairs before proceeding.
            </div>
          </div>
        )}

        {/* 422 partial-render banner */}
        {error?.type === '422' && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-100 text-sm">
            <div className="font-semibold mb-1">Partial manifest — validation failed</div>
            <p className="leading-relaxed">{error.message}</p>
            {error.validationErrors && error.validationErrors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs space-y-1">
                {error.validationErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Core problems */}
        <div className="space-y-8">
          {persistedManifest.core_problems.map((cp) => (
            <section key={cp.id} className="space-y-3">
              <header className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[11px] text-gray-500 uppercase tracking-widest font-mono">
                  Core Problem {cp.id.toUpperCase()}
                </span>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                    cp.priority === 'primary'
                      ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
                      : 'bg-zinc-700/40 text-zinc-300 border-zinc-600/50'
                  }`}
                >
                  {cp.priority}
                </span>
                <h2 className="text-base text-white font-medium leading-snug">
                  {cp.statement}
                </h2>
              </header>

              <div className="space-y-3">
                {groupHypothesesIntoPairRows(cp.hypotheses).map((row, idx) => (
                  <div
                    key={`${cp.id}-row-${idx}`}
                    className={`grid gap-3 ${
                      row.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {row.map((h) =>
                      editingId === h.id ? (
                        <HypothesisEditor
                          key={h.id}
                          hypothesis={h}
                          coreProblemId={cp.id}
                          coreProblems={persistedManifest.core_problems}
                          allHypotheses={allHypotheses}
                          onCancel={() => setEditingId(null)}
                          onSubmit={(form) => handleEditSubmit(h.id, form)}
                        />
                      ) : (
                        <HypothesisCard
                          key={h.id}
                          hypothesis={h}
                          selected={selectedCardId === h.id}
                          flagged={citedIds.has(h.id)}
                          rationaleOpen={expandedRationaleIds.has(h.id)}
                          onSelect={() =>
                            setSelectedCardId((s) => (s === h.id ? null : h.id))
                          }
                          onToggleRationale={() => toggleRationale(h.id)}
                          onJumpToPair={
                            h.contrarian_pair_id
                              ? () => scrollToCard(h.contrarian_pair_id as string)
                              : undefined
                          }
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Flagged-pair SVG overlay */}
      {connectorPaths.length > 0 && (
        <svg
          aria-hidden="true"
          className="fixed inset-0 w-screen h-screen pointer-events-none z-0"
        >
          {connectorPaths.map(({ a, b, d }) => (
            <g key={`${a.id}-${b.id}`} className="pointer-events-auto">
              <title>{auditNote || `Possible MECE overlap between ${a.id} and ${b.id}`}</title>
              <path
                d={d}
                stroke="rgba(245, 158, 11, 0.85)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
              />
              {/* Wider transparent stroke for hover hit-area */}
              <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
            </g>
          ))}
        </svg>
      )}

      {/* Action bar (sticky bottom) */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-t border-[#222] px-6 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleProceed}
          disabled={loading || !manifest}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-900/40 disabled:text-indigo-300/40 text-black text-sm font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center gap-2"
        >
          <ArrowRight size={14} />
          Proceed to Synthesis
        </button>
        <button
          onClick={() => setAddModalOpen(true)}
          className="px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-indigo-500/40 text-gray-300 hover:text-indigo-200 text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus size={14} />
          Add Hypothesis
        </button>
        <button
          onClick={handleEditClick}
          disabled={!selectedCardId}
          className="px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-indigo-500/40 text-gray-300 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Edit size={14} />
          Edit
        </button>
        <button
          onClick={handleRegen}
          disabled={loading}
          className="px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-amber-500/40 text-gray-300 hover:text-amber-200 disabled:opacity-40 text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Regen
        </button>
        <button
          onClick={handleDownloadCSV}
          disabled={!persistedManifest}
          className="px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-teal-500/40 text-gray-300 hover:text-teal-200 disabled:opacity-40 text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Download size={14} />
          Download CSV
        </button>
        <button
          onClick={() => setRejectionPromptOpen(true)}
          className="px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-red-500/40 text-gray-300 hover:text-red-300 text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <X size={14} />
          Reject
        </button>
        <div className="ml-auto text-[11px] text-gray-500 font-mono uppercase tracking-widest">
          {selectedCardId ? `Selected: ${selectedCardId}` : 'No card selected'}
        </div>
      </div>

      {/* Add modal */}
      {addModalOpen && persistedManifest && (
        <HypothesisFormModal
          title="Add Hypothesis"
          submitLabel="Add"
          coreProblems={persistedManifest.core_problems}
          allHypotheses={allHypotheses}
          initial={emptyFormState(persistedManifest.core_problems)}
          onCancel={() => setAddModalOpen(false)}
          onSubmit={handleAddSubmit}
        />
      )}

      {/* Reject prompt */}
      {rejectionPromptOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-[#0a0a0a] border border-red-500/30 rounded-xl p-5 space-y-3 shadow-2xl">
            <h3 className="text-base font-semibold text-red-200">Reject manifest</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              What needs to change? This feedback returns to the intake terminal as
              refinement context.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              className="w-full bg-black border border-red-900/40 focus:border-red-500/60 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
              placeholder="e.g. Missing distribution dimension; reconsider competitive shift hypotheses..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectionPromptOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-[#333] hover:border-[#444] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                className="px-3 py-1.5 text-sm font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 rounded-lg transition-colors"
              >
                Send Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface CounterChipProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tone?: 'default' | 'pass' | 'fail';
}

function CounterChip({ label, value, icon, tone = 'default' }: CounterChipProps) {
  const toneClasses =
    tone === 'pass'
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : tone === 'fail'
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-[#222] bg-[#111]';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClasses}`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  selected: boolean;
  flagged: boolean;
  rationaleOpen: boolean;
  onSelect: () => void;
  onToggleRationale: () => void;
  onJumpToPair?: () => void;
}

function HypothesisCard({
  hypothesis,
  selected,
  flagged,
  rationaleOpen,
  onSelect,
  onToggleRationale,
  onJumpToPair,
}: HypothesisCardProps) {
  const h = hypothesis;
  return (
    <div
      id={`hyp-card-${h.id}`}
      onClick={onSelect}
      className={`group relative rounded-xl border bg-[#0d0d0d] hover:bg-[#111] transition-colors p-4 cursor-pointer ${
        selected ? 'border-indigo-500/60 ring-1 ring-indigo-500/40' : 'border-[#222]'
      } ${flagged ? 'ring-2 ring-red-500/50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {h.id.toUpperCase()}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            {h.dimension.replace(/_/g, ' ')}
          </span>
          <span
            className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
              PRIORITY_CHIP_CLASSES[h.investigation_priority]
            }`}
          >
            {h.investigation_priority}
          </span>
        </div>
        {h.contrarian_pair_id && onJumpToPair && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPair();
            }}
            className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            title={`Jump to ${h.contrarian_pair_id}`}
          >
            ↔ {h.contrarian_pair_id.toUpperCase()}
          </button>
        )}
      </div>

      <p className="mt-3 text-sm text-gray-100 leading-relaxed">{h.statement}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
        <div>
          <span className="text-gray-500 uppercase tracking-widest font-mono text-[9px] block">
            Force
          </span>
          <span className="text-gray-200">{FORCE_LABELS[h.force_assignment]}</span>
        </div>
        <div>
          <span className="text-gray-500 uppercase tracking-widest font-mono text-[9px] block">
            Expected Signals
          </span>
          <span className="text-gray-200">{h.expected_signals.length}</span>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleRationale();
        }}
        className="mt-3 flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-300 font-mono uppercase tracking-widest transition-colors"
      >
        {rationaleOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Rationale
      </button>
      {rationaleOpen && (
        <div className="mt-2 text-[12px] text-gray-300 leading-relaxed border-l-2 border-indigo-500/30 pl-3">
          {h.rationale || <span className="text-gray-500 italic">No rationale provided.</span>}
        </div>
      )}
    </div>
  );
}

interface ErrorPaneProps {
  error: ErrorState;
  retryCountdown: number;
  onRetry: () => void;
  onBack: () => void;
}

function ErrorPane({ error, retryCountdown, onRetry, onBack }: ErrorPaneProps) {
  const titleByType: Record<ErrorType, string> = {
    '422': 'Manifest validation failed',
    '429': 'Rate limited',
    '4xx': 'Request rejected',
    '5xx': 'Engine error',
    network: 'Backend unreachable',
  };
  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white items-center justify-center font-sans px-6">
      <div className="max-w-md w-full bg-[#0a0a0a] border border-red-500/30 rounded-xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center">
            <AlertTriangle className="text-red-300" size={18} />
          </div>
          <h2 className="text-lg font-semibold text-red-100">{titleByType[error.type]}</h2>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{error.message}</p>
        {error.type === '429' && retryCountdown > 0 && (
          <p className="text-xs text-amber-300 font-mono">
            Auto-retrying in {retryCountdown}s...
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-sm font-medium bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 text-indigo-100 rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Retry
          </button>
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-sm font-medium border border-[#333] hover:border-[#444] text-gray-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────────────────────

interface ChipInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}

function ChipInput({ values, onChange, placeholder, ariaLabel }: ChipInputProps) {
  const [draft, setDraft] = useState<string>('');

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="bg-black border border-[#333] focus-within:border-indigo-500/50 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-200 border border-indigo-500/30"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-indigo-300 hover:text-red-300"
            aria-label={`Remove ${v}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] bg-transparent text-xs text-white placeholder-gray-600 outline-none px-1 py-0.5"
      />
    </div>
  );
}

interface HypothesisFormProps {
  initial: HypothesisFormState;
  coreProblems: CoreProblem[];
  allHypotheses: Hypothesis[];
  excludeIdFromContrarianOptions?: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (form: HypothesisFormState) => void;
}

function HypothesisForm({
  initial,
  coreProblems,
  allHypotheses,
  excludeIdFromContrarianOptions,
  submitLabel,
  onCancel,
  onSubmit,
}: HypothesisFormProps) {
  const [form, setForm] = useState<HypothesisFormState>(initial);
  const [errors, setErrors] = useState<ValidationFailure[]>([]);

  const errorFor = (field: ValidationFailure['field']) =>
    errors.find((e) => e.field === field)?.message;

  const handleSubmit = () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length === 0) onSubmit(form);
  };

  const contrarianOptions = allHypotheses.filter(
    (h) => h.id !== excludeIdFromContrarianOptions,
  );

  return (
    <div className="space-y-3 text-sm">
      <Field label="Statement" error={errorFor('statement')}>
        <textarea
          value={form.statement}
          onChange={(e) => setForm({ ...form, statement: e.target.value })}
          rows={3}
          className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
          placeholder="Hypothesis statement..."
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Core Problem" error={errorFor('core_problem_id')}>
          <select
            value={form.core_problem_id}
            onChange={(e) => setForm({ ...form, core_problem_id: e.target.value })}
            className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            {coreProblems.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.id.toUpperCase()} — {cp.statement.slice(0, 60)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Investigation Priority">
          <select
            value={form.investigation_priority}
            onChange={(e) =>
              setForm({
                ...form,
                investigation_priority: e.target.value as InvestigationPriority,
              })
            }
            className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            {VALID_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Dimension" error={errorFor('dimension')}>
          <select
            value={form.dimension}
            onChange={(e) =>
              setForm({ ...form, dimension: e.target.value as StructuralDimension })
            }
            className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            {STRUCTURAL_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Force Assignment" error={errorFor('force_assignment')}>
          <select
            value={form.force_assignment}
            onChange={(e) =>
              setForm({ ...form, force_assignment: e.target.value as StrategicForce })
            }
            className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            {VALID_FORCES.map((f) => (
              <option key={f} value={f}>
                {FORCE_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="MECE Cluster ID" error={errorFor('mece_cluster_id')}>
        <input
          value={form.mece_cluster_id}
          onChange={(e) => setForm({ ...form, mece_cluster_id: e.target.value })}
          placeholder="e.g. cluster_pricing_misalignment"
          className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
        />
      </Field>

      <Field
        label={`Expected Signals (≥ ${MIN_EXPECTED_SIGNALS})`}
        error={errorFor('expected_signals')}
      >
        <ChipInput
          values={form.expected_signals}
          onChange={(next) => setForm({ ...form, expected_signals: next })}
          placeholder="Add signal tag and press Enter"
          ariaLabel="expected signals"
        />
      </Field>

      <Field label="Expected Counter Signals (optional)">
        <ChipInput
          values={form.expected_counter_signals}
          onChange={(next) => setForm({ ...form, expected_counter_signals: next })}
          placeholder="Add counter signal and press Enter"
          ariaLabel="expected counter signals"
        />
      </Field>

      <Field label="Contrarian Pair">
        <select
          value={form.contrarian_pair_id ?? ''}
          onChange={(e) =>
            setForm({ ...form, contrarian_pair_id: e.target.value || null })
          }
          className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="">— No contrarian pair —</option>
          {contrarianOptions.map((h) => (
            <option key={h.id} value={h.id}>
              {h.id.toUpperCase()} — {h.statement.slice(0, 60)}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={
          form.contrarian_pair_id === null
            ? 'Rationale (must include "no meaningful opposite" or "no useful contrarian")'
            : 'Rationale'
        }
        error={errorFor('rationale')}
      >
        <textarea
          value={form.rationale}
          onChange={(e) => setForm({ ...form, rationale: e.target.value })}
          rows={3}
          className="w-full bg-black border border-[#333] focus:border-indigo-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
          placeholder="Why this hypothesis matters..."
        />
      </Field>

      {errors.length > 0 && (
        <ul className="text-xs text-red-300 list-disc pl-5 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-[#333] hover:border-[#444] rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-sm font-medium bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/50 text-indigo-100 rounded-lg transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1">
        {label}
      </span>
      {children}
      {error && <span className="block mt-1 text-[11px] text-red-300">{error}</span>}
    </label>
  );
}

interface HypothesisFormModalProps {
  title: string;
  submitLabel: string;
  coreProblems: CoreProblem[];
  allHypotheses: Hypothesis[];
  initial: HypothesisFormState;
  excludeIdFromContrarianOptions?: string;
  onCancel: () => void;
  onSubmit: (form: HypothesisFormState) => void;
}

function HypothesisFormModal({
  title,
  submitLabel,
  coreProblems,
  allHypotheses,
  initial,
  excludeIdFromContrarianOptions,
  onCancel,
  onSubmit,
}: HypothesisFormModalProps) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-[#0a0a0a] border border-indigo-500/30 rounded-xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-base font-semibold text-indigo-100 mb-3">{title}</h3>
        <HypothesisForm
          initial={initial}
          coreProblems={coreProblems}
          allHypotheses={allHypotheses}
          excludeIdFromContrarianOptions={excludeIdFromContrarianOptions}
          submitLabel={submitLabel}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

interface HypothesisEditorProps {
  hypothesis: Hypothesis;
  coreProblemId: string;
  coreProblems: CoreProblem[];
  allHypotheses: Hypothesis[];
  onCancel: () => void;
  onSubmit: (form: HypothesisFormState) => void;
}

function HypothesisEditor({
  hypothesis,
  coreProblemId,
  coreProblems,
  allHypotheses,
  onCancel,
  onSubmit,
}: HypothesisEditorProps) {
  return (
    <div
      id={`hyp-card-${hypothesis.id}`}
      className="rounded-xl border border-indigo-500/50 bg-[#0d0d0d] p-4 ring-1 ring-indigo-500/30"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-300">
          Editing {hypothesis.id.toUpperCase()}
        </span>
      </div>
      <HypothesisForm
        initial={formStateFromHypothesis(hypothesis, coreProblemId)}
        coreProblems={coreProblems}
        allHypotheses={allHypotheses}
        excludeIdFromContrarianOptions={hypothesis.id}
        submitLabel="Save"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Database, Search, MessageSquare, ShoppingCart,
  Newspaper, Filter, Sparkles, BrainCircuit, FlaskConical,
  Target, ShieldCheck, Eye, Zap, Radio, TrendingUp
} from 'lucide-react';

interface EcosystemMapMethodologyProps {
  intent: string;
  brief?: string;
  pillarExtractions?: Record<string, any> | null;
  template?: string | null;
  onMapComplete: (graphNodes: string[]) => void;
  onBack: () => void;
  hideSidebar?: boolean;
  onGraphMetrics?: (metrics: any) => void;
  strategicOverlayEnabled?: boolean;
}

const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity":          "#f59e0b",
  "Choice Architecture":     "#8b5cf6",
  "Value Elasticity":        "#14b8a6",
  "Reinforcement Stability": "#f43f5e",
  "Competitive Energy":      "#0ea5e9",
};

const PLATFORM_ICONS: Record<string, any> = {
  "Reddit": MessageSquare,
  "YouTube": Radio,
  "E-commerce Reviews": ShoppingCart,
  "Google Trends & PAA": Search,
  "News & Industry": Newspaper,
};

const PLATFORM_COLORS: Record<string, string> = {
  "Reddit": "#FF4500",
  "YouTube": "#FF0000",
  "E-commerce Reviews": "#f59e0b",
  "Google Trends & PAA": "#4285F4",
  "News & Industry": "#10b981",
};

// Animated counter hook
function useAnimatedCounter(target: number, duration: number = 1200, delay: number = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setValue(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, duration, delay]);
  return value;
}

// Phase connector line
function PhaseConnector({ delay }: { delay: number }) {
  return (
    <div className="flex justify-center py-1">
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 40, opacity: 1 }}
        transition={{ delay, duration: 0.4, ease: "easeOut" }}
        className="w-px bg-gradient-to-b from-[#333] to-[#555]"
      />
    </div>
  );
}

// Header metric card
function MetricCard({ label, value, suffix, color, icon: Icon, delay }: {
  label: string; value: number; suffix?: string; color: string; icon: any; delay: number;
}) {
  const animatedValue = useAnimatedCounter(value, 1400, delay);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="bg-[#111] border border-[#222] rounded-2xl p-5 flex flex-col items-center justify-center min-w-[160px] relative overflow-hidden group hover:border-[#444] transition-colors"
    >
      <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity" style={{ background: `radial-gradient(circle at center, ${color}, transparent 70%)` }} />
      <Icon size={20} className="mb-2 opacity-60" style={{ color }} />
      <div className="text-3xl font-light tracking-tight" style={{ color }}>
        ~{animatedValue.toLocaleString()}{suffix && <span className="text-lg ml-0.5">{suffix}</span>}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mt-1.5">{label}</div>
    </motion.div>
  );
}

// Platform source card with animated bar
function PlatformCard({ platform, index, totalSources }: {
  platform: any; index: number; totalSources: number;
}) {
  const Icon = PLATFORM_ICONS[platform.name] || Database;
  const color = PLATFORM_COLORS[platform.name] || "#9ca3af";
  const pct = totalSources > 0 ? (platform.estimated_sources / totalSources) * 100 : 0;
  const delay = 0.8 + index * 0.12;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#333] transition-colors group"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-200">{platform.name}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">{platform.scout_type}</div>
        </div>
        <div className="text-lg font-light" style={{ color }}>~{platform.estimated_sources}</div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: delay + 0.2, duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>

      {/* Targets */}
      <div className="flex flex-wrap gap-1.5">
        {(platform.targets || []).slice(0, 3).map((t: string, i: number) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-[#111] border border-[#222] text-gray-400 font-mono">
            {t}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// Sieve funnel visualization
function SieveFunnel({ sieve, delay }: { sieve: any; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="bg-gradient-to-b from-[#111] to-[#0a0a0a] border border-[#222] rounded-2xl p-5 relative overflow-hidden"
    >
      <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(circle at center, #f43f5e, transparent 70%)' }} />
      <div className="flex items-center gap-2 mb-3">
        <Filter size={16} className="text-rose-400" />
        <span className="text-xs font-mono text-rose-400 uppercase tracking-widest">Tri-Factor Relevance Sieve</span>
      </div>
      <div className="flex gap-3 mb-4">
        {(sieve?.filters || []).map((f: string, i: number) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.1 + i * 0.1 }}
            className="flex-1 bg-[#0a0a0a] border border-rose-900/30 rounded-lg p-2.5 text-center"
          >
            <div className="text-[11px] text-rose-300 font-medium">{f}</div>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs text-gray-400">
            <span className="text-rose-400 font-semibold">{sieve?.noise_discard_pct || 95}%</span> noise discarded
          </span>
        </div>
        <div className="text-xs text-gray-400">
          Hunt List: <span className="text-teal-400 font-semibold">~{sieve?.output_hunt_list_size || 120} URLs</span>
        </div>
      </div>
    </motion.div>
  );
}

// Inference engine cards
function InferencePhase({ phase, delay }: { phase: any; delay: number }) {
  const engineIcons = [BrainCircuit, Sparkles, FlaskConical];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/* Engine cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {(phase.engines || []).map((eng: any, i: number) => {
          const Icon = engineIcons[i] || Sparkles;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.1 + i * 0.12 }}
              className="bg-[#0a0a0a] border border-violet-900/30 rounded-xl p-4 text-center hover:border-violet-500/40 transition-colors"
            >
              <Icon size={20} className="text-violet-400 mx-auto mb-2" />
              <div className="text-xs font-medium text-violet-200 mb-1">{eng.name}</div>
              <div className="text-[10px] text-gray-500 leading-snug">{eng.description}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Signal taxonomy tags */}
      <div className="flex flex-wrap gap-2 justify-center">
        {(phase.signal_taxonomy || []).map((tag: string, i: number) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.4 + i * 0.06 }}
            className="text-[11px] px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-mono"
          >
            {tag}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

// Hypothesis verification cards
function VerificationPhase({ phase, delay }: { phase: any; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {(phase.hypotheses || []).map((hyp: any, i: number) => {
          const forceColor = FORCE_COLORS[hyp.force] || "#9ca3af";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: i % 2 === 0 ? -15 : 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + 0.1 + i * 0.12 }}
              className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 hover:border-[#444] transition-colors"
            >
              <div className="flex items-start gap-3">
                <Target size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 mb-1.5 leading-snug">{hyp.label}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-medium" style={{ backgroundColor: `${forceColor}15`, color: forceColor, border: `1px solid ${forceColor}30` }}>
                    {hyp.force}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* MSU + Ghost Brand row */}
      <div className="flex gap-3">
        {phase.ghost_brand_detection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.4 }}
            className="flex-1 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-center gap-2"
          >
            <Eye size={14} className="text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-300">Ghost Brand Detection: <span className="font-semibold">ACTIVE</span></span>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5 }}
          className="flex-1 bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 flex items-center gap-2"
        >
          <ShieldCheck size={14} className="text-rose-400 shrink-0" />
          <span className="text-[11px] text-rose-300">MSU Stop Rule: &lt; {((phase.msu_threshold || 0.02) * 100).toFixed(0)}% variance = <span className="font-semibold">HALT</span></span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Final rendering phase — force pills
function RenderingPhase({ phase, confidenceTarget, delay }: { phase: any; confidenceTarget: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="text-center"
    >
      <div className="flex flex-wrap gap-2.5 justify-center mb-5">
        {(phase.forces || []).map((force: string, i: number) => {
          const color = FORCE_COLORS[force] || "#9ca3af";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.1 + i * 0.08 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full border"
              style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-medium" style={{ color }}>{force}</span>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.6 }}
        className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/30 rounded-xl px-5 py-3"
      >
        <Zap size={16} className="text-teal-400" />
        <span className="text-sm text-teal-300">Confidence Target: <span className="font-semibold text-teal-200">{confidenceTarget}%</span></span>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ───

export default function EcosystemMapMethodology({
  intent, brief, pillarExtractions, template,
  hideSidebar = false, onGraphMetrics
}: EcosystemMapMethodologyProps) {
  const [loading, setLoading] = useState(true);
  const [methodology, setMethodology] = useState<any>(null);

  useEffect(() => {
    const fetchMethodology = async () => {
      try {
        const cacheKey = 'methodology_data';
        const cached = sessionStorage.getItem(cacheKey);

        if (cached) {
          setMethodology(JSON.parse(cached));
          setLoading(false);
        } else {
          const res = await axios.post('http://localhost:8000/api/generate-methodology', {
            research_intent: intent,
            brief_text: brief || undefined,
            pillar_extractions: pillarExtractions || undefined,
            template: template && template !== 'none' ? template : undefined,
          });
          const data = res.data.methodology;
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
          setMethodology(data);
          setLoading(false);
        }

        // Report metrics to parent
        if (onGraphMetrics) {
          onGraphMetrics({
            loading: false,
            analyzingNodes: 0,
            totalNodes: 0,
            totalEdges: 0,
            categoriesLegend: [],
            ecosystemNodeNames: [],
          });
        }
      } catch (e) {
        console.error("Failed to generate methodology", e);
        setLoading(false);
      }
    };
    fetchMethodology();
  }, [intent, brief, pillarExtractions, template, onGraphMetrics]);

  // Compute total sources from platforms
  const totalPlatformSources = useMemo(() => {
    if (!methodology?.phases?.[0]?.platforms) return 0;
    return methodology.phases[0].platforms.reduce((sum: number, p: any) => sum + (p.estimated_sources || 0), 0);
  }, [methodology]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black text-teal-400/80">
        <Activity size={48} className="animate-pulse mb-4" />
        <span className="font-mono tracking-widest text-sm">GENERATING EXECUTION BLUEPRINT...</span>
      </div>
    );
  }

  if (!methodology) return null;

  const phases = methodology.phases || [];
  const discoveryPhase = phases.find((p: any) => p.id === 'discovery');
  const extractionPhase = phases.find((p: any) => p.id === 'extraction');
  const inferencePhase = phases.find((p: any) => p.id === 'inference');
  const verificationPhase = phases.find((p: any) => p.id === 'verification');
  const renderingPhase = phases.find((p: any) => p.id === 'rendering');

  return (
    <div className="w-full h-full bg-black text-white overflow-auto relative">
      {/* Background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 z-0 pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-10 space-y-2">

        {/* Study Type Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 mb-2"
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">Execution Blueprint</span>
          <span className="text-[10px] px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 font-mono uppercase tracking-widest">
            {methodology.study_type}
          </span>
        </motion.div>

        {/* Primary Forces */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center gap-2 mb-6"
        >
          {(methodology.primary_forces || []).map((force: string, i: number) => {
            const color = FORCE_COLORS[force] || "#9ca3af";
            return (
              <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-md font-mono" style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}>
                {force}
              </span>
            );
          })}
        </motion.div>

        {/* ── Header Metrics ── */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <MetricCard label="Sources" value={methodology.estimated_sources || 120} color="#14b8a6" icon={Database} delay={0.15} />
          <MetricCard label="Signals" value={methodology.estimated_signals || 2000} color="#8b5cf6" icon={Sparkles} delay={0.25} />
          <MetricCard label="Minutes" value={methodology.estimated_timeline_minutes || 30} color="#f59e0b" icon={TrendingUp} delay={0.35} />
          <MetricCard label="Confidence" value={methodology.confidence_target || 85} suffix="%" color="#0ea5e9" icon={ShieldCheck} delay={0.45} />
        </div>

        {/* ── PHASE 1: Discovery ── */}
        {discoveryPhase && (
          <>
            <PhaseHeader phase={discoveryPhase} index={1} delay={0.55} />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              {(discoveryPhase.platforms || []).map((p: any, i: number) => (
                <PlatformCard key={i} platform={p} index={i} totalSources={totalPlatformSources} />
              ))}
            </div>
            {discoveryPhase.sieve && <SieveFunnel sieve={discoveryPhase.sieve} delay={1.4} />}
          </>
        )}

        <PhaseConnector delay={1.6} />

        {/* ── PHASE 2: Extraction ── */}
        {extractionPhase && (
          <>
            <PhaseHeader phase={extractionPhase} index={2} delay={1.7} />
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8 }}
              className="bg-[#111] border border-[#222] rounded-2xl p-5"
            >
              <div className="flex gap-3 mb-4">
                {(extractionPhase.cleaning_steps || []).map((step: string, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.9 + i * 0.1 }}
                    className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 text-center"
                  >
                    <div className="text-[11px] text-gray-300 font-medium">{step}</div>
                  </motion.div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-xs text-gray-400">
                  Output: <span className="text-violet-400 font-semibold">~{(extractionPhase.output_signals || 2000).toLocaleString()} clean signals</span>
                </span>
              </div>
            </motion.div>
          </>
        )}

        <PhaseConnector delay={2.2} />

        {/* ── PHASE 3: Inference ── */}
        {inferencePhase && (
          <>
            <PhaseHeader phase={inferencePhase} index={3} delay={2.3} />
            <InferencePhase phase={inferencePhase} delay={2.4} />
          </>
        )}

        <PhaseConnector delay={2.9} />

        {/* ── PHASE 4: Verification ── */}
        {verificationPhase && (
          <>
            <PhaseHeader phase={verificationPhase} index={4} delay={3.0} />
            <VerificationPhase phase={verificationPhase} delay={3.1} />
          </>
        )}

        <PhaseConnector delay={3.5} />

        {/* ── PHASE 5: Rendering ── */}
        {renderingPhase && (
          <>
            <PhaseHeader phase={renderingPhase} index={5} delay={3.6} />
            <RenderingPhase phase={renderingPhase} confidenceTarget={methodology.confidence_target || 85} delay={3.7} />
          </>
        )}

        {/* Bottom spacer */}
        <div className="h-16" />
      </div>
    </div>
  );
}

// Phase header with number badge, title, duration
function PhaseHeader({ phase, index, delay }: { phase: any; index: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-3 mb-3 mt-2"
    >
      <div className="w-7 h-7 rounded-full bg-[#222] border border-[#333] flex items-center justify-center text-xs font-mono text-gray-400 shrink-0">
        {index}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-200">{phase.name}</div>
        <div className="text-[10px] text-gray-500 leading-snug">{phase.description}</div>
      </div>
      <div className="text-[10px] font-mono text-gray-500 bg-[#111] border border-[#222] px-2.5 py-1 rounded-md shrink-0">
        ~{phase.duration_minutes} min
      </div>
    </motion.div>
  );
}

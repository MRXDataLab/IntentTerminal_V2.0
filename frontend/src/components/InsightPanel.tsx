"use client";
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, TrendingDown, TrendingUp, Lock } from 'lucide-react';
import axios from 'axios';

interface InsightPanelProps {
  node: any;
  studyContext: string;
  onClose: () => void;
  onUnlock?: (nodeId: string) => void;
  iuBalance?: number;
}

function ExhaustCard({ signal }: { signal: any }) {
  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-blue-400">{signal.source_platform}</span>
        <span className="text-[10px] text-gray-600">{signal.timestamp?.slice(0, 10)}</span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed italic">"{signal.content}"</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {(signal.signal_tags || []).map((tag: string, i: number) => (
            <span key={i} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-mono rounded-full border border-purple-500/20">[{tag}]</span>
          ))}
        </div>
        <div className="flex gap-2 text-[10px] text-gray-500">
          {signal.engagement?.upvotes > 0 && <span>▲ {signal.engagement.upvotes}</span>}
          {signal.engagement?.replies > 0 && <span>💬 {signal.engagement.replies}</span>}
        </div>
      </div>
    </div>
  );
}

export default function InsightPanel({ node, studyContext, onClose, onUnlock, iuBalance }: InsightPanelProps) {
  const [insight, setInsight] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  const isEmergent = node?.ui_state === 'emergent';
  const isLocked = isEmergent && node?.live_status === null;

  const fetchInsight = async () => {
    if (insight) return;
    setLoadingInsight(true);
    try {
      const res = await axios.post('http://localhost:8000/api/truth-map/node/insight', {
        node_id: node.id, node_label: node.label, node_description: node.description, study_context: studyContext
      });
      setInsight(res.data.insight);
    } catch (e) { console.error(e); }
    finally { setLoadingInsight(false); }
  };

  const fetchSignals = async () => {
    if (signals.length > 0) { setShowSignals(true); return; }
    setLoadingSignals(true);
    try {
      const res = await axios.post('http://localhost:8000/api/truth-map/node/signals', {
        node_id: node.id, node_label: node.label, node_description: node.description, study_context: studyContext
      });
      setSignals(res.data.evidence?.signals || []);
      setShowSignals(true);
    } catch (e) { console.error(e); }
    finally { setLoadingSignals(false); }
  };

  // Auto-fetch insight on mount (proper useEffect instead of render-time side effect)
  useEffect(() => {
    if (node) { fetchInsight(); }
  }, [node?.id]);

  const severityColor: Record<string, string> = { critical: '#ef4444', high: '#f97316', moderate: '#f59e0b', low: '#6b7280' };

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 right-0 w-[420px] h-full bg-[#0d0d0d] border-l border-[#222] z-50 flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="p-5 border-b border-[#222] flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isEmergent && <Lock size={12} className="text-purple-400" />}
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{node?.type?.replace('_', ' ')}</span>
          </div>
          <h3 className="text-base font-medium text-white truncate">{node?.label}</h3>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{node?.description}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-[#222] rounded-lg text-gray-500 hover:text-white transition-colors shrink-0 ml-2"><X size={16} /></button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loadingInsight ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <div className="w-2 h-2 rounded-full bg-teal-500/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-teal-500/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-teal-500/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : insight ? (
          <>
            {/* Insight Card */}
            <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: severityColor[insight.severity] || '#6b7280' }}>
                  {insight.severity} Impact
                </span>
                <div className="flex items-center gap-1 text-xs">
                  {(insight.force_impact_pct || 0) < 0 ? <TrendingDown size={12} className="text-red-400" /> : <TrendingUp size={12} className="text-emerald-400" />}
                  <span className={(insight.force_impact_pct || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}>{insight.force_impact_pct > 0 ? '+' : ''}{insight.force_impact_pct}%</span>
                </div>
              </div>
              <h4 className="text-sm font-medium text-white">{insight.headline}</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{insight.insight_text}</p>
              {insight.force_impact_label && (
                <div className="pt-2 border-t border-[#1a1a1a]">
                  <span className="text-[10px] font-mono text-gray-500">Force: </span>
                  <span className="text-[10px] font-mono text-teal-400">{insight.force_impact_label}</span>
                </div>
              )}
              {insight.correlated_nodes?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {insight.correlated_nodes.map((cn: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">{cn}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Tap 2: View Core Signals */}
            {!showSignals && !isLocked && (
              <button onClick={fetchSignals} disabled={loadingSignals}
                className="w-full py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#333] rounded-xl text-sm text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2">
                {loadingSignals ? (
                  <><div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" /> Fetching signals...</>
                ) : (
                  <><ChevronRight size={14} /> View Core Signals</>
                )}
              </button>
            )}

            {/* IU Unlock for emergent nodes */}
            {isLocked && onUnlock && (
              <button onClick={() => onUnlock(node.id)}
                disabled={!iuBalance || iuBalance < (node.unlock_cost_iu || 50)}
                className="w-full py-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 hover:border-purple-500/50 rounded-xl text-sm text-purple-400 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <Lock size={14} />
                Investigate Deeper: Allocate {node.unlock_cost_iu || 50} IUs
              </button>
            )}

            {/* Signal Evidence Cards */}
            <AnimatePresence>
              {showSignals && signals.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                  <h4 className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Core Signal Evidence</h4>
                  {signals.map((sig, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                      <ExhaustCard signal={sig} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}

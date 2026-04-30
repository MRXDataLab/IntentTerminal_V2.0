"use client";

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Radio, Globe, Zap, Shield, ChevronRight,
  ExternalLink, ArrowLeft, CheckCircle2, AlertTriangle,
  MessageSquare, Video, Newspaper, ShoppingCart, Activity
} from 'lucide-react';

interface DiscoveryTerminalProps {
  manifest: Record<string, any>;
  intent: string;
  graphNodes: string[];
  onComplete: (results: any[]) => void;
  onBack: () => void;
}

interface Engine {
  id: string;
  name: string;
  description: string;
  available: boolean;
  cost: string;
  rate: string;
  features: string[];
}

const ENGINE_ICONS: Record<string, any> = {
  google_direct: Globe,
  brave: Shield,
  serpapi: Zap,
};

const ENGINE_COLORS: Record<string, string> = {
  google_direct: "#4285F4",
  brave: "#FB542B",
  serpapi: "#10b981",
};

const VERTICAL_ICONS: Record<string, any> = {
  web: Search,
  forums: MessageSquare,
  videos: Video,
  news: Newspaper,
  shopping: ShoppingCart,
  paa: ChevronRight,
};

export default function DiscoveryTerminal({ manifest, intent, graphNodes, onComplete, onBack }: DiscoveryTerminalProps) {
  const [phase, setPhase] = useState<'select_engine' | 'scanning' | 'complete'>('select_engine');
  const [engines, setEngines] = useState<Engine[]>([]);
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>({});
  const [results, setResults] = useState<any[]>([]);
  const [paaTree, setPaaTree] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [liveFeed, setLiveFeed] = useState<string[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch available engines on mount
  useEffect(() => {
    axios.get('http://localhost:8000/api/discovery/engines')
      .then(res => setEngines(res.data.engines))
      .catch(() => {});
  }, []);

  // Poll job status
  useEffect(() => {
    if (!jobId || phase !== 'scanning') return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://localhost:8000/api/discovery/status/${jobId}`);
        setProgress(res.data.progress);

        // Add to live feed
        const msg = res.data.progress?.message;
        if (msg) {
          setLiveFeed(prev => {
            const updated = [...prev, msg];
            return updated.slice(-30); // Keep last 30 messages
          });
        }

        if (res.data.status === 'complete') {
          clearInterval(interval);
          // Fetch full results
          const resultsRes = await axios.get(`http://localhost:8000/api/discovery/results/${jobId}`);
          setResults(resultsRes.data.results);
          setPaaTree(resultsRes.data.paa_tree);
          setStats(resultsRes.data.stats);
          setPhase('complete');
        } else if (res.data.status === 'error') {
          clearInterval(interval);
          setLiveFeed(prev => [...prev, `❌ Error: ${res.data.progress?.message}`]);
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, phase]);

  // Auto-scroll live feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [liveFeed]);

  const startDiscovery = async (engineId: string) => {
    setSelectedEngine(engineId);
    setPhase('scanning');
    setLiveFeed([`🚀 Starting discovery with ${engineId}...`]);

    try {
      const res = await axios.post('http://localhost:8000/api/discovery/start', {
        engine: engineId,
        manifest,
        intent,
        graph_nodes: graphNodes,
        paa_depth: 2,
      });
      setJobId(res.data.job_id);
      setLiveFeed(prev => [...prev, `📡 Job ${res.data.job_id} queued. Deploying scouts...`]);
    } catch (e: any) {
      setLiveFeed(prev => [...prev, `❌ Failed to start: ${e.message}`]);
    }
  };

  // ── Phase 1: Engine Selection ──
  if (phase === 'select_engine') {
    return (
      <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center shrink-0">
              <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-8 w-auto object-contain mr-2 bg-transparent" onError={(e) => { e.currentTarget.style.display='none' }} />
            </div>
            <div className="w-px h-4 bg-[#333]"></div>
            <h1 className="text-sm font-medium tracking-wide text-gray-300">Discovery Terminal</h1>
          </div>
        </div>

        {/* Engine Selection */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="max-w-3xl w-full">
            <div className="text-center mb-8">
              <Radio size={32} className="text-amber-500 mx-auto mb-3" />
              <h2 className="text-2xl font-light tracking-wide text-white mb-2">Select Search Engine</h2>
              <p className="text-sm text-gray-500">Choose how Outllyr will scout the internet for your study&apos;s signal sources.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {engines.map((engine) => {
                const Icon = ENGINE_ICONS[engine.id] || Search;
                const color = ENGINE_COLORS[engine.id] || "#9ca3af";
                return (
                  <motion.button
                    key={engine.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => engine.available && startDiscovery(engine.id)}
                    disabled={!engine.available}
                    className={`text-left p-5 rounded-2xl border transition-all ${
                      engine.available
                        ? 'bg-[#111] border-[#222] hover:border-[#444] hover:bg-[#151515] cursor-pointer'
                        : 'bg-[#0a0a0a] border-[#1a1a1a] opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                        <Icon size={20} style={{ color }} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{engine.name}</div>
                        <div className="text-[10px] font-mono text-gray-500">{engine.cost}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed mb-3">{engine.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {engine.features.map((f, i) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-[#1a1a1a] text-gray-500 font-mono">{f}</span>
                      ))}
                    </div>
                    {!engine.available && (
                      <div className="mt-3 text-[10px] text-amber-500 flex items-center gap-1">
                        <AlertTriangle size={10} /> API key not configured
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 2: Live Scanning Dashboard ──
  if (phase === 'scanning') {
    const engineColor = ENGINE_COLORS[selectedEngine || ''] || '#9ca3af';
    const verticalCounts = progress?.stats?.verticals || stats?.verticals || {};

    return (
      <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-8 w-auto object-contain mr-2 bg-transparent" onError={(e) => { e.currentTarget.style.display='none' }} />
            </div>
            <div className="w-px h-4 bg-[#333]"></div>
            <h1 className="text-sm font-medium tracking-wide text-gray-300">Discovery Terminal</h1>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: engineColor }}></div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">{selectedEngine}</span>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Stats + Verticals */}
          <div className="w-[340px] shrink-0 border-r border-[#222] bg-[#0a0a0a] p-5 overflow-y-auto">
            {/* Top metrics */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
                <div className="text-2xl font-light text-teal-400">{progress?.stats?.total_unique || stats?.total_unique || 0}</div>
                <div className="text-[9px] text-gray-500 font-mono uppercase mt-1">URLs Found</div>
              </div>
              <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
                <div className="text-2xl font-light text-amber-400">{progress?.stats?.seed_queries || stats?.seed_queries || 0}</div>
                <div className="text-[9px] text-gray-500 font-mono uppercase mt-1">Seed Queries</div>
              </div>
              <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
                <div className="text-2xl font-light text-violet-400">{progress?.stats?.paa_questions_found || stats?.paa_questions_found || 0}</div>
                <div className="text-[9px] text-gray-500 font-mono uppercase mt-1">PAA Questions</div>
              </div>
              <div className="bg-[#111] border border-[#222] rounded-xl p-3 text-center">
                <div className="text-2xl font-light text-rose-400">
                  {progress?.depth || 0}/{progress?.max_depth || 2}
                </div>
                <div className="text-[9px] text-gray-500 font-mono uppercase mt-1">PAA Depth</div>
              </div>
            </div>

            {/* Vertical breakdown */}
            <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-3">Verticals</h4>
            <div className="space-y-2">
              {['web', 'forums', 'videos', 'news'].map((v) => {
                const Icon = VERTICAL_ICONS[v] || Search;
                const count = verticalCounts[v] || 0;
                return (
                  <div key={v} className="flex items-center gap-3 bg-[#111] border border-[#1a1a1a] rounded-lg p-2.5">
                    <Icon size={14} className="text-gray-500 shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 capitalize">{v}</span>
                    <span className="text-xs font-mono text-teal-400">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* PAA Tree */}
            {paaTree.length > 0 && (
              <div className="mt-6">
                <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-3">PAA Rabbit Hole</h4>
                <div className="space-y-1.5 text-[11px]">
                  {paaTree.slice(0, 10).map((paa, i) => (
                    <div key={i} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-md p-2">
                      <div className="text-gray-300">{paa.question}</div>
                      <div className="text-[9px] text-gray-600 mt-0.5">
                        Depth {paa.depth} · {paa.links_found} links · {paa.children?.length || 0} sub-questions
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Feed */}
          <div className="flex-1 flex flex-col bg-black">
            {/* Current phase indicator */}
            <div className="px-6 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
              <Activity size={14} className="text-teal-400 animate-pulse" />
              <span className="text-xs text-gray-400 font-mono">{progress?.phase || 'initializing'}</span>
              {progress?.seed_index && (
                <span className="text-[10px] text-gray-600 font-mono">
                  Query {progress.seed_index}/{progress.seed_total}
                </span>
              )}
            </div>

            {/* Scrolling live feed */}
            <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-[11px]">
              {liveFeed.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-gray-500 leading-relaxed"
                >
                  <span className="text-gray-700 mr-2">{String(i + 1).padStart(3, '0')}</span>
                  {msg}
                </motion.div>
              ))}
              {phase === 'scanning' && (
                <div className="flex items-center gap-2 text-teal-500 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                  <span>Scanning...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 3: Complete — show summary and proceed ──
  return (
    <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center shrink-0">
            <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-8 w-auto object-contain mr-2 bg-transparent" onError={(e) => { e.currentTarget.style.display='none' }} />
          </div>
          <div className="w-px h-4 bg-[#333]"></div>
          <h1 className="text-sm font-medium tracking-wide text-gray-300">Discovery Complete</h1>
          <CheckCircle2 size={14} className="text-emerald-400" />
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`http://localhost:8000/api/discovery/csv/${jobId}`}
            download
            className="flex items-center gap-2 px-4 py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-xs font-medium rounded-lg transition-colors border border-[#333]"
          >
            📥 Download CSV
          </a>
          <button
            onClick={() => {
              const content = JSON.stringify(manifest, null, 2);
              const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'Outtlyr_Link_Farming_Manifest.json';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-xs font-medium rounded-lg transition-colors border border-[#333]"
          >
            📄 Download Manifest
          </button>
          <button
            onClick={() => onComplete(results)}
            className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          >
            Proceed to Audit Dashboard →
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Summary stats */}
        <div className="w-[340px] shrink-0 border-r border-[#222] bg-[#0a0a0a] p-5 overflow-y-auto">
          <h3 className="text-sm font-medium text-white mb-4">Discovery Summary</h3>

          <div className="space-y-3 mb-6">
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-light text-teal-400">{results.length}</div>
              <div className="text-[10px] text-teal-600 font-mono uppercase mt-1">Ranked URLs</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#111] border border-[#222] rounded-lg p-3 text-center">
                <div className="text-lg font-light text-gray-300">{stats.total_raw || 0}</div>
                <div className="text-[9px] text-gray-600 font-mono">Raw Found</div>
              </div>
              <div className="bg-[#111] border border-[#222] rounded-lg p-3 text-center">
                <div className="text-lg font-light text-gray-300">{stats.total_blacklisted || 0}</div>
                <div className="text-[9px] text-gray-600 font-mono">Filtered</div>
              </div>
            </div>
          </div>

          {/* Vertical breakdown */}
          <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">By Vertical</h4>
          <div className="space-y-1.5 mb-6">
            {Object.entries(stats.verticals || {}).map(([v, count]) => (
              <div key={v} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 capitalize">{v}</span>
                <span className="text-gray-300 font-mono">{count as number}</span>
              </div>
            ))}
          </div>

          {/* PAA summary */}
          {paaTree.length > 0 && (
            <>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">PAA Questions Explored</h4>
              <div className="text-xs text-gray-400 mb-4">{stats.paa_questions_found || 0} questions across {stats.paa_max_depth || 0} depth levels</div>
            </>
          )}
        </div>

        {/* Right: Top results preview */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Top Ranked Sources</h3>
          <div className="space-y-2">
            {results.slice(0, 30).map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3 hover:border-[#333] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                    (r.relevance_score || 0) >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                    (r.relevance_score || 0) >= 60 ? 'bg-amber-500/10 text-amber-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {r.relevance_score || '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-200 mb-0.5 truncate">{r.title}</div>
                    {r.summary && <p className="text-[10px] text-gray-500 mb-1">{r.summary}</p>}
                    <div className="flex items-center gap-2">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400/60 hover:text-blue-400 truncate max-w-[300px] flex items-center gap-1">
                        <ExternalLink size={9} /> {r.url}
                      </a>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-gray-600 font-mono">{r.vertical}</span>
                    </div>
                    {r.signal_tags && r.signal_tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {r.signal_tags.map((tag: string, ti: number) => (
                          <span key={ti} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

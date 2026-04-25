"use client";

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, ArrowLeft, Zap, Lock, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import InsightPanel from './InsightPanel';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface LivingTruthMapProps {
  intent: string;
  brief?: string;
  manifest?: Record<string, any>;
  graphNodes?: string[];
  onMapApproved: (graphNodes: string[]) => void;
  onBack: () => void;
}

const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity": "#f59e0b",
  "Choice Architecture": "#8b5cf6",
  "Value Elasticity": "#14b8a6",
  "Reinforcement Stability": "#f43f5e",
  "Competitive Energy": "#0ea5e9",
};

const UI_STATE_STYLES: Record<string, { fill: string; border: string; borderDash?: number[] }> = {
  core: { fill: '#1e3a5f', border: '#3b82f6' },
  primary: { fill: '#ffffff', border: '#3b82f6' },
  emergent: { fill: 'transparent', border: '#a855f7', borderDash: [4, 4] },
  source_terrain: { fill: '#374151', border: '#6b7280' },
};

export default function LivingTruthMap({ intent, brief, manifest, graphNodes, onMapApproved, onBack }: LivingTruthMapProps) {
  const [topology, setTopology] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [convergence, setConvergence] = useState<any>(null);
  const [iuBalance, setIuBalance] = useState(5000);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [addIuAmount, setAddIuAmount] = useState(500);
  const [showAddIu, setShowAddIu] = useState(false);
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());
  const pulseRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 600 });

  // Track container size for force graph
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setGraphDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [loading, topology]);

  // Generate topology
  useEffect(() => {
    const generate = async () => {
      try {
        const res = await axios.post('http://localhost:8000/api/truth-map/generate', {
          intent,
          brief: brief || undefined,
          manifest: manifest || undefined,
          graph_nodes: graphNodes || undefined,
        });
        const topo = res.data.topology;
        setTopology(topo);
        setIuBalance(res.data.iu_balance?.balance || 5000);

        // Stagger emergent nodes
        const allIds = new Set<string>();
        const emergentIds: string[] = [];
        (topo.nodes || []).forEach((n: any) => {
          if (n.ui_state === 'emergent') { emergentIds.push(n.id); }
          else { allIds.add(n.id); }
        });
        setVisibleNodes(new Set(allIds));

        // Stagger-reveal emergent nodes
        emergentIds.forEach((id, i) => {
          setTimeout(() => { setVisibleNodes(prev => new Set([...prev, id])); }, 3000 + i * 2000);
        });

        setLoading(false);
      } catch (e) { console.error("Failed to generate truth map", e); setLoading(false); }
    };
    generate();
  }, [intent]);

  // Convergence polling
  useEffect(() => {
    if (loading || !topology) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/truth-map/convergence');
        setConvergence(res.data);
      } catch (e) { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [loading, topology]);

  // Pulse animation
  useEffect(() => {
    const animate = () => {
      pulseRef.current = (pulseRef.current + 0.03) % (Math.PI * 2);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleUnlock = async (nodeId: string) => {
    try {
      const res = await axios.post('http://localhost:8000/api/truth-map/node/unlock', { node_id: nodeId });
      if (res.data.status === 'success') {
        setIuBalance(res.data.iu_result.balance);
        // Update node state in topology
        setTopology((prev: any) => {
          if (!prev) return prev;
          const updated = { ...prev, nodes: prev.nodes.map((n: any) => n.id === nodeId ? { ...n, live_status: 'deploying', ui_state: 'primary' } : n) };
          return updated;
        });
      }
    } catch (e) { console.error("Unlock failed", e); }
  };

  const handleAddIu = async () => {
    try {
      const res = await axios.post('http://localhost:8000/api/truth-map/iu-add', { amount: addIuAmount });
      if (res.data.success) { setIuBalance(res.data.balance); setShowAddIu(false); }
    } catch (e) { console.error(e); }
  };

  // Filter graph data to only visible nodes
  const filteredGraphData = topology ? {
    nodes: (topology.nodes || []).filter((n: any) => visibleNodes.has(n.id)),
    links: (topology.links || topology.edges || []).filter((e: any) => visibleNodes.has(e.source?.id || e.source) && visibleNodes.has(e.target?.id || e.target)),
  } : { nodes: [], links: [] };

  const getNodeColor = (node: any) => {
    if (node.force_impact && FORCE_COLORS[node.force_impact]) return FORCE_COLORS[node.force_impact];
    const style = UI_STATE_STYLES[node.ui_state] || UI_STATE_STYLES.primary;
    return style.border;
  };

  const nodeStates = convergence?.node_states || {};

  const convergencePct = convergence?.convergence_pct || 0;
  const tooltipMsg = convergence?.active_tooltip || "Initializing topology...";

  const allNodeNames = (topology?.nodes || []).filter((n: any) => n.type !== 'root').map((n: any) => n.label || n.id);

  return (
    <div className="flex w-full h-screen bg-black text-white overflow-hidden relative">
      {/* Sidebar */}
      <div className="w-80 min-w-[20rem] h-full border-r border-[#333] bg-[#0a0a0a] z-10 flex flex-col pt-5 pb-5 shadow-2xl overflow-y-auto shrink-0">
        <div className="px-5 mb-5 flex items-start gap-3">
          <button onClick={onBack} className="mt-1 shrink-0 p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
            <ArrowLeft size={16} />
          </button>
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center">
              <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-12 w-auto object-contain shrink-0 bg-transparent" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <Network className="text-blue-500" size={16} />
              <h1 className="text-base font-medium tracking-wide">Living Truth Map</h1>
            </div>
          </div>
        </div>

        <div className="px-5 flex-1 space-y-4">
          {/* Research Intent */}
          <div>
            <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-1.5">Research Intent</h4>
            <div className="bg-[#111] p-2.5 rounded-lg border border-[#222]">
              <p className="text-[11px] text-gray-300 italic leading-relaxed break-words line-clamp-3">&quot;{intent}&quot;</p>
            </div>
          </div>

          {/* Convergence Bar */}
          <div className="bg-[#111] border border-[#222] rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Insight Convergence</span>
              <span className="text-xs font-mono text-teal-400">{convergencePct}%</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`h-2 flex-1 rounded-sm transition-all duration-500 ${i < Math.ceil(convergencePct / 10) ? 'bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.4)]' : 'bg-[#222]'}`} />
              ))}
            </div>
            <p className="text-[9px] text-gray-500 italic font-mono truncate">{tooltipMsg}</p>
          </div>

          {/* IU Balance */}
          <div className="bg-[#111] border border-[#222] rounded-lg p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Investigation Units</span>
              <button onClick={() => setShowAddIu(!showAddIu)} className="p-0.5 hover:bg-[#222] rounded text-gray-500 hover:text-teal-400 transition-colors">
                <Plus size={11} />
              </button>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-light text-white font-mono">{iuBalance.toLocaleString()}</span>
              <span className="text-[10px] text-gray-500">IUs remaining</span>
            </div>
            <div className="w-full h-1 bg-[#222] rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${Math.min((iuBalance / 5000) * 100, 100)}%` }} />
            </div>
            <AnimatePresence>
              {showAddIu && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 pt-2 border-t border-[#1a1a1a] flex gap-2">
                  <input type="number" value={addIuAmount} onChange={(e) => setAddIuAmount(Number(e.target.value))} className="flex-1 bg-[#0a0a0a] border border-[#222] rounded-lg px-2 py-1 text-xs text-white font-mono outline-none focus:border-teal-500/50" />
                  <button onClick={handleAddIu} className="px-2.5 py-1 bg-teal-500/20 text-teal-400 text-xs rounded-lg border border-teal-500/30 hover:bg-teal-500/30 transition-colors">Add</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111] border border-[#222] rounded-lg p-2.5">
              <span className="text-[9px] text-gray-500 block mb-0.5">Nodes</span>
              <span className="text-base font-mono text-white">{filteredGraphData.nodes.length}</span>
            </div>
            <div className="bg-[#111] border border-[#222] rounded-lg p-2.5">
              <span className="text-[9px] text-gray-500 block mb-0.5">Edges</span>
              <span className="text-base font-mono text-white">{filteredGraphData.links.length}</span>
            </div>
          </div>

          {/* Legend */}
          <div>
            <h4 className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mb-1.5">Node Types</h4>
            <div className="space-y-1">
              {[
                { label: 'Core Problem', color: '#3b82f6', icon: '●' },
                { label: 'Explicit Hypothesis', color: '#ffffff', icon: '●' },
                { label: 'AI Suggestion (Locked)', color: '#a855f7', icon: '◌' },
                { label: 'Source Terrain', color: '#6b7280', icon: '▬' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: item.color }}>{item.icon}</span>
                  <span className="text-[10px] text-gray-400">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Approve Button */}
          {!loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <button onClick={() => onMapApproved(allNodeNames)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                <Zap size={16} />
                Approve &amp; Proceed to Discovery
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Graph Canvas */}
      <div ref={containerRef} className="flex-1 h-full relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 z-0" />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-teal-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full border-2 border-teal-500/40 animate-pulse" />
              <div className="absolute inset-4 rounded-full bg-teal-500/10 flex items-center justify-center">
                <Network size={24} className="text-teal-400" />
              </div>
            </div>
            <span className="font-mono tracking-widest text-teal-400/80 text-sm">INITIALIZING TRUTH MAP...</span>
          </div>
        ) : topology ? (
          <div className="absolute inset-0 cursor-move z-10">
            <ForceGraph2D
              ref={graphRef}
              width={graphDimensions.width}
              height={graphDimensions.height}
              graphData={filteredGraphData}
              nodeColor={getNodeColor}
              nodeRelSize={6}
              linkWidth={(link: any) => {
                const w = link.weight || 1;
                const ns = nodeStates[link.target?.id || link.target];
                const boost = ns?.state === 'ingesting' || ns?.state === 'converging' ? 1.5 : 1;
                return w * boost;
              }}
              linkColor={(link: any) => link.dashed ? '#7c3aed44' : '#334155'}
              linkLineDash={(link: any) => link.dashed ? [4, 4] : null}
              backgroundColor="#00000000"
              cooldownTicks={100}
              onNodeClick={(node: any) => { if (node.type !== 'root') setSelectedNode(node); }}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const style = UI_STATE_STYLES[node.ui_state] || UI_STATE_STYLES.primary;
                const ns = nodeStates[node.id];
                const isIngesting = ns?.state === 'ingesting' || ns?.state === 'deploying';
                const pulse = Math.sin(pulseRef.current * 2 + (node.x || 0) * 0.01) * 0.5 + 0.5;
                const label = node.label || node.id;
                const fontSize = Math.max(12 / globalScale, 3.5);
                ctx.font = `${fontSize}px Inter, sans-serif`;
                const textWidth = ctx.measureText(label).width;

                if (node.ui_state === 'source_terrain') {
                  // Pill shape
                  const pw = textWidth + fontSize * 1.2;
                  const ph = fontSize * 1.4;
                  ctx.fillStyle = style.fill;
                  ctx.beginPath();
                  ctx.roundRect(node.x - pw / 2, node.y - ph / 2, pw, ph, ph / 2);
                  ctx.fill();
                  ctx.strokeStyle = style.border;
                  ctx.lineWidth = 1 / globalScale;
                  ctx.stroke();
                  ctx.fillStyle = '#d1d5db';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, node.x, node.y);
                } else if (node.ui_state === 'core') {
                  // Core: large circle with pulsing aura
                  const r = 18 / globalScale;
                  // Aura
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, r + 6 / globalScale, 0, 2 * Math.PI);
                  ctx.fillStyle = `rgba(59, 130, 246, ${0.08 + pulse * 0.08})`;
                  ctx.fill();
                  // Main circle
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                  ctx.fillStyle = style.fill;
                  ctx.fill();
                  ctx.strokeStyle = style.border;
                  ctx.lineWidth = 2 / globalScale;
                  ctx.stroke();
                  ctx.fillStyle = '#ffffff';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, node.x, node.y);
                } else {
                  // Primary / Emergent: rounded rect
                  const bw = textWidth + fontSize * 1;
                  const bh = fontSize + fontSize * 0.8;
                  ctx.fillStyle = node.ui_state === 'emergent' ? 'rgba(10,10,10,0.9)' : 'rgba(10,10,10,0.95)';
                  ctx.beginPath();
                  ctx.roundRect(node.x - bw / 2, node.y - bh / 2, bw, bh, 4);
                  ctx.fill();

                  if (style.borderDash) ctx.setLineDash(style.borderDash.map(d => d / globalScale));
                  ctx.strokeStyle = node.force_impact ? (FORCE_COLORS[node.force_impact] || style.border) : style.border;
                  ctx.lineWidth = 1.5 / globalScale;
                  ctx.stroke();
                  if (style.borderDash) ctx.setLineDash([]);

                  // Ingesting pulse glow
                  if (isIngesting) {
                    ctx.beginPath();
                    ctx.roundRect(node.x - bw / 2 - 2 / globalScale, node.y - bh / 2 - 2 / globalScale, bw + 4 / globalScale, bh + 4 / globalScale, 6);
                    ctx.strokeStyle = `rgba(20, 184, 166, ${0.2 + pulse * 0.3})`;
                    ctx.lineWidth = 1.5 / globalScale;
                    ctx.stroke();
                  }

                  // Lock icon for emergent
                  if (node.ui_state === 'emergent' && (!ns || ns.state === 'pending')) {
                    ctx.fillStyle = '#a855f7';
                    ctx.font = `${fontSize * 0.7}px sans-serif`;
                    ctx.fillText('🔒', node.x + bw / 2 - fontSize * 0.5, node.y - bh / 2 + fontSize * 0.3);
                    ctx.font = `${fontSize}px Inter, sans-serif`;
                  }

                  const nodeColor = node.force_impact ? (FORCE_COLORS[node.force_impact] || style.border) : (node.ui_state === 'emergent' ? '#c084fc' : '#e5e7eb');
                  ctx.fillStyle = nodeColor;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, node.x, node.y);
                }

                node.__bckgDimensions = [textWidth + fontSize, fontSize + fontSize * 0.8];
              }}
              nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                ctx.fillStyle = color;
                const d = node.__bckgDimensions;
                if (d) ctx.fillRect(node.x - d[0] / 2, node.y - d[1] / 2, d[0], d[1]);
              }}
            />
          </div>
        ) : null}

        {/* Insight Panel Overlay */}
        <AnimatePresence>
          {selectedNode && (
            <InsightPanel
              node={selectedNode}
              studyContext={intent}
              onClose={() => setSelectedNode(null)}
              onUnlock={handleUnlock}
              iuBalance={iuBalance}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

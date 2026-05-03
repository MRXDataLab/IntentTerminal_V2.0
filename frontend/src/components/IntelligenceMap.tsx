"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Download, ArrowLeft, X, Zap, Shield,
  ChevronRight, Target, Eye, BrainCircuit
} from 'lucide-react';
import dynamic from 'next/dynamic';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

interface IntelligenceMapProps {
  intent: string;
  brief?: string;
  manifest?: Record<string, any>;
  graphNodes: string[];
  onBack: () => void;
}

const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity": "#f59e0b",
  "Choice Architecture Pressure": "#8b5cf6",
  "Value Elasticity Field": "#14b8a6",
  "Reinforcement Stability": "#f43f5e",
  "Competitive Energy Field": "#0ea5e9",
};

const NODE_CONFIG: Record<string, { color: string; size: number; emissive: string }> = {
  root:                  { color: '#6d28d9', size: 10, emissive: '#a78bfa' },
  explicit_hypothesis:   { color: '#0d9488', size: 7,  emissive: '#5eead4' },
  suggested_hypothesis:  { color: '#f59e0b', size: 7,  emissive: '#fbbf24' },
  insight_branch:        { color: '#3b82f6', size: 4,  emissive: '#60a5fa' },
  signal_cluster:        { color: '#4b5563', size: 2,  emissive: '#6b7280' },
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#10b981',
  inconclusive: '#f59e0b',
  debunked: '#ef4444',
  pending: '#6b7280',
};

function getDescendantIds(nodeId: string, links: any[]): Set<string> {
  const ids = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const link of links) {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      if (srcId === current && !ids.has(tgtId)) {
        ids.add(tgtId);
        queue.push(tgtId);
      }
    }
  }
  return ids;
}

function createLabel(text: string, color: string, size: number): any {
  if (typeof document === 'undefined') return null;
  const THREE = require('three');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${size * 10}px Inter, system-ui, sans-serif`;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  canvas.width = w + 20;
  canvas.height = size * 14;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width / 40, canvas.height / 40, 1);
  return sprite;
}

export default function IntelligenceMap({ intent, brief, manifest, graphNodes, onBack }: IntelligenceMapProps) {
  const [loading, setLoading] = useState(true);
  const [topology, setTopology] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [selectedHyp, setSelectedHyp] = useState<any>(null);
  const [insight, setInsight] = useState<any>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [showStrategicOverlay, setShowStrategicOverlay] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [convergence, setConvergence] = useState<any>({ stage: 0, pct: 0, label: 'Not Started' });
  const [intelBalance, setIntelBalance] = useState<any>({ balance: 5000, starting_balance: 5000 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);

  const focusedNodeIds = useMemo(() => {
    if (!focusedId || !topology) return null;
    const rootNode = topology.nodes.find((n: any) => n.type === 'root');
    const desc = getDescendantIds(focusedId, topology.links);
    if (rootNode) desc.add(rootNode.id);
    return desc;
  }, [focusedId, topology]);

  // Resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [loading, topology]);

  // Fetch topology
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.post('http://localhost:8000/api/intelligence/generate', {
          intent, brief: brief || undefined, manifest: manifest || undefined, graph_nodes: graphNodes,
        });
        setTopology(res.data.topology);
        setIntelBalance(res.data.intel_balance || { balance: 5000, starting_balance: 5000 });
        setLoading(false);
        setTimeout(() => { if (fgRef.current) fgRef.current.zoomToFit(1000, 150); }, 2000);
      } catch (e) {
        console.error("Failed to generate intelligence map", e);
        setLoading(false);
      }
    };
    fetch();
  }, [intent, brief, manifest, graphNodes]);

  // Fetch convergence
  useEffect(() => {
    axios.get('http://localhost:8000/api/intelligence/convergence').then(r => setConvergence(r.data)).catch(() => {});
  }, []);

  const setConvergenceStage = async (stage: number) => {
    const res = await axios.post('http://localhost:8000/api/intelligence/convergence/set', { stage });
    setConvergence(res.data);
  };

  const fetchInsight = async (node: any) => {
    setSelectedHyp(node);
    setInsight(null);
    setInsightLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/intelligence/insight', {
        hypothesis_id: node.id, hypothesis_label: node.label, hypothesis_description: node.description, study_context: intent,
      });
      setInsight(res.data.insight);
    } catch (e) { console.error(e); }
    setInsightLoading(false);
  };

  const handleDoubleDown = async (hypId: string, cost: number) => {
    try {
      const res = await axios.post('http://localhost:8000/api/intelligence/doubledown', { hypothesis_id: hypId, intel_cost: cost });
      if (res.data.deeper_insight) setInsight(res.data.deeper_insight);
      setIntelBalance({ ...intelBalance, balance: res.data.intel_result.balance });
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Double down failed');
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    if (!node || !fgRef.current) return;
    if (node.type === 'root') { setFocusedId(null); setSelectedHyp(null); fgRef.current.zoomToFit(800, 150); return; }
    if (node.type === 'explicit_hypothesis' || node.type === 'suggested_hypothesis') {
      setFocusedId(focusedId === node.id ? null : node.id);
      if (focusedId !== node.id) {
        fetchInsight(node);
        const d = 200, r = 1 + d / Math.max(Math.hypot(node.x, node.y, node.z || 0), 1);
        fgRef.current.cameraPosition({ x: node.x * r, y: node.y * r, z: (node.z || 0) * r }, node, 1000);
      } else { setSelectedHyp(null); fgRef.current.zoomToFit(800, 150); }
      return;
    }
    // Click child → focus parent hypothesis
    const parentEdge = topology?.links?.find((l: any) => {
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return tgtId === node.id;
    });
    if (parentEdge) {
      const srcId = typeof parentEdge.source === 'object' ? parentEdge.source.id : parentEdge.source;
      const parentNode = topology?.nodes?.find((n: any) => n.id === srcId);
      if (parentNode && (parentNode.type === 'explicit_hypothesis' || parentNode.type === 'suggested_hypothesis')) {
        setFocusedId(parentNode.id);
        fetchInsight(parentNode);
      }
    }
  }, [focusedId, topology]);

  // 3D node objects
  const nodeThreeObject = useCallback((node: any) => {
    if (typeof window === 'undefined') return undefined;
    const THREE = require('three');
    const type = node.type || 'signal_cluster';
    const config = NODE_CONFIG[type] || NODE_CONFIG.signal_cluster;
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const forceColor = showStrategicOverlay && node.force && FORCE_COLORS[node.force];
    const baseColor = forceColor || config.color;
    const group = new THREE.Group();

    const geo = new THREE.SphereGeometry(config.size, 24, 24);
    const mat = new THREE.MeshPhongMaterial({
      color: baseColor, emissive: forceColor || config.emissive,
      emissiveIntensity: type === 'root' ? 0.5 : type.includes('hypothesis') ? 0.35 : 0.15,
      transparent: true, opacity: isFocused ? 1.0 : 0.06, shininess: 60,
    });

    // Dashed ring for suggested hypotheses
    if (type === 'suggested_hypothesis') {
      const ringGeo = new THREE.RingGeometry(config.size * 1.4, config.size * 1.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: isFocused ? 0.4 : 0.03, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(ringGeo, ringMat));
    }
    // Solid ring for explicit
    if (type === 'explicit_hypothesis') {
      const ringGeo = new THREE.RingGeometry(config.size * 1.3, config.size * 1.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#5eead4', transparent: true, opacity: isFocused ? 0.3 : 0.03, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(ringGeo, ringMat));
    }

    group.add(new THREE.Mesh(geo, mat));

    // Label
    const showLabel = isFocused && (type === 'root' || type.includes('hypothesis') || type === 'insight_branch');
    if (showLabel) {
      const labelColor = type === 'root' ? '#e2e2e8' : type === 'explicit_hypothesis' ? '#c0f0e8' : type === 'suggested_hypothesis' ? '#fde68a' : '#93c5fd';
      const labelSize = type === 'root' ? 5 : type.includes('hypothesis') ? 4 : 3;
      const sprite = createLabel(node.label || node.id, labelColor, labelSize);
      if (sprite) { sprite.position.set(0, config.size + labelSize * 0.8, 0); group.add(sprite); }
    }
    return group;
  }, [focusedNodeIds]);

  const getLinkColor = useCallback((link: any) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const isFocused = !focusedNodeIds || (focusedNodeIds.has(srcId) && focusedNodeIds.has(tgtId));
    const forceColor = showStrategicOverlay && link.force && FORCE_COLORS[link.force];
    const base = forceColor || '#6b7280';
    return isFocused ? base + '80' : base + '08';
  }, [focusedNodeIds]);

  return (
    <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <div className="w-full px-6 py-4 border-b border-[#333] flex items-center justify-between z-20 bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center shrink-0">
            <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-10 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display='none' }} />
            <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
          </div>
          <div className="w-px h-6 bg-[#333] mx-2"></div>
          <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-pulse"></div>
          <h1 className="text-lg font-medium tracking-wide text-gray-300">Outtlyr Intelligence Map</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">PHASE 6: INTELLIGENCE</span>
          <div className="w-px h-6 bg-[#333]"></div>
          <a href="http://localhost:8000/api/intelligence/export" download className="flex items-center gap-1.5 px-3 py-1.5 bg-[#222] hover:bg-[#333] text-gray-300 text-[10px] font-mono rounded-lg border border-[#333] transition-colors">
            <Download size={12} /> Export Timeline
          </a>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-row-reverse overflow-hidden">
        {/* Right Sidebar */}
        <div className="w-[500px] shrink-0 border-l border-[#222] bg-[#0a0a0a] p-5 overflow-y-auto space-y-5">

          {/* Convergence */}
          <div>
            <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Insight Convergence</h4>
            <div className="bg-[#111] border border-[#222] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-light text-white">{convergence.pct}%</span>
                <span className="text-[10px] font-mono text-gray-500">{convergence.label}</span>
              </div>
              <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${convergence.pct}%` }} />
              </div>
              <p className="text-[10px] text-gray-500 mb-3">{convergence.description}</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(s => (
                  <button key={s} onClick={() => setConvergenceStage(s)}
                    className={`flex-1 py-1.5 text-[9px] font-mono rounded-md border transition-colors ${convergence.stage >= s ? 'bg-teal-500/20 border-teal-500/40 text-teal-400' : 'bg-[#111] border-[#222] text-gray-600 hover:text-gray-400'}`}>
                    {s * 25}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Intel Units */}
          <div>
            <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Intel Units</h4>
            <div className="bg-[#111] border border-[#222] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl font-light text-amber-400">{intelBalance?.balance?.toLocaleString()}</span>
                <span className="text-[10px] font-mono text-gray-600">/ {intelBalance?.starting_balance?.toLocaleString()}</span>
              </div>
              <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${((intelBalance?.balance || 0) / (intelBalance?.starting_balance || 1)) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Strategic Overlay Toggle */}
          <div className="bg-[#111] border border-[#222] p-2.5 rounded-lg flex items-center justify-between">
            <span className="text-[11px] text-gray-300 font-medium">Strategic Overlay</span>
            <button 
              onClick={() => setShowStrategicOverlay(!showStrategicOverlay)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${showStrategicOverlay ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showStrategicOverlay ? 'translate-x-2' : '-translate-x-2'}`} />
            </button>
          </div>

          {!showStrategicOverlay ? (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Node Types</h4>
              <div className="space-y-1.5">
                {[
                  { color: '#6d28d9', label: 'Core Problem', border: 'solid' },
                  { color: '#0d9488', label: 'Explicit Hypothesis', border: 'solid' },
                  { color: '#f59e0b', label: 'Suggested Hypothesis', border: 'dashed' },
                  { color: '#3b82f6', label: 'Insight Branch', border: 'solid' },
                  { color: '#4b5563', label: 'Signal Cluster', border: 'solid' },
                ].map(n => (
                  <div key={n.label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: n.color, border: n.border === 'dashed' ? '1.5px dashed #fbbf24' : 'none' }} />
                    <span className="text-[11px] text-gray-400">{n.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Strategic Forces</h4>
              <div className="space-y-1.5">
                {Object.entries(FORCE_COLORS).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-gray-300">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: 3D Canvas */}
        <div ref={containerRef} className="flex-1 h-full relative overflow-hidden" style={{ background: '#060610' }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-teal-400/80 z-10">
              <Activity size={48} className="animate-pulse mb-4" />
              <span className="font-mono tracking-widest">GENERATING INTELLIGENCE MAP...</span>
            </div>
          ) : topology ? (
            <ForceGraph3D
              ref={fgRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={topology}
              backgroundColor="#060610"
              nodeThreeObject={nodeThreeObject}
              nodeThreeObjectExtend={false}
              linkColor={getLinkColor}
              linkWidth={(link: any) => {
                const w = link.weight || 1;
                return Math.max(w * 0.4, 0.3);
              }}
              linkCurvature={0.15}
              linkOpacity={1}
              onNodeHover={(node: any) => setHoveredNode(node)}
              onNodeClick={handleNodeClick}
              onBackgroundClick={() => { setFocusedId(null); setSelectedHyp(null); if (fgRef.current) fgRef.current.zoomToFit(800, 150); }}

              cooldownTicks={100}
              d3AlphaDecay={0.04}
              d3VelocityDecay={0.35}
              onEngineStop={() => { if (topology) topology.nodes.forEach((n: any) => { n.fx = n.x; n.fy = n.y; n.fz = n.z; }); }}
              enableNodeDrag={true}
              enableNavigationControls={true}
            />
          ) : null}

          {/* Hover tooltip */}
          {hoveredNode && (
            <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 backdrop-blur-md border border-[#333] rounded-xl px-4 py-3 max-w-sm pointer-events-none shadow-2xl">
              <div className="text-sm font-medium text-white mb-1">{hoveredNode.label}</div>
              {hoveredNode.description && <p className="text-[11px] text-gray-400 leading-relaxed mb-1.5">{hoveredNode.description}</p>}
              <div className="flex gap-2 flex-wrap">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#222] text-gray-400 font-mono">{hoveredNode.type?.replace('_', ' ')}</span>
                {hoveredNode.force && <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${FORCE_COLORS[hoveredNode.force] || '#666'}20`, color: FORCE_COLORS[hoveredNode.force] || '#999' }}>{hoveredNode.force}</span>}
                {hoveredNode.confirmation_status && <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${STATUS_COLORS[hoveredNode.confirmation_status]}20`, color: STATUS_COLORS[hoveredNode.confirmation_status] }}>{hoveredNode.confirmation_status}</span>}
              </div>
            </div>
          )}

          {/* Controls hint */}
          <div className="absolute top-4 left-4 z-20 text-[10px] text-gray-600 font-mono space-y-0.5 pointer-events-none">
            <div>Left-drag: Orbit</div>
            <div>Right-drag: Pan</div>
            <div>Click hypothesis: Focus + Insight</div>
          </div>
        </div>
      </div>

      {/* Bottom Panel: Hypothesis Insight */}
      <AnimatePresence>
        {selectedHyp && (
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="border-t border-[#222] bg-[#0a0a0a] px-6 py-4 max-h-[40vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedHyp.type === 'explicit_hypothesis' ? '#0d9488' : '#f59e0b' }} />
                <h3 className="text-sm font-medium text-white">{selectedHyp.label}</h3>
                {insight?.confirmation_status && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium" style={{ backgroundColor: `${STATUS_COLORS[insight.confirmation_status]}20`, color: STATUS_COLORS[insight.confirmation_status] }}>
                    {insight.confirmation_status.toUpperCase()}
                  </span>
                )}
                {insight?.force && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ backgroundColor: `${FORCE_COLORS[insight.force] || '#666'}15`, color: FORCE_COLORS[insight.force] || '#999' }}>
                    {insight.force}
                  </span>
                )}
              </div>
              <button onClick={() => { setSelectedHyp(null); setInsight(null); }} className="p-1 hover:bg-[#222] rounded text-gray-500"><X size={14} /></button>
            </div>

            {insightLoading ? (
              <div className="flex items-center gap-2 text-gray-500 py-4"><Activity size={16} className="animate-spin" /> Generating insight...</div>
            ) : insight ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-white mb-1">{insight.headline}</h4>
                  <p className="text-[12px] text-gray-400 leading-relaxed">{insight.insight_text}</p>
                </div>

                <div className="flex gap-4 text-[10px]">
                  <div className="bg-[#111] border border-[#222] rounded-lg px-3 py-2">
                    <span className="text-gray-500">Signals:</span> <span className="text-teal-400 font-mono">{insight.signal_count}</span>
                  </div>
                  <div className="bg-[#111] border border-[#222] rounded-lg px-3 py-2">
                    <span className="text-gray-500">Intensity:</span> <span className={`font-mono ${insight.intensity === 'HIGH' ? 'text-rose-400' : insight.intensity === 'MEDIUM' ? 'text-amber-400' : 'text-gray-400'}`}>{insight.intensity}</span>
                  </div>
                  <div className="bg-[#111] border border-[#222] rounded-lg px-3 py-2">
                    <span className="text-gray-500">Impact:</span> <span className={`font-mono ${(insight.force_impact_pct || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{insight.force_impact_pct > 0 ? '+' : ''}{insight.force_impact_pct}%</span>
                  </div>
                </div>

                {/* Suggested Action */}
                {insight.suggested_action && (
                  <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1"><Target size={12} className="text-teal-400" /><span className="text-[10px] text-teal-400 font-mono uppercase">Suggested Action</span></div>
                    <p className="text-[11px] text-teal-200">{insight.suggested_action}</p>
                  </div>
                )}

                {/* Top Signals */}
                {insight.top_signals?.length > 0 && (
                  <div>
                    <h5 className="text-[10px] text-gray-500 font-mono uppercase mb-2">Signal Evidence</h5>
                    <div className="space-y-2">
                      {insight.top_signals.slice(0, 5).map((sig: any, i: number) => (
                        <div key={i} className="bg-[#111] border border-[#1a1a1a] rounded-lg p-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#222] text-gray-500 font-mono">{sig.platform}</span>
                            <span className="text-[9px] text-gray-600">{sig.timestamp}</span>
                            {sig.signal_tag && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono">{sig.signal_tag}</span>}
                          </div>
                          <p className="text-[11px] text-gray-300 italic leading-relaxed">&quot;{sig.content}&quot;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Double Down */}
                {selectedHyp.type === 'suggested_hypothesis' && selectedHyp.intel_cost && (
                  <button
                    onClick={() => handleDoubleDown(selectedHyp.id, selectedHyp.intel_cost)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    <BrainCircuit size={14} />
                    Double Down — {selectedHyp.intel_cost} Intel Units
                  </button>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

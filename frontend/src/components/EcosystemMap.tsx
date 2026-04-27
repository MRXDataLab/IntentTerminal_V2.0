"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Network, Activity, CheckCircle2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface EcosystemMapProps {
  intent: string;
  brief?: string;
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

const NODE_STYLES: Record<string, { fill: string; border: string; size: number; shape: string; fontWeight: number; fontSize: number; opacity: number }> = {
  root:      { fill: '#6d28d9', border: '#a78bfa', size: 20, shape: 'circle',   fontWeight: 700, fontSize: 12, opacity: 1.0 },
  subject:   { fill: '#0d9488', border: '#5eead4', size: 14, shape: 'circle',   fontWeight: 600, fontSize: 10, opacity: 1.0 },
  component: { fill: '#1e40af', border: '#60a5fa', size: 8,  shape: 'circle',   fontWeight: 500, fontSize: 8,  opacity: 0.85 },
  signal:    { fill: '#374151', border: '#6b7280', size: 4,  shape: 'circle',   fontWeight: 400, fontSize: 7,  opacity: 0.45 },
  context:   { fill: '#b45309', border: '#fbbf24', size: 8,  shape: 'diamond',  fontWeight: 500, fontSize: 8,  opacity: 0.9 },
  scope:     { fill: '#1e3a5f', border: '#38bdf8', size: 6,  shape: 'square',   fontWeight: 400, fontSize: 7,  opacity: 0.55 },
  category:  { fill: '#0d9488', border: '#5eead4', size: 14, shape: 'circle',   fontWeight: 600, fontSize: 10, opacity: 1.0 },
};

const EDGE_COLORS: Record<string, string> = {
  root:      '#a78bfa40',
  subject:   '#5eead450',
  component: '#60a5fa40',
  signal:    '#9ca3af30',
  context:   '#fbbf2440',
  scope:     '#38bdf840',
  category:  '#5eead450',
};

const CATEGORY_PALETTE = [
  "#f59e0b", "#8b5cf6", "#14b8a6", "#f43f5e", "#0ea5e9",
  "#a855f7", "#ec4899", "#84cc16",
];

// Build a set of all descendant node IDs from a given subject node
function getDescendantIds(subjectId: string, links: any[]): Set<string> {
  const ids = new Set<string>([subjectId]);
  const queue = [subjectId];
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

export default function EcosystemMap({ intent, brief, onMapComplete, onBack, hideSidebar = false, onGraphMetrics, strategicOverlayEnabled }: EcosystemMapProps) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ecosystemNodeNames, setEcosystemNodeNames] = useState<string[]>([]);
  const [categoriesLegend, setCategoriesLegend] = useState<{name: string, color: string, desc: string}[]>([]);
  const [showStrategicOverlay, setShowStrategicOverlay] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [focusedSubject, setFocusedSubject] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const fgRef = useRef<any>(null);

  // Build the set of highlighted node IDs when a subject is focused
  const focusedNodeIds = useMemo(() => {
    if (!focusedSubject || !graphData) return null;
    // Include root node + the focused subject's entire branch
    const rootNode = graphData.nodes.find((n: any) => n.type === 'root');
    const rootId = rootNode?.id || '';
    const descendants = getDescendantIds(focusedSubject, graphData.links);
    descendants.add(rootId);
    // Also include scope nodes (they're always relevant)
    graphData.nodes.forEach((n: any) => {
      if (n.type === 'scope') descendants.add(n.id);
    });
    return descendants;
  }, [focusedSubject, graphData]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [loading, graphData, hideSidebar]);

  useEffect(() => {
    if (onGraphMetrics) {
      onGraphMetrics({
        loading,
        analyzingNodes: graphData ? graphData.nodes.length : 0,
        totalNodes: graphData ? graphData.nodes.length : 0,
        totalEdges: graphData ? graphData.links.length : 0,
        categoriesLegend,
        ecosystemNodeNames
      });
    }
  }, [loading, graphData, categoriesLegend, ecosystemNodeNames, onGraphMetrics]);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const cacheKey = 'ecosystem_graph';
        const cached = sessionStorage.getItem(cacheKey);
        let graphDataObj;

        if (intent === 'DEV_TEST_MOCK') {
          const bypassRes = await axios.get('http://localhost:8000/api/latest-run');
          graphDataObj = bypassRes.data.graph;
          sessionStorage.setItem(cacheKey, JSON.stringify(graphDataObj));
        } else if (cached) {
          graphDataObj = JSON.parse(cached);
        } else {
          const res = await axios.post('http://localhost:8000/api/generate-ecosystem', { intent, brief: brief || undefined });
          graphDataObj = res.data.graph;
          sessionStorage.setItem(cacheKey, JSON.stringify(graphDataObj));
        }

        setGraphData(graphDataObj);
        const allNodeNames: string[] = (graphDataObj.nodes || []).filter((n: any) => n.type !== 'root').map((n: any) => n.label || n.id);
        setEcosystemNodeNames(allNodeNames);
        const catNodes = (graphDataObj.nodes || []).filter((n: any) => n.type === 'subject' || n.type === 'category');
        setCategoriesLegend(catNodes.map((n: any, i: number) => ({ name: n.label, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length], desc: n.description || "" })));
        setLoading(false);
        setTimeout(() => { if (fgRef.current) fgRef.current.zoomToFit(600, 80); }, 900);
      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent, brief]);

  // Node click handler — focus/unfocus
  const handleNodeClick = useCallback((node: any) => {
    if (!node || !fgRef.current) return;
    const type = node.type || 'signal';

    if (type === 'root') {
      // Click root → reset focus, zoom to fit
      setFocusedSubject(null);
      fgRef.current.zoomToFit(600, 80);
      return;
    }

    if (type === 'subject' || type === 'category') {
      if (focusedSubject === node.id) {
        // Click same subject again → unfocus
        setFocusedSubject(null);
        fgRef.current.zoomToFit(600, 80);
      } else {
        // Focus this subject branch
        setFocusedSubject(node.id);
        fgRef.current.centerAt(node.x, node.y, 600);
        fgRef.current.zoom(2.2, 600);
      }
      return;
    }

    // Click any other node → focus its parent subject
    const parentSubject = node.subject;
    if (parentSubject && graphData) {
      const subjectNode = graphData.nodes.find((n: any) => n.id === parentSubject || n.label === parentSubject);
      if (subjectNode) {
        setFocusedSubject(subjectNode.id);
        fgRef.current.centerAt(subjectNode.x, subjectNode.y, 600);
        fgRef.current.zoom(2.2, 600);
        return;
      }
    }

    // Fallback — just center on the clicked node
    fgRef.current.centerAt(node.x, node.y, 600);
    fgRef.current.zoom(2.5, 600);
  }, [focusedSubject, graphData]);

  // Click on empty canvas → reset focus
  const handleBackgroundClick = useCallback(() => {
    if (focusedSubject) {
      setFocusedSubject(null);
      if (fgRef.current) fgRef.current.zoomToFit(600, 80);
    }
  }, [focusedSubject]);

  // Drag handler — when dragging a subject, move its descendants too
  const handleNodeDrag = useCallback((node: any, translate: { x: number; y: number }) => {
    if (!graphData || (node.type !== 'subject' && node.type !== 'category')) return;
    
    const descendants = getDescendantIds(node.id, graphData.links);
    descendants.delete(node.id); // Don't double-move the dragged node itself
    
    for (const descId of descendants) {
      const descNode = graphData.nodes.find((n: any) => n.id === descId);
      if (descNode) {
        descNode.fx = (descNode.fx ?? descNode.x) + translate.x;
        descNode.fy = (descNode.fy ?? descNode.y) + translate.y;
        descNode.x = descNode.fx;
        descNode.y = descNode.fy;
      }
    }
  }, [graphData]);

  // Track previous drag position for computing deltas
  const lastDragPos = useRef<{ x: number; y: number } | null>(null);

  const handleNodeDragWithDelta = useCallback((node: any) => {
    if (!graphData || (node.type !== 'subject' && node.type !== 'category')) {
      lastDragPos.current = null;
      return;
    }
    
    const currentPos = { x: node.x, y: node.y };
    if (lastDragPos.current) {
      const dx = currentPos.x - lastDragPos.current.x;
      const dy = currentPos.y - lastDragPos.current.y;
      
      const descendants = getDescendantIds(node.id, graphData.links);
      descendants.delete(node.id);
      
      for (const descId of descendants) {
        const descNode = graphData.nodes.find((n: any) => n.id === descId);
        if (descNode) {
          descNode.fx = (descNode.fx ?? descNode.x) + dx;
          descNode.fy = (descNode.fy ?? descNode.y) + dy;
          descNode.x = descNode.fx;
          descNode.y = descNode.fy;
        }
      }
    }
    lastDragPos.current = { ...currentPos };
  }, [graphData]);

  const handleNodeDragEnd = useCallback((node: any) => {
    lastDragPos.current = null;
    // Re-freeze the dragged node
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  // Paint node — with focus/dim logic
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const type = node.type || 'signal';
    const style = NODE_STYLES[type] || NODE_STYLES.signal;
    const label = node.label || node.id || '';
    const size = style.size;
    const isHovered = hoveredNode?.id === node.id;
    const useForceColor = strategicOverlayEnabled && node.force && FORCE_COLORS[node.force];
    const fillColor = useForceColor ? FORCE_COLORS[node.force] : style.fill;
    const borderColor = useForceColor ? FORCE_COLORS[node.force] : style.border;

    // Focus/dim: if a subject is focused, dim nodes NOT in its branch
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const dimFactor = isFocused ? 1.0 : 0.08;

    ctx.save();
    ctx.globalAlpha = (isHovered ? 1.0 : style.opacity) * dimFactor;

    if (isHovered && isFocused) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 18;
    }

    ctx.beginPath();
    if (style.shape === 'diamond') {
      const s = size * 0.9;
      ctx.moveTo(node.x, node.y - s);
      ctx.lineTo(node.x + s, node.y);
      ctx.lineTo(node.x, node.y + s);
      ctx.lineTo(node.x - s, node.y);
      ctx.closePath();
    } else if (style.shape === 'square') {
      const half = size * 0.7;
      ctx.rect(node.x - half, node.y - half, half * 2, half * 2);
    } else {
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    }

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isHovered ? 2.5 : (type === 'root' ? 2 : 1);
    ctx.stroke();
    ctx.restore();

    // Labels
    if (!isFocused && !isHovered) return; // Skip labels for dimmed nodes

    const showLabel = type === 'root' || type === 'subject' || type === 'category'
      || type === 'component' || type === 'context'
      || globalScale > 1.5 || isHovered;

    if (showLabel) {
      const fontSize = Math.max(style.fontSize / Math.pow(globalScale, 0.25), 2.5);
      ctx.font = `${style.fontWeight} ${fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = type === 'root' || type === 'subject' || type === 'category' ? '#e2e2e8' : '#8888a0';
      ctx.globalAlpha = isHovered ? 1.0 : (type === 'signal' || type === 'scope' ? 0.6 : 0.9);
      ctx.fillText(label, node.x, node.y + size + 3);
      ctx.globalAlpha = 1.0;
    }
  }, [hoveredNode, strategicOverlayEnabled, focusedNodeIds]);

  // Paint link — with focus/dim logic
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const source = link.source;
    const target = link.target;
    if (!source || !target || typeof source.x !== 'number') return;

    const targetType = target.type || 'signal';
    const color = EDGE_COLORS[targetType] || '#ffffff20';

    // Dim links not in the focused branch
    const srcId = typeof source.id === 'string' ? source.id : source;
    const tgtId = typeof target.id === 'string' ? target.id : target;
    const isFocused = !focusedNodeIds || (focusedNodeIds.has(srcId) && focusedNodeIds.has(tgtId));

    ctx.save();
    ctx.globalAlpha = isFocused ? 1.0 : 0.04;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);

    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const curvature = 0.12;
    const cpX = midX - dy * curvature;
    const cpY = midY + dx * curvature;

    ctx.quadraticCurveTo(cpX, cpY, target.x, target.y);
    ctx.strokeStyle = isFocused ? color.replace(/[\da-f]{2}$/, 'aa') : color;
    ctx.lineWidth = targetType === 'subject' || targetType === 'category' ? 1.8 : 0.8;
    ctx.stroke();
    ctx.restore();
  }, [focusedNodeIds]);

  return (
    <div className="flex w-full h-full text-white overflow-hidden relative" style={{ background: '#0a0a12', minHeight: hideSidebar ? '100%' : '100vh' }}>

      {/* Left Sidebar */}
      {!hideSidebar && (
        <div className="w-80 min-w-[20rem] h-full border-r border-[#2a2a3a] bg-[#0f0f18] z-10 flex flex-col pt-5 pb-5 shadow-2xl overflow-y-auto shrink-0">
          <div className="px-5 mb-5">
            <div className="flex items-center gap-2 text-gray-300">
              <Network className="text-blue-500" size={16} />
              <h1 className="text-base font-medium tracking-wide">Knowledge Graph</h1>
            </div>
          </div>
          <div className="px-5 flex-1">
            <div className="mb-5">
              <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Research Intent</h4>
              <div className="bg-[#111] p-3 rounded-lg border border-[#222]">
                <p className="text-[11px] text-gray-300 italic leading-relaxed break-words line-clamp-3">&quot;{intent}&quot;</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">Nodes Mapped</span>
                  <span className="text-teal-400 font-mono text-xs">{graphData ? graphData.nodes.length : 0}</span>
                </div>
              </div>
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">Semantic Edges</span>
                  <span className="text-blue-400 font-mono text-xs">{graphData ? graphData.links.length : 0}</span>
                </div>
              </div>
            </div>

            {!loading && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                <div className="mb-4 bg-[#111] border border-[#222] p-2.5 rounded-lg flex items-center justify-between">
                  <span className="text-[11px] text-gray-300 font-medium">Strategic Overlay</span>
                  <button onClick={() => setShowStrategicOverlay(!showStrategicOverlay)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${showStrategicOverlay ? 'bg-blue-600' : 'bg-gray-700'}`}>
                    <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${showStrategicOverlay ? 'translate-x-2' : '-translate-x-2'}`} />
                  </button>
                </div>

                {/* Node Type Legend */}
                <div className="mb-4">
                  <h4 className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mb-2">Node Types</h4>
                  <div className="space-y-1.5">
                    {[
                      { type: 'root', label: 'Core Problem' },
                      { type: 'subject', label: 'Hypothesis' },
                      { type: 'component', label: 'Sub-topic' },
                      { type: 'signal', label: 'Signal / Keyword' },
                      { type: 'context', label: 'Rival / Trigger' },
                      { type: 'scope', label: 'Scope Boundary' },
                    ].map(({ type, label }) => {
                      const s = NODE_STYLES[type];
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm shrink-0 border" style={{ backgroundColor: s.fill, borderColor: s.border }} />
                          <span className="text-[11px] text-gray-400">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-5">
                  <h4 className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mb-2">
                    {showStrategicOverlay ? "Strategic Forces" : "Key Subjects"}
                  </h4>
                  <div className="space-y-1.5">
                    {showStrategicOverlay ? (
                      Object.entries(FORCE_COLORS).map(([name, color]) => (
                        <div key={name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[11px] text-gray-300 font-medium">{name}</span>
                        </div>
                      ))
                    ) : (
                      categoriesLegend.map((cat) => (
                        <div key={cat.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-[11px] text-gray-300 font-medium">{cat.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Focus hint */}
                {focusedSubject && (
                  <div className="mb-4 bg-teal-500/10 border border-teal-500/30 rounded-lg p-2.5">
                    <p className="text-[10px] text-teal-400">Click the root node or empty space to reset view.</p>
                  </div>
                )}

                <button onClick={() => onMapComplete(ecosystemNodeNames)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  <CheckCircle2 size={16} />
                  Confirm Methodology
                </button>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Graph Canvas */}
      <div ref={containerRef} className="flex-1 h-full relative overflow-hidden" style={{ background: '#0a0a12' }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.04)_0,transparent_60%)] pointer-events-none z-0" />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-teal-400/80">
            <Activity size={48} className="animate-pulse mb-4" />
            <span className="font-mono tracking-widest">PERFORMING HORIZON SCAN...</span>
          </div>
        ) : graphData ? (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const size = (NODE_STYLES[node.type] || NODE_STYLES.signal).size + 8;
              ctx.beginPath();
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkCanvasObject={paintLink}
            linkDirectionalParticles={0}
            onNodeHover={(node: any) => setHoveredNode(node)}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDragWithDelta}
            onNodeDragEnd={handleNodeDragEnd}
            onBackgroundClick={handleBackgroundClick}
            cooldownTicks={80}
            d3AlphaDecay={0.06}
            d3VelocityDecay={0.45}
            d3AlphaMin={0.001}
            dagMode="radialout"
            dagLevelDistance={150}
            onEngineStop={() => {
              if (fgRef.current && graphData) {
                graphData.nodes.forEach((node: any) => {
                  node.fx = node.x;
                  node.fy = node.y;
                });
              }
            }}
            enableZoomInteraction={true}
            enablePanInteraction={true}
          />
        ) : null}

        {/* Tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 backdrop-blur-md border border-[#333] rounded-xl px-4 py-3 max-w-sm pointer-events-none shadow-2xl">
            <div className="text-sm font-medium text-white mb-1.5">{hoveredNode.label || hoveredNode.id}</div>
            {hoveredNode.description && (
              <p className="text-[11px] text-gray-400 leading-relaxed mb-2">{hoveredNode.description}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#222] text-gray-400 font-mono">{hoveredNode.type}</span>
              {hoveredNode.force && hoveredNode.force !== 'root' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{
                  backgroundColor: `${FORCE_COLORS[hoveredNode.force] || '#666'}20`,
                  color: FORCE_COLORS[hoveredNode.force] || '#999'
                }}>{hoveredNode.force}</span>
              )}
              {hoveredNode.subject && hoveredNode.subject !== hoveredNode.label && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-gray-500 font-mono">↳ {hoveredNode.subject}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

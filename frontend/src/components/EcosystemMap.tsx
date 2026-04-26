"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Activity, CheckCircle2, ArrowLeft } from 'lucide-react';
import * as d3Hierarchy from 'd3-hierarchy';

interface EcosystemMapProps {
  intent: string;
  brief?: string;
  onMapComplete: (graphNodes: string[]) => void;
  onBack: () => void;
  hideSidebar?: boolean;
  onGraphMetrics?: (metrics: any) => void;
  strategicOverlayEnabled?: boolean;
}

// Strategic Overlay color palette (the 5 forces)
const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity":          "#f59e0b",
  "Choice Architecture":     "#8b5cf6",
  "Value Elasticity":        "#14b8a6",
  "Reinforcement Stability": "#f43f5e",
  "Competitive Energy":      "#0ea5e9",
};

// Dynamic Category color palette
const CATEGORY_PALETTE = [
  "#f59e0b", "#8b5cf6", "#14b8a6", "#f43f5e", "#0ea5e9",
  "#a855f7", "#ec4899", "#84cc16",
];

// ─── NotebookLM Visual Constants ───
const NODE_HEIGHT = 40;
const NODE_PADDING_X = 24;
const NODE_FONT = '500 13px "Inter", "Segoe UI", system-ui, sans-serif';
const ROOT_FONT = '600 14px "Inter", "Segoe UI", system-ui, sans-serif';
const CHEVRON_WIDTH = 32;
const VERTICAL_GAP = 16; // gap between sibling nodes
const HORIZONTAL_GAP = 100; // gap between tree tiers

// NotebookLM fill colors
const FILL_ROOT = '#4a4563';
const FILL_SUBJECT = '#3a4a42';
const FILL_COMPONENT = '#2d4040';
const FILL_SIGNAL = '#2d4040';

function getFillColor(type: string): string {
  if (type === 'root') return FILL_ROOT;
  if (type === 'subject' || type === 'category') return FILL_SUBJECT;
  if (type === 'component') return FILL_COMPONENT;
  return FILL_SIGNAL;
}

// ─── Utility: Convert flat nodes+links into a d3 hierarchy ───
interface TreeNode {
  id: string;
  label: string;
  type: string;
  force?: string;
  subject?: string;
  children: TreeNode[];
}

function buildTree(nodes: any[], links: any[]): TreeNode | null {
  const nodeMap: Record<string, TreeNode> = {};
  for (const n of nodes) {
    nodeMap[n.id] = { ...n, children: [] };
  }
  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    if (nodeMap[sourceId] && nodeMap[targetId]) {
      nodeMap[sourceId].children.push(nodeMap[targetId]);
    }
  }
  const root = nodes.find((n: any) => n.type === 'root');
  return root ? nodeMap[root.id] : null;
}

// ─── Measure text width using an offscreen canvas ───
let _measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, font: string): number {
  // Safe fallback for Next.js Server-Side Rendering
  if (typeof document === 'undefined') {
    return text.length * 7; // Approximate width
  }
  
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d')!;
  ctx.font = font;
  return ctx.measureText(text).width;
}

// ─── Compute node width based on its label ───
function getNodeWidth(label: string, type: string, hasChildren: boolean): number {
  const font = type === 'root' ? ROOT_FONT : NODE_FONT;
  const textW = measureText(label, font);
  return textW + NODE_PADDING_X * 2 + (hasChildren ? CHEVRON_WIDTH : 0);
}

// ─── Bezier path from parent to child (NotebookLM curve style) ───
function buildLinkPath(
  x1: number, y1: number, parentWidth: number,
  x2: number, y2: number
): string {
  const startX = x1 + parentWidth / 2;
  const startY = y1;
  const endX = x2 - 0; // to left edge of child pill
  const endY = y2;
  const midX = startX + (endX - startX) * 0.5;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}


// ─── Pill-shaped Node component ───
interface MindMapNodeProps {
  node: d3Hierarchy.HierarchyPointNode<TreeNode>;
  expandedSet: Set<string>;
  onToggle: (id: string) => void;
  visibleIds: Set<string>;
  revealIndex: number; // controls staggered animation order
}

function MindMapNode({ node, expandedSet, onToggle, visibleIds, revealIndex }: MindMapNodeProps) {
  const d = node.data;
  const hasChildren = d.children && d.children.length > 0;
  const isExpanded = expandedSet.has(d.id);
  const nodeW = getNodeWidth(d.label, d.type, hasChildren);
  const fillColor = getFillColor(d.type);
  const font = d.type === 'root' ? ROOT_FONT : NODE_FONT;
  const textW = measureText(d.label, font);
  const pillW = textW + NODE_PADDING_X * 2;
  const cornerRadius = NODE_HEIGHT / 2;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        delay: revealIndex * 0.12,
      }}
      style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      onClick={(e) => {
        e.stopPropagation();
        if (hasChildren) onToggle(d.id);
      }}
    >
      {/* Pill background */}
      <motion.rect
        x={node.y - nodeW / 2}
        y={node.x - NODE_HEIGHT / 2}
        width={nodeW}
        height={NODE_HEIGHT}
        rx={cornerRadius}
        ry={cornerRadius}
        fill={fillColor}
        initial={false}
        animate={{ x: node.y - nodeW / 2, y: node.x - NODE_HEIGHT / 2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />

      {/* Label text */}
      <motion.text
        x={node.y - nodeW / 2 + NODE_PADDING_X}
        y={node.x}
        dy="0.35em"
        fill="#e2e2e8"
        fontSize={d.type === 'root' ? 14 : 13}
        fontWeight={d.type === 'root' ? 600 : 500}
        fontFamily='"Inter", "Segoe UI", system-ui, sans-serif'
        style={{ userSelect: 'none', pointerEvents: 'none' }}
        initial={false}
        animate={{ x: node.y - nodeW / 2 + NODE_PADDING_X, y: node.x }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {d.label}
      </motion.text>

      {/* Chevron section */}
      {hasChildren && (
        <>
          {/* Separator line */}
          <motion.line
            x1={node.y - nodeW / 2 + pillW}
            y1={node.x - NODE_HEIGHT * 0.3}
            x2={node.y - nodeW / 2 + pillW}
            y2={node.x + NODE_HEIGHT * 0.3}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
            initial={false}
            animate={{
              x1: node.y - nodeW / 2 + pillW,
              x2: node.y - nodeW / 2 + pillW,
              y1: node.x - NODE_HEIGHT * 0.3,
              y2: node.x + NODE_HEIGHT * 0.3,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />

          {/* Chevron arrow */}
          <motion.g
            initial={false}
            animate={{
              x: node.y - nodeW / 2 + pillW + CHEVRON_WIDTH / 2,
              y: node.x,
              rotate: isExpanded ? 90 : 0,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <path
              d="M -4 -5 L 3 0 L -4 5"
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        </>
      )}
    </motion.g>
  );
}


export default function EcosystemMap({ intent, brief, onMapComplete, onBack, hideSidebar = false, onGraphMetrics, strategicOverlayEnabled }: EcosystemMapProps) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingNodes, setAnalyzingNodes] = useState(0);
  const [ecosystemNodeNames, setEcosystemNodeNames] = useState<string[]>([]);
  const [categoriesLegend, setCategoriesLegend] = useState<{name: string, color: string, desc: string}[]>([]);
  const [showStrategicOverlay, setShowStrategicOverlay] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // ─── Expand/Collapse state ───
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());

  // ─── Staggered reveal state ───
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [revealDone, setRevealDone] = useState(false);

  // Track container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [loading, graphData, hideSidebar]);

  // Report metrics to parent
  useEffect(() => {
    if (onGraphMetrics) {
      onGraphMetrics({
        loading,
        analyzingNodes,
        totalNodes: graphData ? graphData.nodes.length : 0,
        totalEdges: graphData ? graphData.links.length : 0,
        categoriesLegend,
        ecosystemNodeNames
      });
    }
  }, [loading, analyzingNodes, graphData, categoriesLegend, ecosystemNodeNames, onGraphMetrics]);

  // ─── Fetch graph data ───
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
            const res = await axios.post('http://localhost:8000/api/generate-ecosystem', {
              intent,
              brief: brief || undefined
            });
            graphDataObj = res.data.graph;
            sessionStorage.setItem(cacheKey, JSON.stringify(graphDataObj));
        }
        
        setGraphData(graphDataObj);
        
        const allNodeNames: string[] = (graphDataObj.nodes || [])
          .filter((n: any) => n.type !== 'root')
          .map((n: any) => n.label || n.id);
        setEcosystemNodeNames(allNodeNames);

        const catNodes = (graphDataObj.nodes || []).filter((n: any) => n.type === 'subject' || n.type === 'category');
        const legendData = catNodes.map((n: any, index: number) => ({
          name: n.label,
          color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
          desc: n.description || "Key point from intent"
        }));
        setCategoriesLegend(legendData);
        setAnalyzingNodes(graphDataObj.nodes.length);
        setLoading(false);

      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent, brief]);

  // ─── Staggered reveal animation: tier by tier ───
  useEffect(() => {
    if (!graphData) return;
    const treeRoot = buildTree(graphData.nodes, graphData.links);
    if (!treeRoot) return;

    // BFS order for staggered reveal
    const bfsOrder: string[] = [];
    const queue: TreeNode[] = [treeRoot];
    while (queue.length > 0) {
      const current = queue.shift()!;
      bfsOrder.push(current.id);
      for (const child of current.children) {
        queue.push(child);
      }
    }

    // Start with the root visible immediately
    const newVisible = new Set<string>([bfsOrder[0]]);
    setVisibleIds(new Set(newVisible));
    // Also auto-expand the root
    setExpandedSet(prev => new Set([...prev, bfsOrder[0]]));
    let i = 1; // Start from second node since root is already visible
    
    const interval = setInterval(() => {
      if (i >= bfsOrder.length) {
        clearInterval(interval);
        setRevealDone(true);
        return;
      }
      newVisible.add(bfsOrder[i]);
      
      // Auto-expand nodes as they appear (so their children can appear next)
      const nodeData = graphData.nodes.find((n: any) => n.id === bfsOrder[i]);
      if (nodeData) {
        // Check if this node has children in the links
        const hasKids = graphData.links.some((l: any) => {
          const sid = typeof l.source === 'object' ? l.source.id : l.source;
          return sid === bfsOrder[i];
        });
        if (hasKids) {
          setExpandedSet(prev => new Set([...prev, bfsOrder[i]]));
        }
      }
      
      setVisibleIds(new Set(newVisible));
      i++;
    }, 350);

    return () => clearInterval(interval);
  }, [graphData]);

  // ─── Toggle expand/collapse ───
  const handleToggle = useCallback((id: string) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ─── Build the visible tree (pruned by expandedSet) ───
  const { layoutNodes, layoutLinks } = useMemo(() => {
    if (!graphData) return { layoutNodes: [], layoutLinks: [] };
    const treeRoot = buildTree(graphData.nodes, graphData.links);
    if (!treeRoot) return { layoutNodes: [], layoutLinks: [] };

    // Prune: only keep children for expanded nodes
    function prune(node: TreeNode): TreeNode {
      if (!expandedSet.has(node.id)) {
        return { ...node, children: [] };
      }
      return {
        ...node,
        children: node.children
          .filter(c => visibleIds.has(c.id))
          .map(c => prune(c)),
      };
    }

    // Always include root node
    const pruned = prune({ ...treeRoot, children: visibleIds.has(treeRoot.id) ? treeRoot.children : [] });
    // Ensure root is marked visible so it always renders
    if (!visibleIds.has(treeRoot.id) && graphData) {
      return { layoutNodes: [], layoutLinks: [] };
    }

    // Create d3 hierarchy and compute tree layout
    const root = d3Hierarchy.hierarchy(pruned);
    
    // Count visible leaf nodes to size the tree
    const leafCount = root.leaves().length;
    const treeHeight = Math.max(leafCount * (NODE_HEIGHT + VERTICAL_GAP), dimensions.height * 0.6);
    const treeWidth = Math.max(dimensions.width * 0.7, 800);

    const treeLayout = d3Hierarchy.tree<TreeNode>()
      .size([treeHeight, treeWidth])
      .separation((a, b) => {
        // Give more space between different parent groups
        return a.parent === b.parent ? 1 : 1.4;
      });

    treeLayout(root);

    const nodes = root.descendants() as d3Hierarchy.HierarchyPointNode<TreeNode>[];
    const links = root.links() as d3Hierarchy.HierarchyPointLink<TreeNode>[];

    return { layoutNodes: nodes, layoutLinks: links };
  }, [graphData, expandedSet, visibleIds, dimensions]);

  // ─── Calculate SVG viewBox to center the tree ───
  const viewBox = useMemo(() => {
    if (layoutNodes.length === 0) return `0 0 ${dimensions.width} ${dimensions.height}`;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of layoutNodes) {
      const w = getNodeWidth(n.data.label, n.data.type, n.data.children.length > 0);
      minX = Math.min(minX, n.x - NODE_HEIGHT);
      maxX = Math.max(maxX, n.x + NODE_HEIGHT);
      minY = Math.min(minY, n.y - w / 2 - 40);
      maxY = Math.max(maxY, n.y + w / 2 + 40);
    }
    const padding = 60;
    return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
  }, [layoutNodes, dimensions]);

  // ─── Build revealIndex map for stagger delay ───
  const revealIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    // BFS from the graphData to get stable ordering
    if (graphData) {
      const treeRoot = buildTree(graphData.nodes, graphData.links);
      if (treeRoot) {
        const queue: TreeNode[] = [treeRoot];
        while (queue.length > 0) {
          const current = queue.shift()!;
          map.set(current.id, idx++);
          for (const child of current.children) {
            queue.push(child);
          }
        }
      }
    }
    return map;
  }, [graphData]);

  return (
    <div className="flex w-full h-full text-white overflow-hidden relative" style={{ background: '#1e1e2e', minHeight: hideSidebar ? '100%' : '100vh' }}>
      {/* Left Sidebar Info */}
      {!hideSidebar && (
        <div className="w-80 min-w-[20rem] h-full border-r border-[#2a2a3a] bg-[#181825] z-10 flex flex-col pt-5 pb-5 shadow-2xl overflow-y-auto shrink-0">
          <div className="px-5 mb-5 flex items-start gap-3">
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-2 text-gray-300">
                <Network className="text-blue-500" size={16} />
                <h1 className="text-base font-medium tracking-wide">Category Graph</h1>
              </div>
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
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs">Nodes Mapped</span>
                <span className="text-teal-400 font-mono text-xs">{graphData ? graphData.nodes.length : 0}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1 mt-1.5">
                <div 
                  className="bg-teal-500 h-1 rounded-full transition-all duration-300" 
                  style={{ width: graphData ? `${(visibleIds.size / graphData.nodes.length) * 100}%` : '0%' }}
                ></div>
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
              
              {/* Strategic Context Toggle */}
              <div className="mb-4 bg-[#111] border border-[#222] p-2.5 rounded-lg flex items-center justify-between">
                <span className="text-[11px] text-gray-300 font-medium">Strategic Overlay</span>
                <button 
                  onClick={() => setShowStrategicOverlay(!showStrategicOverlay)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-black ${showStrategicOverlay ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showStrategicOverlay ? 'translate-x-2' : '-translate-x-2'}`} />
                </button>
              </div>

              {/* Dynamic Legend */}
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
              <button onClick={() => onMapComplete(ecosystemNodeNames)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                <CheckCircle2 size={16} />
                Confirm Methodology
              </button>
            </motion.div>
          )}
        </div>
        </div>
      )}

      {/* Right Map Canvas — NotebookLM Style */}
      <div ref={containerRef} className="flex-1 h-full relative overflow-hidden" style={{ background: '#1e1e2e' }}>
        
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-teal-400/80">
            <Activity size={48} className="animate-pulse mb-4" />
            <span className="font-mono tracking-widest">PERFORMING HORIZON SCAN...</span>
          </div>
        ) : graphData && layoutNodes.length > 0 ? (
          <svg
            width="100%"
            height="100%"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            style={{ overflow: 'visible' }}
          >
            {/* Links (curved beziers) */}
            <AnimatePresence>
              {layoutLinks.map((link, i) => {
                const parent = link.source as d3Hierarchy.HierarchyPointNode<TreeNode>;
                const child = link.target as d3Hierarchy.HierarchyPointNode<TreeNode>;
                const parentW = getNodeWidth(parent.data.label, parent.data.type, parent.data.children.length > 0);

                const startX = parent.y + parentW / 2;
                const startY = parent.x;
                const endX = child.y - getNodeWidth(child.data.label, child.data.type, child.data.children.length > 0) / 2;
                const endY = child.x;
                const midX = startX + (endX - startX) * 0.5;
                const pathD = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

                return (
                  <motion.path
                    key={`link-${parent.data.id}-${child.data.id}`}
                    d={pathD}
                    fill="none"
                    stroke="#4a6a7a"
                    strokeWidth={1.5}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    exit={{ pathLength: 0, opacity: 0 }}
                    transition={{
                      pathLength: { duration: 0.6, ease: 'easeInOut', delay: (revealIndexMap.get(child.data.id) || 0) * 0.12 },
                      opacity: { duration: 0.3, delay: (revealIndexMap.get(child.data.id) || 0) * 0.12 },
                    }}
                  />
                );
              })}
            </AnimatePresence>

            {/* Nodes */}
            <AnimatePresence>
              {layoutNodes.map((node) => (
                <MindMapNode
                  key={node.data.id}
                  node={node}
                  expandedSet={expandedSet}
                  onToggle={handleToggle}
                  visibleIds={visibleIds}
                  revealIndex={revealIndexMap.get(node.data.id) || 0}
                />
              ))}
            </AnimatePresence>
          </svg>
        ) : null}
      </div>
    </div>
  );
}

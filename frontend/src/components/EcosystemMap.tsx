"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Network, Activity, CheckCircle2 } from 'lucide-react';
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
const VERTICAL_GAP = 20; // gap between sibling nodes
const HORIZONTAL_GAP = 350; // horizontal distance between tiers

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
  if (typeof document === 'undefined') {
    return text.length * 7; // Approximate width for SSR
  }
  
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d')!;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function getNodeWidth(label: string, type: string): number {
  const font = type === 'root' ? ROOT_FONT : NODE_FONT;
  const textW = measureText(label, font);
  return textW + NODE_PADDING_X * 2;
}

// ─── Static Node Component ───
function StaticMindMapNode({ node }: { node: d3Hierarchy.HierarchyPointNode<TreeNode> }) {
  const d = node.data;
  const nodeW = getNodeWidth(d.label, d.type);
  const fillColor = getFillColor(d.type);
  const cornerRadius = NODE_HEIGHT / 2;

  // d3 nodeSize puts y as the horizontal axis, and x as the vertical axis
  const xPos = node.y - nodeW / 2;
  const yPos = node.x - NODE_HEIGHT / 2;

  return (
    <g>
      <rect
        x={xPos}
        y={yPos}
        width={nodeW}
        height={NODE_HEIGHT}
        rx={cornerRadius}
        ry={cornerRadius}
        fill={fillColor}
      />
      <text
        x={xPos + NODE_PADDING_X}
        y={node.x}
        dy="0.35em"
        fill="#e2e2e8"
        fontSize={d.type === 'root' ? 14 : 13}
        fontWeight={d.type === 'root' ? 600 : 500}
        fontFamily='"Inter", "Segoe UI", system-ui, sans-serif'
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {d.label}
      </text>
    </g>
  );
}

export default function EcosystemMap({ intent, brief, onMapComplete, hideSidebar = false, onGraphMetrics, showStrategicOverlay }: any) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ecosystemNodeNames, setEcosystemNodeNames] = useState<string[]>([]);
  const [categoriesLegend, setCategoriesLegend] = useState<{name: string, color: string, desc: string}[]>([]);

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
        setLoading(false);

      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent, brief]);

  // Report metrics
  useEffect(() => {
    if (onGraphMetrics && graphData) {
      onGraphMetrics({
        loading,
        analyzingNodes: graphData.nodes.length,
        totalNodes: graphData.nodes.length,
        totalEdges: graphData.links.length,
        categoriesLegend,
        ecosystemNodeNames
      });
    }
  }, [loading, graphData, categoriesLegend, ecosystemNodeNames, onGraphMetrics]);

  // ─── Compute Static Layout ───
  const { layoutNodes, layoutLinks, viewBox } = useMemo(() => {
    if (!graphData) return { layoutNodes: [], layoutLinks: [], viewBox: "0 0 1000 1000" };
    const treeRoot = buildTree(graphData.nodes, graphData.links);
    if (!treeRoot) return { layoutNodes: [], layoutLinks: [], viewBox: "0 0 1000 1000" };

    const root = d3Hierarchy.hierarchy(treeRoot);
    
    // nodeSize ensures absolute deterministic pixel-spacing preventing overlaps
    const treeLayout = d3Hierarchy.tree<TreeNode>()
      .nodeSize([NODE_HEIGHT + VERTICAL_GAP, HORIZONTAL_GAP])
      .separation((a, b) => a.parent === b.parent ? 1.2 : 1.8);

    treeLayout(root);

    const nodes = root.descendants() as d3Hierarchy.HierarchyPointNode<TreeNode>[];
    const links = root.links() as d3Hierarchy.HierarchyPointLink<TreeNode>[];

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const w = getNodeWidth(n.data.label, n.data.type);
      // d3 nodeSize puts layout top-down (x is vertical, y is horizontal)
      // So map: vertical=n.x, horizontal=n.y
      minX = Math.min(minX, n.y - w / 2);
      maxX = Math.max(maxX, n.y + w / 2);
      minY = Math.min(minY, n.x - NODE_HEIGHT / 2);
      maxY = Math.max(maxY, n.x + NODE_HEIGHT / 2);
    });

    const padding = 100;
    const computedViewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

    return { layoutNodes: nodes, layoutLinks: links, viewBox: computedViewBox };
  }, [graphData]);

  return (
    <div className="flex w-full h-full text-white overflow-hidden relative" style={{ background: '#1e1e2e', minHeight: hideSidebar ? '100%' : '100vh' }}>
      {/* Left Sidebar Info */}
      {!hideSidebar && (
        <div className="w-80 min-w-[20rem] h-full border-r border-[#2a2a3a] bg-[#181825] z-10 flex flex-col pt-5 pb-5 shadow-2xl overflow-y-auto shrink-0">
          <div className="px-5 mb-5 flex items-start gap-3">
            <div className="flex items-center gap-2 text-gray-300">
              <Network className="text-blue-500" size={16} />
              <h1 className="text-base font-medium tracking-wide">Category Graph</h1>
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
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Nodes Mapped</span>
                <span className="text-teal-400 font-mono text-xs">{graphData ? graphData.nodes.length : 0}</span>
              </div>
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Semantic Edges</span>
                <span className="text-blue-400 font-mono text-xs">{graphData ? graphData.links.length : 0}</span>
              </div>
            </div>
            
            {!loading && (
              <div className="mt-5">
                <button onClick={() => onMapComplete(ecosystemNodeNames)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  <CheckCircle2 size={16} />
                  Confirm Methodology
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right Map Canvas — Static NotebookLM Style */}
      <div className="flex-1 h-full relative overflow-hidden flex items-center justify-center" style={{ background: '#1e1e2e' }}>
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
            style={{ overflow: 'visible', width: '100%', height: '100%', display: 'block' }}
          >
            {/* Links (curved beziers) */}
            {layoutLinks.map((link) => {
              const parent = link.source as d3Hierarchy.HierarchyPointNode<TreeNode>;
              const child = link.target as d3Hierarchy.HierarchyPointNode<TreeNode>;
              const parentW = getNodeWidth(parent.data.label, parent.data.type);
              const childW = getNodeWidth(child.data.label, child.data.type);

              const startX = parent.y + parentW / 2;
              const startY = parent.x;
              const endX = child.y - childW / 2;
              const endY = child.x;
              const midX = startX + (endX - startX) * 0.5;
              const pathD = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

              return (
                <path
                  key={`link-${parent.data.id}-${child.data.id}`}
                  d={pathD}
                  fill="none"
                  stroke="#4a6a7a"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Nodes */}
            {layoutNodes.map((node) => (
              <StaticMindMapNode
                key={node.data.id}
                node={node}
              />
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

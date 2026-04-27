"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Activity } from 'lucide-react';
import dynamic from 'next/dynamic';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

interface EcosystemMap3DProps {
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

const NODE_CONFIG: Record<string, { color: string; size: number; opacity: number }> = {
  root:      { color: '#a78bfa', size: 12, opacity: 1.0 },
  subject:   { color: '#5eead4', size: 8,  opacity: 1.0 },
  component: { color: '#60a5fa', size: 4,  opacity: 0.8 },
  signal:    { color: '#6b7280', size: 2,  opacity: 0.5 },
  context:   { color: '#fbbf24', size: 4,  opacity: 0.9 },
  scope:     { color: '#38bdf8', size: 3,  opacity: 0.6 },
  category:  { color: '#5eead4', size: 8,  opacity: 1.0 },
};

const CATEGORY_PALETTE = [
  "#f59e0b", "#8b5cf6", "#14b8a6", "#f43f5e", "#0ea5e9",
  "#a855f7", "#ec4899", "#84cc16",
];

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

export default function EcosystemMap3D({ intent, brief, onMapComplete, onBack, hideSidebar = false, onGraphMetrics, strategicOverlayEnabled }: EcosystemMap3DProps) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [focusedSubject, setFocusedSubject] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const fgRef = useRef<any>(null);

  const focusedNodeIds = useMemo(() => {
    if (!focusedSubject || !graphData) return null;
    const rootNode = graphData.nodes.find((n: any) => n.type === 'root');
    const descendants = getDescendantIds(focusedSubject, graphData.links);
    if (rootNode) descendants.add(rootNode.id);
    graphData.nodes.forEach((n: any) => { if (n.type === 'scope') descendants.add(n.id); });
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
        categoriesLegend: (graphData?.nodes || [])
          .filter((n: any) => n.type === 'subject' || n.type === 'category')
          .map((n: any, i: number) => ({ name: n.label, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length], desc: n.description || "" })),
        ecosystemNodeNames: (graphData?.nodes || []).filter((n: any) => n.type !== 'root').map((n: any) => n.label || n.id),
      });
    }
  }, [loading, graphData, onGraphMetrics]);

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
        setLoading(false);

        setTimeout(() => {
          if (fgRef.current) fgRef.current.zoomToFit(800, 100);
        }, 1500);
      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent, brief]);

  const handleNodeClick = useCallback((node: any) => {
    if (!node || !fgRef.current) return;
    const type = node.type || 'signal';

    if (type === 'root') {
      setFocusedSubject(null);
      fgRef.current.zoomToFit(800, 100);
      return;
    }

    if (type === 'subject' || type === 'category') {
      if (focusedSubject === node.id) {
        setFocusedSubject(null);
        fgRef.current.zoomToFit(800, 100);
      } else {
        setFocusedSubject(node.id);
        const distance = 250;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z || 0);
        fgRef.current.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: (node.z || 0) * distRatio },
          node,
          1000
        );
      }
      return;
    }

    // Click child → focus parent subject
    if (node.subject && graphData) {
      const subjectNode = graphData.nodes.find((n: any) => n.id === node.subject || n.label === node.subject);
      if (subjectNode) {
        setFocusedSubject(subjectNode.id);
        const distance = 250;
        const distRatio = 1 + distance / Math.hypot(subjectNode.x, subjectNode.y, subjectNode.z || 0);
        fgRef.current.cameraPosition(
          { x: subjectNode.x * distRatio, y: subjectNode.y * distRatio, z: (subjectNode.z || 0) * distRatio },
          subjectNode,
          1000
        );
      }
    }
  }, [focusedSubject, graphData]);

  const handleBackgroundClick = useCallback(() => {
    if (focusedSubject) {
      setFocusedSubject(null);
      if (fgRef.current) fgRef.current.zoomToFit(800, 100);
    }
  }, [focusedSubject]);

  const getNodeColor = useCallback((node: any) => {
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const config = NODE_CONFIG[node.type] || NODE_CONFIG.signal;
    const baseColor = (strategicOverlayEnabled && node.force && FORCE_COLORS[node.force]) || config.color;

    if (!isFocused) {
      // Return very dim version
      return baseColor + '15';
    }
    return baseColor;
  }, [focusedNodeIds, strategicOverlayEnabled]);

  const getNodeOpacity = useCallback((node: any) => {
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const config = NODE_CONFIG[node.type] || NODE_CONFIG.signal;
    return isFocused ? config.opacity : 0.05;
  }, [focusedNodeIds]);

  const getLinkColor = useCallback((link: any) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const isFocused = !focusedNodeIds || (focusedNodeIds.has(srcId) && focusedNodeIds.has(tgtId));
    return isFocused ? '#ffffff30' : '#ffffff06';
  }, [focusedNodeIds]);

  const getLinkOpacity = useCallback((link: any) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const isFocused = !focusedNodeIds || (focusedNodeIds.has(srcId) && focusedNodeIds.has(tgtId));
    return isFocused ? 0.4 : 0.03;
  }, [focusedNodeIds]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#060610' }}>
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-teal-400/80">
          <Activity size={48} className="animate-pulse mb-4" />
          <span className="font-mono tracking-widest">BUILDING 3D TOPOLOGY...</span>
        </div>
      ) : graphData ? (
        <ForceGraph3D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="#060610"
          nodeLabel={(node: any) => ''}
          nodeColor={getNodeColor}
          nodeOpacity={1}
          nodeVal={(node: any) => {
            const config = NODE_CONFIG[node.type] || NODE_CONFIG.signal;
            return config.size;
          }}
          nodeResolution={16}
          linkColor={getLinkColor}
          linkOpacity={0.4}
          linkWidth={0.5}
          linkCurvature={0.1}
          onNodeHover={(node: any) => setHoveredNode(node)}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          dagMode="radialout"
          dagLevelDistance={60}
          cooldownTicks={100}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.4}
          onEngineStop={() => {
            if (fgRef.current && graphData) {
              graphData.nodes.forEach((node: any) => {
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
              });
            }
          }}
          enableNodeDrag={true}
          enableNavigationControls={true}
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
          </div>
        </div>
      )}
    </div>
  );
}

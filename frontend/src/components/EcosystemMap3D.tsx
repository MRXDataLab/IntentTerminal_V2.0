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

const NODE_CONFIG: Record<string, { color: string; emissive: string; size: number }> = {
  root:      { color: '#8b5cf6', emissive: '#a78bfa', size: 8  },
  subject:   { color: '#0d9488', emissive: '#5eead4', size: 5  },
  component: { color: '#1e40af', emissive: '#60a5fa', size: 3  },
  signal:    { color: '#4b5563', emissive: '#6b7280', size: 1.5 },
  context:   { color: '#b45309', emissive: '#fbbf24', size: 3  },
  scope:     { color: '#1e3a5f', emissive: '#38bdf8', size: 2  },
  category:  { color: '#0d9488', emissive: '#5eead4', size: 5  },
};

const LINK_COLORS: Record<string, string> = {
  root:      '#a78bfa',
  subject:   '#5eead4',
  component: '#60a5fa',
  signal:    '#6b7280',
  context:   '#fbbf24',
  scope:     '#38bdf8',
  category:  '#5eead4',
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

// Create a text sprite for 3D labels
function createTextSprite(text: string, color: string, fontSize: number): any {
  if (typeof document === 'undefined') return null;
  const THREE = require('three');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${fontSize * 10}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;

  canvas.width = textWidth + 20;
  canvas.height = fontSize * 14;

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(canvas.width / 40, canvas.height / 40, 1);
  return sprite;
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
          if (fgRef.current) fgRef.current.zoomToFit(1000, 150);
        }, 2000);
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
      fgRef.current.zoomToFit(800, 150);
      return;
    }

    if (type === 'subject' || type === 'category') {
      if (focusedSubject === node.id) {
        setFocusedSubject(null);
        fgRef.current.zoomToFit(800, 150);
      } else {
        setFocusedSubject(node.id);
        const distance = 200;
        const distRatio = 1 + distance / Math.max(Math.hypot(node.x, node.y, node.z || 0), 1);
        fgRef.current.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: (node.z || 0) * distRatio },
          node, 1000
        );
      }
      return;
    }

    if (node.subject && graphData) {
      const subjectNode = graphData.nodes.find((n: any) => n.id === node.subject || n.label === node.subject);
      if (subjectNode) {
        setFocusedSubject(subjectNode.id);
        const distance = 200;
        const distRatio = 1 + distance / Math.max(Math.hypot(subjectNode.x, subjectNode.y, subjectNode.z || 0), 1);
        fgRef.current.cameraPosition(
          { x: subjectNode.x * distRatio, y: subjectNode.y * distRatio, z: (subjectNode.z || 0) * distRatio },
          subjectNode, 1000
        );
      }
    }
  }, [focusedSubject, graphData]);

  const handleBackgroundClick = useCallback(() => {
    if (focusedSubject) {
      setFocusedSubject(null);
      if (fgRef.current) fgRef.current.zoomToFit(800, 150);
    }
  }, [focusedSubject]);

  // Custom 3D node objects — sphere + floating text label
  const nodeThreeObject = useCallback((node: any) => {
    if (typeof window === 'undefined') return undefined;
    const THREE = require('three');

    const type = node.type || 'signal';
    const config = NODE_CONFIG[type] || NODE_CONFIG.signal;
    const isFocused = !focusedNodeIds || focusedNodeIds.has(node.id);
    const useForceColor = strategicOverlayEnabled && node.force && FORCE_COLORS[node.force];
    const baseColor = useForceColor ? FORCE_COLORS[node.force] : config.color;
    const emissiveColor = useForceColor ? FORCE_COLORS[node.force] : config.emissive;

    const group = new THREE.Group();

    // Sphere
    const geometry = new THREE.SphereGeometry(config.size, 24, 24);
    const material = new THREE.MeshPhongMaterial({
      color: baseColor,
      emissive: emissiveColor,
      emissiveIntensity: type === 'root' ? 0.6 : (type === 'subject' || type === 'category') ? 0.4 : 0.2,
      transparent: true,
      opacity: isFocused ? 1.0 : 0.08,
      shininess: 80,
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Outer glow ring for root and subjects
    if (type === 'root' || type === 'subject' || type === 'category') {
      const ringGeo = new THREE.RingGeometry(config.size * 1.3, config.size * 1.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: emissiveColor,
        transparent: true,
        opacity: isFocused ? 0.25 : 0.02,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);
    }

    // Text label — only for root, subject, component, context (skip signals at distance)
    const showLabel = type === 'root' || type === 'subject' || type === 'category' || type === 'component' || type === 'context';
    if (showLabel && isFocused) {
      const label = node.label || node.id || '';
      const labelColor = type === 'root' ? '#e2e2e8' : type === 'subject' || type === 'category' ? '#c0f0e8' : '#a0a8c0';
      const labelSize = type === 'root' ? 5 : type === 'subject' || type === 'category' ? 4 : 3;
      const sprite = createTextSprite(label, labelColor, labelSize);
      if (sprite) {
        sprite.position.set(0, config.size + labelSize * 0.8, 0);
        group.add(sprite);
      }
    }

    return group;
  }, [focusedNodeIds, strategicOverlayEnabled]);

  // Link visuals
  const getLinkColor = useCallback((link: any) => {
    const target = link.target;
    const targetType = typeof target === 'object' ? (target.type || 'signal') : 'signal';
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof target === 'object' ? target.id : target;
    const isFocused = !focusedNodeIds || (focusedNodeIds.has(srcId) && focusedNodeIds.has(tgtId));
    const baseColor = LINK_COLORS[targetType] || '#6b7280';
    return isFocused ? baseColor + '60' : baseColor + '08';
  }, [focusedNodeIds]);

  const getLinkWidth = useCallback((link: any) => {
    const target = link.target;
    const targetType = typeof target === 'object' ? (target.type || 'signal') : 'signal';
    if (targetType === 'subject' || targetType === 'category') return 1.5;
    if (targetType === 'component') return 0.8;
    return 0.3;
  }, []);

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
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={getLinkColor}
          linkWidth={getLinkWidth}
          linkCurvature={0.15}
          linkCurveRotation={0.5}
          linkOpacity={1}
          onNodeHover={(node: any) => setHoveredNode(node)}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          dagMode="radialout"
          dagLevelDistance={80}
          cooldownTicks={100}
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.35}
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
            {hoveredNode.subject && hoveredNode.subject !== hoveredNode.label && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-gray-500 font-mono">↳ {hoveredNode.subject}</span>
            )}
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute top-4 left-4 z-20 text-[10px] text-gray-600 font-mono space-y-0.5 pointer-events-none">
        <div>Left-drag: Orbit</div>
        <div>Right-drag: Pan</div>
        <div>Scroll: Zoom</div>
        <div>Click node: Focus branch</div>
      </div>
    </div>
  );
}

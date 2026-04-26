"use client";

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Activity } from 'lucide-react';
import { motion } from 'framer-motion';

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

// Math helpers for SVG Donut slices
const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle - Math.PI / 2),
  y: cy + r * Math.sin(angle - Math.PI / 2)
});

const drawArc = (cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number) => {
  // Prevent 360 degree arcs from breaking SVG (subtract a tiny amount)
  if (endAngle - startAngle >= Math.PI * 2) {
    endAngle -= 0.0001;
  }
  
  const startOut = polarToCartesian(cx, cy, outerR, startAngle);
  const endOut = polarToCartesian(cx, cy, outerR, endAngle);
  const startIn = polarToCartesian(cx, cy, innerR, endAngle); // Note: For the inner arc, we draw backward from end to start
  const endIn = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  
  return [
    `M ${startOut.x} ${startOut.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOut.x} ${endOut.y}`,
    `L ${startIn.x} ${startIn.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endIn.x} ${endIn.y}`,
    `Z`
  ].join(' ');
};

export default function EcosystemMapSunburst({ intent, brief, hideSidebar = false, onGraphMetrics }: EcosystemMapProps) {
  const [loading, setLoading] = useState(true);
  const [analyzingNodes, setAnalyzingNodes] = useState(0);
  const [graphData, setGraphData] = useState<any>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 800 });
  const [hoveredSlice, setHoveredSlice] = useState<any>(null);

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
  }, [loading]);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const cacheKey = 'ecosystem_graph';
        const cached = sessionStorage.getItem(cacheKey);
        let graphData;
        
        if (intent === 'DEV_TEST_MOCK') {
            const bypassRes = await axios.get('http://localhost:8000/api/latest-run');
            graphData = bypassRes.data.graph;
            sessionStorage.setItem(cacheKey, JSON.stringify(graphData));
        } else if (cached) {
            graphData = JSON.parse(cached);
        } else {
            const res = await axios.post('http://localhost:8000/api/generate-ecosystem', {
              intent,
              brief: brief || undefined
            });
            graphData = res.data.graph;
            sessionStorage.setItem(cacheKey, JSON.stringify(graphData));
        }
        
        const nodes = graphData.nodes || [];
        
        // Build hierarchy for sunburst
        const root = nodes.find((n: any) => n.type === 'root') || { id: 'root', label: intent };
        const childNodes = nodes.filter((n: any) => n.type !== 'root' && n.type !== 'error');
        
        const uniqueForces = Array.from(new Set(childNodes.map((n: any) => n.force || 'Strategic Category')));
        
        const hierarchy = uniqueForces.map((forceName: any) => ({
          force: forceName,
          id: forceName,
          label: forceName,
          description: 'Strategic Force Driver',
          children: childNodes.filter((c: any) => (c.force || 'Strategic Category') === forceName)
        }));

        setGraphData({ root, forces: hierarchy, allNodes: nodes });

        const allNodeNames = childNodes.map((n: any) => n.label || n.id);
        
        if (onGraphMetrics) {
          onGraphMetrics({
            loading: false,
            analyzingNodes: nodes.length,
            totalNodes: nodes.length,
            totalEdges: graphData.links?.length || 0,
            categoriesLegend: [],
            ecosystemNodeNames: allNodeNames
          });
        }
        
        let count = 0;
        const interval = setInterval(() => {
          count += 3;
          setAnalyzingNodes(count);
          if (count >= nodes.length) {
            clearInterval(interval);
            setAnalyzingNodes(nodes.length);
            setLoading(false);
          }
        }, 150);

      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent, brief, onGraphMetrics]);

  if (loading || !graphData) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black text-teal-400/80">
        <Activity size={48} className="animate-pulse mb-4" />
        <span className="font-mono tracking-widest">RENDERING SUNBURST TOPOLOGY...</span>
      </div>
    );
  }

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;
  const maxRadius = Math.min(cx, cy) * 0.8;
  
  const innerRadius = maxRadius * 0.3; // Root circle
  const midRadius = maxRadius * 0.6; // Forces ring
  const outerRadius = maxRadius; // Subjects ring

  // Calculate Angles
  let currentAngle = 0;
  const totalForces = graphData.forces.length;
  
  const slices: any[] = [];
  const textLabels: any[] = [];

  graphData.forces.forEach((force: any, fIdx: number) => {
    // Determine how much of the pie this force gets based on its children count
    // Minimum 1 weight so empty forces still show
    const weight = Math.max(1, force.children.length);
    const totalWeight = graphData.forces.reduce((acc: number, f: any) => acc + Math.max(1, f.children.length), 0);
    const angleSpan = (weight / totalWeight) * (Math.PI * 2);
    
    const fStart = currentAngle;
    const fEnd = currentAngle + angleSpan;
    const fColor = FORCE_COLORS[force.force] || FORCE_COLORS[force.id] || '#8b5cf6';
    
    // 1. Add Force Slice (Inner Ring)
    slices.push({
      node: force,
      path: drawArc(cx, cy, innerRadius + 2, midRadius - 2, fStart, fEnd),
      color: fColor,
      isForce: true,
      midAngle: fStart + angleSpan / 2
    });

    // Label for Force Slice
    const fMid = fStart + angleSpan / 2;
    textLabels.push({
      node: force,
      text: force.label,
      x: cx + ((innerRadius + midRadius) / 2) * Math.cos(fMid - Math.PI / 2),
      y: cy + ((innerRadius + midRadius) / 2) * Math.sin(fMid - Math.PI / 2),
      angle: fMid,
      isForce: true
    });

    // 2. Add Children Slices (Outer Ring)
    if (force.children.length > 0) {
      const childAngleSpan = angleSpan / force.children.length;
      force.children.forEach((child: any, cIdx: number) => {
        const cStart = fStart + cIdx * childAngleSpan;
        const cEnd = cStart + childAngleSpan;
        const cMid = cStart + childAngleSpan / 2;

        slices.push({
          node: child,
          path: drawArc(cx, cy, midRadius + 2, outerRadius - 2, cStart, cEnd),
          color: fColor,
          isForce: false,
          midAngle: cMid
        });

        textLabels.push({
          node: child,
          text: child.label,
          x: cx + ((midRadius + outerRadius) / 2) * Math.cos(cMid - Math.PI / 2),
          y: cy + ((midRadius + outerRadius) / 2) * Math.sin(cMid - Math.PI / 2),
          angle: cMid,
          isForce: false
        });
      });
    }
    
    currentAngle += angleSpan;
  });

  return (
    <div ref={containerRef} className="w-full h-full bg-black text-white relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1f2937_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-20 z-0 pointer-events-none"></div>
      
      <svg width="100%" height="100%" className="absolute inset-0 z-10">
        
        {/* Draw all slices */}
        {slices.map((slice, i) => {
          const isHovered = hoveredSlice?.node.id === slice.node.id;
          const isParentHovered = hoveredSlice?.node.id === slice.node.force;
          const isChildHovered = hoveredSlice?.node.force === slice.node.id;
          
          let opacity = 0.5;
          if (!hoveredSlice) opacity = slice.isForce ? 0.7 : 0.4;
          else if (isHovered) opacity = 1;
          else if (isParentHovered || isChildHovered) opacity = 0.8;
          else opacity = 0.1;

          return (
            <motion.path
              key={`slice-${i}`}
              d={slice.path}
              fill={slice.color}
              initial={{ opacity: 0 }}
              animate={{ opacity }}
              transition={{ duration: 0.3 }}
              className="cursor-pointer transition-all duration-300 hover:brightness-125"
              onMouseEnter={() => setHoveredSlice(slice)}
              onMouseLeave={() => setHoveredSlice(null)}
            />
          );
        })}

        {/* Draw Center Circle (Root) */}
        <circle 
          cx={cx} cy={cy} r={innerRadius - 4} 
          fill="#111" stroke="#333" strokeWidth={2}
          onMouseEnter={() => setHoveredSlice({ node: graphData.root })}
          onMouseLeave={() => setHoveredSlice(null)}
          className="cursor-pointer transition-all hover:fill-[#222]"
        />
        
        {/* Draw Text Labels inside slices (SVG Text) */}
        {textLabels.map((lbl, i) => {
          const isHovered = hoveredSlice?.node.id === lbl.node.id;
          // Rotate text so it's readable
          let rotation = (lbl.angle * 180 / Math.PI);
          if (rotation > 90 && rotation < 270) rotation += 180; // flip upside down text

          return (
            <text
              key={`txt-${i}`}
              x={lbl.x}
              y={lbl.y}
              fill={isHovered ? "#fff" : "rgba(255,255,255,0.7)"}
              fontSize={lbl.isForce ? "12px" : "10px"}
              fontWeight={lbl.isForce ? "600" : "400"}
              textAnchor="middle"
              alignmentBaseline="middle"
              pointerEvents="none"
              transform={`rotate(${rotation}, ${lbl.x}, ${lbl.y})`}
              className="font-mono tracking-tighter"
            >
              {lbl.text.length > 20 ? lbl.text.substring(0, 18) + '...' : lbl.text}
            </text>
          );
        })}
      </svg>

      {/* Center Root Text (HTML overlay for better wrapping) */}
      <div 
        className="absolute z-20 flex items-center justify-center pointer-events-none"
        style={{ width: innerRadius * 1.5, height: innerRadius * 1.5, left: cx - innerRadius*0.75, top: cy - innerRadius*0.75 }}
      >
        <h2 className="text-sm font-semibold text-center text-white">{graphData.root?.label || intent}</h2>
      </div>

      {/* Hover Tooltip Overlay */}
      {hoveredSlice && hoveredSlice.node.id !== 'root' && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#111] border border-[#333] p-4 rounded-xl shadow-2xl z-50 max-w-md text-center pointer-events-none">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredSlice.color || '#fff' }}></div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-gray-500">
              {hoveredSlice.isForce ? 'Strategic Force' : 'Identified Node'}
            </span>
          </div>
          <h3 className="text-base font-medium text-white mb-1">{hoveredSlice.node.label}</h3>
          {hoveredSlice.node.description && (
            <p className="text-xs text-gray-400">{hoveredSlice.node.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

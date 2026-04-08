"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Network, Activity, Search, ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import force graph to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface EcosystemMapProps {
  intent: string;
  onMapComplete: (graphNodes: string[]) => void;
  onBack: () => void;
}

// 5 Strategic Force color palette
const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity":          "#f59e0b", // Amber
  "Choice Architecture":     "#8b5cf6", // Violet
  "Value Elasticity":        "#14b8a6", // Teal
  "Reinforcement Stability": "#f43f5e", // Rose
  "Competitive Energy":      "#0ea5e9", // Sky
  "root":                    "#ffffff", // White for root
};

const FORCE_LEGEND = [
  { name: "Demand Gravity",          color: "#f59e0b", desc: "Consumer pulls & triggers" },
  { name: "Choice Architecture",     color: "#8b5cf6", desc: "Decision environment shaprs" },
  { name: "Value Elasticity",        color: "#14b8a6", desc: "Price sensitivity & value" },
  { name: "Reinforcement Stability", color: "#f43f5e", desc: "Loyalty & switching costs" },
  { name: "Competitive Energy",      color: "#0ea5e9", desc: "Competitors & insurgents" },
];

export default function EcosystemMap({ intent, onMapComplete, onBack }: EcosystemMapProps) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingNodes, setAnalyzingNodes] = useState(0);
  const [ecosystemNodeNames, setEcosystemNodeNames] = useState<string[]>([]);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const res = await axios.post('http://localhost:8000/api/generate-ecosystem', { intent });
        setGraphData(res.data.graph);
        
        // Extract all non-root node labels to pass to the Audit Dashboard
        const allNodeNames: string[] = (res.data.graph.nodes || [])
          .filter((n: any) => n.type !== 'root')
          .map((n: any) => n.label || n.id);
        setEcosystemNodeNames(allNodeNames);
        
        // Simulating the "Scanning" process
        let count = 0;
        const interval = setInterval(() => {
          count += 3;
          setAnalyzingNodes(count);
          if (count >= res.data.graph.nodes.length) {
            clearInterval(interval);
            setAnalyzingNodes(res.data.graph.nodes.length);
            setLoading(false);
          }
        }, 150);

      } catch (e) {
        console.error("Failed to generate ecosystem", e);
        setLoading(false);
      }
    };
    fetchGraph();
  }, [intent]);

  // Color logic for nodes based on Strategic Force
  const getNodeColor = (node: any) => {
    if (node.type === 'root') return '#ffffff';
    const force = node.force || node.type;
    return FORCE_COLORS[force] || '#9ca3af';
  };

  return (
    <div className="flex w-full h-screen bg-black text-white overflow-hidden relative">
      {/* Left Sidebar Info */}
      <div className="w-96 min-w-[24rem] h-full border-r border-[#333] bg-[#0a0a0a] z-10 flex flex-col pt-6 pb-6 shadow-2xl overflow-y-auto shrink-0">
        <div className="px-6 mb-8 flex items-start gap-4">
          <button onClick={onBack} className="mt-1 shrink-0 p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col gap-3 w-full">
            <div className="flex items-center">
               <img src="/logo.png" alt="mrxdatalabs" className="h-6 w-auto object-contain bg-white p-1 rounded-sm shrink-0" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
               <span className="hidden font-bold text-xl tracking-tight text-white ml-2">mr<span className="text-[#cba358]">x</span>datalabs</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <Network className="text-blue-500" size={18} />
              <h1 className="text-lg font-medium tracking-wide">Category Graph</h1>
            </div>
          </div>
        </div>

        <div className="px-6 flex-1">
          <div className="mb-8">
            <h4 className="text-[11px] text-gray-500 uppercase tracking-widest font-mono mb-3">Research Intent</h4>
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
               <p className="text-[13px] text-gray-300 italic leading-relaxed break-words">&quot;{intent}&quot;</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-sm">Nodes Mapped</span>
                <span className="text-teal-400 font-mono text-sm">{graphData ? graphData.nodes.length : 0}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1 mt-2">
                <div 
                  className="bg-teal-500 h-1 rounded-full transition-all duration-300" 
                  style={{ width: graphData ? `${(analyzingNodes / graphData.nodes.length) * 100}%` : '0%' }}
                ></div>
              </div>
            </div>
            
            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-sm">Semantic Edges</span>
                <span className="text-blue-400 font-mono text-sm">{graphData ? graphData.links.length : 0}</span>
              </div>
            </div>
          </div>

          {!loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
              {/* Force Legend */}
              <div className="mb-6">
                <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-3">Strategic Forces</h4>
                <div className="space-y-2">
                  {FORCE_LEGEND.map((f) => (
                    <div key={f.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                      <div>
                        <span className="text-xs text-gray-300 font-medium">{f.name}</span>
                        <span className="text-[10px] text-gray-500 ml-1">— {f.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => onMapComplete(ecosystemNodeNames)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                <Search size={18} />
                Generate Source Seeds
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right Map Canvas */}
      <div className="flex-1 h-full relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 z-0"></div>
        
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-teal-400/80">
            <Activity size={48} className="animate-pulse mb-4" />
            <span className="font-mono tracking-widest">PERFORMING HORIZON SCAN...</span>
          </div>
        ) : graphData ? (
          <div className="w-full h-full cursor-move z-10 relative">
            <ForceGraph2D
              graphData={graphData}
              nodeColor={getNodeColor}
              nodeRelSize={6}
              linkWidth={1.5}
              linkColor={() => '#334155'}
              backgroundColor="#00000000"
              cooldownTicks={100}
              onEngineStop={() => {}}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const label = node.label;
                const fontSize = Math.max(12 / globalScale, 4);
                ctx.font = `${fontSize}px Inter, sans-serif`;
                const textWidth = ctx.measureText(label).width;
                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.8);

                ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
                ctx.beginPath();
                ctx.roundRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1], 4);
                ctx.fill();

                ctx.strokeStyle = getNodeColor(node);
                ctx.lineWidth = 1.5 / globalScale;
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = getNodeColor(node);
                ctx.fillText(label, node.x, node.y);

                node.__bckgDimensions = bckgDimensions;
              }}
              nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                ctx.fillStyle = color;
                const bckgDimensions = node.__bckgDimensions;
                if (bckgDimensions) {
                  ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

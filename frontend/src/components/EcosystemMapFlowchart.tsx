"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EcosystemMapProps {
  intent: string;
  brief?: string;
  onMapComplete: (graphNodes: string[]) => void;
  onBack: () => void;
  hideSidebar?: boolean;
  onGraphMetrics?: (metrics: any) => void;
  strategicOverlayEnabled?: boolean;
  hasPlayed?: boolean;
}

const FORCE_COLORS: Record<string, string> = {
  "Demand Gravity":          "#f59e0b",
  "Choice Architecture":     "#8b5cf6",
  "Value Elasticity":        "#14b8a6",
  "Reinforcement Stability": "#f43f5e",
  "Competitive Energy":      "#0ea5e9",
};

export default function EcosystemMapFlowchart({ intent, brief, hideSidebar = false, onGraphMetrics }: EcosystemMapProps) {
  const [loading, setLoading] = useState(true);
  const [analyzingNodes, setAnalyzingNodes] = useState(0);
  const [treeData, setTreeData] = useState<{ root: any, forces: { forceNode: any, children: any[] }[] } | null>(null);

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
        const links = graphData.links || [];
        
        // Build Tree structure — group by force, but show hypothesis first in each group
        const root = nodes.find((n: any) => n.type === 'root') || { id: 'root', label: intent };
        const subjectNodes = nodes.filter((n: any) => n.type === 'subject' || n.type === 'category');
        
        // Build parent→children map from links
        const childrenOf: Record<string, any[]> = {};
        for (const link of links) {
          const srcId = typeof link.source === 'object' ? link.source.id : link.source;
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
          const targetNode = nodes.find((n: any) => n.id === tgtId);
          if (targetNode) {
            if (!childrenOf[srcId]) childrenOf[srcId] = [];
            childrenOf[srcId].push(targetNode);
          }
        }
        
        // Group subjects by force, then attach their children hierarchically
        const uniqueForces = Array.from(new Set(subjectNodes.map((n: any) => n.force || 'Strategic Category')));
        
        const forces = uniqueForces.map((forceName: any) => {
          const hypotheses = subjectNodes.filter((s: any) => (s.force || 'Strategic Category') === forceName);
          // For each hypothesis, collect its full subtree
          const allChildren: any[] = [];
          for (const hyp of hypotheses) {
            allChildren.push({ ...hyp, _isHypothesis: true });
            const components = childrenOf[hyp.id] || [];
            for (const comp of components) {
              allChildren.push(comp);
              const signals = childrenOf[comp.id] || [];
              for (const sig of signals) {
                allChildren.push(sig);
              }
            }
          }
          return {
            forceNode: { force: forceName, label: forceName, description: `${hypotheses.length} hypothesis${hypotheses.length !== 1 ? 'es' : ''}` },
            children: allChildren
          };
        });

        setTreeData({ root, forces });

        const allNodeNames = nodes.filter((n: any) => n.type !== 'root' && n.type !== 'error').map((n: any) => n.label || n.id);
        
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
        
        // Simulation loading
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

  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black text-teal-400/80">
        <Activity size={48} className="animate-pulse mb-4" />
        <span className="font-mono tracking-widest">BUILDING EXECUTIVE FLOWCHART...</span>
      </div>
    );
  }

  if (!treeData) return null;

  return (
    <div className="w-full h-full bg-black text-white overflow-auto relative p-8">
      {/* Background Grid */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 z-0 pointer-events-none"></div>

      <div className="relative z-10 min-w-max mx-auto flex flex-col items-center pt-10">
        
        {/* Level 1: Root */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white text-black px-6 py-4 rounded-xl border border-gray-300 shadow-[0_0_30px_rgba(255,255,255,0.15)] flex flex-col items-center max-w-2xl text-center relative z-20"
        >
          <div className="flex items-center gap-2 mb-2">
            <Network size={16} className="text-gray-500" />
            <span className="text-xs font-mono uppercase tracking-widest text-gray-500">Core Intent</span>
          </div>
          <h2 className="text-lg font-medium">{treeData.root?.label || intent}</h2>
        </motion.div>

        {/* Vertical stem from root */}
        <div className="w-px h-10 bg-[#333]"></div>

        {/* Level 2: Forces Container */}
        <div className="flex justify-center relative w-full px-10">
          
          {/* Horizontal connecting line (Bus) */}
          <div className="absolute top-0 left-0 right-0 h-px bg-[#333]" style={{
            left: `calc(50% / ${treeData.forces.length})`,
            right: `calc(50% / ${treeData.forces.length})`
          }}></div>

          {treeData.forces.map((col, idx) => {
            const color = FORCE_COLORS[col.forceNode.force] || '#9ca3af';
            
            return (
              <div key={idx} className="flex-1 flex flex-col items-center px-4 relative">
                
                {/* Vertical line down from Bus */}
                <div className="w-px h-10 bg-[#333] absolute top-0"></div>

                {/* Force Header */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + (idx * 0.1) }}
                  className="mt-10 mb-6 bg-[#111] border rounded-lg px-4 py-3 w-full max-w-[280px] shadow-lg relative z-20"
                  style={{ borderColor: `${color}40` }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                    <h3 className="text-sm font-semibold" style={{ color }}>{col.forceNode.label}</h3>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-tight line-clamp-2">{col.forceNode.description || 'Strategic Force'}</p>
                </motion.div>

                {/* Level 3: Children (Nodes) — hypotheses shown first with distinct styling */}
                <div className="flex flex-col gap-2 w-full max-w-[300px] relative">
                  {col.children.length > 0 && (
                     <div className="absolute left-6 top-[-24px] bottom-6 w-px bg-[#222] z-0"></div>
                  )}

                  {col.children.map((child, cIdx) => {
                    const isHyp = child._isHypothesis || child.type === 'subject' || child.type === 'category';
                    const isSignal = child.type === 'signal';
                    const isContext = child.type === 'context';
                    const isScope = child.type === 'scope';
                    
                    return (
                      <motion.div 
                        key={cIdx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + (idx * 0.05) + (cIdx * 0.04) }}
                        className={`relative z-10 pl-10 transition-colors rounded-md ${
                          isHyp 
                            ? 'bg-[#0d1f1a] border border-teal-800/50 p-3 mt-2 mb-1' 
                            : isContext
                            ? 'bg-[#1a1408] border border-amber-900/30 p-2.5'
                            : isSignal
                            ? 'bg-transparent border border-[#1a1a1a] p-2 ml-4 opacity-70'
                            : 'bg-[#0a0a0a] border border-[#222] p-2.5 hover:border-gray-600 hover:bg-[#111]'
                        }`}
                      >
                        <div className="absolute left-6 top-1/2 w-4 h-px bg-[#333] -translate-y-1/2"></div>
                        <div className={`absolute left-[22px] top-1/2 w-1.5 h-1.5 rounded-full -translate-y-1/2 ${isHyp ? 'bg-teal-500' : isContext ? 'bg-amber-500' : 'bg-[#444]'}`}></div>

                        <div className="flex items-center gap-2">
                          {isHyp && <span className="text-[9px] font-mono text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded shrink-0">HYPOTHESIS</span>}
                          {isContext && <span className="text-[9px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">{child.context_type === 'visible_rival' ? 'RIVAL' : child.context_type === 'ghost_rival' ? 'GHOST' : 'TRIGGER'}</span>}
                          <h4 className={`text-xs font-medium ${isHyp ? 'text-teal-200' : isSignal ? 'text-gray-500' : 'text-gray-200'}`}>{child.label}</h4>
                        </div>
                        {child.description && !isSignal && (
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug">{child.description}</p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

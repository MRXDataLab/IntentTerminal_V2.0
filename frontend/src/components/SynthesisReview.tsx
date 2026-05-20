"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ArrowLeft, MessageSquare, Download, CheckCircle2, Network, ChevronUp, ChevronDown } from 'lucide-react';
import EcosystemMap from './EcosystemMap';
import EcosystemMapFlowchart from './EcosystemMapFlowchart';
import EcosystemMapMethodology from './EcosystemMapMethodology';
import EcosystemMap3D from './EcosystemMap3D';
import { SynthesisReviewProps } from './SynthesisReviewProps';

export default function SynthesisReview({ 
  interactionPayload, 
  briefText, 
  manifestData, 
  hypothesisManifest,
  onBack, 
  onConfirm, 
  onReject, 
  onDownloadBrief, 
  onDevBypassDiscovery,
}: SynthesisReviewProps) {
  
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [rejectionText, setRejectionText] = useState('');
  const [isBriefExpanded, setIsBriefExpanded] = useState(false);
  const [graphStyle, setGraphStyle] = useState<'knowledge' | 'knowledge3d' | 'flowchart' | 'methodology'>('knowledge3d');
  
  // Graph State lifted from EcosystemMap
  const [graphMetrics, setGraphMetrics] = useState<any>(null);
  const [showStrategicOverlay, setShowStrategicOverlay] = useState(false);

  // Strategic Overlay color palette (same as EcosystemMap)
  const FORCE_COLORS: Record<string, string> = {
    "Demand Gravity":          "#f59e0b",
    "Choice Architecture":     "#8b5cf6",
    "Value Elasticity":        "#14b8a6",
    "Reinforcement Stability": "#f43f5e",
    "Competitive Energy":      "#0ea5e9",
  };

  const handleReject = () => {
    onReject(rejectionText.trim() || undefined);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white overflow-hidden font-sans">
      
      {/* Top Header */}
      <div className="w-full px-6 py-4 border-b border-[#333] flex items-center justify-between z-20 bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center shrink-0">
             <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-10 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
             <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
          </div>
          <div className="w-px h-6 bg-[#333] mx-2"></div>
          <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-pulse"></div>
          <h1 className="text-lg font-medium tracking-wide text-gray-300">Synthesis Terminal</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">PHASE 2: METHODOLOGY</span>
          {onDevBypassDiscovery && (
            <button
              onClick={onDevBypassDiscovery}
              className="text-[10px] font-mono tracking-widest uppercase bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50 px-3 py-1.5 rounded transition-colors"
            >
              🧪 Skip to Discovery
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row-reverse overflow-hidden w-full relative">
        
        {/* Right Sidebar (Controls & Manifest) - Full Height */}
        <div className="w-[500px] shrink-0 h-full flex flex-col bg-[#0a0a0a] border-l border-[#222] overflow-y-auto custom-scrollbar z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-5 flex-1 space-y-6">
            
            {/* Category Graph Header */}
            <div className="flex items-center gap-2 text-gray-300">
              <Network className="text-blue-500" size={16} />
              <h2 className="text-sm font-medium tracking-wide">Category Graph</h2>
            </div>

            {/* Research Intent */}
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Research Intent</h4>
              <div className="bg-[#111] p-3 rounded-lg border border-[#222]">
                 <p className="text-[11px] text-gray-300 italic leading-relaxed break-words">{interactionPayload.intent}</p>
              </div>
            </div>

            {/* Core Problem Statement */}
            {graphMetrics?.rootNodeLabel && (
              <div>
                <h4 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Core Problem Statement</h4>
                <div className="bg-[#111] p-3 rounded-lg border border-[#222]">
                   <p className="text-[11px] text-gray-300 italic leading-relaxed break-words">{graphMetrics.rootNodeLabel}</p>
                </div>
              </div>
            )}

            {/* Graph Metrics */}
            <div className="space-y-3">
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400 text-xs">Relationships Mapped</span>
                  <span className="text-teal-400 font-mono text-xs">{graphMetrics ? graphMetrics.totalNodes : 0}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1 mt-1.5 overflow-hidden">
                  <div 
                    className="bg-teal-500 h-1 rounded-full transition-all duration-300" 
                    style={{ width: graphMetrics && graphMetrics.totalNodes > 0 ? `${(graphMetrics.analyzingNodes / graphMetrics.totalNodes) * 100}%` : '0%' }}
                  ></div>
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



            {/* Dynamic Legend */}
            <div>
              <h4 className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mb-2">
                {showStrategicOverlay ? "Strategic Forces" : "Key Hypotheses"}
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
                  graphMetrics?.categoriesLegend?.map((cat: any, idx: number) => (
                    <div key={cat.name} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2.5 mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-[11px] text-gray-200 font-medium flex-1">{cat.name}</span>
                        <span className="text-[9px] text-gray-500 font-mono">H{idx + 1}</span>
                      </div>
                      {cat.desc && (
                        <p className="text-[10px] text-gray-500 leading-snug ml-4.5 pl-0.5">{cat.desc}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-[#222] flex flex-col gap-3">
              <button 
                onClick={() => onConfirm(graphMetrics?.ecosystemNodeNames || [])} 
                disabled={!graphMetrics || graphMetrics.loading}
                className="w-full py-3 bg-teal-500 hover:bg-teal-400 disabled:bg-teal-900/50 disabled:text-teal-300/50 text-black text-sm font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} />
                Confirm Methodology
              </button>
              
              <AnimatePresence>
                {showRejectionInput && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="flex gap-2 mb-1">
                      <input
                        value={rejectionText}
                        onChange={(e) => setRejectionText(e.target.value)}
                        placeholder="What needs to change? (optional)"
                        className="flex-1 bg-black border border-red-900/40 focus:border-red-500/50 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleReject()}
                      />
                      <button onClick={handleReject} className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-medium rounded-lg transition-colors shrink-0">
                        Send
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => setShowRejectionInput(!showRejectionInput)}
                className="w-full py-2.5 bg-[#111] hover:bg-[#222] border border-[#333] hover:border-red-500/40 text-gray-400 hover:text-red-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <MessageSquare size={14} />
                Request Refinement
              </button>
            </div>
          </div>
        </div>

        {/* Left Area (Graph + Brief) */}
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-black">
          
          {/* Graph Engine Tabs */}
          <div className="absolute top-4 right-4 z-50 flex items-center bg-[#111]/80 backdrop-blur-md p-1 rounded-lg border border-[#333] shadow-lg">
            <button 
              onClick={() => setGraphStyle('knowledge3d')}
              className={`px-4 py-1.5 text-xs font-mono tracking-widest uppercase rounded-md transition-all ${graphStyle === 'knowledge3d' ? 'bg-teal-500/20 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
            >Knowledge Graph</button>
            <button 
              onClick={() => setGraphStyle('methodology')}
              className={`px-4 py-1.5 text-xs font-mono tracking-widest uppercase rounded-md transition-all ${graphStyle === 'methodology' ? 'bg-teal-500/20 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
            >Methodology</button>
          </div>

          {/* Top Section - Graph Canvas */}
          <div className={`w-full relative transition-all duration-500 ease-in-out ${isBriefExpanded ? 'h-[40%]' : 'h-[calc(100%-56px)]'}`}>
            
            {graphStyle === 'knowledge' && (
              <EcosystemMap
                intent={interactionPayload.intent}
                brief={briefText || undefined}
                hypothesisManifest={hypothesisManifest}
                onMapComplete={() => {}} 
                onBack={() => {}} 
                hideSidebar={true}
                strategicOverlayEnabled={showStrategicOverlay}
                onGraphMetrics={setGraphMetrics}
              />
            )}
            {graphStyle === 'knowledge3d' && (
              <EcosystemMap3D
                intent={interactionPayload.intent}
                brief={briefText || undefined}
                hypothesisManifest={hypothesisManifest}
                onMapComplete={() => {}}
                onBack={() => {}}
                hideSidebar={true}
                strategicOverlayEnabled={showStrategicOverlay}
                onGraphMetrics={setGraphMetrics}
              />
            )}
            {graphStyle === 'flowchart' && (
              <EcosystemMapFlowchart
                intent={interactionPayload.intent}
                brief={briefText || undefined}
                hypothesisManifest={hypothesisManifest}
                onMapComplete={() => {}} 
                onBack={() => {}} 
                hideSidebar={true}
                strategicOverlayEnabled={showStrategicOverlay}
                onGraphMetrics={setGraphMetrics}
              />
            )}
            {graphStyle === 'methodology' && (
              <EcosystemMapMethodology
                intent={interactionPayload.intent}
                brief={briefText || undefined}
                hypothesisManifest={hypothesisManifest}
                pillarExtractions={interactionPayload.pillarExtractions}
                template={interactionPayload.template}
                onMapComplete={() => {}}
                onBack={() => {}}
                hideSidebar={true}
                strategicOverlayEnabled={showStrategicOverlay}
                onGraphMetrics={setGraphMetrics}
              />
            )}
          </div>

          {/* Bottom Section - Strategic Brief */}
          <div className={`w-full bg-[#0d1f1a]/80 border-t border-teal-900/50 flex flex-col transition-all duration-500 ease-in-out shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 ${isBriefExpanded ? 'h-[60%]' : 'h-[56px] overflow-hidden'}`}>
            <div className="flex items-center justify-between px-6 h-[56px] shrink-0 border-b border-teal-900/30 bg-[#0a1411]">
              <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsBriefExpanded(!isBriefExpanded)}>
                <div className="p-1 rounded-md bg-teal-900/30 text-teal-400 group-hover:bg-teal-900/50 transition-colors">
                  {isBriefExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-teal-400 shrink-0" />
                  <span className="text-xs font-mono text-teal-500 uppercase tracking-widest">Strategic Brief</span>
                </div>
              </div>
              <button onClick={onDownloadBrief} className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs rounded-lg transition-colors flex items-center gap-2">
                <Download size={14} /> Download .md
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-black/40 custom-scrollbar">
              <div className="max-w-4xl">
                <pre className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                  {briefText ? briefText : 'Generating strategic brief...'}
                </pre>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

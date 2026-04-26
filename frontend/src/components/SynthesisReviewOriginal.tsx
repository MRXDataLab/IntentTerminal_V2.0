"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Activity, ArrowLeft, MessageSquare, CheckCircle2 } from 'lucide-react';
import EcosystemMap from './EcosystemMap';
import { SynthesisReviewProps } from './SynthesisReviewProps';

export default function SynthesisReviewOriginal({ 
  interactionPayload, 
  briefText, 
  manifestData, 
  onBack, 
  onConfirm, 
  onReject, 
  onDownloadBrief, 
  onDownloadManifest 
}: SynthesisReviewProps) {
  
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [rejectionText, setRejectionText] = useState('');

  const handleReject = () => {
    onReject(rejectionText.trim() || undefined);
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden relative">
      {/* Left Pane: Brief + Manifest Review */}
      <div className="w-1/2 h-full flex flex-col border-r border-[#222]">
        {/* Header */}
        <div className="p-5 border-b border-[#222] flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center shrink-0">
              <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-12 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
              <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
            </div>
            <div className="w-px h-6 bg-[#333]"></div>
            <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)] animate-pulse"></div>
            <h1 className="text-base font-medium tracking-wide text-gray-300">Synthesis Review</h1>
          </div>
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Module_2: Synthesis</span>
        </div>

        {/* Artifacts Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* North Star */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-violet-950/20 border border-violet-900/30 rounded-2xl p-4">
            <h4 className="text-xs text-violet-400 uppercase tracking-widest font-mono mb-2">Research Intent</h4>
            <p className="text-sm text-violet-50 leading-relaxed font-light italic">&quot;{interactionPayload.intent}&quot;</p>
          </motion.div>

          {/* Strategic Brief */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#0d1f1a] border border-teal-900/40 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-teal-400 shrink-0" />
                <span className="text-xs font-mono text-teal-500 uppercase tracking-widest">Strategic Research Brief</span>
              </div>
              <button onClick={onDownloadBrief} className="px-3 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs rounded-lg transition-colors">
                Download .md
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">{briefText}</pre>
            </div>
          </motion.div>

          {/* Manifest Summary */}
          {manifestData && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#0f1419] border border-blue-900/30 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-blue-400 shrink-0" />
                  <span className="text-xs font-mono text-blue-400 uppercase tracking-widest">Link Farming Manifest</span>
                </div>
                <button onClick={onDownloadManifest} className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs rounded-lg transition-colors">
                  Download .json
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-black/30 rounded-xl p-3">
                  <div className="text-2xl font-light text-blue-200">{manifestData.boolean_nets?.length || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Boolean Nets</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <div className="text-2xl font-light text-blue-200">{manifestData.signal_taxonomy?.length || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Signal Tags</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <div className="text-2xl font-light text-blue-200">{manifestData.entity_anchors?.tracked_competitors?.length || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Rivals Tracked</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Approval Actions */}
        <div className="p-5 border-t border-[#222] bg-[#0a0a0a] space-y-3 shrink-0">
          <AnimatePresence>
            {showRejectionInput && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="flex gap-2 mb-3">
                  <input
                    value={rejectionText}
                    onChange={(e) => setRejectionText(e.target.value)}
                    placeholder="What needs to change? (optional)"
                    className="flex-1 bg-black border border-red-900/40 focus:border-red-500/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleReject()}
                  />
                  <button onClick={handleReject} className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 text-sm rounded-lg transition-colors">
                    Send & Refine
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRejectionInput(!showRejectionInput)}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-500/40 text-gray-300 hover:text-red-400 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <MessageSquare size={14} />
              Request Refinement
            </button>
            <button
              onClick={() => {/* Approval will go to Category Graph in right pane */}}
              className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-400 text-black font-semibold text-sm rounded-xl transition-colors shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
              style={{ display: 'none' }} // Hidden — approval is via Category Graph confirm
            >
              <CheckCircle2 size={14} />
              Approve
            </button>
          </div>
        </div>
      </div>

      {/* Right Pane: Category Graph (Methodology Preview) */}
      <div className="w-1/2 h-full relative">
        <EcosystemMap
          intent={interactionPayload.intent}
          brief={briefText || undefined}
          onMapComplete={onConfirm}
          onBack={() => {}}
        />
      </div>
    </div>
  );
}

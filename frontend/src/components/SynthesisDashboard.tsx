"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, FileText, Activity, Network, CheckCircle2, XCircle, ArrowLeft, MessageSquare } from 'lucide-react';
import EcosystemMap from './EcosystemMap';
import LivingTruthMap from './LivingTruthMap';
import type { InteractionPayload } from '@/app/page';

type SynthesisStep = 'generating' | 'review' | 'truth_map';

interface SynthesisDashboardProps {
  interactionPayload: InteractionPayload;
  onComplete: (manifest: Record<string, any>) => void;
  onRejected: (rejectionContext?: string) => void;
  onBack: () => void;
}

export default function SynthesisDashboard({ interactionPayload, onComplete, onRejected, onBack }: SynthesisDashboardProps) {
  const [step, setStep] = useState<SynthesisStep>('generating');
  const [briefText, setBriefText] = useState<string | null>(null);
  const [manifestData, setManifestData] = useState<Record<string, any> | null>(null);
  const [graphNodes, setGraphNodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<string>('Initializing synthesis engine...');
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [rejectionText, setRejectionText] = useState('');

  // Auto-generate artifacts on mount
  useEffect(() => {
    const generate = async () => {
      try {
        // Step 1: Generate Strategic Brief
        setGenProgress('Generating Strategic Research Brief...');
        const briefRes = await axios.post('http://localhost:8000/api/generate-brief', {
          research_intent: interactionPayload.intent,
          parameters: interactionPayload.parameters,
          pillar_extractions: interactionPayload.pillarExtractions || undefined,
          context_document: interactionPayload.contextDocument || undefined,
          template: interactionPayload.template && interactionPayload.template !== 'none' ? interactionPayload.template : undefined,
        });
        setBriefText(briefRes.data.brief);

        // Step 2: Generate Link Farming Manifest
        setGenProgress('Building Link Farming Manifest...');
        try {
          const manifestRes = await axios.post('http://localhost:8000/api/generate-manifest', {
            research_intent: interactionPayload.intent,
            brief_text: briefRes.data.brief,
            pillar_extractions: interactionPayload.pillarExtractions || undefined,
            template: interactionPayload.template && interactionPayload.template !== 'none' ? interactionPayload.template : undefined,
          });
          setManifestData(manifestRes.data.manifest);
        } catch (manifestErr) {
          console.error('Manifest generation error (non-blocking)', manifestErr);
        }

        setGenProgress('Synthesis complete.');
        setTimeout(() => setStep('review'), 800);

      } catch (err) {
        console.error('Synthesis generation error', err);
        setError('Failed to generate synthesis artifacts. Please try again.');
      }
    };

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadBrief = () => {
    if (!briefText) return;
    const content = `# Outtlyr Strategic Research Brief\n\n**Research Intent:** ${interactionPayload.intent}\n\n---\n\n${briefText}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Outtlyr_Strategic_Brief.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadManifest = () => {
    if (!manifestData) return;
    const content = JSON.stringify(manifestData, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Outtlyr_Link_Farming_Manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Category Graph confirmed → move to Living Truth Map
  const handleMethodologyConfirmed = (nodes: string[]) => {
    setGraphNodes(nodes);
    setStep('truth_map');
  };

  // Living Truth Map approved → pass manifest to Module 3
  const handleTruthMapApproved = () => {
    if (manifestData) {
      onComplete(manifestData);
    }
  };

  const handleReject = () => {
    onRejected(rejectionText.trim() || undefined);
  };

  // ── Step 1: Generating Artifacts ──
  if (step === 'generating') {
    return (
      <div className="flex w-full h-screen bg-black text-white items-center justify-center flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.08)_0,transparent_50%)]"></div>

        {error ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 z-10">
            <XCircle size={48} className="text-red-500" />
            <h2 className="text-xl font-light text-red-200">{error}</h2>
            <button onClick={onBack} className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
              ← Back to Interaction Terminal
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6 z-10">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-2 border-violet-500/30 flex items-center justify-center">
                <Zap size={32} className="text-violet-400 animate-pulse" />
              </div>
              <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-violet-500/20 animate-ping"></div>
            </div>
            <h2 className="text-2xl font-light tracking-widest text-violet-50">SYNTHESIS ENGINE</h2>
            <p className="text-sm text-gray-400 font-mono">{genProgress}</p>
            <div className="flex gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-violet-500/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  // ── Step 3: Living Truth Map ──
  if (step === 'truth_map') {
    return (
      <LivingTruthMap
        intent={interactionPayload.intent}
        brief={briefText || undefined}
        manifest={manifestData || undefined}
        graphNodes={graphNodes}
        onMapApproved={handleTruthMapApproved}
        onBack={() => setStep('review')}
      />
    );
  }

  // ── Step 2: Review & Approval Gate ──
  return (
    <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden">

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
              <button onClick={handleDownloadBrief} className="px-3 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs rounded-lg transition-colors">
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
                <button onClick={handleDownloadManifest} className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs rounded-lg transition-colors">
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
          onMapComplete={handleMethodologyConfirmed}
          onBack={() => {}}
        />
      </div>
    </div>
  );
}

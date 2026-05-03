"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, FileText, Activity, Network, CheckCircle2, XCircle, ArrowLeft, MessageSquare } from 'lucide-react';
import EcosystemMap from './EcosystemMap';
import IntelligenceMap from './IntelligenceMap';
import type { InteractionPayload } from '@/app/page';
import SynthesisReview from './SynthesisReview';
import DiscoveryTerminal from './DiscoveryTerminal';
import ExtractionDashboard from './ExtractionDashboard';

type SynthesisStep = 'generating' | 'review' | 'discovery' | 'extraction_dashboard' | 'intelligence_map';

interface SynthesisDashboardProps {
  interactionPayload: InteractionPayload;
  onComplete: (manifest: Record<string, any>) => void;
  onRejected: (rejectionContext?: string) => void;
  onBack: (resolvedIntent?: string) => void;
}

export default function SynthesisDashboard({ interactionPayload, onComplete, onRejected, onBack }: SynthesisDashboardProps) {
  const [step, setStep] = useState<SynthesisStep>('generating');
  const [briefText, setBriefText] = useState<string | null>(null);
  const [manifestData, setManifestData] = useState<Record<string, any> | null>(null);
  const [graphNodes, setGraphNodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<string>('Initializing synthesis engine...');
  // When DEV_TEST_MOCK is used, we overwrite this with the real recorded intent
  const [resolvedIntent, setResolvedIntent] = useState<string>(interactionPayload.intent);

  // Auto-generate artifacts on mount
  useEffect(() => {
    // Clear cached graph and methodology data so fresh LLM calls use the latest prompts
    try {
      sessionStorage.removeItem('ecosystem_graph');
      sessionStorage.removeItem('methodology_data');
    } catch (_) { /* SSR safety */ }

    const generate = async () => {
      try {
        if (interactionPayload.intent === 'DEV_TEST_MOCK') {
          setGenProgress('DEV BYPASS: Fetching latest recorded run...');
          const bypassRes = await axios.get('http://localhost:8000/api/latest-run');
          const { intent, brief, manifest } = bypassRes.data;

          setResolvedIntent(intent);
          setBriefText(brief);
          setManifestData(manifest);

          setGenProgress('DEV BYPASS: Ready.');
          setTimeout(() => setStep('review'), 400);
          return;
        }

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
        } catch (manifestErr: any) {
          console.error('Manifest generation error (non-blocking): ' + (manifestErr.message || String(manifestErr)));
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

  // Category Graph confirmed → move to Discovery Terminal
  const handleMethodologyConfirmed = (nodes: string[]) => {
    setGraphNodes(nodes);
    setStep('discovery');
  };

  // Dev Bypass → skip straight to Discovery using cached manifest
  const handleDevBypassDiscovery = async () => {
    try {
      const bypassRes = await axios.get('http://localhost:8000/api/latest-run');
      const { intent, brief, manifest, graph } = bypassRes.data;
      setResolvedIntent(intent);
      setBriefText(brief);
      setManifestData(manifest);
      // Extract node names from cached graph
      const nodes = (graph.nodes || [])
        .filter((n: any) => n.type !== 'root')
        .map((n: any) => n.label || n.id);
      setGraphNodes(nodes);
      setStep('discovery');
    } catch (e) {
      console.error('Dev bypass failed:', e);
      alert('Dev bypass failed. Run a full live session first to generate cached data.');
    }
  };

  // Discovery complete → move to Intelligence Map
  const handleDiscoveryComplete = (results: any[]) => {
    // We now transition to the Extraction Dashboard instead of directly to Intelligence Map
    setStep('extraction_dashboard');
  };

  // Intelligence Map doesn't have an onComplete — it's the terminal step
  const handleTruthMapApproved = () => {
    if (manifestData) {
      onComplete(manifestData);
    }
  };

  const handleReject = () => {
    onRejected();
  };

  // ── Step 1: Generating Artifacts ──
  if (step === 'generating') {
    return (
      <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
        {/* Top Header (Persistent during load) */}
        <div className="w-full px-6 py-4 border-b border-[#333] flex items-center justify-between z-20 bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => onBack(resolvedIntent)} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center shrink-0">
              <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-10 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
              <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
            </div>
            <div className="w-px h-6 bg-[#333] mx-2"></div>
            <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-pulse"></div>
            <h1 className="text-lg font-medium tracking-wide text-gray-300">Synthesis Terminal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">PHASE 2: METHODOLOGY</span>
          </div>
        </div>

        {/* Loading Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center relative bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.08)_0,transparent_50%)]"></div>

          {error ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 z-10">
              <XCircle size={48} className="text-red-500" />
              <h2 className="text-xl font-light text-red-200">{error}</h2>
              <button onClick={() => onBack(resolvedIntent)} className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
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
      </div>
    );
  }

  // ── Step 2.5: Discovery Terminal ──
  if (step === 'discovery') {
    return (
      <DiscoveryTerminal
        manifest={manifestData || {}}
        intent={resolvedIntent}
        graphNodes={graphNodes}
        onComplete={handleDiscoveryComplete}
        onSkip={() => setStep('intelligence_map')}
        onBack={() => setStep('review')}
      />
    );
  }

  // ── Step 2.6: Extraction Dashboard ──
  if (step === 'extraction_dashboard') {
    return (
      <ExtractionDashboard
        onComplete={() => setStep('intelligence_map')}
        onBack={() => setStep('discovery')}
      />
    );
  }

  // ── Step 3: Outtlyr Intelligence Map ──
  if (step === 'intelligence_map') {
    return (
      <IntelligenceMap
        intent={resolvedIntent}
        brief={briefText || undefined}
        manifest={manifestData || undefined}
        graphNodes={graphNodes}
        onBack={() => setStep('review')}
      />
    );
  }

  // ── Step 2: Review & Approval Gate ──

  return (
    <div className="relative w-full h-full">
      <SynthesisReview
        interactionPayload={{ ...interactionPayload, intent: resolvedIntent }}
        briefText={briefText}
        manifestData={manifestData}
        onBack={() => onBack(resolvedIntent)}
        onConfirm={handleMethodologyConfirmed}
        onReject={onRejected}
        onDownloadBrief={handleDownloadBrief}
        onDownloadManifest={handleDownloadManifest}
        onDevBypassDiscovery={handleDevBypassDiscovery}
      />
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, CheckCircle2, Upload, Activity, LayoutTemplate, Zap, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InteractionPayload } from '@/app/page';

const STUDY_TEMPLATES = [
  { id: 'U&A',               label: 'U&A Study',            desc: 'Usage & Attitudes — behavioral patterns, occasions, drivers', color: '#f59e0b' },
  { id: 'Brand Health',      label: 'Brand Health',          desc: 'Awareness, perception gaps, NPS, share of mind',             color: '#8b5cf6' },
  { id: 'Market Entry',      label: 'Market Entry',          desc: 'Whitespace, sizing, regulatory readiness, go-to-market',     color: '#14b8a6' },
  { id: 'Competitive Pulse', label: 'Competitive Pulse',     desc: 'Competitor moves, pricing signals, talent migration',        color: '#0ea5e9' },
  { id: 'Erosion Study',     label: 'Erosion Study',         desc: 'Churn triggers, unmet needs, loyalty degradation',          color: '#f43f5e' },
  { id: 'Pricing & Value',   label: 'Pricing & Value',       desc: 'Price sensitivity, value justification, feature-to-cost debates', color: '#22d3ee' },
];

// Fallback first message if LLM is unavailable at template select
const TEMPLATE_FIRST_MESSAGE: Record<string, string> = {
  'U&A':               "Great — let's map out this Usage & Attitudes study. Which category or product are we studying, and what usage occasion do you believe is shifting?",
  'Brand Health':      "Let's track your brand health. Who is the primary rival stealing your mindshare right now?",
  'Market Entry':      "Let's assess market entry readiness. Which new market, geography, or category is on the radar, and what signal made you decide to explore it now?",
  'Competitive Pulse': "Time to get a competitive pulse. Which specific competitor has caught your attention, and what signals have you detected — a new launch, price move, or talent shift?",
  'Erosion Study':     "Let's diagnose the erosion. What specific metric is eroding — market share, volume, trial rate — and since when?",
  'Pricing & Value':   "Let's assess your pricing narrative. Is the brand relying on discounts to maintain volume, or does it have genuine narrative equity?",
};

type Message = {
  role: 'user' | 'agent';
  content: string;
  actions?: { label: string, value: string }[];
};

const READINESS_LABELS: { max: number, label: string, color: string }[] = [
  { max: 20,  label: 'VAGUE',       color: '#ef4444' },
  { max: 40,  label: 'EMERGING',    color: '#f97316' },
  { max: 60,  label: 'DEVELOPING',  color: '#f59e0b' },
  { max: 70,  label: 'CALIBRATING', color: '#3b82f6' },
  { max: 100, label: 'SATURATED',   color: '#10b981' },
];

function getReadinessLabel(score: number) {
  return READINESS_LABELS.find(r => score <= r.max) || READINESS_LABELS[READINESS_LABELS.length - 1];
}

interface IntakeTerminalProps {
  onInteractionComplete: (payload: InteractionPayload) => void;
  existingPayload?: InteractionPayload | null;
}

export default function IntakeTerminal({ onInteractionComplete, existingPayload }: IntakeTerminalProps) {
  const defaultMessages: Message[] = [
    { role: 'agent', content: 'Welcome to Outtlyr. Let us refine your research intent. What overarching topic or business anxiety would you like to explore?' }
  ];

  const [messages, setMessages] = useState<Message[]>(
    existingPayload?.chatHistory?.length ? existingPayload.chatHistory as Message[] : defaultMessages
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalIntent, setFinalIntent] = useState<string | null>(existingPayload?.isRefinement ? null : (existingPayload?.intent || null));
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(existingPayload?.template || null);
  const [contextLoaded, setContextLoaded] = useState<string | null>(existingPayload?.contextDocument || null);
  
  const [parameters, setParameters] = useState<{label: string, score: number}[]>(existingPayload?.parameters || []);
  const [overallReadiness, setOverallReadiness] = useState(
    existingPayload?.parameters?.length ? Math.round(existingPayload.parameters.reduce((a, p) => a + p.score, 0) / existingPayload.parameters.length) : 0
  );
  const [pillarExtractions, setPillarExtractions] = useState<Record<string, any> | null>(existingPayload?.pillarExtractions || null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, parameters]);

  // Refinement mode: inject the rejection context as a system message
  useEffect(() => {
    if (existingPayload?.isRefinement && existingPayload?.rejectionContext) {
      setMessages(prev => [
        ...prev,
        { role: 'agent', content: `🔄 **Refinement requested.** The client's feedback on the synthesis output:\n\n"${existingPayload.rejectionContext}"\n\nPlease provide additional context so we can refine the research parameters.` }
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    if (selectedTemplate === null) {
      setSelectedTemplate('none');
    }
    
    const userMsg: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', {
        messages: updatedMessages,
        fast_track: false,
        template: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
        current_scores: parameters.length > 0 ? parameters : undefined,
        current_extractions: pillarExtractions || undefined,
        context_document: contextLoaded || undefined,
      });
      
      if (res.data.is_finalized) {
        setFinalIntent(res.data.research_intent);
      }
      if (res.data.parameters && res.data.parameters.length > 0) {
        setParameters(res.data.parameters);
        setOverallReadiness(res.data.overall_readiness || 0);
      }
      if (res.data.pillar_extractions) {
        setPillarExtractions(res.data.pillar_extractions);
      }
      setMessages((prev) => [...prev, { role: 'agent', content: res.data.response }]);
    } catch (error: any) {
      console.error('Chat error', error);
      setMessages(updatedMessages.slice(0, -1));
      const errMsg = error?.response?.status === 500
        ? 'The AI is momentarily rate-limited. Please wait a few seconds and try again.'
        : 'Connection error. Please ensure the backend is running.';
      setMessages((prev) => [...prev, { role: 'agent', content: errMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Called when a study template card is clicked
  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplate(templateId);
    setIsLoading(true);
    const templateLabel = STUDY_TEMPLATES.find(t => t.id === templateId)?.label || templateId;
    const ackMessage: Message = {
      role: 'agent',
      content: `📋 Study type set to **${templateLabel}**. Let me ask you a few focused questions to calibrate the research scope.`
    };
    const messagesWithAck = [...messages, ackMessage];
    setMessages(messagesWithAck);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', {
        messages: messagesWithAck,
        fast_track: false,
        template: templateId,
        current_scores: parameters.length > 0 ? parameters : undefined,
        current_extractions: pillarExtractions || undefined,
        context_document: contextLoaded || undefined,
      });
      if (res.data.parameters && res.data.parameters.length > 0) {
        setParameters(res.data.parameters);
        setOverallReadiness(res.data.overall_readiness || 0);
      }
      if (res.data.pillar_extractions) {
        setPillarExtractions(res.data.pillar_extractions);
      }
      setMessages((prev) => [...prev, { role: 'agent', content: res.data.response }]);
    } catch {
      const fallback = TEMPLATE_FIRST_MESSAGE[templateId] || 'Tell me more about what you\'d like to explore.';
      setMessages((prev) => [...prev, { role: 'agent', content: fallback }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContextUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    // Set selectedTemplate to 'none' to exit the template selection screen
    if (selectedTemplate === null) setSelectedTemplate('none');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post('http://localhost:8000/api/upload-context', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const summary = res.data.context_summary;
      setContextLoaded(summary);

      const scanningMessages: Message[] = [
        ...messages,
        {
          role: 'agent',
          content: `📎 Document received: **"${file.name}"**\n🔍 Scanning and scoring against all 5 diagnostic pillars...`
        }
      ];
      setMessages(scanningMessages);

      const chatRes = await axios.post('http://localhost:8000/api/chat', {
        messages: scanningMessages,
        fast_track: false,
        template: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
        current_scores: parameters.length > 0 ? parameters : undefined,
        current_extractions: pillarExtractions || undefined,
        context_document: summary
      });

      const newParams: {label: string, score: number}[] = chatRes.data.parameters && chatRes.data.parameters.length > 0
        ? chatRes.data.parameters
        : parameters;
      const newReadiness = chatRes.data.overall_readiness || 0;

      if (chatRes.data.parameters && chatRes.data.parameters.length > 0) {
        setParameters(newParams);
      }
      setOverallReadiness(newReadiness);
      if (chatRes.data.pillar_extractions) {
        setPillarExtractions(chatRes.data.pillar_extractions);
      }

      if (chatRes.data.is_finalized && chatRes.data.research_intent) {
        setFinalIntent(chatRes.data.research_intent);
        setMessages([...scanningMessages, {
          role: 'agent',
          content: `✅ **Scan complete.** All pillars are sufficiently covered.\n\n${chatRes.data.response}`
        }]);
        setIsLoading(false);
        e.target.value = '';
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 900));

      const weakPillars  = newParams.filter(p => p.score < 70).map(p => p.label);
      const needsFineTuning = weakPillars.length > 0;

      const recommendationText = needsFineTuning
        ? `📊 Scan complete. The right panel shows your diagnostic scores.\n\n⚠️ **Fine-tuning recommended** — the following pillars are below 70%:\n${weakPillars.map(p => `• ${p}`).join('\n')}\n\nHow would you like to proceed?`
        : `📊 Scan complete. The right panel shows your diagnostic scores.\n\n✅ **Strong baseline** — all pillars are above the 70% threshold.\n\nYou can proceed directly to the Horizon Scan, or fine-tune for even higher precision.`;

      const decisionMsg: Message = {
        role: 'agent',
        content: recommendationText,
        actions: [
          {
            label: '▶ Proceed As-is',
            value: `proceed_as_is|||${chatRes.data.research_intent || ''}`
          },
          {
            label: needsFineTuning ? '✏️ Fine-tune Gaps' : '✏️ Fine-tune Further',
            value: 'fine_tune'
          }
        ]
      };

      setMessages([...scanningMessages, decisionMsg]);

    } catch (error) {
      console.error('Context upload error', error);
      setMessages(prev => [...prev, {
        role: 'agent',
        content: 'Failed to parse the uploaded file. Please try a .csv, .pdf, .txt or .md file.'
      }]);
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsLoading(true);
      try {
        const res = await axios.post('http://localhost:8000/api/chat', { 
          messages: messages, 
          fast_track: true, 
          template: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
          current_scores: parameters.length > 0 ? parameters : undefined,
          current_extractions: pillarExtractions || undefined,
          context_document: contextLoaded || undefined
        });
        if (res.data.is_finalized) {
          setFinalIntent(res.data.research_intent);
        }
        setParameters(res.data.parameters || []);
        setOverallReadiness(res.data.overall_readiness || 0);
        setMessages((prev) => [...prev, { role: 'agent', content: res.data.response }]);
      } catch (error) {
        console.error('Fast-track error', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDownloadIntent = () => {
    if (!finalIntent) return;
    
    let content = `# Research Intent Document\n\n`;
    content += `**North Star Statement:**\n${finalIntent}\n\n`;
    content += `## Diagnostic Pillars\n`;
    parameters.forEach(p => {
      content += `- **${p.label}**: ${p.score}/100\n`;
    });
    
    if (contextLoaded) {
      content += `\n## Baseline Context\n${contextLoaded}\n`;
    }

    if (pillarExtractions) {
      content += `\n## Extracted Data\n\`\`\`json\n${JSON.stringify(pillarExtractions, null, 2)}\n\`\`\`\n`;
    }

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Outtlyr_Intent_Document.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };




  const handleAction = async (value: string) => {
    setMessages(prev => prev.map((m, i) =>
      i === prev.length - 1 ? { ...m, actions: undefined } : m
    ));

    if (value.startsWith('proceed_as_is')) {
      const packedIntent = value.split('|||')[1]?.trim();

      if (packedIntent) {
        setFinalIntent(packedIntent);
        setMessages(prev => [...prev,
          { role: 'user', content: 'Proceed as-is' },
          { role: 'agent', content: '✅ Intent locked in. Initiating Horizon Scan with the extracted baseline.' }
        ]);
      } else {
        const userMsg: Message = { role: 'user', content: 'Proceed as-is' };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        try {
          const res = await axios.post('http://localhost:8000/api/chat', {
            messages: [...messages, userMsg],
            fast_track: false,
            template: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
            current_scores: parameters,
            current_extractions: pillarExtractions || undefined,
            context_document: contextLoaded || undefined
          });
          if (res.data.is_finalized) {
            setFinalIntent(res.data.research_intent);
          }
          if (res.data.pillar_extractions) {
            setPillarExtractions(res.data.pillar_extractions);
          }
          setMessages(prev => [...prev, { role: 'agent', content: res.data.response }]);
        } catch (error) {
          console.error('Action error', error);
        } finally {
          setIsLoading(false);
        }
      }
    } else if (value === 'fine_tune') {
      const userMsg: Message = { role: 'user', content: "Let's fine-tune the gaps." };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsLoading(true);
      try {
        const res = await axios.post('http://localhost:8000/api/chat', {
          messages: updatedMessages,
          fast_track: false,
          template: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
          current_scores: parameters,
          current_extractions: pillarExtractions || undefined,
          context_document: contextLoaded || undefined
        });
        if (res.data.parameters && res.data.parameters.length > 0) {
          setParameters(res.data.parameters);
          setOverallReadiness(res.data.overall_readiness || 0);
        }
        if (res.data.is_finalized) {
          setFinalIntent(res.data.research_intent);
        }
        if (res.data.pillar_extractions) {
          setPillarExtractions(res.data.pillar_extractions);
        }
        setMessages(prev => [...prev, { role: 'agent', content: res.data.response }]);
      } catch (error) {
        console.error('Fine-tune error', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const readinessInfo = getReadinessLabel(overallReadiness);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white overflow-hidden">
      
      {/* Full-Width Top Header */}
      <div className="w-full px-6 py-4 border-b border-[#333] flex items-center justify-between z-20 bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center shrink-0">
             <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-10 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
             <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
          </div>
          <div className="w-px h-6 bg-[#333] mx-2"></div>
          <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-pulse"></div>
          <h1 className="text-lg font-medium tracking-wide text-gray-300">Intake Terminal</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">PHASE 1: ALIGNMENT</span>
          <button
            onClick={() => onInteractionComplete({
              intent: 'DEV_TEST_MOCK',
              parameters: [
                { label: "Demand Gravity", score: 85 },
                { label: "Choice Architecture", score: 70 },
                { label: "Value Elasticity", score: 90 },
                { label: "Reinforcement Stability", score: 80 },
                { label: "Competitive Energy", score: 75 },
              ],
              pillarExtractions: null,
              contextDocument: null,
              template: "none",
              chatHistory: [],
              isRefinement: false,
            })}
            className="text-[10px] font-mono tracking-widest uppercase bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50 px-3 py-1.5 rounded transition-colors"
          >
            🧪 Dev Bypass
          </button>
        </div>
      </div>

      {/* Bottom Deck (Two Halves) */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Pane - Chat Interface */}
        <div className="w-1/2 h-full flex flex-col border-r border-[#333] relative">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'agent' ? 'bg-teal-900/40 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
                  {msg.role === 'agent' ? <Bot size={20} /> : <User size={20} />}
                </div>
                <div className={`px-5 py-3 rounded-2xl max-w-[80%] text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-white/10 text-white rounded-tr-sm' : 'bg-teal-950/20 text-teal-50 border border-teal-900/30 rounded-tl-sm'}`}>
                  {msg.content}
                  
                  {msg.actions && (
                    <div className="flex gap-2 mt-4">
                      {msg.actions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleAction(action.value)}
                          className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 rounded-lg text-xs font-medium text-teal-400 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-teal-900/40 flex items-center justify-center shrink-0 border border-teal-500/30 text-teal-400">
                  <Bot size={20} />
                </div>
                <div className="px-5 py-4 rounded-2xl bg-teal-950/20 border border-teal-900/30 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-500/50 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-teal-500/50 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-teal-500/50 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 border-t border-[#333] bg-[#111]">
          <div className="relative flex items-center">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Clarify your research intent..."
              className="w-full bg-black border border-[#333] hover:border-[#444] focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 rounded-xl px-5 py-4 pr-14 text-white placeholder-gray-600 outline-none transition-all disabled:opacity-40"
              disabled={!!finalIntent}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || !!finalIntent || isLoading}
              className="absolute right-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-teal-400 disabled:text-gray-600 disabled:hover:bg-transparent rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Pane - Visualisation & Output */}
      <div className="w-1/2 h-full bg-black relative flex flex-col items-center overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20"></div>
        
        <div className="z-10 w-full max-w-md flex-1 overflow-y-auto py-6 px-4">
          {selectedTemplate === null ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-2.5 w-full">
              <div className="text-center mb-3">
                <LayoutTemplate size={24} className="text-teal-500 mx-auto mb-2" />
                <h2 className="text-lg font-medium text-white">Select a Study Template</h2>
                <p className="text-xs text-gray-500 mt-1">Or upload an existing brief, or skip to free-form probing</p>
              </div>
              <div className="space-y-1.5">
                {STUDY_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t.id)}
                    className="w-full text-left p-3 rounded-xl border border-[#222] hover:border-[#444] bg-[#111] hover:bg-[#171717] transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <div>
                        <div className="text-sm font-medium text-white group-hover:text-teal-300 transition-colors">{t.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Path C: Upload an existing brief — PRIMARY entry option */}
              <label className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-teal-500/30 hover:border-teal-500/60 bg-teal-950/10 hover:bg-teal-950/20 text-teal-400 cursor-pointer transition-all">
                <Upload size={18} />
                <span className="text-sm font-medium">Upload an Existing Brief</span>
                <input type="file" accept=".csv,.pdf,.md,.txt" className="hidden" onChange={handleContextUpload} />
              </label>

              <button
                onClick={() => setSelectedTemplate('none')}
                className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-300 border border-[#1a1a1a] hover:border-[#333] rounded-xl transition-colors"
              >
                Skip — Begin without template
              </button>
            </motion.div>
          ) : (!finalIntent) ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col w-full space-y-6">
              
              {parameters.length > 0 && (
                <div className="flex flex-col items-center mb-6">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" stroke="#333" strokeWidth="8" fill="transparent" />
                      <circle 
                        cx="50" cy="50" r="42" 
                        stroke={readinessInfo.color} 
                        strokeWidth="8" fill="transparent" 
                        strokeDasharray={2 * Math.PI * 42}
                        strokeDashoffset={2 * Math.PI * 42 - (overallReadiness / 100) * (2 * Math.PI * 42)}
                        className="transition-all duration-1000 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-bold text-white">{overallReadiness}%</span>
                      <span className="text-[10px] font-mono uppercase tracking-widest mt-1" style={{ color: readinessInfo.color }}>{readinessInfo.label}</span>
                    </div>
                  </div>
                </div>
              )}

              {parameters.length > 0 ? (
                <div className="space-y-4 w-full bg-[#111] border border-[#222] p-5 rounded-2xl">
                  {parameters.map((param, idx) => {
                    const isSaturated = param.score >= 70;
                    return (
                      <div key={idx} className="flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-1.5 font-mono text-xs">
                           <span className={`uppercase tracking-wide flex items-center gap-1.5 ${isSaturated ? 'text-gray-500' : 'text-gray-300'}`}>
                             {param.label}
                             {isSaturated && <Check size={12} className="text-emerald-400" />}
                           </span>
                           <span className={`font-bold ${isSaturated ? 'text-emerald-400' : param.score >= 40 ? 'text-amber-400' : 'text-gray-500'}`}>{param.score}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }} 
                             animate={{ width: `${param.score}%` }} 
                             transition={{ duration: 0.8, ease: "easeOut" }}
                             className={`h-full rounded-full bg-gradient-to-r ${isSaturated ? 'from-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : param.score >= 40 ? 'from-amber-500 to-yellow-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'from-gray-600 to-gray-500'}`}
                           />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="w-24 h-24 rounded-full border border-dashed border-gray-600 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full border border-gray-700 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-light text-gray-400">Awaiting Alignment</h3>
                    <p className="text-sm text-gray-600 mt-2">Chat with the agent to solidify your research intent. The radar will track which dimensions still need detail.</p>
                  </div>
                </div>
              )}

              <div className="mt-8 pt-8 border-t border-[#222] w-full flex flex-col items-center">
                <p className="text-xs text-gray-500 mb-4 uppercase tracking-widest font-mono">Or fast-track with an existing document</p>
                <label className="flex items-center justify-center gap-2 px-6 py-3 bg-[#111] hover:bg-[#222] border border-[#333] hover:border-teal-500/50 text-gray-300 hover:text-teal-400 rounded-xl cursor-pointer transition-all">
                  <Upload size={18} />
                  <span className="text-sm font-medium">Upload Context (.csv, .pdf, .txt, .md)</span>
                  <input type="file" accept=".csv,.pdf,.md,.txt" className="hidden" onChange={handleContextUpload} />
                </label>
              </div>

            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5 w-full"
            >
              {/* Intent Locked Card */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 backdrop-blur-sm shadow-[0_0_50px_rgba(20,184,166,0.1)]">
                <div className="flex items-center gap-3 text-teal-400 mb-4">
                  <CheckCircle2 size={20} />
                  <h2 className="text-base font-medium tracking-wide text-white">Intent Locked</h2>
                </div>
                <h4 className="text-xs text-teal-500/60 uppercase tracking-widest font-mono mb-2">North Star Statement</h4>
                <p className="text-sm text-teal-50 leading-relaxed font-light italic">
                  &quot;{finalIntent || "Research intent calibrated and ready."}&quot;
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs font-mono text-gray-500">
                  <Activity size={12} />
                  Intent_Form.md saved
                </div>
              </div>

              {/* Proceed to Synthesis */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <button
                  onClick={handleDownloadIntent}
                  className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Activity size={14} />
                  Download Intent Document (.md)
                </button>
                <button
                  onClick={() => onInteractionComplete({
                    intent: finalIntent || '',
                    parameters,
                    pillarExtractions,
                    contextDocument: contextLoaded,
                    template: selectedTemplate,
                    chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
                    isRefinement: false,
                  })}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-xl transition-colors shadow-[0_0_20px_rgba(20,184,166,0.4)] flex items-center justify-center gap-2"
                >
                  <Zap size={16} />
                  Proceed to Synthesis
                </button>
              </motion.div>
            </motion.div>
          )}
        </div>
        </div>
      </div>

    </div>
  );
}

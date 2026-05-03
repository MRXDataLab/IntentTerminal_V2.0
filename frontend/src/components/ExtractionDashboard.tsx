"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Database, Zap, ArrowLeft, Network, Link as LinkIcon, Target } from 'lucide-react';

interface ExtractionDashboardProps {
  onComplete: () => void;
  onBack: () => void;
}

const MOCK_EVENTS = [
  "[Reddit] Extracted 42 comments from r/SwiggyDeliveryPartners",
  "[YouTube] Parsed transcript for 'Zomato vs Swiggy Unit Economics'",
  "[News] Mapped 12 articles to 'Value Elasticity Field'",
  "[Forums] Identified 8 high-signal complaints about platform fees",
  "[Twitter] Ingested 150 tweets regarding late deliveries",
  "[DuckDuckGo] Crawled 24 pages for 'Quick Commerce profitability'",
  "[Reddit] Mapped 18 signals to 'Demand Gravity'",
  "[Web] Extracted pricing models from top 5 competitor landing pages",
  "[YouTube] Analyzed sentiment of top 100 comments on Delivery vlog",
  "[Forums] Detected emerging narrative around 'Choice Architecture Pressure'",
  "[News] Ingested regulatory updates on gig worker rights",
  "[Web] Extracted feature sets from 3 parallel delivery apps",
  "[Twitter] Mapped 45 signals to 'Competitive Energy Field'",
  "[Reddit] Parsed 3 AMAs from former delivery executives",
  "[YouTube] Identified 6 key influencer opinions on platform algorithms",
];

export default function ExtractionDashboard({ onComplete, onBack }: ExtractionDashboardProps) {
  const [linksScraped, setLinksScraped] = useState(0);
  const [rawPoints, setRawPoints] = useState(0);
  const [forcesMapped, setForcesMapped] = useState(0);
  const [feed, setFeed] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  useEffect(() => {
    const TOTAL_DURATION = 10000; // 10 seconds
    const intervalMs = 150;
    let elapsed = 0;
    let eventIndex = 0;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      
      // Update counters organically
      setLinksScraped(prev => prev + Math.floor(Math.random() * 3));
      setRawPoints(prev => prev + Math.floor(Math.random() * 25));
      if (Math.random() > 0.7) {
        setForcesMapped(prev => prev + 1);
      }

      // Add to feed organically
      if (Math.random() > 0.6 && eventIndex < MOCK_EVENTS.length) {
        setFeed(prev => [...prev, MOCK_EVENTS[eventIndex % MOCK_EVENTS.length]]);
        eventIndex++;
      }

      if (elapsed >= TOTAL_DURATION) {
        clearInterval(timer);
        setIsFinished(true);
        // Final boost to make numbers look complete
        setLinksScraped(142);
        setRawPoints(3854);
        setForcesMapped(215);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <div className="w-full px-6 py-4 border-b border-[#333] flex items-center justify-between z-20 bg-[#0a0a0a]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center shrink-0">
            <img src="/outtlyr-logo.png" alt="Outtlyr" className="h-10 w-auto object-contain mr-3 shrink-0 bg-transparent" onError={(e) => { e.currentTarget.style.display='none' }} />
            <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">Outtlyr</span>
          </div>
          <div className="w-px h-6 bg-[#333] mx-2"></div>
          <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-pulse"></div>
          <h1 className="text-lg font-medium tracking-wide text-gray-300">Data Extraction Terminal</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">PHASE 4: INGESTION</span>
        </div>
      </div>

      <div className="flex-1 flex flex-row-reverse overflow-hidden">
        {/* Right Stats Column */}
        <div className="w-[380px] shrink-0 border-l border-[#222] bg-[#0a0a0a] p-8 flex flex-col justify-center space-y-8 relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="space-y-2">
            <h2 className="text-sm font-mono text-gray-500 uppercase tracking-widest mb-6">Extraction Telemetry</h2>
            
            <motion.div 
              className="bg-[#111] border border-[#222] rounded-xl p-5"
              animate={{ borderColor: isFinished ? '#333' : '#3b82f633' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <LinkIcon size={16} className="text-blue-500" />
                <span className="text-xs text-gray-400 font-mono uppercase">Links Scraped</span>
              </div>
              <div className="text-4xl font-light text-blue-400">{linksScraped.toLocaleString()}</div>
            </motion.div>

            <motion.div 
              className="bg-[#111] border border-[#222] rounded-xl p-5"
              animate={{ borderColor: isFinished ? '#333' : '#10b98133' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Database size={16} className="text-emerald-500" />
                <span className="text-xs text-gray-400 font-mono uppercase">Raw Data Points</span>
              </div>
              <div className="text-4xl font-light text-emerald-400">{rawPoints.toLocaleString()}</div>
            </motion.div>

            <motion.div 
              className="bg-[#111] border border-[#222] rounded-xl p-5"
              animate={{ borderColor: isFinished ? '#333' : '#f59e0b33' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Target size={16} className="text-amber-500" />
                <span className="text-xs text-gray-400 font-mono uppercase">Signals Mapped</span>
              </div>
              <div className="text-4xl font-light text-amber-400">{forcesMapped.toLocaleString()}</div>
            </motion.div>
          </div>

          <AnimatePresence>
            {isFinished && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8"
              >
                <button
                  onClick={onComplete}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
                >
                  <Zap size={16} />
                  Initiate Inference
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 relative bg-[#050505] flex flex-col">
          {/* Top: Glowing Animation */}
          <div className="flex-1 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.05)_0%,transparent_70%)]"></div>
            
            <div className="relative z-10 flex items-center justify-center">
              {/* Pulse rings */}
              {!isFinished && (
                <>
                  <motion.div 
                    className="absolute w-48 h-48 rounded-full border border-emerald-500/20"
                    animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                  />
                  <motion.div 
                    className="absolute w-48 h-48 rounded-full border border-emerald-500/20"
                    animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }}
                  />
                </>
              )}
              
              {/* Core */}
              <motion.div 
                className={`w-32 h-32 rounded-full border-2 flex items-center justify-center bg-[#0a0a0a] z-20 ${isFinished ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.2)]' : 'border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.2)]'}`}
                animate={!isFinished ? { boxShadow: ['0 0 20px rgba(16,185,129,0.2)', '0 0 60px rgba(16,185,129,0.5)', '0 0 20px rgba(16,185,129,0.2)'] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isFinished ? (
                  <Database size={40} className="text-amber-400" />
                ) : (
                  <Network size={40} className="text-emerald-400 animate-pulse" />
                )}
              </motion.div>
            </div>
          </div>

          {/* Bottom: Terminal Feed */}
          <div className="h-64 border-t border-[#222] bg-[#0a0a0a] p-6 font-mono text-xs overflow-hidden flex flex-col relative">
            <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10"></div>
            <div className="flex items-center gap-2 text-emerald-500 mb-4 shrink-0">
              <Zap size={14} />
              <span className="uppercase tracking-widest">{isFinished ? 'EXTRACTION COMPLETE' : 'LIVE EXTRACTION STREAM'}</span>
            </div>
            <div ref={feedRef} className="flex-1 overflow-y-auto space-y-2 text-gray-400 scroll-smooth pb-4 custom-scrollbar">
              <AnimatePresence initial={false}>
                {feed.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3"
                  >
                    <span className="text-[#333] shrink-0">[{new Date().toISOString().split('T')[1].slice(0,-1)}]</span>
                    <span className="text-gray-300">{msg}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!isFinished && (
                <div className="flex items-center gap-2 text-emerald-500/50 pt-2">
                  <span className="animate-pulse">_</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

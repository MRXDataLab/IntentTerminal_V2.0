"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud,
  Sparkles,
  Brain,
  Route,
  Server,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  cloud: <Cloud size={22} />,
  sparkles: <Sparkles size={22} />,
  brain: <Brain size={22} />,
  route: <Route size={22} />,
  server: <Server size={22} />,
};

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  available: boolean;
  active: boolean;
  placeholder?: boolean;
}

interface LLMProviderGateProps {
  onProviderSelected: () => void;
}

export default function LLMProviderGate({ onProviderSelected }: LLMProviderGateProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/llm-provider');
      setProviders(res.data.providers);
      setActiveProvider(res.data.active);
    } catch {
      setError('Could not reach backend. Ensure the API is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || !provider.available || provider.placeholder) return;

    setSelecting(providerId);
    setError(null);
    try {
      const res = await axios.post('http://localhost:8000/api/llm-provider', {
        provider_id: providerId,
      });
      setActiveProvider(res.data.provider);
      setProviders(res.data.providers);

      // Brief delay to show the activation animation
      setTimeout(() => {
        onProviderSelected();
      }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to select provider.');
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#050505]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 size={32} className="text-teal-500 animate-spin" />
          <span className="text-sm text-gray-500 font-mono uppercase tracking-widest">
            Connecting to engine...
          </span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-[#050505] overflow-hidden relative">
      {/* Ambient grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-15" />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.06)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-2xl px-6"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-4"
          >
            <div className="w-3 h-3 rounded-full bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.8)] animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-[0.3em] text-teal-500/80">
              MRX Engine
            </span>
          </motion.div>
          <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
            Select Inference Provider
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            Choose the LLM backend that will power all reasoning, extraction, and synthesis
            across the Outtlyr pipeline.
          </p>
        </div>

        {/* Provider Cards */}
        <div className="space-y-3">
          <AnimatePresence>
            {providers.map((provider, idx) => {
              const isSelecting = selecting === provider.id;
              const isActive = activeProvider === provider.id && !selecting;
              const isDisabled = !provider.available || provider.placeholder;
              const justActivated = selecting === provider.id && activeProvider === provider.id;

              return (
                <motion.button
                  key={provider.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + idx * 0.08, duration: 0.4 }}
                  onClick={() => handleSelect(provider.id)}
                  disabled={isDisabled || !!selecting}
                  className={`
                    w-full text-left p-4 rounded-2xl border transition-all duration-300
                    ${isDisabled
                      ? 'border-[#1a1a1a] bg-[#0a0a0a] opacity-40 cursor-not-allowed'
                      : isActive || justActivated
                        ? 'border-teal-500/50 bg-teal-950/20 shadow-[0_0_30px_rgba(20,184,166,0.1)]'
                        : 'border-[#222] bg-[#111] hover:border-[#444] hover:bg-[#161616] cursor-pointer'
                    }
                    group relative overflow-hidden
                  `}
                >
                  {/* Active glow stripe */}
                  {(isActive || justActivated) && (
                    <motion.div
                      layoutId="activeGlow"
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                      style={{ backgroundColor: provider.color }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}

                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div
                      className={`
                        w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                        transition-all duration-300
                        ${isActive || justActivated
                          ? 'text-white'
                          : isDisabled
                            ? 'text-gray-700'
                            : 'text-gray-400 group-hover:text-white'
                        }
                      `}
                      style={{
                        backgroundColor: isActive || justActivated
                          ? `${provider.color}20`
                          : 'rgba(255,255,255,0.03)',
                        borderWidth: 1,
                        borderColor: isActive || justActivated
                          ? `${provider.color}40`
                          : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      {ICON_MAP[provider.icon] || <Zap size={22} />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isDisabled ? 'text-gray-600' : 'text-white'
                          }`}
                        >
                          {provider.name}
                        </span>
                        {provider.placeholder && (
                          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                            Coming Soon
                          </span>
                        )}
                        {!provider.available && !provider.placeholder && (
                          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Needs Config
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {provider.description}
                      </p>
                    </div>

                    {/* Status indicator */}
                    <div className="shrink-0">
                      {isSelecting ? (
                        <Loader2 size={18} className="text-teal-400 animate-spin" />
                      ) : isActive || justActivated ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        >
                          <CheckCircle2 size={18} className="text-teal-400" />
                        </motion.div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[#333] group-hover:border-[#555] transition-colors" />
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Continue button — shown when a provider is active */}
        {activeProvider && !selecting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 flex flex-col items-center"
          >
            <button
              onClick={onProviderSelected}
              className="w-full py-3.5 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-xl transition-all shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:shadow-[0_0_40px_rgba(20,184,166,0.5)] flex items-center justify-center gap-2"
            >
              <Zap size={16} />
              Launch Intake Terminal
            </button>
            <p className="text-[10px] text-gray-600 mt-3 font-mono uppercase tracking-widest">
              Provider:{' '}
              <span className="text-gray-400">
                {providers.find(p => p.id === activeProvider)?.name || activeProvider}
              </span>
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

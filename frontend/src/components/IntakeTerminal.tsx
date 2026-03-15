"use client";

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Message = {
  role: 'user' | 'agent';
  content: string;
};

interface IntakeTerminalProps {
  onIntentFinalized: (intent: string) => void;
}

export default function IntakeTerminal({ onIntentFinalized }: IntakeTerminalProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: 'Welcome to MRX. Let us refine your research intent. What overarching topic or business anxiety would you like to explore?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalIntent, setFinalIntent] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', { messages: updatedMessages });
      
      if (res.data.is_finalized) {
        setFinalIntent(res.data.research_intent);
      }
      
      setMessages((prev) => [...prev, { role: 'agent', content: res.data.response }]);
    } catch (error) {
      console.error('Chat error', error);
      setMessages((prev) => [...prev, { role: 'agent', content: 'Connection Error. Please check backend.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-white overflow-hidden pb-10">
      
      {/* Left Pane - Chat Interface */}
      <div className="w-1/2 h-full flex flex-col border-r border-[#333] relative">
        <div className="p-6 border-b border-[#333] flex items-center justify-between z-10 bg-[#0a0a0a]/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
               <img src="/logo.png" alt="mrxdatalabs" className="h-6 w-auto object-contain mr-1 bg-white p-1 rounded-sm shrink-0" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
               <span className="hidden font-bold text-xl tracking-tight mr-1 text-white">mr<span className="text-[#cba358]">x</span>datalabs</span>
            </div>
            <div className="w-px h-6 bg-[#333] mx-2"></div>
            <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-pulse"></div>
            <h1 className="text-lg font-medium tracking-wide text-gray-300">Intake Terminal</h1>
          </div>
          <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Phase_1: Alignment</span>
        </div>

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
              className="w-full bg-black border border-[#333] hover:border-[#444] focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 rounded-xl px-5 py-4 pr-14 text-white placeholder-gray-600 outline-none transition-all"
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
      <div className="w-1/2 h-full bg-black relative flex flex-col justify-center items-center p-12">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20"></div>
        
        <div className="z-10 w-full max-w-lg">
          {!finalIntent ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center text-center space-y-6 opacity-40">
              <div className="w-24 h-24 rounded-full border border-dashed border-gray-600 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-gray-700 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-light text-gray-400">Awaiting Alignment</h3>
                <p className="text-sm text-gray-600 mt-2">Chat with the agent to solidify your research intent. The system requires a bulletproof &quot;Why&quot; before proceeding to Ecosystem Mapping.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-teal-950/20 border border-teal-500/30 rounded-2xl p-8 backdrop-blur-xl shadow-[0_0_50px_rgba(20,184,166,0.1)]"
            >
              <div className="flex items-center gap-3 text-teal-400 mb-6">
                <CheckCircle2 size={24} />
                <h2 className="text-xl font-medium tracking-wide text-white">Intent Finalized</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs text-teal-500/60 uppercase tracking-widest font-mono mb-2">North Star Statement</h4>
                  <p className="text-lg text-teal-50 leading-relaxed font-light">
                    &quot;{finalIntent}&quot;
                  </p>
                </div>
                
                <div className="pt-6 border-t border-teal-500/20 mt-6 flex justify-between items-center">
                  <div className="text-sm text-gray-400">Ready for Stage 2</div>
                  <button 
                    onClick={() => onIntentFinalized(finalIntent)}
                    className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-black font-medium rounded-lg transition-colors shadow-[0_0_15px_rgba(20,184,166,0.4)]"
                  >
                    Initiate Horizon Scan
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

    </div>
  );
}

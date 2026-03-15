"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Database, ShieldAlert, BarChart3, Radio, ArrowLeft } from 'lucide-react';

interface AuditDashboardProps {
  intent: string;
  onBeginIngestion: () => void;
  onBack: () => void;
}

export default function AuditDashboard({ intent, onBeginIngestion, onBack }: AuditDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        // We mock passing graph nodes from the previous step.
        // In reality, this would be the actual output of step 3.
        const mockNodes = ["Ola S1", "Ather 450", "TVS iQube", "Hero Vida", "Honda Activa"];
        const res = await axios.post('http://localhost:8000/api/discover', { graph_nodes: mockNodes });
        
        setTimeout(() => {
          setData(res.data);
          setLoading(false);
        }, 1500); // Simulate network/processing delay for UI impact
      } catch (e) {
        console.error("Failed to fetch sources", e);
        setLoading(false);
      }
    };
    fetchSources();
  }, []);

  if (loading) {
    return (
      <div className="flex w-full h-screen bg-black text-white items-center justify-center flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.1)_0,transparent_50%)]"></div>
        <Radio size={48} className="text-teal-500 animate-pulse mb-6" />
        <h2 className="text-2xl font-light tracking-widest text-teal-50">INITIATING LINK-FARM CRAWL</h2>
        <p className="text-gray-500 mt-2">Scouting and dipping across sources to measure signal...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen bg-[#050505] text-white p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#333] pb-6">
          <div className="flex items-start gap-4">
            <button onClick={onBack} className="mt-1.5 p-1.5 hover:bg-[#222] rounded-md text-gray-400 hover:text-white transition-colors border border-transparent hover:border-[#333]">
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center mb-4 shrink-0">
                 <img src="/logo.png" alt="mrxdatalabs" className="h-8 w-auto object-contain bg-white p-1.5 rounded-sm shrink-0" onError={(e) => { e.currentTarget.style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden') }} />
                 <span className="hidden font-bold text-2xl tracking-tight text-white ml-2">mr<span className="text-[#cba358]">x</span>datalabs</span>
              </div>
              <h1 className="text-3xl font-medium tracking-tight">Dipstick Audit & Scale Estimate</h1>
              <p className="text-sm text-gray-500 mt-2">Steps 4, 5 & 6 — Analyzing Signal Quality Before Heavy Ingestion</p>
            </div>
          </div>
          <button 
            onClick={onBeginIngestion}
            className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all flex items-center gap-2"
          >
            <Database size={18} />
            Commit to Ingestion Pipeline
          </button>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-4 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#111] p-6 rounded-2xl border border-[#222]">
            <h3 className="text-gray-400 text-sm font-medium mb-1">Total Sources Scraped</h3>
            <div className="text-4xl font-light text-white">{data?.total_sources_found}</div>
            <div className="text-xs text-gray-500 mt-2 line-clamp-1">Across Reddit, YouTube, Vahan</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-teal-950/20 p-6 rounded-2xl border border-teal-900/30">
            <h3 className="text-teal-400 text-sm font-medium mb-1">High-Signal Containers</h3>
            <div className="text-4xl font-light text-teal-50">{data?.approved_sources}</div>
            <div className="text-xs text-teal-600 mt-2">Passed Neutrality & Relevance test</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-blue-950/20 p-6 rounded-2xl border border-blue-900/30">
            <h3 className="text-blue-400 text-sm font-medium mb-1">Total Extractable Signals</h3>
            <div className="text-4xl font-light text-blue-50">{data?.scale_estimate?.extractable_data_points}</div>
            <div className="text-xs text-blue-600 mt-2">Estimated viable comments/blocks</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-orange-950/20 p-6 rounded-2xl border border-orange-900/30">
            <h3 className="text-orange-400 text-sm font-medium mb-1">Estimated Ingestion Time</h3>
            <div className="text-4xl font-light text-orange-50">{data?.scale_estimate?.estimated_time_to_ingest}</div>
            <div className="text-xs text-orange-600 mt-2">Calculated based on 50 signals/min</div>
          </motion.div>
        </div>

        {/* Audit Table */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="bg-[#111] rounded-2xl border border-[#222] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#222] bg-[#151515] flex items-center justify-between">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <BarChart3 size={18} className="text-teal-500" />
              Source Integrity Audit
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0a] text-gray-400 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Node / Topic</th>
                  <th className="px-6 py-4 font-medium">Platform</th>
                  <th className="px-6 py-4 font-medium">Neutrality</th>
                  <th className="px-6 py-4 font-medium">Relevance</th>
                  <th className="px-6 py-4 font-medium">Engagement</th>
                  <th className="px-6 py-4 font-medium">Signal Score</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {data?.sources?.map((src: any, index: number) => (
                  <tr key={index} className="hover:bg-[#151515] transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{src.node}</td>
                    <td className="px-6 py-4 text-gray-300">{src.platform}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${src.metrics.neutrality * 100}%` }}></div>
                        </div>
                        <span className="text-xs text-gray-400">{src.metrics.neutrality}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500" style={{ width: `${src.metrics.relevance * 100}%` }}></div>
                        </div>
                        <span className="text-xs text-gray-400">{src.metrics.relevance}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 font-mono text-xs">{src.metrics.engagement_density}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${src.signal_score >= 0.7 ? 'bg-teal-500/10 text-teal-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        {src.signal_score}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {src.status === 'APPROVED' ? (
                        <div className="flex items-center gap-1.5 text-teal-500 text-xs font-medium uppercase">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div> Approved
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium uppercase">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div> Rejected
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Risk Module Alert (Mocking Step 8 for UI demo) */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }} className="bg-red-950/10 border border-red-900/30 rounded-2xl p-6 flex items-start gap-4">
          <ShieldAlert className="text-red-500 mt-1 shrink-0" size={24} />
          <div>
            <h3 className="text-red-400 font-medium mb-1">Risk Detection Module Alert</h3>
            <p className="text-sm text-gray-400 leading-relaxed max-w-3xl">
              System has detected a blind spot in the proposed data pool: <strong className="text-red-300">&quot;We have high Consumer review data, but missing critical Delivery Partner perspectives heavily reliant on economy scooters.&quot;</strong> 
              <br/><br/>
               The orchestrator recommends adding subreddits like <span className="text-gray-300 font-mono">r/SwiggyDeliveryPartners</span> prior to triggering ingestion.
            </p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}

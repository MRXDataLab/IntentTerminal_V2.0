"use client";

import { useState } from 'react';
import IntakeTerminal from '@/components/IntakeTerminal';
import EcosystemMap from '@/components/EcosystemMap';
import AuditDashboard from '@/components/AuditDashboard';

export default function Home() {
  const [phase, setPhase] = useState<'intake' | 'ecosystem' | 'audit'>('intake');
  const [researchIntent, setResearchIntent] = useState<string>('');
  const [strategicBrief, setStrategicBrief] = useState<string>('');
  const [graphNodes, setGraphNodes] = useState<string[]>([]);

  const handleIntentFinalized = (intent: string, brief?: string) => {
    setResearchIntent(intent);
    setStrategicBrief(brief || '');
    setPhase('ecosystem');
  };

  const handleMapComplete = (nodes: string[]) => {
    setGraphNodes(nodes);
    setPhase('audit');
  };

  return (
    <main className="min-h-screen bg-black w-full overflow-hidden flex">
      {phase === 'intake' && <IntakeTerminal onIntentFinalized={handleIntentFinalized} />}
      {phase === 'ecosystem' && <EcosystemMap intent={researchIntent} brief={strategicBrief} onMapComplete={handleMapComplete} onBack={() => setPhase('intake')} />}
      {phase === 'audit' && <AuditDashboard intent={researchIntent} graphNodes={graphNodes} onBeginIngestion={() => alert('Starting step 7: Full Ingestion Setup...')} onBack={() => setPhase('ecosystem')} />}
    </main>
  );
}

"use client";

import { useState } from 'react';
import IntakeTerminal from '@/components/IntakeTerminal';
import EcosystemMap from '@/components/EcosystemMap';
import AuditDashboard from '@/components/AuditDashboard';

export default function Home() {
  const [phase, setPhase] = useState<'intake' | 'ecosystem' | 'audit'>('intake');
  const [researchIntent, setResearchIntent] = useState<string>('');

  const handleIntentFinalized = (intent: string) => {
    setResearchIntent(intent);
    setPhase('ecosystem');
  };

  return (
    <main className="min-h-screen bg-black w-full overflow-hidden flex">
      {phase === 'intake' && <IntakeTerminal onIntentFinalized={handleIntentFinalized} />}
      {phase === 'ecosystem' && <EcosystemMap intent={researchIntent} onMapComplete={() => setPhase('audit')} onBack={() => setPhase('intake')} />}
      {phase === 'audit' && <AuditDashboard intent={researchIntent} onBeginIngestion={() => alert('Starting step 7: Full Ingestion Setup...')} onBack={() => setPhase('ecosystem')} />}
    </main>
  );
}

"use client";

import { useState } from 'react';
import IntakeTerminal from '@/components/IntakeTerminal';
import SynthesisDashboard from '@/components/SynthesisDashboard';
import DiscoveryAudit from '@/components/DiscoveryAudit';

// Shared type for the payload passed from Module 1 → Module 2
export interface InteractionPayload {
  intent: string;
  parameters: { label: string; score: number }[];
  pillarExtractions: Record<string, any> | null;
  contextDocument: string | null;
  template: string | null;
  chatHistory: { role: 'user' | 'agent'; content: string }[];
  isRefinement: boolean;
  rejectionContext?: string;
}

export default function Home() {
  const [phase, setPhase] = useState<'interaction' | 'synthesis' | 'discovery'>('interaction');

  // Persisted across the approval loop — never wiped on rejection
  const [interactionPayload, setInteractionPayload] = useState<InteractionPayload | null>(null);

  // Module 2 → Module 3 bridge (manifest JSON only)
  const [manifestData, setManifestData] = useState<Record<string, any> | null>(null);

  // Module 1 → Module 2
  const handleInteractionComplete = (payload: InteractionPayload) => {
    setInteractionPayload(payload);
    setPhase('synthesis');
  };

  // Module 2 → Module 1 (REJECTION — back-loop for refinement)
  const handleSynthesisRejected = (rejectionContext?: string) => {
    setInteractionPayload(prev => prev ? {
      ...prev,
      isRefinement: true,
      rejectionContext,
    } : null);
    setPhase('interaction');
  };

  // Module 2 → Module 3 (APPROVAL — manifest is the sole bridge)
  const handleSynthesisApproved = (manifest: Record<string, any>) => {
    setManifestData(manifest);
    setPhase('discovery');
  };

  return (
    <main className="h-screen w-screen bg-black overflow-hidden flex">
      {phase === 'interaction' && (
        <IntakeTerminal
          onInteractionComplete={handleInteractionComplete}
          existingPayload={interactionPayload}
        />
      )}
      {phase === 'synthesis' && interactionPayload && (
        <SynthesisDashboard
          interactionPayload={interactionPayload}
          onComplete={handleSynthesisApproved}
          onRejected={handleSynthesisRejected}
          onBack={() => setPhase('interaction')}
        />
      )}
      {phase === 'discovery' && manifestData && (
        <DiscoveryAudit
          manifest={manifestData}
          onBeginIngestion={() => alert('Starting full ingestion pipeline...')}
          onBack={() => setPhase('synthesis')}
        />
      )}
    </main>
  );
}

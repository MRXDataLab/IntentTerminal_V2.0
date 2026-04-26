import { InteractionPayload } from '@/app/page';

export interface SynthesisReviewProps {
  interactionPayload: InteractionPayload;
  briefText: string | null;
  manifestData: Record<string, any> | null;
  onBack: () => void;
  onConfirm: (nodes: string[]) => void;
  onReject: (rejectionContext?: string) => void;
  onDownloadBrief: () => void;
  onDownloadManifest: () => void;
}

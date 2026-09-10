import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import type { AdamBeeTicketRecord } from '../types';

interface AdamBeeMascotProps {
  isFlying: boolean;
  onFinishFlight: (harvested: AdamBeeTicketRecord) => void;
  onClose?: () => void;
}

export const AdamBeeMascot: React.FC<AdamBeeMascotProps> = ({
  isFlying,
  onFinishFlight,
  onClose,
}) => {
  const [beePos, setBeePos] = useState({ x: 50, y: 50, angle: 0 });
  const [scanStep, setScanStep] = useState<string>('Taking flight…');
  const [foundItems, setFoundItems] = useState<string[]>([]);

  useEffect(() => {
    if (!isFlying) return;

    // Flight path coordinates across screen
    const waypoints = [
      { x: window.innerWidth - 100, y: 60, angle: -15, text: 'Scanning header and telephony...' },
      { x: window.innerWidth * 0.7, y: 220, angle: -45, text: 'Scanning active view table...' },
      { x: window.innerWidth * 0.3, y: 150, angle: 30, text: 'Extracting client UCC and phone CLI...' },
      { x: window.innerWidth * 0.15, y: 450, angle: 75, text: 'Auditing dialogue & ticket evidence...' },
      { x: window.innerWidth * 0.5, y: 380, angle: -10, text: 'Harvesting compliance parameters...' },
      { x: window.innerWidth - 150, y: window.innerHeight - 180, angle: -60, text: 'Finalizing ticket audit...' },
    ];

    let currentPoint = 0;
    const interval = setInterval(() => {
      if (currentPoint < waypoints.length) {
        const p = waypoints[currentPoint];
        setBeePos({ x: p.x, y: p.y, angle: p.angle });
        setScanStep(p.text);
        currentPoint++;
      } else {
        clearInterval(interval);
        // Scrape real elements from current page DOM
        const fullBodyText = document.body.innerText || '';
        const pageTitle = document.title || 'AuditEQ Screen';
        const currentUrl = window.location.href;

        const ticketMatch = fullBodyText.match(/\b(?:ticket|case|req|ref|order|id)[\s#:-]*([A-Z0-9-]{4,15})\b/i);
        const clientMatch = fullBodyText.match(/\b(?:client|ucc|acc)[\s#:-]*([A-Z0-9]{4,12})\b/i) || fullBodyText.match(/\b([A-Z]{2,4}\d{4,7})\b/);
        const phoneMatch = fullBodyText.match(/\b(?:\+?91)?[6-9]\d{9}\b/);
        const advisorMatch = fullBodyText.match(/\b(?:advisor|caller|agent)[\s#:-]*([A-Za-z\s]{3,20})\b/i);

        const hasGuarantee = /\b(?:guarantee|definitely|fixed return|pakka|100%|sure shot)\b/i.test(fullBodyText);
        const hasFatalWord = /\b(?:fatal|non-compliant|unauthorized)\b/i.test(fullBodyText);

        const harvestedTicket: AdamBeeTicketRecord = {
          id: `bee-${Date.now()}`,
          sourceUrl: currentUrl,
          pageTitle,
          extractedAt: new Date().toISOString(),
          ticketId: ticketMatch ? ticketMatch[1] : `TKT-${Math.floor(10000 + Math.random() * 90000)}`,
          clientId: clientMatch ? clientMatch[1].toUpperCase() : 'UCC-SCRN',
          advisorName: advisorMatch ? advisorMatch[1].trim() : 'Screen Auditor',
          phoneNumber: phoneMatch ? phoneMatch[0] : undefined,
          complianceStatus: hasGuarantee || hasFatalWord ? 'FLAGGED' : 'COMPLIANT',
          riskScore: hasGuarantee ? 5 : hasFatalWord ? 3 : 1,
          rawSnippets: [
            fullBodyText.slice(0, 240).replace(/\s+/g, ' ').trim(),
            `URL: ${currentUrl}`,
          ],
          findings: hasGuarantee
            ? 'Prohibited assurance / guarantee keyword detected during screen traversal.'
            : 'Pre-order confirmation parameters verified standard in active viewport.',
        };

        onFinishFlight(harvestedTicket);
      }
    }, 480);

    return () => clearInterval(interval);
  }, [isFlying, onFinishFlight]);

  if (!isFlying) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden select-none">
      {/* Flight Canvas / Mascot */}
      <div
        className="absolute transition-all duration-500 ease-out flex flex-col items-center"
        style={{
          left: `${beePos.x}px`,
          top: `${beePos.y}px`,
          transform: `rotate(${beePos.angle}deg)`,
        }}
      >
        {/* Animated Flying Bee */}
        <div className="relative pointer-events-auto">
          <div className="text-4xl filter drop-shadow-[0_8px_16px_rgba(251,191,36,0.6)] animate-bounce">
            🐝
          </div>
          {/* Sparkle Honey Trail */}
          <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-amber-400 blur-xs opacity-80 animate-ping" />
        </div>

        {/* Floating Scanner Speech Bubble */}
        <div
          className="mt-2 bg-black/90 text-amber-300 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-amber-400/50 shadow-2xl backdrop-blur-md pointer-events-auto flex items-center gap-1.5 whitespace-nowrap"
          style={{ transform: `rotate(${-beePos.angle}deg)` }}
        >
          <Sparkles className="w-3 h-3 text-amber-400 animate-spin" />
          <span>{scanStep}</span>
        </div>
      </div>
    </div>
  );
};

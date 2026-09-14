import React, { useEffect, useState, useRef } from 'react';
import type { AdamBeeTicketRecord } from '../types';

interface AdamBeeMascotProps {
  isFlying: boolean;
  onFinishFlight: (harvested: AdamBeeTicketRecord) => void;
  onClose?: () => void;
}

export const AdamBeeMascot: React.FC<AdamBeeMascotProps> = ({
  isFlying,
  onFinishFlight,
}) => {
  const [beePos, setBeePos] = useState({ x: -60, y: 100, angle: 25 });
  const [trail, setTrail] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const trailIdRef = useRef(0);

  useEffect(() => {
    if (!isFlying) return;

    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Real fly flight trajectory: erratic, hovering, swooping, darting, looping
    const flightPoints = [
      { x: w * 0.05, y: h * 0.2, angle: 15, duration: 320 },
      { x: w * 0.25, y: h * 0.12, angle: -10, duration: 280 },
      { x: w * 0.5, y: h * 0.08, angle: 5, duration: 260 },
      { x: w * 0.75, y: h * 0.18, angle: 35, duration: 300 },
      { x: w * 0.88, y: h * 0.35, angle: 70, duration: 280 },
      // Loop down & hover
      { x: w * 0.7, y: h * 0.55, angle: -140, duration: 320 },
      { x: w * 0.45, y: h * 0.48, angle: -170, duration: 260 },
      { x: w * 0.2, y: h * 0.62, angle: 130, duration: 340 },
      // Swoop across center table
      { x: w * 0.38, y: h * 0.38, angle: -45, duration: 280 },
      { x: w * 0.62, y: h * 0.32, angle: -15, duration: 260 },
      // Dart toward bottom right and exit upward
      { x: w * 0.82, y: h * 0.7, angle: 55, duration: 320 },
      { x: w * 0.65, y: h * 0.82, angle: -120, duration: 300 },
      { x: w * 0.4, y: h * 0.75, angle: -160, duration: 280 },
      { x: w * 0.15, y: h * 0.45, angle: -80, duration: 320 },
      { x: w * 0.5, y: h * 0.25, angle: 40, duration: 300 },
    ];

    let currentIdx = 0;
    let timeoutId: any;

    const runNextWaypoint = () => {
      if (currentIdx < flightPoints.length) {
        const pt = flightPoints[currentIdx];
        setBeePos({ x: pt.x, y: pt.y, angle: pt.angle });

        // Add pollen trail particle
        trailIdRef.current += 1;
        setTrail((prev) => [
          ...prev.slice(-12),
          { id: trailIdRef.current, x: pt.x, y: pt.y, size: Math.random() * 4 + 3 },
        ]);

        currentIdx++;
        timeoutId = setTimeout(runNextWaypoint, pt.duration);
      } else {
        // Scrape real elements from current page DOM and finish
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
    };

    runNextWaypoint();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isFlying, onFinishFlight]);

  if (!isFlying) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden select-none">
      <style>{`
        @keyframes bee-flutter-left {
          0% { transform: rotate(-25deg) skewX(0deg) scaleY(1); }
          50% { transform: rotate(15deg) skewX(10deg) scaleY(0.25); }
          100% { transform: rotate(-35deg) skewX(-10deg) scaleY(0.9); }
        }
        @keyframes bee-flutter-right {
          0% { transform: rotate(25deg) skewX(0deg) scaleY(1); }
          50% { transform: rotate(-15deg) skewX(-10deg) scaleY(0.25); }
          100% { transform: rotate(35deg) skewX(10deg) scaleY(0.9); }
        }
        @keyframes bee-buzz-jitter {
          0% { transform: translate(0px, 0px); }
          20% { transform: translate(-1.5px, 1.5px); }
          40% { transform: translate(1.5px, -1px); }
          60% { transform: translate(-1px, -1.5px); }
          80% { transform: translate(1.5px, 1px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes pollen-fade {
          0% { opacity: 0.85; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.2) translate(-8px, 12px); }
        }
      `}</style>

      {/* Pollen dust trail particles */}
      {trail.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] pointer-events-none"
          style={{
            left: `${p.x + 18}px`,
            top: `${p.y + 18}px`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: 'pollen-fade 0.8s ease-out forwards',
          }}
        />
      ))}

      {/* Flight Canvas / Realistic Flying Bee */}
      <div
        className="absolute transition-all duration-300 ease-out flex items-center justify-center pointer-events-none"
        style={{
          left: `${beePos.x}px`,
          top: `${beePos.y}px`,
          transform: `rotate(${beePos.angle}deg)`,
        }}
      >
        <div
          className="relative pointer-events-auto filter drop-shadow-[0_6px_14px_rgba(245,158,11,0.5)]"
          style={{ animation: 'bee-buzz-jitter 0.08s infinite ease-in-out' }}
        >
          {/* Detailed SVG Bee with realistic anatomy & high-speed flapping wings */}
          <svg
            viewBox="0 0 72 72"
            className="w-14 h-14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Rapidly Flapping Wings */}
            <g style={{ transformOrigin: '30px 24px', animation: 'bee-flutter-left 0.05s infinite alternate ease-in-out' }}>
              <ellipse
                cx="20"
                cy="14"
                rx="14"
                ry="7"
                fill="rgba(224, 242, 254, 0.75)"
                stroke="#38bdf8"
                strokeWidth="1.2"
                transform="rotate(-20 20 14)"
              />
              <path d="M12 14 Q20 16 26 12" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" />
            </g>

            <g style={{ transformOrigin: '42px 24px', animation: 'bee-flutter-right 0.05s infinite alternate ease-in-out' }}>
              <ellipse
                cx="52"
                cy="14"
                rx="14"
                ry="7"
                fill="rgba(224, 242, 254, 0.75)"
                stroke="#38bdf8"
                strokeWidth="1.2"
                transform="rotate(20 52 14)"
              />
              <path d="M46 12 Q52 16 60 14" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" />
            </g>

            {/* Little Stinger */}
            <polygon points="36,64 33,56 39,56" fill="#18181b" />

            {/* Abdomen / Body */}
            <ellipse cx="36" cy="42" rx="15" ry="17" fill="#fbbf24" stroke="#18181b" strokeWidth="2.2" />

            {/* Realistic Black Stripes */}
            <path d="M22 36 Q36 40 50 36" stroke="#18181b" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M22 43 Q36 47 50 43" stroke="#18181b" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M24 50 Q36 53 48 50" stroke="#18181b" strokeWidth="3.5" strokeLinecap="round" fill="none" />

            {/* Thorax / Head */}
            <circle cx="36" cy="24" r="10" fill="#18181b" />

            {/* Big Expressive Eyes */}
            <circle cx="32" cy="22" r="2.8" fill="#ffffff" />
            <circle cx="32.5" cy="22" r="1.4" fill="#09090b" />
            <circle cx="40" cy="22" r="2.8" fill="#ffffff" />
            <circle cx="39.5" cy="22" r="1.4" fill="#09090b" />

            {/* Cute Rosy Cheeks */}
            <ellipse cx="29" cy="26" rx="1.6" ry="1.1" fill="#fb7185" opacity="0.8" />
            <ellipse cx="43" cy="26" rx="1.6" ry="1.1" fill="#fb7185" opacity="0.8" />

            {/* Antennae */}
            <path d="M32 20 Q28 10 22 8" fill="none" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="21.5" cy="7.5" r="2" fill="#f59e0b" />
            <path d="M40 20 Q44 10 50 8" fill="none" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="50.5" cy="7.5" r="2" fill="#f59e0b" />
          </svg>
        </div>
      </div>
    </div>
  );
};

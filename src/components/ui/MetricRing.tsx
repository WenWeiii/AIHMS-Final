import React from 'react';
import { cn } from '@/src/lib/utils';

interface MetricRingProps {
  progress: number;
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
  status?: 'normal' | 'warning' | 'critical';
  onClick?: () => void;
}

export const MetricRing: React.FC<MetricRingProps> = ({ progress, icon, label, value, className, status = 'normal', onClick }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const getStatusColors = () => {
    switch (status) {
      case 'critical': return { stop1: '#4e3500', stop2: '#755754', text: 'text-tertiary' };
      case 'warning': return { stop1: '#4e3500', stop2: '#ffdeaa', text: 'text-tertiary' };
      default: return { stop1: '#00440c', stop2: '#195c1f', text: 'text-primary' };
    }
  };

  const colors = getStatusColors();
  const gradientId = `gradient-${(label || 'metric').replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-surface-container-highest rounded-2xl p-6 flex flex-col items-center shadow-ambient transition-all", 
        onClick && "cursor-pointer hover:bg-surface-container-high active:scale-95",
        className
      )}
    >
      <div className="relative w-24 h-24 mb-4">
        <svg className="w-full h-full -rotate-90">
          <circle
            className="text-tertiary-fixed"
            cx="48"
            cy="48"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
          />
          <circle
            className="transition-all duration-1000 ease-out"
            cx="48"
            cy="48"
            fill="transparent"
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: colors.stop1 }} />
              <stop offset="100%" style={{ stopColor: colors.stop2 }} />
            </linearGradient>
          </defs>
        </svg>
        <div className={cn("absolute inset-0 flex items-center justify-center", colors.text)}>
          {icon}
        </div>
      </div>
      <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-[0.1em] font-bold">{label}</span>
      <span className="text-xl font-headline text-on-surface font-extrabold">{value}</span>
    </div>
  );
};

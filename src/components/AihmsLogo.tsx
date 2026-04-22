import React from 'react';
import { cn } from '@/src/lib/utils';

export const AihmsLogo = ({ className, colored = false }: { className?: string; colored?: boolean }) => {
  return (
    <svg 
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={cn("w-full h-full", className)}
    >
      <path 
        fill={colored ? "#ffffff" : "currentColor"}
        d="M 100 20 
           L 60 100 
           L 70 120 
           L 100 60 
           L 140 140 
           L 60 140 
           L 62 136 
           L 52 116 
           L 30 160 
           L 170 160 
           Z" 
      />
    </svg>
  );
};

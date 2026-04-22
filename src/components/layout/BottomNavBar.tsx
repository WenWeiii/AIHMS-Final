import React from 'react';
import { Home, BarChart2, MessageSquare, Calendar, Users, Settings, HeartHandshake, Shield, User } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Screen } from '@/src/types';
import { useTranslation } from '../LanguageProvider';
import { useFirebase } from '../FirebaseProvider';

interface BottomNavBarProps {
  activeScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeScreen, onScreenChange }) => {
  const { t } = useTranslation();
  const { profile } = useFirebase();
  const role = profile?.role || 'patient';

  const navItems = [
    { id: 'dashboard' as Screen, label: t('nav.dashboard'), icon: Home, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'insights' as Screen, label: t('nav.insights'), icon: BarChart2, roles: ['caregiver', 'admin'] },
    { id: 'chat' as Screen, label: t('nav.chat'), icon: MessageSquare, roles: ['patient', 'admin'] },
    { 
      id: 'health-circle' as Screen, 
      label: role === 'caregiver' ? t('nav.health_circle_caregiver') : t('nav.health_circle_patient'), 
      icon: role === 'caregiver' ? User : HeartHandshake, 
      roles: ['patient', 'caregiver', 'admin'] 
    },
    { id: 'calendar' as Screen, label: t('nav.calendar'), icon: Calendar, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'community' as Screen, label: t('nav.community'), icon: Users, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'settings' as Screen, label: t('nav.settings'), icon: Settings, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'admin' as Screen, label: 'Admin', icon: Shield, roles: ['admin'] },
  ].filter(item => item.roles.includes(role));

  return (
    <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-lg">
      <div className="glass-nav rounded-3xl py-3 px-4 flex justify-around items-center shadow-ambient">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onScreenChange(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-500 relative min-w-[48px]",
                isActive ? "text-primary" : "text-on-surface-variant/40 hover:text-primary/60"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all duration-500 flex items-center justify-center",
                isActive ? "bg-primary/10 shadow-sm" : "bg-transparent"
              )}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={cn(
                "text-[9px] font-headline font-black tracking-widest uppercase transition-all duration-500",
                isActive ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute -bottom-4"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

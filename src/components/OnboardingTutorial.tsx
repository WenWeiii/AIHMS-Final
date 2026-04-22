import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Activity, Brain, MessageSquare, ChevronRight, X, Sparkles, Users, HeartHandshake, ShieldCheck } from 'lucide-react';
import { Screen, UserRole } from '../types';
import { useFirebase } from './FirebaseProvider';
import { cn } from '../lib/utils';
import { useTranslation } from './LanguageProvider';

interface Step {
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
  screen: Screen;
  target?: string;
  isRoleSelection?: boolean;
}

const steps: Step[] = [
  {
    titleKey: "onboarding.welcome",
    descriptionKey: "onboarding.welcome_desc",
    icon: <Plus size={48} className="text-primary" />,
    screen: 'dashboard'
  },
  {
    titleKey: "onboarding.vitals_title",
    descriptionKey: "onboarding.vitals_desc",
    icon: <Activity size={48} className="text-primary" />,
    screen: 'dashboard'
  },
  {
    titleKey: "onboarding.analysis_title",
    descriptionKey: "onboarding.analysis_desc",
    icon: <Brain size={48} className="text-secondary" />,
    screen: 'insights'
  },
  {
    titleKey: "onboarding.chat_title",
    descriptionKey: "onboarding.chat_desc",
    icon: <MessageSquare size={48} className="text-tertiary" />,
    screen: 'chat'
  }
];

interface OnboardingTutorialProps {
  onScreenChange: (screen: Screen) => void;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ onScreenChange }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { completeOnboarding, hasCompletedOnboarding, setRole, profile } = useFirebase();
  const { t } = useTranslation();

  if (hasCompletedOnboarding) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onScreenChange(steps[nextStep].screen);
    } else {
      completeOnboarding();
    }
  };

  const step = steps[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 40 }}
          className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl border border-primary/10 overflow-hidden"
        >
          {/* Background Sparkle */}
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
          
          <div className="relative z-10 space-y-8">
            <div className="flex justify-between items-start">
              <div className="w-20 h-20 bg-surface-container-highest rounded-3xl flex items-center justify-center shadow-sm">
                {step.icon}
              </div>
              <button 
                onClick={completeOnboarding}
                className="p-2 text-outline hover:text-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-tertiary" />
                <span className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-tertiary">{t('onboarding.tutorial')}</span>
              </div>
              <h3 className="text-4xl font-headline font-black text-primary leading-tight tracking-tighter">
                {t(step.titleKey)}
              </h3>
              <p className="text-on-surface-variant text-lg leading-relaxed">
                {t(step.descriptionKey)}
              </p>
            </div>

            {step.isRoleSelection && (
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setRole('patient')}
                  className={cn(
                    "group p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 relative overflow-hidden",
                    profile?.role === 'patient' 
                      ? "border-primary bg-primary/5 shadow-ambient" 
                      : "border-outline/10 hover:border-primary/40 bg-surface-container-highest/20"
                  )}
                >
                  {profile?.role === 'patient' && (
                    <motion.div 
                      layoutId="selection-glow"
                      className="absolute inset-0 bg-primary/5 blur-xl -z-10"
                    />
                  )}
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
                    profile?.role === 'patient' ? "bg-primary text-on-primary" : "bg-surface-container-highest text-outline group-hover:text-primary"
                  )}>
                    <HeartHandshake size={32} />
                  </div>
                  <div className="text-center">
                    <span className="block font-headline font-black uppercase tracking-widest text-[10px]">{t('onboarding.patient')}</span>
                    <span className="text-[8px] opacity-40 font-headline font-bold uppercase tracking-tight">{t('settings.role_patient')}</span>
                  </div>
                </button>
                <button 
                  onClick={() => setRole('caregiver')}
                  className={cn(
                    "group p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 relative overflow-hidden",
                    profile?.role === 'caregiver' 
                      ? "border-tertiary bg-tertiary/5 shadow-ambient" 
                      : "border-outline/10 hover:border-tertiary/40 bg-surface-container-highest/20"
                  )}
                >
                  {profile?.role === 'caregiver' && (
                    <motion.div 
                      layoutId="selection-glow"
                      className="absolute inset-0 bg-tertiary/5 blur-xl -z-10"
                    />
                  )}
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
                    profile?.role === 'caregiver' ? "bg-tertiary text-on-tertiary" : "bg-surface-container-highest text-outline group-hover:text-tertiary"
                  )}>
                    <ShieldCheck size={32} />
                  </div>
                  <div className="text-center">
                    <span className="block font-headline font-black uppercase tracking-widest text-[10px]">{t('onboarding.caregiver')}</span>
                    <span className="text-[8px] opacity-40 font-headline font-bold uppercase tracking-tight">{t('settings.role_caregiver')}</span>
                  </div>
                </button>
              </div>
            )}

            <div className="pt-4 flex items-center justify-between">
              <div className="flex gap-2">
                {steps.map((_, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      i === currentStep ? "w-8 bg-primary" : "w-2 bg-outline/20"
                    )}
                  />
                ))}
              </div>
              
              <button 
                onClick={handleNext}
                className="signature-gradient text-on-primary px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-ambient flex items-center gap-3 hover:scale-105 active:scale-95 transition-all"
              >
                <span>{currentStep === steps.length - 1 ? t('onboarding.start') : t('onboarding.next')}</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

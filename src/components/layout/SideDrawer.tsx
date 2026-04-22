import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Info, HelpCircle, LogOut, ChevronRight, Home, BarChart2, MessageSquare, HeartHandshake, Calendar, Users, Settings, ShieldCheck, User, MessageSquareHeart } from 'lucide-react';
import { useFirebase } from '../FirebaseProvider';
import { useTranslation } from '../LanguageProvider';
import { AihmsLogo } from '../AihmsLogo';
import { Screen } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { FeedbackModal } from '../ui/FeedbackModal';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onScreenChange: (screen: Screen) => void;
  activeScreen: Screen;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, onScreenChange, activeScreen }) => {
  const { user, profile, signOut } = useFirebase();
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [sosStatus, setSosStatus] = useState<'idle' | 'triggering' | 'sent'>('idle');

  const isAdminEmail = user?.email === 'ongyh123@gmail.com' || user?.email === 'shumww1@gmail.com';

  const navItems = [
    { id: 'dashboard' as Screen, label: t('nav.dashboard'), icon: Home, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'insights' as Screen, label: t('nav.insights'), icon: BarChart2, roles: ['caregiver', 'admin'] },
    { id: 'chat' as Screen, label: t('nav.chat'), icon: MessageSquare, roles: ['patient', 'admin'] },
    { 
      id: 'health-circle' as Screen, 
      label: profile?.role === 'caregiver' ? t('nav.health_circle_caregiver') : t('nav.health_circle_patient'), 
      icon: profile?.role === 'caregiver' ? User : HeartHandshake, 
      roles: ['patient', 'caregiver', 'admin'] 
    },
    { id: 'calendar' as Screen, label: t('nav.calendar'), icon: Calendar, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'community' as Screen, label: t('nav.community'), icon: Users, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'settings' as Screen, label: t('nav.settings'), icon: Settings, roles: ['patient', 'caregiver', 'admin'] },
    { id: 'admin' as Screen, label: 'Admin Control', icon: ShieldCheck, roles: ['admin'] },
  ].filter(item => isAdminEmail || item.roles.includes(profile?.role || 'patient'));

  const handleNavClick = (id: Screen) => {
    onScreenChange(id);
    onClose();
  };

  const handleTriggerSOS = () => {
    setSosStatus('triggering');
    // Simulate SOS dispatch delay before showing success
    setTimeout(() => {
      setSosStatus('sent');
    }, 2000);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-on-surface/20 backdrop-blur-sm z-[60]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-surface z-[70] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center">
                  <AihmsLogo className="text-primary w-12 h-12" />
                </div>
                <div>
                  <h2 className="font-headline font-black text-primary uppercase tracking-tighter">AIHMs</h2>
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">Guardian v1.0</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container-low rounded-xl transition-all text-outline"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Emergency Section */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-headline font-black text-outline uppercase tracking-[0.2em] ml-2">
                  {t('drawer.emergency_title') || 'Emergency Actions'}
                </h3>
                <button 
                  onClick={() => setShowSOS(true)}
                  className="w-full bg-tertiary text-on-tertiary p-6 rounded-3xl flex items-center gap-4 shadow-lg shadow-tertiary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <div className="bg-white/20 p-2 rounded-xl">
                    <ShieldAlert size={28} />
                  </div>
                  <div className="text-left">
                    <p className="font-headline font-black text-lg leading-tight">{t('drawer.sos_button') || 'Trigger SOS'}</p>
                    <p className="text-xs opacity-70">{t('drawer.sos_desc') || 'Alert all trusted contacts'}</p>
                  </div>
                </button>
              </section>

              {/* Navigation Section */}
              <section className="space-y-2">
                <h3 className="text-[10px] font-headline font-black text-outline uppercase tracking-[0.2em] ml-2 mb-4">
                  {t('drawer.navigation_title') || 'Main Menu'}
                </h3>
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl transition-all group",
                      activeScreen === item.id 
                        ? "bg-primary/5 text-primary" 
                        : "hover:bg-surface-container-low text-on-surface-variant"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-2 rounded-xl transition-all",
                        activeScreen === item.id ? "bg-primary/10" : "bg-surface-container-highest group-hover:bg-surface-container-high"
                      )}>
                        <item.icon size={20} strokeWidth={activeScreen === item.id ? 2.5 : 2} />
                      </div>
                      <span className="font-headline font-bold">{item.label}</span>
                    </div>
                    <ChevronRight size={16} className={cn(
                      "transition-all",
                      activeScreen === item.id ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"
                    )} />
                  </button>
                ))}
              </section>

              {/* Support Section */}
              <section className="space-y-2">
                <h3 className="text-[10px] font-headline font-black text-outline uppercase tracking-[0.2em] ml-2 mb-4">
                  {t('drawer.support_title') || 'Support & Info'}
                </h3>
                <button 
                  onClick={() => setShowHelp(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container-low text-on-surface-variant transition-all"
                >
                  <div className="p-2 rounded-xl bg-surface-container-highest">
                    <HelpCircle size={20} />
                  </div>
                  <span className="font-headline font-bold">{t('drawer.help_center') || 'Help Center'}</span>
                </button>
                <button 
                  onClick={() => setShowFeedback(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container-low text-on-surface-variant transition-all"
                >
                  <div className="p-2 rounded-xl bg-surface-container-highest text-tertiary">
                    <MessageSquareHeart size={20} />
                  </div>
                  <span className="font-headline font-bold">{t('feedback.title') || 'Share Feedback'}</span>
                </button>
                <button 
                  onClick={() => setShowAbout(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-container-low text-on-surface-variant transition-all"
                >
                  <div className="p-2 rounded-xl bg-surface-container-highest">
                    <Info size={20} />
                  </div>
                  <span className="font-headline font-bold">{t('drawer.about') || 'About AIHMs'}</span>
                </button>
              </section>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-outline-variant/10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/10">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-primary/5 flex items-center justify-center text-primary font-headline font-black">
                      {user?.displayName?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-black text-on-surface truncate">{user?.displayName}</p>
                  <p className="text-xs text-outline truncate">{user?.email}</p>
                </div>
              </div>
              <button 
                onClick={() => { signOut(); onClose(); }}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-surface-container-highest text-tertiary font-headline font-black text-sm hover:bg-tertiary/5 transition-all"
                aria-label={t('auth.logout')}
              >
                <LogOut size={18} />
                {t('auth.logout')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Modals outside the drawer so they can overlay properly */}
    <AnimatePresence>
      {showSOS && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              // Once sent, they can close it. If it's idle/triggering, closing cancels or hides it.
              if (sosStatus === 'idle' || sosStatus === 'sent') {
                setShowSOS(false);
                setTimeout(() => setSosStatus('idle'), 500);
              }
            }}
            className="fixed inset-0 bg-on-surface/60 backdrop-blur-md z-[80]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-surface p-8 rounded-[2.5rem] shadow-ambient z-[90] text-center"
          >
            <div className={cn(
              "w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 transition-all duration-500",
              sosStatus === 'sent' ? "bg-primary text-on-primary" : "bg-tertiary text-on-tertiary",
              sosStatus === 'triggering' && "animate-pulse"
            )}>
              <ShieldAlert size={40} className={sosStatus === 'triggering' ? "animate-bounce" : ""} />
            </div>

            {sosStatus === 'idle' && (
              <>
                <h3 className="font-headline font-black text-2xl text-tertiary mb-4">{t('drawer.sos_confirm_title') || 'Confirm SOS'}</h3>
                <p className="text-on-surface-variant leading-relaxed mb-8">
                  {t('drawer.sos_confirm_desc') || 'This will immediately alert your caregivers and emergency contacts with your current location.'}
                </p>
                <div className="space-y-4">
                  <button
                    onClick={handleTriggerSOS}
                    className="w-full bg-tertiary text-on-tertiary px-8 py-5 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-lg shadow-tertiary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {t('drawer.sos_confirm_btn') || 'Yes, Trigger SOS'}
                  </button>
                  <button
                    onClick={() => setShowSOS(false)}
                    className="w-full text-on-surface-variant px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest hover:bg-surface-container-low active:scale-[0.98] transition-all"
                  >
                    {t('common.cancel') || 'Cancel'}
                  </button>
                </div>
              </>
            )}

            {sosStatus === 'triggering' && (
              <>
                <h3 className="font-headline font-black text-2xl text-tertiary mb-4 animate-pulse">
                  {t('drawer.sending')}
                </h3>
                <p className="text-on-surface-variant leading-relaxed mb-8">
                  {t('drawer.sending_desc')}
                </p>
              </>
            )}

            {sosStatus === 'sent' && (
              <>
                <h3 className="font-headline font-black text-2xl text-primary mb-4">
                  {t('drawer.sos_success') || 'SOS Activated'}
                </h3>
                <p className="text-on-surface-variant leading-relaxed mb-8">
                  {t('drawer.sos_success_desc') || 'Your trusted contacts have been alerted. Help is on the way.'}
                </p>
                <button
                  onClick={() => {
                    setShowSOS(false);
                    setTimeout(() => setSosStatus('idle'), 500);
                  }}
                  className="w-full bg-primary text-on-primary px-8 py-5 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {t('common.close') || 'Close'}
                </button>
              </>
            )}
          </motion.div>
        </>
      )}

      {showHelp && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelp(false)}
            className="fixed inset-0 bg-on-surface/40 backdrop-blur-md z-[80]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-surface p-8 rounded-[2.5rem] shadow-ambient z-[90] text-center"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary">
              <HelpCircle size={32} />
            </div>
            <h3 className="font-headline font-black text-2xl text-primary mb-4">{t('drawer.help_center') || 'Help Center'}</h3>
            <p className="text-on-surface-variant leading-relaxed mb-8">
              Welcome to the AIHMs Guardian Help Center. If you need assistance using the app, configuring your account, or reporting an issue, our support team is available 24/7.
            </p>
            <div className="space-y-3 mb-8">
              <p className="text-sm font-bold text-on-surface">Contact Support:</p>
              <p className="text-sm text-on-surface-variant">support@aihms.example.com</p>
              <p className="text-sm text-on-surface-variant">1-800-555-0199</p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full bg-surface-container-high text-primary px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Close
            </button>
          </motion.div>
        </>
      )}

      {showAbout && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAbout(false)}
            className="fixed inset-0 bg-on-surface/40 backdrop-blur-md z-[80]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-surface p-8 rounded-[2.5rem] shadow-ambient z-[90] text-center"
          >
            <div className="w-16 h-16 bg-tertiary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-tertiary">
              <Info size={32} />
            </div>
            <h3 className="font-headline font-black text-2xl text-primary mb-2">AIHMs Guardian</h3>
            <p className="text-xs font-bold text-outline uppercase tracking-widest mb-6">Version 1.0.0</p>
            <p className="text-on-surface-variant leading-relaxed mb-8">
              Advanced Agentic AI geriatric pre-triage and health monitoring assistant for the Malaysian healthcare ecosystem. Designed to bring peace of mind to patients and caregivers through intelligent health insights and community support.
            </p>
            <button
              onClick={() => setShowAbout(false)}
              className="w-full bg-surface-container-high text-primary px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Close
            </button>
          </motion.div>
        </>
      )}

      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
    </AnimatePresence>
    </>
  );
};

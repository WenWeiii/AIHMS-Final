import React, { useState, useEffect } from 'react';
import { Menu, UserCircle, MessageSquareHeart, RefreshCw, ChevronDown, User, Activity } from 'lucide-react';
import { FeedbackModal } from '../ui/FeedbackModal';
import { useFirebase } from '../FirebaseProvider';
import { AihmsLogo } from '../AihmsLogo';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../../types';
import { cn } from '../../lib/utils';
import { useTranslation } from '../LanguageProvider';
import { motion, AnimatePresence } from 'motion/react';

interface TopAppBarProps {
  onProfileClick?: () => void;
  onMenuClick?: () => void;
  onLogoClick?: () => void;
}

import { useSocket } from '../SocketProvider';

export function TopAppBar({ onProfileClick, onMenuClick, onLogoClick }: TopAppBarProps) {
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = React.useState(false);
  const [refreshingPatientId, setRefreshingPatientId] = React.useState<string | null>(null);
  const [linkedPatients, setLinkedPatients] = React.useState<UserProfile[]>([]);
  const { user, profile } = useFirebase();
  const { socket, connected } = useSocket();
  const { t } = useTranslation();

  const isCaregiver = profile?.role === 'caregiver' || profile?.role === 'admin';

  React.useEffect(() => {
    if (!user || !isCaregiver) {
      setLinkedPatients([]);
      return;
    }

    const q = query(collection(db, 'users'), where('caregiverIds', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patients = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setLinkedPatients(patients);
    });

    return () => unsubscribe();
  }, [user, isCaregiver]);

  const handleSwitchPatient = async (patientId: string) => {
    if (!user ) return;
    try {
      const caregiverRef = doc(db, 'users', user.uid);
      await updateDoc(caregiverRef, { assignedPatientId: patientId });
      setIsSwitcherOpen(false);
    } catch (error) {
      console.error("Error switching patient:", error);
    }
  };

  const activePatient = linkedPatients.find(p => p.uid === profile?.assignedPatientId) || linkedPatients[0];

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface px-6 py-4 flex items-center justify-between border-b border-outline/5 backdrop-blur-md bg-surface/80">
        <div className="flex items-center gap-6">
          <button 
            onClick={onMenuClick}
            className="text-primary hover:bg-surface-container-low p-2 rounded-xl transition-all"
            aria-label="Menu"
          >
            <Menu size={24} strokeWidth={2.5} />
          </button>
          <button 
            onClick={onLogoClick}
            className="hover:opacity-70 active:scale-95 transition-all text-left flex items-center gap-2 group"
          >
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <AihmsLogo className="w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-headline text-xl font-black tracking-tighter text-primary uppercase leading-none mt-1">AIHMs</h1>
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-outline">Guardian</span>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Patient Switcher for Caregivers */}
          {isCaregiver && linkedPatients.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                className="flex items-center gap-3 px-4 py-2 bg-surface-container-highest rounded-2xl border-2 border-transparent hover:border-primary/20 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden border-2 border-white/20 shadow-sm relative shrink-0">
                  {activePatient?.photoURL ? (
                    <img 
                      src={activePatient.photoURL} 
                      alt={activePatient.displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-signature-gradient flex items-center justify-center text-[10px] font-black text-white italic">
                      {activePatient?.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P'}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start hidden md:flex">
                  <span className="text-[10px] font-headline font-black uppercase tracking-widest text-outline leading-none mb-1">Monitoring</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-headline font-black text-primary leading-none">{activePatient?.displayName.split(' ')[0]}</span>
                    <ChevronDown size={14} className={cn("text-primary transition-transform", isSwitcherOpen && "rotate-180")} />
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {isSwitcherOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[60]"
                      onClick={() => setIsSwitcherOpen(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full mt-4 right-0 w-72 bg-surface-container-low rounded-[2rem] shadow-2xl border border-outline/10 p-4 z-[70] overflow-hidden"
                    >
                      <div className="px-4 py-3 mb-2 border-b border-outline/5">
                        <h4 className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-outline">Switch Patient</h4>
                      </div>
                      <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {linkedPatients.map(patient => (
                          <button
                            key={patient.uid}
                            onClick={() => handleSwitchPatient(patient.uid)}
                            className={cn(
                              "w-full flex items-center gap-4 p-3 rounded-2xl transition-all border-2",
                              profile?.assignedPatientId === patient.uid 
                                ? "bg-primary/5 border-primary/20" 
                                : "hover:bg-surface-container-high border-transparent"
                            )}
                          >
                            <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white shadow-sm shrink-0">
                              {patient.photoURL ? (
                                <img src={patient.photoURL} alt={patient.displayName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-signature-gradient flex items-center justify-center text-xs font-black text-white italic">
                                  {patient.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-start overflow-hidden">
                              <span className={cn(
                                "text-sm font-headline font-black truncate w-full text-left",
                                profile?.assignedPatientId === patient.uid ? "text-primary" : "text-on-surface"
                              )}>
                                {patient.displayName}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-outline opacity-60">ID: {patient.uid.slice(0, 8)}</span>
                            </div>
                            {profile?.assignedPatientId === patient.uid && (
                              <div className="ml-auto w-2 h-2 bg-primary rounded-full" />
                            )}
                          </button>
                        ))}
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-outline/5 grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => {
                            const patient = activePatient;
                            if (patient) {
                              setRefreshingPatientId(patient.uid);
                              setTimeout(() => setRefreshingPatientId(null), 2000);
                            }
                          }}
                          className="flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-xl text-[10px] font-headline font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all"
                        >
                          <RefreshCw size={12} className={refreshingPatientId ? "animate-spin" : ""} />
                          Sync
                        </button>
                        <button 
                          onClick={() => setIsSwitcherOpen(false)}
                          className="flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-xl text-[10px] font-headline font-black uppercase tracking-widest text-outline hover:bg-outline/10 transition-all"
                        >
                          Close
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="h-8 w-px bg-outline/10 mx-1 hidden sm:block" />

          <button 
            onClick={() => setIsFeedbackOpen(true)}
            className="text-tertiary hover:bg-tertiary/10 p-2 rounded-xl transition-all flex items-center gap-2 group"
            aria-label="Feedback"
          >
            <MessageSquareHeart size={24} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
          </button>
          <button 
            onClick={onProfileClick}
            className="text-primary hover:bg-surface-container-low p-1 rounded-full transition-all overflow-hidden border-2 border-transparent hover:border-primary/20 relative"
            aria-label="Profile"
          >
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || 'Profile'} 
                className="w-9 h-9 rounded-full object-cover shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserCircle size={32} strokeWidth={1.5} />
            )}
            <div className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface transition-all",
              connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-outline/30"
            )} title={connected ? "Real-time Connected" : "Real-time Disconnected"} />
          </button>
        </div>
      </header>

      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
      />
    </>
  );
};

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Heart, Weight, Plus, Minus, AlertCircle, CheckCircle2, Clock, ShieldAlert, ChevronRight, Moon, Smile, Watch, Frown, Meh, Laugh, Star, Sparkles, Brain, Stethoscope, Droplets, Calendar, Bell, ChevronDown, User, RefreshCw } from 'lucide-react';
import { MetricRing } from '@/src/components/ui/MetricRing';
import { HealthData, TriageZone, Screen, AIInsight, AIRecommendation } from '@/src/types';
import { cn, formatTime, formatDate, safeParseDate } from '@/src/lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { getDisplayVitals } from '../lib/vitals';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc, deleteDoc, where, updateDoc } from 'firebase/firestore';
import { UserProfile, Appointment, ChatMessage } from '../types';
import { useTranslation } from '../components/LanguageProvider';
import { generateAdvancedInsights, generateAdvancedInsightsStream } from '../services/geminiService';

interface DashboardProps {
  onNavigate?: (screen: Screen) => void;
}

const Stepper: React.FC<{ 
  label: string; 
  value: number; 
  onChange: (val: number) => void; 
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ label, value, onChange, step = 1, min = 0, max = 100000, unit = '' }) => {
  const [localValue, setLocalValue] = useState(value.toString());

  // Sync local value when prop changes from outside (e.g. background sync)
  // but only if it's significantly different to avoid flickering while typing
  useEffect(() => {
    if (parseFloat(localValue) !== value) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const commitChange = (val: number) => {
    const constrained = Math.min(max, Math.max(min, val));
    const rounded = Number(constrained.toFixed(2));
    onChange(rounded);
    setLocalValue(rounded.toString());
  };

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      commitChange(parsed);
    } else {
      setLocalValue(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{label} {unit && `(${unit})`}</label>
      <div className="flex items-center gap-4 bg-surface-container-highest p-2 rounded-2xl h-16">
        <button 
          onClick={() => commitChange(value - step)}
          className="w-12 h-12 flex items-center justify-center bg-surface-container-low rounded-xl text-primary hover:bg-primary hover:text-on-primary transition-all shrink-0"
        >
          <Minus size={20} />
        </button>
        <div className="flex-1 text-center font-headline font-black text-xl text-on-surface">
          <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-center focus:outline-none"
          />
        </div>
        <button 
          onClick={() => commitChange(value + step)}
          className="w-12 h-12 flex items-center justify-center bg-surface-container-low rounded-xl text-primary hover:bg-primary hover:text-on-primary transition-all shrink-0"
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
};

const MoodSelector: React.FC<{ 
  value: string; 
  onChange: (val: string) => void; 
  t: (key: string) => string;
}> = ({ value, onChange, t }) => {
  const moods = [
    { id: 'Poor', label: t('mood.poor'), icon: Frown, color: 'text-red-500' },
    { id: 'Fair', label: t('mood.fair'), icon: Meh, color: 'text-orange-500' },
    { id: 'Neutral', label: t('mood.neutral'), icon: Smile, color: 'text-amber-500' },
    { id: 'Good', label: t('mood.good'), icon: Laugh, color: 'text-green-500' },
    { id: 'Excellent', label: t('mood.excellent'), icon: Star, color: 'text-primary' },
  ];

  return (
    <div className="space-y-3 col-span-full">
      <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('mood.title')}</label>
      <div className="grid grid-cols-5 gap-4">
        {moods.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex flex-col items-center justify-center p-4 rounded-2xl transition-all gap-2 border-2",
              value === m.id 
                ? "bg-primary/5 border-primary" 
                : "bg-surface-container-highest border-transparent hover:bg-surface-container-high"
            )}
          >
            <m.icon size={24} className={cn(value === m.id ? m.color : "text-outline")} />
            <span className={cn(
              "text-[10px] font-headline font-black uppercase tracking-widest",
              value === m.id ? "text-primary" : "text-outline"
            )}>
              {m.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [showInput, setShowInput] = useState(false);
  const [healthData, setHealthData] = useState<HealthData[]>([]);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);
  const [patientProfile, setPatientProfile] = useState<UserProfile | null>(null);
  const [linkedPatients, setLinkedPatients] = useState<UserProfile[]>([]);
  const [isPatientsLoading, setIsPatientsLoading] = useState(false);
  const [refreshingPatientId, setRefreshingPatientId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<HealthData | null>(null);
  const [editingLog, setEditingLog] = useState<HealthData | null>(null);
  const [showMetricDetails, setShowMetricDetails] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [streamingSummary, setStreamingSummary] = useState('');
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<HealthData>>({
    weight: 70,
    heartRate: 72,
    steps: 5000,
    bloodPressure: '120/80',
    sleepHours: 8,
    mood: 'Good'
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.greeting_morning');
    if (hour < 18) return t('dashboard.greeting_afternoon');
    return t('dashboard.greeting_evening');
  };

  useEffect(() => {
    if (!user || (profile?.role !== 'caregiver' && profile?.role !== 'admin')) {
      setLinkedPatients([]);
      return;
    }

    setIsPatientsLoading(true);
    const q = query(collection(db, 'users'), where('caregiverIds', 'array-contains', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patients = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setLinkedPatients(patients);
      
      // Only set initial viewing patient if not already set
      if (!viewingPatientId) {
        if (profile?.assignedPatientId) {
          setViewingPatientId(profile.assignedPatientId);
        } else if (patients.length > 0) {
          setViewingPatientId(patients[0].uid);
        }
      }
      setIsPatientsLoading(false);
    }, (error) => {
      console.error("Error fetching linked patients:", error);
      setIsPatientsLoading(false);
    });

    return () => unsubscribe();
  }, [user, profile?.role]);

  // Support for both patient and clinical perspectives
  useEffect(() => {
    if (profile?.role === 'caregiver' || profile?.role === 'admin') {
      // Caregivers/Admins use the assignedPatientId or the first linked patient
      if (profile.assignedPatientId && profile.assignedPatientId !== viewingPatientId) {
        setViewingPatientId(profile.assignedPatientId);
      }
    } else if (profile?.role === 'patient') {
      // Patients always view their own data
      if (user?.uid && viewingPatientId !== user.uid) {
        setViewingPatientId(user.uid);
      }
    }
  }, [profile, user, viewingPatientId]);

  useEffect(() => {
    if (viewingPatientId && (profile?.role === 'caregiver' || profile?.role === 'admin')) {
      const patientRef = doc(db, 'users', viewingPatientId);
      getDoc(patientRef).then(snap => {
        if (snap.exists()) setPatientProfile(snap.data() as UserProfile);
      });
    } else {
      setPatientProfile(null);
    }
  }, [viewingPatientId, profile?.role]);

  useEffect(() => {
    if (!viewingPatientId) {
      setHealthData([]);
      return;
    }

    setIsHealthLoading(true);
    setAiInsight(null);

    const healthPath = `users/${viewingPatientId}/healthLogs`;
    const healthQ = query(collection(db, healthPath), orderBy('timestamp', 'desc'), limit(14));
    const legacyQ = query(collection(db, 'health_data'), where('userId', '==', viewingPatientId), orderBy('timestamp', 'desc'), limit(14));
    
    let subData: HealthData[] = [];
    let rootData: HealthData[] = [];

    const updateMergedData = () => {
      const merged = [...subData, ...rootData]
        .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() || 0) - (safeParseDate(a.timestamp)?.getTime() || 0))
        .slice(0, 14);
      
      // De-duplicate by ID if necessary (unlikely given different paths, but just in case)
      const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
      setHealthData(unique);
      setIsHealthLoading(false);
    };

    const unsubscribeHealth = onSnapshot(healthQ, (snapshot) => {
      subData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthData[];
      updateMergedData();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, healthPath);
      setIsHealthLoading(false);
    });

    const unsubscribeLegacy = onSnapshot(legacyQ, (snapshot) => {
      rootData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthData[];
      updateMergedData();
    }, (error) => {
      // Legacy might not exist or fail silently without issue
      console.warn("Legacy health_data fetch error:", error);
      updateMergedData();
    });

    return () => {
      unsubscribeHealth();
      unsubscribeLegacy();
    };
  }, [viewingPatientId]);

  useEffect(() => {
    const fetchAI = async () => {
      if (!viewingPatientId || healthData.length === 0 || aiInsight || isAiLoading) return;
      if (profile?.role === 'patient') return; // Do not generate AI insights for patients directly on dashboard
      
      setIsAiLoading(true);
      setStreamingSummary('');
      try {
        const result = await generateAdvancedInsightsStream(
          healthData, 
          [], 
          [], 
          language, 
          profile?.role || 'patient',
          new Date().toISOString().split('T')[0],
          (chunk) => setStreamingSummary(prev => prev + chunk)
        );
        if (result) setAiInsight(result);
      } catch (e) {
        console.error("Dashboard AI fetch error:", e);
      } finally {
        setIsAiLoading(false);
      }
    };

    fetchAI();
  }, [healthData, viewingPatientId]);

  const handleSave = async () => {
    if (!viewingPatientId) return;

    // Simple triage logic for manual entry
    let zone: TriageZone = 'Green';
    const hr = formData.heartRate || 0;
    const bp = formData.bloodPressure || '';
    const systolic = parseInt(bp.split('/')[0]) || 0;

    if (hr > 120 || hr < 40 || systolic > 180 || systolic < 90) {
      zone = 'Red';
    } else if (hr > 100 || hr < 50 || systolic > 150 || systolic < 100) {
      zone = 'Yellow';
    }

    const path = `users/${viewingPatientId}/healthLogs`;
    try {
      const logData = {
        ...formData,
        userId: viewingPatientId,
        timestamp: new Date().toISOString(),
        triageZone: zone,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, path), logData);

      // Update patient profile with latest vitals for quick access in Health Circle
      const patientRef = doc(db, 'users', viewingPatientId);
      await updateDoc(patientRef, {
        latestVitals: {
          heartRate: formData.heartRate,
          steps: formData.steps,
          weight: formData.weight,
          bloodPressure: formData.bloodPressure,
          triageZone: zone,
          timestamp: logData.timestamp
        }
      });

      setShowInput(false);
      alert(t('dashboard.save_success') || 'Health record saved successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!viewingPatientId) return;
    const path = `users/${viewingPatientId}/healthLogs/${logId}`;
    try {
      const logRef = doc(db, `users/${viewingPatientId}/healthLogs`, logId);
      await deleteDoc(logRef);
      if (selectedLog?.id === logId) setSelectedLog(null);
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleUpdateLog = async () => {
    if (!editingLog || !viewingPatientId) return;
    try {
      const logRef = doc(db, `users/${viewingPatientId}/healthLogs`, editingLog.id);
      
      // Simple triage update based on edited values
      let zone: TriageZone = 'Green';
      const hr = editingLog.heartRate || 0;
      const bp = editingLog.bloodPressure || '';
      const systolic = parseInt(bp.split('/')[0]) || 0;
      if (hr > 120 || hr < 40 || systolic > 180 || systolic < 90) zone = 'Red';
      else if (hr > 100 || hr < 50 || systolic > 150 || systolic < 100) zone = 'Yellow';

      const updateData = {
        ...editingLog,
        triageZone: zone,
        updatedAt: new Date().toISOString()
      };
      // id is not part of the document data in firestore
      const { id, ...dataToSave } = updateData;

      await updateDoc(logRef, dataToSave as any);
      setEditingLog(null);
      if (selectedLog?.id === id) {
        setSelectedLog({ ...selectedLog, ...dataToSave } as HealthData);
      }
    } catch (error) {
      console.error("Error updating log:", error);
    }
  };

  const latestLog = healthData[0];

  const getTriageStatus = (zone: TriageZone) => {
    switch (zone) {
      case 'Red': return { label: t('dashboard.triage_red_label'), icon: <ShieldAlert className="text-red-600" />, color: 'bg-red-50 border-red-200 text-red-700', description: t('dashboard.triage_red_desc') };
      case 'Yellow': return { label: t('dashboard.triage_yellow_label'), icon: <Clock className="text-amber-600" />, color: 'bg-amber-50 border-amber-200 text-amber-700', description: t('dashboard.triage_yellow_desc') };
      case 'Green': return { label: t('dashboard.triage_green_label'), icon: <CheckCircle2 className="text-green-600" />, color: 'bg-green-50 border-green-200 text-green-700', description: t('dashboard.triage_green_desc') };
      default: return { label: t('dashboard.triage_none_label'), icon: <AlertCircle className="text-gray-400" />, color: 'bg-gray-50 border-gray-200 text-gray-500', description: t('dashboard.triage_none_desc') };
    }
  };

  const triage = getTriageStatus(latestLog?.triageZone || 'None');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-6 pt-8 pb-40"
    >
      {/* Patient Switcher for Caregivers */}
      {(profile?.role === 'caregiver' || profile?.role === 'admin') && linkedPatients.length > 0 && (
        <div className="mb-12 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest rounded-xl text-outline mr-2">
            <User size={14} />
            <span className="text-[10px] font-headline font-black uppercase tracking-[0.2em]">Viewing Patient</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedPatients.map(patient => (
              <button
                key={patient.uid}
                onClick={async () => {
                  if (viewingPatientId === patient.uid) {
                    setRefreshingPatientId(patient.uid);
                    setHealthData([]);
                    setAiInsight(null);
                    setStreamingSummary('');
                    try {
                      // Re-fetch profile to ensure latest caregiver data etc
                      const patientRef = doc(db, 'users', patient.uid);
                      const snap = await getDoc(patientRef);
                      if (snap.exists()) setPatientProfile(snap.data() as UserProfile);
                      // Visual delay
                      await new Promise(r => setTimeout(r, 800));
                    } catch (e) {
                      console.error("Refresh error:", e);
                    } finally {
                      setRefreshingPatientId(null);
                    }
                  } else {
                    setViewingPatientId(patient.uid);
                    try {
                      const caregiverRef = doc(db, 'users', user.uid);
                      updateDoc(caregiverRef, { assignedPatientId: patient.uid });
                    } catch (error) {
                      console.error("Error persisting patient switch from dashboard:", error);
                    }
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all border-2 relative overflow-hidden",
                  viewingPatientId === patient.uid 
                    ? "bg-primary border-primary text-on-primary shadow-md scale-105" 
                    : "bg-surface-container-low border-transparent text-on-surface-variant hover:border-primary/20 hover:bg-surface-container-high"
                )}
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border-2 border-surface/20 relative group-hover:rotate-12 transition-transform">
                  {refreshingPatientId === patient.uid ? (
                    <div className="absolute inset-0 bg-primary/80 flex items-center justify-center z-20">
                      <RefreshCw size={14} className="animate-spin text-white" />
                    </div>
                  ) : null}
                  {patient.photoURL ? (
                    <img 
                      src={patient.photoURL} 
                      alt={patient.displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-signature-gradient flex items-center justify-center text-[10px] font-black text-white">
                      {patient.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-headline font-black uppercase tracking-widest leading-none">
                      {patient.displayName.split(' ')[0]}
                    </span>
                    {viewingPatientId === patient.uid && !refreshingPatientId && (
                      <RefreshCw size={8} className="opacity-40" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[8px] font-medium opacity-60 uppercase tracking-tighter mt-0.5",
                    viewingPatientId === patient.uid ? "text-on-primary" : "text-outline"
                  )}>
                    {patient.uid.slice(0, 8)}
                  </span>
                </div>
                {refreshingPatientId === patient.uid && (
                  <motion.div 
                    layoutId="refresh-pill"
                    className="absolute inset-0 bg-white/10 backdrop-blur-[2px] pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editorial Header */}
      <section className="mb-12">
        <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary mb-4 block">{t('dashboard.tagline')}</span>
        
        <div className="space-y-6"> {/* div:nth-of-type(1) */}
          <h1 className="text-6xl md:text-8xl font-headline font-black text-primary leading-[0.9] tracking-tighter">
            {getGreeting()},<br />{(profile?.role === 'caregiver' || profile?.role === 'admin') && patientProfile ? patientProfile.displayName.split(' ')[0] : (user?.displayName?.split(' ')[0] || t('dashboard.greeting_user_default'))}
          </h1>
          <p className="text-xl text-on-surface-variant max-w-md leading-relaxed">
            {(profile?.role === 'caregiver' || profile?.role === 'admin') && patientProfile 
              ? t('dashboard.caregiver_view').replace('{name}', patientProfile.displayName)
              : t('dashboard.health_priority')}
          </p>
        </div>

        {profile?.role === 'patient' && profile?.wearableConnected && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 bg-primary/5 border border-primary/10 p-4 rounded-2xl flex items-center gap-4 max-w-md shadow-sm"
          >
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <Watch size={20} />
            </div>
            <div>
              <p className="text-xs font-headline font-black uppercase tracking-widest text-primary">{t('dashboard.wearable_connected')}</p>
              <p className="text-sm text-on-surface-variant">
                {t('dashboard.last_synced')}: {profile.wearableSyncedAt ? formatTime(profile.wearableSyncedAt) : t('dashboard.never')}
              </p>
            </div>
          </motion.div>
        )}
      </section>

      {/* AI Intervention Suggestions (Dynamic) */}
      <section className="mb-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 bg-surface-container-highest rounded-[2.5rem] p-10 shadow-ambient relative overflow-hidden group border border-primary/5 hover:border-primary/10 transition-all">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Brain size={100} />
          </div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <Sparkles size={18} />
              </div>
              <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-primary">
                {(profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.summary_title') : t('dashboard.clarity_title')}
              </h3>
            </div>

            {(isAiLoading && !streamingSummary) ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 bg-surface-container-low rounded-xl w-3/4" />
                <div className="h-4 bg-surface-container-low rounded-lg w-1/2" />
              </div>
            ) : (aiInsight || streamingSummary) ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-headline font-black text-on-surface leading-tight">
                    {aiInsight?.recommendations?.[0]?.title || ((profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.summary_title') : t('dashboard.clarity_title'))}
                  </h2>
                  <p className="text-lg text-on-surface-variant mt-2 leading-relaxed">
                    {streamingSummary || aiInsight?.summary || ((profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.generating') : t('dashboard.clarity_desc'))}
                  </p>
                </div>
                
                {aiInsight && (
                  <div className="flex flex-wrap gap-4">
                    {aiInsight.recommendations?.[0]?.actionType && aiInsight.recommendations[0].actionType !== 'none' && (
                      <button 
                        onClick={() => {
                          const action = aiInsight.recommendations?.[0]?.actionType;
                          if (action === 'calendar' || action === 'reschedule') {
                            onNavigate?.('calendar');
                          } else if (action === 'notify') {
                            onNavigate?.('health-circle');
                          } else {
                            onNavigate?.('insights');
                          }
                        }}
                        className="signature-gradient text-on-primary px-8 py-4 rounded-2xl font-headline font-black text-xs uppercase tracking-widest hover:scale-[1.05] active:scale-[0.95] transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.5)] flex items-center gap-3 border border-white/20"
                      >
                        {aiInsight.recommendations[0].actionType === 'calendar' ? <Calendar size={16} /> : 
                         aiInsight.recommendations[0].actionType === 'notify' ? <Bell size={16} /> : 
                         aiInsight.recommendations[0].actionType === 'reschedule' ? <Clock size={16} /> :
                         <ChevronRight size={16} />}
                         {aiInsight.recommendations[0].actionType === 'calendar' ? t('calendar.add_event') : 
                          aiInsight.recommendations[0].actionType === 'notify' ? t('community.notify_caregiver') : 
                          aiInsight.recommendations[0].actionType === 'reschedule' ? t('calendar.reschedule') :
                          t('common.view_details')}
                      </button>
                    )}
                    {(profile?.role === 'caregiver' || profile?.role === 'admin') ? (
                      <button 
                        onClick={() => onNavigate?.('insights')}
                        className="bg-surface-container-low text-on-surface px-8 py-4 rounded-2xl font-headline font-black text-xs uppercase tracking-widest hover:bg-surface-container-high transition-all border border-outline/10 hover:border-outline/30 shadow-sm"
                      >
                        {t('insights.view_all')}
                      </button>
                    ) : (
                      <button 
                        onClick={() => onNavigate?.('chat')}
                        className="bg-surface-container-low text-on-surface px-8 py-4 rounded-2xl font-headline font-black text-xs uppercase tracking-widest hover:bg-surface-container-high transition-all border border-outline/10 hover:border-outline/30 shadow-sm"
                      >
                        {t('chat.start_chat')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <h2 className="text-3xl font-headline font-black text-on-surface">
                  {(profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.summary_title') : t('dashboard.clarity_title')}
                </h2>
                <p className="text-lg text-on-surface-variant leading-tight">
                  {(profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.generating') : t('dashboard.clarity_desc')}
                </p>
                <button 
                  onClick={() => onNavigate?.((profile?.role === 'caregiver' || profile?.role === 'admin') ? 'insights' : 'chat')}
                  className="bg-primary text-on-primary px-6 py-3 rounded-xl font-headline font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-ambient"
                >
                  {(profile?.role === 'caregiver' || profile?.role === 'admin') ? t('insights.view_all') : t('chat.start_chat')}
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className={cn("md:col-span-4 rounded-[2.5rem] p-8 flex flex-col justify-center items-center text-center shadow-ambient transition-all border border-primary/5", triage.color)}>
          <div className="mb-4 bg-white/20 p-4 rounded-3xl backdrop-blur-sm">
            {triage.icon}
          </div>
          <h3 className="text-2xl font-headline font-black mb-2">{triage.label}</h3>
          <p className="text-sm opacity-80 leading-relaxed font-bold">{triage.description}</p>
        </div>
      </div>
    </section>

      {/* Quick Stats Grid */}
      <section className="mb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-headline font-black tracking-[0.1em] uppercase text-primary">{t('dashboard.vitals_title')}</h2>
          <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <MetricRing 
            progress={(latestLog?.steps || 0) / 10000} 
            icon={<Activity size={28} strokeWidth={1.5} />} 
            label={t('metrics.activity')} 
            value={`${latestLog?.steps || 0} ${t('metrics.steps')}`} 
            onClick={() => setShowMetricDetails('steps')}
          />
          <MetricRing 
            progress={(latestLog?.heartRate || 70) / 150} 
            icon={<Heart size={28} strokeWidth={1.5} />} 
            label={t('metrics.heart_rate')} 
            value={`${latestLog?.heartRate || 0} ${t('metrics.bpm')}`}
            status={latestLog?.heartRate && (latestLog.heartRate > 100 || latestLog.heartRate < 50) ? 'warning' : 'normal'}
            onClick={() => setShowMetricDetails('heartRate')}
          />
          <MetricRing 
            progress={0.6} 
            icon={<Weight size={28} strokeWidth={1.5} />} 
            label={t('metrics.weight')} 
            value={`${latestLog?.weight || 0} ${t('metrics.kg')}`} 
            onClick={() => setShowMetricDetails('weight')}
          />
        </div>
      </section>

      {/* Goal Rings Section */}
      <section className="mb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-headline font-black tracking-[0.1em] uppercase text-primary">{t('dashboard.goals_title')}</h2>
          <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <MetricRing 
            progress={Math.min((latestLog?.steps || 0) / 10000, 1)} 
            icon={<Activity size={28} strokeWidth={1.5} />} 
            label={t('dashboard.daily_steps')} 
            value={`${latestLog?.steps || 0} / 10,000`} 
            onClick={() => setShowMetricDetails('steps')}
          />
          {/* Placeholder for other goals to maintain layout symmetry */}
          <div className="hidden sm:block" />
          <div className="hidden sm:block" />
        </div>
      </section>

      {/* Wearables Integration Section */}
      {profile?.role === 'patient' && !profile?.wearableConnected && (
        <section className="mb-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-surface-container-low rounded-[3rem] p-10 shadow-ambient border border-primary/10 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />
            <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
              <div className="w-24 h-24 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform">
                <Watch size={48} />
              </div>
              <div className="flex-1 text-center md:text-left space-y-3">
                <h3 className="text-3xl font-headline font-black text-on-surface tracking-tight">
                  {t('wearables.header_title')}
                </h3>
                <p className="text-on-surface-variant text-lg leading-relaxed max-w-md">
                  {t('wearables.sync_desc') || 'Sync your wearable device to have your steps, heart rate, and sleep data automatically updated for enhanced AI health monitoring.'}
                </p>
              </div>
              <button 
                onClick={() => onNavigate?.('wearables')}
                className="signature-gradient text-on-primary px-10 py-6 rounded-2xl font-headline font-black uppercase tracking-[0.2em] text-sm shadow-ambient hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
              >
                <Plus size={24} />
                {t('wearables.connect_fitbit')}
              </button>
            </div>
          </motion.div>
        </section>
      )}

      {/* Manual Input Section */}
      <section className="mb-20">
        <div className="bg-surface-container-low rounded-[2.5rem] p-10 shadow-ambient">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-headline font-black text-primary">{t('dashboard.log_vitals')}</h2>
              <p className="text-on-surface-variant mt-1">{t('dashboard.log_vitals_desc')}</p>
            </div>
            <button 
              onClick={() => setShowInput(!showInput)}
              className="bg-primary text-on-primary px-6 h-14 rounded-2xl flex items-center gap-2 shadow-ambient hover:scale-105 transition-all font-headline font-black uppercase tracking-widest text-xs"
              aria-label={t('dashboard.add_log')}
            >
              <Plus size={24} /> {t('dashboard.add_log')}
            </button>
          </div>

          {showInput && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="space-y-8 overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Stepper 
                  label={t('metrics.weight')} 
                  value={formData.weight || 70} 
                  onChange={(val) => setFormData({...formData, weight: val})} 
                  step={0.1} 
                  unit={t('metrics.kg')} 
                />
                <Stepper 
                  label={t('metrics.heart_rate')} 
                  value={formData.heartRate || 72} 
                  onChange={(val) => setFormData({...formData, heartRate: val})} 
                  unit={t('metrics.bpm')} 
                />
                <Stepper 
                  label={t('metrics.steps')} 
                  value={formData.steps || 5000} 
                  onChange={(val) => setFormData({...formData, steps: val})} 
                  step={500} 
                />
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('metrics.blood_pressure')}</label>
                  <input 
                    type="text" 
                    value={formData.bloodPressure}
                    onChange={(e) => setFormData({...formData, bloodPressure: e.target.value})}
                    placeholder="120/80"
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                  />
                </div>
                <Stepper 
                  label={t('metrics.sleep')} 
                  value={formData.sleepHours || 8} 
                  onChange={(val) => setFormData({...formData, sleepHours: val})} 
                  step={0.5} 
                  unit={t('metrics.hours')} 
                />
                <MoodSelector 
                  value={formData.mood || 'Good'} 
                  onChange={(val) => setFormData({...formData, mood: val})} 
                  t={t}
                />
              </div>
              <button 
                onClick={handleSave}
                className="w-full signature-gradient text-on-primary py-6 rounded-2xl font-headline font-black text-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {t('dashboard.save_record')}
              </button>
            </motion.div>
          )}
        </div>
      </section>

      {/* Recent Logs - Editorial List */}
      <section>
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-sm font-headline font-black tracking-[0.1em] uppercase text-primary">{t('dashboard.history_title')}</h2>
          <button 
            onClick={() => onNavigate?.('health-history')}
            className="text-xs font-headline font-black uppercase tracking-widest text-tertiary hover:underline"
          >
            {t('dashboard.full_archive')}
          </button>
        </div>
        <div className="space-y-6">
          {isHealthLoading ? (
            <div className="bg-surface-container-low rounded-[2rem] p-12 text-center animate-pulse">
               <p className="text-on-surface-variant font-headline font-bold">{t('common.loading') || 'Syncing clinical records...'}</p>
             </div>
          ) : healthData.length === 0 ? (
            <div className="bg-surface-container-low rounded-[2rem] p-12 text-center">
              <p className="text-on-surface-variant font-headline font-bold">{t('dashboard.no_records')}</p>
            </div>
          ) : (
            healthData.map((log) => {
              const display = getDisplayVitals(log);
              return (
                <div 
                  key={log.id} 
                  onClick={() => setSelectedLog(log)}
                  className="bg-surface-container-highest p-8 rounded-[2rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-surface-container-high transition-all cursor-pointer border border-primary/0 hover:border-primary/10"
                >
                  <div className="flex items-center gap-8">
                    <div className={cn(
                      "w-3 h-16 rounded-full",
                      log.triageZone === 'Red' ? "bg-tertiary" : log.triageZone === 'Yellow' ? "bg-tertiary/40" : "bg-primary"
                    )} />
                    <div>
                      <p className="text-[10px] font-headline font-black uppercase tracking-widest text-outline mb-2">{safeParseDate(log.timestamp)?.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      <div className="flex flex-wrap gap-8">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-outline font-black uppercase tracking-widest">{t('metrics.weight')}</span>
                          <span className="text-xl font-headline font-black text-primary">{display.weight}<span className="text-xs ml-1 opacity-60 uppercase">{t('metrics.kg')}</span></span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-outline font-black uppercase tracking-widest">{t('metrics.heart')}</span>
                          <span className="text-xl font-headline font-black text-secondary">{display.heartRate} <span className="text-xs opacity-60 uppercase">{t('metrics.bpm')}</span></span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-outline font-black uppercase tracking-widest">{t('metrics.bp')}</span>
                          <span className="text-xl font-headline font-black text-on-surface">{display.bloodPressure}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-outline font-black uppercase tracking-widest">{t('metrics.steps')}</span>
                          <span className="text-xl font-headline font-black text-secondary flex items-center gap-2">
                            <Watch size={16} className="text-tertiary" /> {display.steps}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "px-4 py-2 rounded-full text-[10px] font-headline font-black uppercase tracking-widest",
                      log.triageZone === 'Red' ? "bg-tertiary text-on-tertiary" : "bg-primary/10 text-primary"
                    )}>
                      {t(`dashboard.zone_${(log.triageZone || 'Green').toLowerCase()}`)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLog(log);
                        }}
                        className="p-3 bg-primary/5 text-primary hover:bg-primary hover:text-on-primary rounded-xl transition-all flex items-center gap-2 font-headline font-black text-[10px] uppercase tracking-widest group/edit"
                      >
                        <ChevronRight size={18} className="group-hover/edit:translate-x-1 transition-transform" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Log Detail Drawer */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setSelectedLog(null)} 
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-surface p-10 rounded-t-[3rem] md:rounded-[3rem] w-full max-w-2xl relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-4xl font-headline font-black text-primary leading-tight">
                  {t('dashboard.record_details') || 'Record Details'}
                </h3>
                <div 
                  onClick={() => setSelectedLog(null)}
                  className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center text-outline hover:text-primary transition-all cursor-pointer"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="bg-surface-container-low p-6 rounded-2xl border border-primary/5">
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest mb-1">{t('metrics.blood_pressure')}</p>
                  <p className="text-2xl font-headline font-black text-primary">{selectedLog.bloodPressure}</p>
                </div>
                <div className="bg-surface-container-low p-6 rounded-2xl border border-primary/5">
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest mb-1">{t('metrics.heart_rate')}</p>
                  <p className="text-2xl font-headline font-black text-primary">{selectedLog.heartRate} <span className="text-sm">bpm</span></p>
                </div>
                <div className="bg-surface-container-low p-6 rounded-2xl border border-primary/5">
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest mb-1">{t('metrics.weight')}</p>
                  <p className="text-2xl font-headline font-black text-primary">{selectedLog.weight} <span className="text-sm">kg</span></p>
                </div>
                <div className="bg-surface-container-low p-6 rounded-2xl border border-primary/5">
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest mb-1">{t('metrics.sleep')}</p>
                  <p className="text-2xl font-headline font-black text-primary">{selectedLog.sleepHours} <span className="text-sm">{t('metrics.hours')}</span></p>
                </div>
                <div className="bg-surface-container-low p-6 rounded-2xl border border-primary/5">
                  <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest mb-1">{t('metrics.steps')}</p>
                  <p className="text-2xl font-headline font-black text-primary">{selectedLog.steps?.toLocaleString() || '0'} <span className="text-sm">{t('metrics.steps')}</span></p>
                </div>
              </div>

              <div className="space-y-6 mb-12">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Smile size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-headline font-black text-outline uppercase tracking-widest">{t('metrics.mood')}</p>
                    <p className="font-headline font-black text-lg">{selectedLog.mood || 'Neutral'}</p>
                  </div>
                </div>
                {selectedLog.notes && (
                  <div className="bg-surface-container-highest p-6 rounded-2xl">
                    <p className="text-xs font-headline font-black text-outline uppercase tracking-widest mb-2">{t('dashboard.log_notes') || 'Notes'}</p>
                    <p className="text-on-surface-variant leading-relaxed font-bold">
                      {selectedLog.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                 <button 
                  onClick={() => setEditingLog(selectedLog)}
                  className="flex-1 py-5 bg-primary/10 text-primary font-headline font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-primary/20 transition-all flex items-center justify-center gap-3"
                >
                  <Plus size={20} className="rotate-0" /> Edit Record
                </button>
                 <button 
                  onClick={() => setShowDeleteConfirm(selectedLog.id)}
                  className="flex-1 py-5 bg-red-100 text-red-700 font-headline font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-red-200 transition-all flex items-center justify-center gap-3"
                >
                  <Minus size={20} /> {t('common.delete') || 'Delete Record'}
                </button>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="flex-1 py-5 bg-surface-container-highest text-on-surface-variant font-headline font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-surface-container-high transition-all"
                >
                  {t('common.close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Metric Detail Overlay */}
      <AnimatePresence>
        {showMetricDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowMetricDetails(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface p-12 rounded-[3.5rem] w-full max-w-lg relative z-10 shadow-2xl space-y-10"
            >
              <div className="flex items-center justify-between">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary">
                  {showMetricDetails === 'bloodPressure' && <Activity size={40} />}
                  {showMetricDetails === 'heartRate' && <Heart size={40} />}
                  {showMetricDetails === 'weight' && <Weight size={40} />}
                  {showMetricDetails === 'steps' && <Watch size={40} />}
                </div>
                <div 
                  onClick={() => setShowMetricDetails(null)}
                  className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center text-outline hover:text-primary transition-all cursor-pointer"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </div>
              </div>

              <div>
                <h3 className="text-4xl font-headline font-black text-primary tracking-tight">
                  {showMetricDetails === 'bloodPressure' && t('metrics.blood_pressure')}
                  {showMetricDetails === 'heartRate' && t('metrics.heart_rate')}
                  {showMetricDetails === 'weight' && t('metrics.weight')}
                  {showMetricDetails === 'steps' && t('metrics.activity')}
                </h3>
                <p className="text-on-surface-variant mt-2 text-lg">
                  {t('dashboard.metric_desc_prefix') || 'Detailed breakdown of your'} {showMetricDetails} {t('dashboard.metric_desc_suffix') || 'over the past 24 hours.'}
                </p>
              </div>

              <div className="space-y-6">
                <div className="bg-surface-container-low p-8 rounded-3xl border border-primary/5">
                  <p className="text-xs font-headline font-black text-outline uppercase tracking-widest mb-2">{t('dashboard.current_status') || 'Current Status'}</p>
                  <div className="flex items-baseline gap-2">
                     <span className="text-6xl font-headline font-black text-primary">
                        {showMetricDetails === 'bloodPressure' && (latestLog?.bloodPressure || '--')}
                        {showMetricDetails === 'heartRate' && (latestLog?.heartRate ?? '0')}
                        {showMetricDetails === 'weight' && (latestLog?.weight ?? '0')}
                        {showMetricDetails === 'steps' && (latestLog?.steps ?? '0')}
                     </span>
                     <span className="text-xl font-headline font-bold text-outline">
                        {showMetricDetails === 'heartRate' && 'bpm'}
                        {showMetricDetails === 'weight' && 'kg'}
                        {showMetricDetails === 'steps' && t('metrics.steps')}
                     </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 px-4">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <p className="text-sm font-headline font-bold text-on-surface-variant">
                    {t('dashboard.within_healthy_range') || 'Your levels are currently within the target clinical range.'}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowMetricDetails(null)}
                className="w-full py-6 signature-gradient text-on-primary font-headline font-black uppercase tracking-widest rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Edit Record Modal */}
      <AnimatePresence>
        {editingLog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md" 
              onClick={() => setEditingLog(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface rounded-[2.5rem] p-10 w-full max-w-lg relative z-10 shadow-2xl space-y-8 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-3xl font-headline font-black text-primary mb-2">Edit Record</h2>
              <p className="text-on-surface-variant mb-6 font-medium">Update historical data for this timestamp.</p>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Weight (kg)</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={editingLog.weight ?? ''}
                      onChange={(e) => setEditingLog({...editingLog, weight: parseFloat(e.target.value) || 0})}
                      className="w-full h-14 bg-surface-container-highest px-4 rounded-xl font-bold focus:outline-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Heart Rate (BPM)</label>
                    <input 
                      type="number"
                      value={editingLog.heartRate ?? ''}
                      onChange={(e) => setEditingLog({...editingLog, heartRate: parseInt(e.target.value) || 0})}
                      className="w-full h-14 bg-surface-container-highest px-4 rounded-xl font-bold focus:outline-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Blood Pressure</label>
                    <input 
                      type="text"
                      placeholder="120/80"
                      value={editingLog.bloodPressure || ''}
                      onChange={(e) => setEditingLog({...editingLog, bloodPressure: e.target.value})}
                      className="w-full h-14 bg-surface-container-highest px-4 rounded-xl font-bold focus:outline-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Steps</label>
                    <input 
                      type="number"
                      value={editingLog.steps ?? ''}
                      onChange={(e) => setEditingLog({...editingLog, steps: parseInt(e.target.value) || 0})}
                      className="w-full h-14 bg-surface-container-highest px-4 rounded-xl font-bold focus:outline-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Additional Notes</label>
                  <textarea 
                    value={editingLog.notes || ''}
                    onChange={(e) => setEditingLog({...editingLog, notes: e.target.value})}
                    rows={4}
                    className="w-full bg-surface-container-highest p-4 rounded-xl font-medium focus:outline-primary resize-none"
                    placeholder="Enter any additional context..."
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    onClick={handleUpdateLog}
                    className="flex-1 py-4 bg-primary text-on-primary rounded-xl font-headline font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-center"
                  >
                    Save Changes
                  </button>
                  <button 
                    onClick={() => setEditingLog(null)}
                    className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-xl font-headline font-black uppercase tracking-widest text-xs hover:bg-surface-container-high transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md" 
              onClick={() => setShowDeleteConfirm(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface rounded-[2.5rem] p-10 w-full max-w-sm relative z-10 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto text-red-600">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-black text-on-surface">{t('dashboard.delete_confirm_title') || 'Delete Record?'}</h3>
                <p className="text-on-surface-variant leading-relaxed">{t('dashboard.delete_confirm') || 'Are you sure you want to delete this health record?'}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleDeleteLog(showDeleteConfirm)}
                  className="w-full py-4 bg-red-600 text-white font-headline font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-ambient"
                >
                  {t('common.delete') || 'Delete'}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, TrendingUp, Brain, RefreshCw, Activity, Heart, ShieldCheck, Droplets, Footprints, Users, Stethoscope, Smile, AlertTriangle, Moon, Sun, Calendar, Bell, Clock, ChevronRight } from 'lucide-react';
import { generateAdvancedInsights } from '@/src/services/geminiService';
import { HealthData, Appointment, ChatMessage, AIInsight, AIRecommendation, Screen } from '@/src/types';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn, calculateHealthScore, getSystemRecommendations, getAppointmentSuggestion } from '@/src/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, LabelList } from 'recharts';

interface InsightsProps {
  onNavigate?: (screen: Screen) => void;
}

export const Insights: React.FC<InsightsProps> = ({ onNavigate }) => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [healthData, setHealthData] = useState<HealthData[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role === 'caregiver' && profile.assignedPatientId) {
      setViewingPatientId(profile.assignedPatientId);
    } else {
      setViewingPatientId(user?.uid || null);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!viewingPatientId) return;

    const healthPath = `users/${viewingPatientId}/healthLogs`;
    const healthQ = query(collection(db, healthPath), orderBy('timestamp', 'desc'), limit(14));
    
    const unsubscribeHealth = onSnapshot(healthQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthData[];
      setHealthData([...data].reverse());
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, healthPath);
    });

    const apptPath = `users/${viewingPatientId}/appointments`;
    const apptQ = query(collection(db, apptPath), orderBy('date', 'asc'), limit(5));

    const unsubscribeAppts = onSnapshot(apptQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      setAppointments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, apptPath);
    });

    const chatPath = `users/${viewingPatientId}/chatHistory`;
    const chatQ = query(collection(db, chatPath), orderBy('timestamp', 'desc'), limit(20));

    const unsubscribeChat = onSnapshot(chatQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setChatHistory([...data].reverse());
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, chatPath);
    });

    return () => {
      unsubscribeHealth();
      unsubscribeAppts();
      unsubscribeChat();
    };
  }, [viewingPatientId]);

  const handleAnalyze = async () => {
    if (healthData.length === 0) return;
    setLoading(true);
    const result = await generateAdvancedInsights(healthData, appointments, chatHistory, language, profile?.role || 'patient');
    if (result) setInsight(result);
    setLoading(false);
  };

  const getFollowUpSuggestion = () => {
    const latestLog = healthData[healthData.length - 1];
    if (!latestLog?.bloodPressure) return null;
    return getAppointmentSuggestion(latestLog.bloodPressure, appointments);
  };

  const alertMessage = getFollowUpSuggestion() || insight?.proactiveAlert;

  const handleScheduleAppointment = async () => {
    if (!user || !getFollowUpSuggestion()) return;
    
    try {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const appointmentData = {
        userId: user.uid,
        title: "High BP Follow-up (Dr. Lim)",
        date: nextWeek.toISOString().split('T')[0],
        time: "09:00",
        type: 'follow-up',
        status: 'scheduled',
        notes: "Automatically scheduled due to high blood pressure reading.",
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'users', user.uid, 'appointments'), appointmentData);
      onNavigate?.('calendar');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/appointments`);
    }
  };

  useEffect(() => {
    if (healthData.length > 0 && !insight) {
      handleAnalyze();
    }
  }, [healthData]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'hydration': return <Droplets className="text-primary" />;
      case 'mobility': return <Footprints className="text-tertiary" />;
      case 'social': return <Users className="text-primary" />;
      case 'medical': return <Stethoscope className="text-tertiary" />;
      case 'mental': return <Smile className="text-primary" />;
      case 'lifestyle': return <Sun className="text-amber-500" />;
      case 'alert': return <AlertTriangle className="text-red-500" />;
      default: return <Activity className="text-primary" />;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'calendar': return t('calendar.add_event') || 'Add to Calendar';
      case 'reminder': return t('settings.add_reminder') || 'Add Reminder';
      case 'notify': return t('community.notify_caregiver') || 'Notify Caregiver';
      case 'reschedule': return t('calendar.reschedule') || 'Reschedule';
      case 'monitor': return t('dashboard.monitor_closely') || 'Monitor Closely';
      default: return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-6 pt-12 pb-40 space-y-16"
    >
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-6">
          <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">{t('insights.header_tagline')}</span>
          <h2 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.9] tracking-tighter">
            {t('insights.header_title')}
          </h2>
          <p className="text-on-surface-variant text-xl max-w-md leading-relaxed">
            {t('insights.header_desc')}
          </p>
        </div>

        {insight && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-surface-container-low p-8 rounded-[2.5rem] shadow-ambient flex items-center gap-6 border border-primary/10"
          >
            {(() => {
              const latestLog = healthData[healthData.length - 1];
              const score = calculateHealthScore(
                latestLog?.steps || 0,
                latestLog?.heartRate || 0,
                latestLog?.weight || 0,
                latestLog?.sleepHours || 0,
                latestLog?.bloodPressure || '0/0'
              );
              return (
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-container-highest" />
                    <circle 
                      cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" 
                      strokeDasharray={251.2} 
                      strokeDashoffset={251.2 - (251.2 * score) / 100}
                      className="text-primary transition-all duration-1000 ease-out" 
                    />
                  </svg>
                  <span className="absolute font-headline font-black text-2xl text-primary">{score}</span>
                </div>
              );
            })()}
            <div>
              <h4 className="font-headline font-black text-on-surface">{t('insights.health_score')}</h4>
              <p className="text-xs font-headline font-black text-outline uppercase tracking-widest">{t('insights.calculated_score') || 'Calculated Status'}</p>
            </div>
          </motion.div>
        )}
      </section>

      {/* Proactive Alert Banner - Hidden for admins */}
      <AnimatePresence>
        {profile?.role !== 'admin' && alertMessage && (
          <motion.section 
            initial={{ height: 0, opacity: 0, y: -20 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -20 }}
            className="bg-surface-container-high border-2 border-dashed border-outline/20 p-10 rounded-[3rem] shadow-ambient relative overflow-hidden group hover:border-primary/40 transition-all"
          >
            <div className="flex flex-col md:flex-row gap-10 items-center md:items-start relative z-10">
              <div className="bg-surface-container-highest p-6 rounded-[2.5rem] shrink-0 border border-outline/10 text-primary shadow-sm ring-1 ring-primary/5 group-hover:scale-105 transition-transform">
                <ShieldCheck size={48} />
              </div>
              <div className="space-y-6 text-center md:text-left flex-grow">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    <h4 className="font-mono text-[10px] font-black text-primary uppercase tracking-[0.2em] leading-none">Status: Monitor Active</h4>
                  </div>
                </div>
                <p className="text-on-surface text-3xl font-headline font-black leading-tight tracking-tight max-w-2xl">
                  {alertMessage}
                </p>
                
                {getFollowUpSuggestion() && (
                  <div className="flex flex-wrap gap-5 pt-6 justify-center md:justify-start">
                    <button 
                      onClick={() => onNavigate?.('calendar')}
                      className="bg-surface-container-highest text-on-surface-variant px-12 py-5 rounded-full font-mono text-[11px] font-black uppercase tracking-[0.2em] hover:bg-surface-container-high transition-all border border-outline/20"
                    >
                      REVIEW_CALENDAR
                    </button>
                    <button 
                      onClick={handleScheduleAppointment}
                      className="bg-primary text-on-primary px-12 py-5 rounded-full font-mono text-[11px] font-black uppercase tracking-[0.2em] hover:bg-primary/90 transition-all shadow-xl active:scale-95 border border-primary/20"
                    >
                      COMMIT_SCHEDULE
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Technical background elements */}
            <div className="absolute -right-32 -top-32 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />
            <div className="absolute -left-32 -bottom-32 w-80 h-80 bg-tertiary/5 rounded-full blur-[100px]" />
            <div className="absolute right-0 bottom-0 p-4 opacity-5 pointer-events-none">
              <Brain size={120} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* AI Analysis Card - Editorial Hero */}
      <section className="bg-surface-container-low rounded-[2.5rem] p-10 shadow-ambient relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5">
          <Brain size={120} />
        </div>
        
        <div className="max-w-2xl space-y-8 relative z-10">
          <div className="flex items-center justify-between">
            <h4 className="font-headline text-3xl font-black text-primary flex items-center gap-4">
              <Sparkles size={32} className="text-tertiary" />
              {profile?.role === 'caregiver' ? t('insights.summary_title') : t('dashboard.clarity_title')}
            </h4>
            <button 
              onClick={handleAnalyze}
              disabled={loading}
              className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center hover:scale-105 transition-all disabled:opacity-50"
            >
              <RefreshCw size={24} className={cn("text-primary", loading && "animate-spin")} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-4 bg-surface-container-highest rounded w-full"></div>
              <div className="h-4 bg-surface-container-highest rounded w-5/6"></div>
              <div className="h-4 bg-surface-container-highest rounded w-4/6"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-on-surface-variant leading-relaxed text-xl font-medium">
                {insight?.summary || t('insights.generating')}
              </div>
              {insight?.trends && (
                <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                  <h5 className="text-xs font-headline font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                    <TrendingUp size={16} />
                    {t('insights.trend_report')}
                  </h5>
                  <p className="text-on-surface-variant text-lg leading-relaxed">{insight.trends}</p>
                </div>
              )}
            </div>
          )}

          <div className="pt-8 border-t border-outline-variant/10 flex items-center gap-3">
            <ShieldCheck size={20} className="text-primary" />
            <p className="text-xs font-headline font-black uppercase tracking-widest text-outline">{t('insights.verified')}</p>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Blood Pressure Trend - Converted to BarChart */}
        <div className="lg:col-span-2 bg-surface-container-highest rounded-[2rem] p-10 space-y-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-3">
              <Activity size={20} className="text-primary" />
              {t('insights.bp_trend')}
            </h3>
            <span className="text-[10px] font-headline font-black text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">{t('insights.status_stable')}</span>
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthData?.length > 0 ? healthData : []} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece7de" />
                <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} stroke="#757870" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} domain={[60, 160]} stroke="#757870" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fef9f1', borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#00440c' }}
                />
                <Bar dataKey={(d) => d.bloodPressure ? parseInt(d.bloodPressure.split('/')[0]) : 0} name={t('insights.systolic')} fill="#00440c" radius={[8, 8, 0, 0]}>
                   <LabelList dataKey="bloodPressure" position="top" offset={10} fill="#00440c" fontSize={12} fontWeight="900" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heart Rate Trend - Converted to BarChart */}
        <div className="bg-surface-container-highest rounded-[2rem] p-10 space-y-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-3">
              <Heart size={20} className="text-tertiary" />
              {t('insights.heart_rate')}
            </h3>
            <span className="text-[10px] font-headline font-black text-tertiary bg-tertiary/10 px-3 py-1 rounded-full uppercase tracking-widest">{t('insights.status_normal')}</span>
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthData?.length > 0 ? healthData : []} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece7de" />
                <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} domain={[50, 110]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fef9f1', borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#4e3500' }}
                />
                <Bar dataKey="heartRate" name={t('metrics.bpm')} fill="#4e3500" radius={[10, 10, 0, 0]}>
                  <LabelList dataKey="heartRate" position="top" offset={10} fill="#4e3500" fontSize={12} fontWeight="900" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity & Steps Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-surface-container-highest rounded-[2rem] p-10 space-y-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-3">
              <Footprints size={20} className="text-primary" />
              {t('insights.activity')}
            </h3>
            <span className="text-[10px] font-headline font-black text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">{t('insights.status_improving')}</span>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthData?.length > 0 ? healthData : []} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece7de" />
                <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fef9f1', borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#00440c' }}
                />
                <Bar dataKey="steps" name={t('metrics.steps')} fill="#00440c" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="steps" position="top" offset={10} fill="#00440c" fontSize={11} fontWeight="900" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sleep Patterns - Converted to BarChart */}
        <div className="bg-surface-container-highest rounded-[2rem] p-10 space-y-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-3">
              <Moon size={20} className="text-primary" />
              {t('insights.sleep')}
            </h3>
            <span className="text-[10px] font-headline font-black text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">{t('insights.status_restorative')}</span>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthData?.length > 0 ? healthData : []} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece7de" />
                <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} domain={[0, 12]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fef9f1', borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#00440c' }}
                />
                <Bar dataKey="sleepHours" name={t('metrics.hours')} fill="#00440c" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="sleepHours" position="top" offset={10} fill="#00440c" fontSize={12} fontWeight="900" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Mood Trends - Converted to BarChart */}
      <div className="bg-surface-container-highest rounded-[2rem] p-10 space-y-8 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-3">
            <Smile size={20} className="text-tertiary" />
            {t('insights.mood')}
          </h3>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(healthData || []).map(d => ({
              ...d,
              moodValue: d.mood === 'Excellent' ? 5 : d.mood === 'Good' ? 4 : d.mood === 'Neutral' ? 3 : d.mood === 'Fair' ? 2 : d.mood === 'Poor' ? 1 : 3
            }))} margin={{ top: 30, right: 30, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece7de" />
              <XAxis dataKey="timestamp" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#757870', fontWeight: 'bold' }} 
                domain={[0, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(val) => val === 5 ? t('mood.excellent') : val === 4 ? t('mood.good') : val === 3 ? t('mood.neutral') : val === 2 ? t('mood.fair') : val === 1 ? t('mood.poor') : ''}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fef9f1', borderRadius: '16px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.05)' }}
                itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#4e3500' }}
                formatter={(val: number) => [val === 5 ? t('mood.excellent') : val === 4 ? t('mood.good') : val === 3 ? t('mood.neutral') : val === 2 ? t('mood.fair') : t('mood.poor'), t('mood.title')]}
              />
              <Bar dataKey="moodValue" name={t('mood.title')} fill="#4e3500" radius={[10, 10, 0, 0]}>
                <LabelList 
                  dataKey="mood" 
                  position="top" 
                  offset={15} 
                  fill="#4e3500" 
                  fontSize={11} 
                  fontWeight="900"
                  formatter={(val: string) => t(`mood.${val.toLowerCase()}`) || val}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Health Recommendations - Hidden for admins */}
      {profile?.role !== 'admin' && (
        <section className="space-y-12 pb-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4">
              <h3 className="text-5xl font-headline font-black text-primary tracking-tighter">{t('insights.recommendations')}</h3>
              <p className="text-on-surface-variant text-lg max-w-xl">{t('insights.rec_desc') || 'Personalized actions derived from your latest health metrics and AI analysis.'}</p>
            </div>
            <div className="flex items-center gap-4 bg-surface-container-highest p-4 rounded-2xl border border-outline/10">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-[10px] font-headline font-black text-primary uppercase tracking-widest">{t('insights.live_updates') || 'Live Updates'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {(() => {
              const latestLog = healthData[healthData.length - 1];
              const sysRecs = latestLog ? getSystemRecommendations(
                latestLog.steps || 0,
                latestLog.heartRate || 0,
                latestLog.weight || 0,
                latestLog.sleepHours || 0
              ) : [];
              
              const allRecs = [...sysRecs, ...(insight?.recommendations || [])];

              return allRecs.length > 0 ? allRecs.map((rec, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "bg-surface-container-low p-8 rounded-[2.5rem] shadow-ambient flex flex-col gap-8 border transition-all group relative overflow-hidden h-full",
                    rec.priority === 'high' ? "border-tertiary/20 ring-1 ring-tertiary/5" : "border-primary/5 hover:border-primary/20"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm transition-colors",
                      rec.priority === 'high' ? "bg-tertiary/10" : "bg-surface-container-highest group-hover:bg-primary/10"
                    )}>
                      {getCategoryIcon(rec.category)}
                    </div>
                    {rec.priority === 'high' && (
                      <div className="bg-tertiary/10 text-tertiary p-2 rounded-xl">
                        <AlertTriangle size={20} className="animate-pulse" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 flex-grow">
                    <h4 className="text-2xl font-headline font-black text-on-surface group-hover:text-primary transition-colors leading-tight">
                      {rec.title}
                    </h4>
                    <p className="text-on-surface-variant leading-relaxed text-sm font-medium">
                      {rec.description}
                    </p>
                  </div>

                  {rec.actionType !== 'none' && (
                    <button 
                      onClick={() => {
                        if (rec.actionType === 'calendar' || rec.actionType === 'reschedule') {
                          onNavigate?.('calendar');
                        } else if (rec.actionType === 'notify') {
                          onNavigate?.('health-circle');
                        } else if (rec.actionType === 'reminder') {
                          onNavigate?.('settings' as Screen);
                        } else {
                          alert(`Action: ${rec.actionType}`);
                        }
                      }}
                      className={cn(
                        "w-full py-5 px-6 rounded-2xl font-headline font-black text-xs uppercase tracking-[0.2em] transition-all shadow-ambient active:scale-95 flex items-center justify-center gap-3",
                        rec.actionType === 'notify' ? "bg-tertiary text-on-tertiary hover:bg-tertiary/90" : 
                        rec.actionType === 'monitor' ? "bg-surface-container-highest text-on-surface hover:bg-surface-container-high" :
                        "signature-gradient text-on-primary hover:shadow-lg"
                      )}
                    >
                      {rec.actionType === 'calendar' ? <Calendar size={18} /> : 
                       rec.actionType === 'notify' ? <Bell size={18} /> : 
                       rec.actionType === 'reschedule' ? <Clock size={18} /> :
                       rec.actionType === 'monitor' ? <Activity size={18} /> :
                       <ChevronRight size={18} />}
                      {getActionLabel(rec.actionType)}
                    </button>
                  )}
                </motion.div>
              )) : (
                [1, 2, 3, 4].map((_, i) => (
                  <div key={i} className="bg-surface-container-low p-8 rounded-[3rem] shadow-sm animate-pulse space-y-8 h-80">
                    <div className="bg-surface-container-highest w-16 h-16 rounded-2xl"></div>
                    <div className="space-y-4">
                      <div className="h-6 bg-surface-container-highest rounded w-3/4"></div>
                      <div className="h-4 bg-surface-container-highest rounded w-full"></div>
                      <div className="h-4 bg-surface-container-highest rounded w-5/6"></div>
                    </div>
                  </div>
                ))
              )
            })()}
        </div>
      </section>
      )}
    </motion.div>
  );
};

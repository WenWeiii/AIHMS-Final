import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, ChevronDown, Search, Filter, Calendar as CalendarIcon, 
  ArrowDownWideNarrow, Download, Trash2, AlertCircle, 
  Activity, Heart, Weight, Moon, Smile, Meh, Frown, Laugh, Star,
  Clock, ShieldAlert, CheckCircle2, MoreVertical, FileText, ChevronRight, Share2, Sparkles
} from 'lucide-react';
import { getDisplayVitals } from '../lib/vitals';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, where, updateDoc } from 'firebase/firestore';
import { HealthData, Screen, TriageZone, UserProfile } from '../types';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { cn, safeParseDate } from '../lib/utils';

interface HealthHistoryProps {
  onNavigate?: (screen: Screen) => void;
}

export const HealthHistory: React.FC<HealthHistoryProps> = ({ onNavigate }) => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [logs, setLogs] = useState<HealthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterZone, setFilterZone] = useState<TriageZone | 'All'>('All');
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);
  const [patientProfile, setPatientProfile] = useState<UserProfile | null>(null);
  const [selectedLog, setSelectedLog] = useState<HealthData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<HealthData | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    if ((profile?.role === 'caregiver' || profile?.role === 'admin') && profile.assignedPatientId) {
      setViewingPatientId(profile.assignedPatientId);
    } else {
      setViewingPatientId(user?.uid || null);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!viewingPatientId) return;

    setLoading(true);
    const healthPath = `users/${viewingPatientId}/healthLogs`;
    // Fetch all logs without fixed limit for "Full Archive"
    const healthQ = query(collection(db, healthPath), orderBy('timestamp', 'desc'));
    const legacyQ = query(collection(db, 'health_data'), where('userId', '==', viewingPatientId), orderBy('timestamp', 'desc'));
    
    let subData: HealthData[] = [];
    let rootData: HealthData[] = [];

    const updateMergedData = () => {
      const merged = [...subData, ...rootData]
        .sort((a, b) => (safeParseDate(b.timestamp)?.getTime() || 0) - (safeParseDate(a.timestamp)?.getTime() || 0));
      
      const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
      setLogs(unique);
      setLoading(false);
    };

    const unsubscribeHealth = onSnapshot(healthQ, (snapshot) => {
      subData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthData[];
      updateMergedData();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, healthPath);
      setLoading(false);
    });

    const unsubscribeLegacy = onSnapshot(legacyQ, (snapshot) => {
      rootData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthData[];
      updateMergedData();
    }, (error) => {
      console.warn("Legacy history fetch error:", error);
      updateMergedData();
    });

    return () => {
      unsubscribeHealth();
      unsubscribeLegacy();
    };
  }, [viewingPatientId]);

  const handleDeleteLog = async (logId: string) => {
    if (!viewingPatientId) return;
    try {
      await deleteDoc(doc(db, `users/${viewingPatientId}/healthLogs`, logId));
      setShowDeleteConfirm(null);
      if (selectedLog?.id === logId) setSelectedLog(null);
    } catch (error) {
      console.error("Error deleting log:", error);
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
    } catch (error) {
      console.error("Error updating log:", error);
    }
  };

  const handleShareLog = (log: HealthData) => {
    const text = `AIHMs Health Summary (${safeParseDate(log.timestamp)?.toLocaleDateString()}):\n- BPM: ${log.heartRate ?? '--'}\n- BP: ${log.bloodPressure ?? '--'}\n- Weight: ${log.weight ?? '--'}kg\n- Steps: ${log.steps ?? '0'}\n- Mood: ${log.mood ?? 'Good'}\n- Notes: ${log.notes || 'None'}`;
    if (navigator.share) {
      navigator.share({ title: 'Health Record', text }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert(t('common.copied') || 'Summary copied to clipboard');
    }
  };

  const handleDownloadLogs = () => {
    if (logs.length === 0) return;
    
    // Create CSV content
    const headers = ['Date', 'Weight (kg)', 'Heart Rate (bpm)', 'Blood Pressure', 'Steps', 'Mood', 'Triage Zone', 'Notes'];
    const rows = logs.map(log => [
      safeParseDate(log.timestamp)?.toISOString() || '',
      log.weight ?? '',
      log.heartRate ?? '',
      `"${log.bloodPressure || ''}"`,
      log.steps ?? 0,
      log.mood || 'Neutral',
      log.triageZone || 'None',
      `"${(log.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AIHMs_Health_Archive_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = !search || 
                          (log.notes?.toLowerCase() || '').includes(search) || 
                          (log.triageZone?.toLowerCase() || '').includes(search) ||
                          (log.heartRate?.toString() || '').includes(search) ||
                          (log.bloodPressure || '').includes(search);
    const matchesFilter = filterZone === 'All' || log.triageZone === filterZone;
    return matchesSearch && matchesFilter;
  });

  const getTriageColor = (zone?: TriageZone) => {
    switch (zone) {
      case 'Red': return 'bg-tertiary text-on-tertiary';
      case 'Yellow': return 'bg-amber-100 text-amber-700';
      case 'Green': return 'bg-primary/20 text-primary';
      default: return 'bg-outline/10 text-outline';
    }
  };

  const getMoodIcon = (mood?: string) => {
    switch (mood) {
      case 'Excellent': return <Star size={16} className="text-primary" />;
      case 'Good': return <Laugh size={16} className="text-green-500" />;
      case 'Neutral': return <Smile size={16} className="text-amber-500" />;
      case 'Fair': return <Meh size={16} className="text-orange-500" />;
      case 'Poor': return <Frown size={16} className="text-red-500" />;
      default: return <Smile size={16} className="text-outline" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-6 pt-12 pb-40"
    >
      <header className="mb-12 space-y-8">
        <button 
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center gap-2 text-primary hover:gap-3 transition-all"
        >
          <ChevronLeft size={20} />
          <span className="text-xs font-headline font-black uppercase tracking-widest">{t('common.back_to_dashboard')}</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-headline font-black text-primary tracking-tighter leading-none">
              {t('dashboard.full_archive')}
            </h1>
            <p className="text-on-surface-variant text-xl max-w-md">
              {t('history.archive_desc', { target: profile?.role === 'caregiver' ? (patientProfile?.displayName || t('onboarding.patient')) : t('common.you') })}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-surface-container-low px-6 py-4 rounded-2xl border border-outline/10 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-right">
                <p className="text-[10px] font-headline font-black uppercase tracking-widest text-outline">{t('history.total_records')}</p>
                <p className="text-2xl font-headline font-black text-primary">{logs.length}</p>
              </div>
              <div className="h-8 w-px bg-outline/10" />
              <FileText size={24} className="text-primary opacity-40" />
            </div>
          </div>
        </div>
      </header>

      {/* Filters Toolbar */}
      <section className="mb-10 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors" size={20} />
          <input 
            type="text"
            placeholder={t('history.search_logs')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-14 bg-surface-container-low pl-12 pr-6 rounded-2xl border border-outline/10 focus:outline-primary transition-all font-headline font-bold text-sm"
          />
        </div>
      </section>

      {/* Summary Section - Harmonized with Dashboard */}
      {logs.length > 0 && (
        <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-primary/10 shadow-sm mb-10">
          <div className="flex items-center gap-4 mb-4">
            <Sparkles size={24} className="text-tertiary" />
            <h3 className="text-xl font-headline font-black text-primary uppercase tracking-tight">
              {t('insights.summary_title') || 'Clinical Summary'}
            </h3>
          </div>
          <p className="text-on-surface-variant font-medium leading-relaxed">
            {profile?.role === 'caregiver' 
              ? `Showing comprehensive health history for ${patientProfile?.displayName || 'Patient'}. The metrics below reflect verified logs and pre-triage zones.`
              : `Reviewing your historical clinical logs. These records track your progress across multiple vitals including steps, weight, and heart rate.`}
          </p>
        </section>
      )}

      {/* Historical Records Section */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-headline font-black text-on-surface flex items-center gap-3">
            <Clock size={24} className="text-outline" />
            Historical Logs
          </h3>
          <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-surface-container-low px-4 rounded-2xl border border-outline/10 relative">
            <Filter size={18} className="text-outline" />
            <select 
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value as any)}
              className="bg-transparent h-14 focus:outline-none font-headline font-bold text-xs uppercase tracking-widest appearance-none pr-8"
            >
              <option value="All">{t('history.all_zones')}</option>
              <option value="Red">Critical ({t('dashboard.zone_red')})</option>
              <option value="Yellow">Warning ({t('dashboard.zone_yellow')})</option>
              <option value="Green">Stable ({t('dashboard.zone_green')})</option>
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
          </div>
          <button 
            onClick={handleDownloadLogs}
            className="h-14 w-14 bg-surface-container-low rounded-2xl border border-outline/10 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 transition-all shadow-sm"
            title="Download CSV"
          >
            <Download size={20} />
          </button>
        </div>
      </div>
    </section>

      {/* Logs Table-like Desktop View / Card Mobile View */}
      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-container-low rounded-3xl animate-pulse shadow-sm" />
          ))
        ) : filteredLogs.length === 0 ? (
          <div className="bg-surface-container-low rounded-3xl p-20 text-center border-2 border-dashed border-outline/10">
            <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 text-primary opacity-40">
              <Clock size={40} />
            </div>
            <h3 className="text-2xl font-headline font-black text-on-surface mb-2">{t('history.no_records_found')}</h3>
            <p className="text-on-surface-variant max-w-xs mx-auto">{t('history.adjust_filters')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredLogs.map((log) => {
              const display = getDisplayVitals(log);
              return (
                <motion.div 
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "bg-surface-container-highest p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-surface-container-high transition-all border-2 border-transparent relative",
                    selectedLog?.id === log.id && "border-primary/20 bg-primary/5"
                  )}
                  onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                      log.triageZone === 'Red' ? "bg-tertiary/10 text-tertiary" : 
                      log.triageZone === 'Yellow' ? "bg-amber-100 text-amber-700" :
                      "bg-primary/10 text-primary"
                    )}>
                      {log.triageZone === 'Red' ? <ShieldAlert size={24} /> : 
                       log.triageZone === 'Yellow' ? <Clock size={24} /> : 
                       <CheckCircle2 size={24} />}
                    </div>
                    <div>
                      <p className="text-[10px] font-headline font-black uppercase tracking-widest text-outline mb-1">
                        {safeParseDate(log.timestamp)?.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { 
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-headline font-black text-primary">{display.heartRate} <span className="text-[10px] opacity-60">BPM</span></span>
                        <div className="w-1 h-1 bg-outline/20 rounded-full" />
                        <span className="text-lg font-headline font-black text-on-surface">{display.bloodPressure}</span>
                        <div className="w-1 h-1 bg-outline/20 rounded-full" />
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          getTriageColor(log.triageZone)
                        )}>
                          {log.triageZone || 'None'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 md:justify-end">
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-6">
                      <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline/5">
                        <Weight size={14} className="text-primary opacity-60" />
                        <span className="text-sm font-bold">{display.weight}<span className="text-[10px] ml-0.5 opacity-60 uppercase">kg</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline/5">
                        <Activity size={14} className="text-secondary opacity-60" />
                        <span className="text-sm font-bold">{display.steps}<span className="text-[10px] ml-0.5 opacity-60 uppercase"> steps</span></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-on-surface-variant">
                      {getMoodIcon(log.mood)}
                      <span className="text-sm font-bold">{t(`mood.${(log.mood || 'Good').toLowerCase()}`)}</span>
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
                        <span className="hidden sm:inline">Edit Details</span>
                      </button>
                      
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === log.id ? null : log.id);
                          }}
                          className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                        >
                          <MoreVertical size={18} />
                        </button>
                        
                        <AnimatePresence>
                          {activeMenuId === log.id && (
                            <>
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-40"
                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}
                              />
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute right-0 top-full mt-2 w-56 bg-surface shadow-2xl rounded-2xl border border-outline/10 p-2 z-50 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button 
                                  onClick={() => { handleShareLog(log); setActiveMenuId(null); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-on-surface hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
                                >
                                  <Share2 size={16} />
                                  <span>Share summary</span>
                                </button>
                                <button 
                                  onClick={() => { /* Placeholder for Flag */ setActiveMenuId(null); alert('Record flagged for physician review.'); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-secondary hover:bg-secondary/10 rounded-xl transition-all"
                                >
                                  <AlertCircle size={16} />
                                  <span>Flag for Review</span>
                                </button>
                                <button 
                                  onClick={() => { handleDownloadLogs(); setActiveMenuId(null); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-on-surface hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
                                >
                                  <Download size={16} />
                                  <span>Export (CSV)</span>
                                </button>
                                <div className="h-px bg-outline/10 my-1" />
                                <button 
                                  onClick={() => { setShowDeleteConfirm(log.id); setActiveMenuId(null); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-tertiary hover:bg-tertiary/10 rounded-xl transition-all"
                                >
                                  <Trash2 size={16} />
                                  <span>Delete Record</span>
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {selectedLog?.id === log.id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="w-full border-t border-outline/10 mt-4 pt-6 space-y-4"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-surface-container-low p-4 rounded-2xl">
                            <p className="text-[8px] font-headline font-black uppercase text-outline mb-1">Blood Pressure</p>
                            <p className="text-sm font-bold">{display.bloodPressure}</p>
                          </div>
                          <div className="bg-surface-container-low p-4 rounded-2xl">
                            <p className="text-[8px] font-headline font-black uppercase text-outline mb-1">Heart Rate</p>
                            <p className="text-sm font-bold">{display.heartRate} BPM</p>
                          </div>
                          <div className="bg-surface-container-low p-4 rounded-2xl">
                            <p className="text-[8px] font-headline font-black uppercase text-outline mb-1">Weight</p>
                            <p className="text-sm font-bold">{display.weight} kg</p>
                          </div>
                          <div className="bg-surface-container-low p-4 rounded-2xl">
                            <p className="text-[8px] font-headline font-black uppercase text-outline mb-1">Steps</p>
                            <p className="text-sm font-bold">{display.steps}</p>
                          </div>
                        </div>
                        {log.notes && (
                          <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                            <p className="text-[8px] font-headline font-black uppercase text-primary mb-2">Reviewer Notes</p>
                            <p className="text-sm text-on-surface-variant italic leading-relaxed">"{log.notes}"</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-surface p-10 rounded-[2.5rem] shadow-2xl z-[101] border border-outline/10"
            >
              <div className="w-20 h-20 bg-tertiary/10 rounded-3xl flex items-center justify-center text-tertiary mx-auto mb-8">
                <ShieldAlert size={40} />
              </div>
              <h3 className="text-3xl font-headline font-black text-center text-on-surface mb-4">{t('history.delete_title')}</h3>
              <p className="text-on-surface-variant text-center mb-10 leading-relaxed font-medium">
                {t('history.delete_desc')}
              </p>
              <div className="space-y-4">
                <button 
                  onClick={() => handleDeleteLog(showDeleteConfirm)}
                  className="w-full py-5 bg-tertiary text-on-tertiary rounded-2xl font-headline font-black uppercase tracking-widest text-sm shadow-lg shadow-tertiary/20 hover:scale-105 active:scale-95 transition-all"
                >
                  {t('common.delete')}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-full py-5 bg-surface-container-highest text-on-surface rounded-2xl font-headline font-black uppercase tracking-widest text-sm hover:bg-surface-container-high transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Record Modal */}
      <AnimatePresence>
        {editingLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingLog(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface p-10 rounded-[2.5rem] shadow-2xl z-[101] border border-outline/10 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-3xl font-headline font-black text-primary mb-2">Edit Record</h2>
              <p className="text-on-surface-variant mb-8 font-medium">Update the historical data for this timestamp.</p>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Weight (kg)</label>
                    <input 
                      type="number"
                      value={editingLog.weight || ''}
                      onChange={(e) => setEditingLog({...editingLog, weight: parseFloat(e.target.value) || undefined})}
                      className="w-full h-14 bg-surface-container-highest px-4 rounded-xl font-bold focus:outline-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-black uppercase text-outline ml-2">Heart Rate (BPM)</label>
                    <input 
                      type="number"
                      value={editingLog.heartRate || ''}
                      onChange={(e) => setEditingLog({...editingLog, heartRate: parseInt(e.target.value) || undefined})}
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
                      value={editingLog.steps || ''}
                      onChange={(e) => setEditingLog({...editingLog, steps: parseInt(e.target.value) || undefined})}
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
                    className="flex-1 py-4 bg-primary text-on-primary rounded-xl font-headline font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
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
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

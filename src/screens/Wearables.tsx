import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Watch, 
  Smartphone, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Heart, 
  Activity, 
  Moon,
  ExternalLink,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { useTranslation } from '../components/LanguageProvider';
import { useFirebase } from '../components/FirebaseProvider';
import { updateDoc, doc, collection, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

export const Wearables: React.FC = () => {
  const { t } = useTranslation();
  const { profile, user } = useFirebase();
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const targetUid = (profile?.role === 'caregiver' && profile?.assignedPatientId) 
    ? profile.assignedPatientId 
    : user?.uid;

  useEffect(() => {
    if (!targetUid) return;
    const unsub = onSnapshot(doc(db, 'users', targetUid), (snap) => {
      if (snap.exists()) {
        setTargetProfile({ uid: snap.id, ...snap.data() } as UserProfile);
      }
    });
    return () => unsub();
  }, [targetUid]);

  const handleConnectFitbit = async () => {
    if (!user || !targetUid) return;
    try {
      const response = await fetch(`/api/auth/fitbit/url?uid=${targetUid}`);
      const { url, error } = await response.json();
      
      if (error) throw new Error(error);

      const width = 600;
      const height = 700;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2;

      const authWindow = window.open(
        url,
        'fitbit_oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!authWindow) {
        alert('Popup blocked. Please allow popups for this site.');
      }
    } catch (err) {
      console.error(err);
      alert(t('settings.fitbit_connect_error'));
    }
  };

  const handleSyncFitbit = async () => {
    if (!targetProfile?.wearableToken || !user || !targetUid) return;
    
    setIsSyncing(true);
    setSyncStatus('idle');
    
    try {
      const response = await fetch(`/api/fitbit/sync?accessToken=${profile.wearableToken}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      // Save to HealthLogs
      await addDoc(collection(db, 'users', targetUid, 'healthLogs'), {
        ...data,
        source: 'fitbit',
        timestamp: serverTimestamp(),
      });

      // Update Profile Last Sync and Vitals
      await updateDoc(doc(db, 'users', targetUid), {
        wearableSyncedAt: serverTimestamp(),
        latestVitals: {
          steps: data.steps,
          heartRate: data.heartRate,
          sleepHours: data.sleepHours,
          weight: data.weight,
          bloodPressure: data.bloodPressure,
          triageZone: data.triageZone,
          timestamp: new Date().toISOString()
        }
      });

      setSyncStatus('success');
      alert('Data Synced Successfully: Your Fitbit metrics have been imported into AIHMs.');
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
      alert(t('settings.fitbit_sync_error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const simulateSync = async () => {
    if (!user || !targetUid) return;
    setIsSyncing(true);
    setSyncStatus('idle');

    // Artificial delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const simulatedData = {
        userId: targetUid,
        steps: Math.floor(Math.random() * 5000) + 3000,
        heartRate: Math.floor(Math.random() * 15) + 65,
        sleepHours: parseFloat((Math.random() * 2 + 6).toFixed(1)),
        weight: parseFloat((Math.random() * 5 + 72).toFixed(1)),
        bloodPressure: "124/84",
        source: 'simulated_watch',
        triageZone: 'Green' as const,
        timestamp: new Date().toISOString(),
      };

      await addDoc(collection(db, 'users', targetUid, 'healthLogs'), {
        ...simulatedData,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', targetUid), {
        wearableConnected: true,
        wearableType: 'Simulated Watch',
        wearableSyncedAt: serverTimestamp(),
        latestVitals: {
          steps: simulatedData.steps,
          heartRate: simulatedData.heartRate,
          sleepHours: simulatedData.sleepHours,
          weight: simulatedData.weight,
          bloodPressure: simulatedData.bloodPressure,
          triageZone: simulatedData.triageZone,
          timestamp: simulatedData.timestamp
        }
      });

      setSyncStatus('success');
      alert('Simulation Completed! Check your dashboard.');
    } catch (err) {
      setSyncStatus('error');
      alert('Simulation Failed');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'FITBIT_AUTH_SUCCESS' && user && targetUid) {
        const { accessToken } = event.data;
        await updateDoc(doc(db, 'users', targetUid), {
          wearableConnected: true,
          wearableType: 'fitbit',
          wearableToken: accessToken,
          wearableSyncedAt: serverTimestamp()
        });
        alert(t('settings.fitbit_sync_success'));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  return (
    <div className="min-h-screen bg-[#fef9f1] pb-24">
      {/* Header */}
      <div className="bg-emerald-800 text-white pt-12 pb-20 rounded-b-[40px] shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/30 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-900/40 rounded-full -ml-10 -mb-10 blur-2xl" />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 text-emerald-200/80 mb-2">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest uppercase">{t('wearables.header_tagline')}</span>
            </div>
            <h1 className="text-3xl font-serif font-bold mb-3">{t('wearables.header_title')}</h1>
            <p className="text-emerald-100/80 max-w-md text-sm leading-relaxed">
              {targetProfile?.uid !== user?.uid 
                ? t('wearables.header_desc_caregiver').replace('{name}', targetProfile?.displayName || 'Patient') 
                : t('wearables.header_desc')}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 -mt-12 space-y-6">
        {/* Connection Status Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[32px] p-8 shadow-xl shadow-emerald-900/5 relative overflow-hidden border border-emerald-50/50"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${targetProfile?.wearableConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                <Watch className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">
                  {targetProfile?.wearableConnected ? (targetProfile.wearableType === 'fitbit' ? 'Fitbit Versa' : targetProfile.wearableType) : 'No Device Linked'}
                </h3>
                <p className="text-sm text-gray-500">
                  {targetProfile?.wearableConnected ? t('settings.status_active') : t('dashboard.never')}
                </p>
              </div>
            </div>
            {targetProfile?.wearableConnected && (
              <motion.button
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
                onClick={targetProfile.wearableType === 'fitbit' ? handleSyncFitbit : simulateSync}
                disabled={isSyncing}
                className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <RefreshCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              </motion.button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className={`p-4 rounded-2xl border ${targetProfile?.wearableConnected ? 'border-emerald-100 bg-emerald-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
              <Activity className={`w-5 h-5 mb-2 ${targetProfile?.wearableConnected ? 'text-emerald-600' : 'text-gray-300'}`} />
              <div className="text-[10px] font-bold text-gray-400 uppercase">{t('metrics.steps')}</div>
              <div className="font-bold text-gray-900">{targetProfile?.latestVitals?.steps || '0'}</div>
            </div>
            <div className={`p-4 rounded-2xl border ${targetProfile?.wearableConnected ? 'border-rose-100 bg-rose-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
              <Heart className={`w-5 h-5 mb-2 ${targetProfile?.wearableConnected ? 'text-rose-500' : 'text-gray-300'}`} />
              <div className="text-[10px] font-bold text-gray-400 uppercase">{t('metrics.heart')}</div>
              <div className="font-bold text-gray-900">{targetProfile?.latestVitals?.heartRate || '0'} bpm</div>
            </div>
            <div className={`p-4 rounded-2xl border ${targetProfile?.wearableConnected ? 'border-indigo-100 bg-indigo-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
              <Moon className={`w-5 h-5 mb-2 ${targetProfile?.wearableConnected ? 'text-indigo-500' : 'text-gray-300'}`} />
              <div className="text-[10px] font-bold text-gray-400 uppercase">{t('metrics.sleep')}</div>
              <div className="font-bold text-gray-900">{targetProfile?.latestVitals?.sleepHours || '0'}h</div>
            </div>
          </div>
        </motion.div>

        {/* Integration Options */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900 px-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            Available Services
          </h2>

          <div className="grid gap-3">
            {/* Fitbit */}
            <button
              onClick={handleConnectFitbit}
              className="flex items-center justify-between p-5 bg-white rounded-2xl border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all group group-active:scale-95"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center">
                  <img src="https://picsum.photos/seed/fitbit/100/100" className="w-8 h-8 rounded-md grayscale group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">{t('wearables.connect_fitbit')}</div>
                  <p className="text-xs text-gray-500">Cloud Sync (Best for Web)</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Simulated Watch (For Demo) */}
            <button
              onClick={simulateSync}
              className="flex items-center justify-between p-5 bg-white rounded-2xl border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all group group-active:scale-95"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Watch className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900">{t('wearables.simulate_sync')}</div>
                  <p className="text-xs text-gray-500 italic">No account required</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            {/* Apple Health (Disabled) */}
            <div className="flex items-center justify-between p-5 bg-gray-50/50 rounded-2xl border border-gray-100 opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-400">{t('wearables.connect_apple')}</div>
                  <p className="text-xs text-gray-300">{t('wearables.coming_soon')}</p>
                </div>
              </div>
              <div className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-1 rounded-full uppercase tracking-wider">Mobile Only</div>
            </div>

            {/* Google Fit (Disabled) */}
            <div className="flex items-center justify-between p-5 bg-gray-50/50 rounded-2xl border border-gray-100 opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <RefreshCcw className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-400">{t('wearables.connect_google')}</div>
                  <p className="text-xs text-gray-300">{t('wearables.coming_soon')}</p>
                </div>
              </div>
              <div className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-1 rounded-full uppercase tracking-wider">Mobile Only</div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 border-dashed">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-emerald-900 mb-1">How it works</h4>
              <p className="text-xs text-emerald-700/80 leading-relaxed">
                We use secure OAuth 2.0 to request read-only access to your health metrics. Your raw data is processed by our AI to provide the insights on your dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wearables;

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Lock, Bell, Palette, HelpCircle, LogOut, ChevronRight, MapPin, Share2, BellOff, Check, ShieldCheck, HeartHandshake, Link as LinkIcon, Watch, RefreshCw, Eye, EyeOff, Globe, Languages, Loader2, Users, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { requestNotificationPermission, sendNotification } from '../services/notificationService';
import { useTheme, ThemeName } from '../components/ThemeProvider';
import { useTranslation } from '../components/LanguageProvider';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Screen, UserRole, Language, TrustedContact } from '../types';

export const Settings: React.FC<{ onNavigate?: (screen: Screen) => void }> = ({ onNavigate }) => {
  const { user, profile, signOut, updateUserProfile, connectWearable, setRole, setLanguage: setFirebaseLanguage, toggleNarration } = useFirebase();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [showIDCard, setShowIDCard] = useState(false);
  const [showMainCaregiverPicker, setShowMainCaregiverPicker] = useState(false);
  const [caregiversData, setCaregiversData] = useState<any[]>([]);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [managedPatientsCount, setManagedPatientsCount] = useState(0);
  const [trustedContactsCount, setTrustedContactsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    displayName: user?.displayName || '',
    photoURL: user?.photoURL || '',
    bloodType: profile?.bloodType || 'O+',
    allergies: profile?.allergies || 'Penicillin'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [simulatedLocation, setSimulatedLocation] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('smart-notifications') === 'true' || ('Notification' in window && Notification.permission === 'granted');
  });
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [narrationEnabled, setNarrationEnabled] = useState(!!profile?.narrationEnabled);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000); // Update every 30s
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setNarrationEnabled(!!profile?.narrationEnabled);
  }, [profile?.narrationEnabled]);

  const handleToggleNarration = async () => {
    const newVal = !narrationEnabled;
    setNarrationEnabled(newVal);
    await toggleNarration(newVal);
  };

  const handleToggleNotifications = async () => {
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    localStorage.setItem('smart-notifications', String(newVal));

    if (newVal) {
      if ('Notification' in window && Notification.permission !== 'denied') {
        const granted = await requestNotificationPermission();
        if (granted) {
          sendNotification(t('settings.notifications_enabled_title'), {
            body: t('settings.notifications_enabled_body')
          });
        }
      }
    }
  };

  const handleToggleLocation = () => {
    if (!locationSharing) {
      setSimulatedLocation("37.7749° N, 122.4194° W (San Francisco)");
      setLocationSharing(true);
    } else {
      setSimulatedLocation(null);
      setLocationSharing(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile(profileForm.displayName, profileForm.photoURL, profileForm.bloodType, profileForm.allergies);
      setShowProfileEditor(false);
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

// Moved handleLinkPatient to HealthCircle.tsx
  const [roleToConfirm, setRoleToConfirm] = useState<UserRole | null>(null);

  const handleRoleChangeRequest = (newRole: UserRole) => {
    if (!user || !profile || newRole === profile.role) return;
    setRoleToConfirm(newRole);
  };

  const confirmRoleChange = async () => {
    if (!roleToConfirm) return;
    setIsSaving(true);
    try {
      await setRole(roleToConfirm);
      setShowRoleSelector(false);
      setRoleToConfirm(null);
    } catch (error) {
      console.error("Failed to change role:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateInviteToken = async () => {
    if (!user) return;
    setGeneratingToken(true);
    try {
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes expiry
      await updateDoc(doc(db, 'users', user.uid), {
        inviteToken: token,
        inviteTokenExpiresAt: expiresAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setGeneratingToken(false);
    }
  };

  const fetchCaregivers = async () => {
    try {
      const systemCaregivers = profile?.caregiverIds?.length 
        ? await Promise.all(
            profile.caregiverIds.map(async (id) => {
              const docSnap = await getDoc(doc(db, 'users', id));
              return docSnap.exists() ? { uid: id, ...docSnap.data(), isSystem: true } : null;
            })
          )
        : [];

      // Combine with trusted contacts which are already synced in useEffect
      const formattedTrusted = trustedContacts.map(tc => ({
        uid: tc.id,
        displayName: tc.name,
        photoURL: null,
        role: 'trusted_contact',
        relation: tc.relation,
        isSystem: false
      }));

      setCaregiversData([...systemCaregivers.filter(Boolean), ...formattedTrusted]);
    } catch (error) {
      console.error("Error fetching caregivers:", error);
    }
  };

  const handleSetMainCaregiver = async (caregiverId: string) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        mainCaregiverId: caregiverId
      });
      setShowMainCaregiverPicker(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (user && profile?.role === 'caregiver') {
      const q = query(collection(db, 'users'), where('caregiverIds', 'array-contains', user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setManagedPatientsCount(snapshot.docs.length);
      });
      return () => unsubscribe();
    }
  }, [user, profile?.role]);

  useEffect(() => {
    if (user) {
      const path = `users/${user.uid}/trustedContacts`;
      const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TrustedContact[];
        setTrustedContacts(data);
        setTrustedContactsCount(data.length);
      }, (error) => {
        console.error("Error fetching trusted contacts count:", error);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const handleConnectFitbit = async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/auth/fitbit/url?uid=${user.uid}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      window.open(url, 'fitbit_oauth', 'width=600,height=700');
    } catch (error) {
      console.error("Fitbit connect error:", error);
      alert(t('settings.fitbit_connect_error'));
    }
  };

  const handleSyncFitbit = async () => {
    if (!user || !profile?.wearableToken) return;
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/fitbit/sync?accessToken=${profile.wearableToken}`);
      if (!response.ok) throw new Error('Sync failed');
      const data = await response.json();
      
      // Save to health logs
      const logsRef = collection(db, `users/${user.uid}/healthLogs`);
      await addDoc(logsRef, {
        ...data,
        notes: t('settings.synced_from_fitbit'),
        createdAt: new Date().toISOString()
      });

      // Update last synced
      await updateDoc(doc(db, 'users', user.uid), {
        wearableSyncedAt: new Date().toISOString()
      });

      alert(t('settings.fitbit_sync_success'));
    } catch (error) {
      console.error("Fitbit sync error:", error);
      alert(t('settings.fitbit_sync_error'));
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FITBIT_AUTH_SUCCESS') {
        const { accessToken } = event.data;
        connectWearable('fitbit', accessToken);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [connectWearable]);

  const isAdminEmail = user?.email === 'ongyh123@gmail.com' || user?.email === 'shumww1@gmail.com';
  const isAdminUser = isAdminEmail || profile?.role === 'admin';

  const sections = [
    {
      title: t('settings.section_account'),
      items: [
        { label: t('settings.label_profile'), icon: User, value: null, action: () => {
          setProfileForm({
            displayName: user?.displayName || '',
            photoURL: user?.photoURL || '',
            bloodType: profile?.bloodType || 'O+',
            allergies: profile?.allergies || 'Penicillin'
          });
          setShowProfileEditor(true);
        }},
        (isAdminUser ? { 
          label: t('settings.label_role'), 
          icon: ShieldCheck, 
          value: profile?.role === 'admin' ? 'Admin' : (profile?.role === 'caregiver' ? t('settings.role_caregiver') : t('settings.role_patient')), 
          action: () => setShowRoleSelector(true) 
        } : null),
        { label: t('settings.label_privacy'), icon: Lock, value: null, action: () => setShowPrivacyControls(true) },
      ].filter(Boolean) as any
    },
    {
      title: t('settings.section_care_network'),
      items: [
        profile?.role === 'patient' && { 
          label: t('settings.label_my_caregivers'), 
          icon: ShieldCheck, 
          value: `${(profile?.caregiverIds?.length || 0) + (trustedContactsCount || 0)} ${t('settings.status_linked')}`,
          action: () => {
            fetchCaregivers();
            setShowMainCaregiverPicker(true);
          }
        },
        profile?.role === 'caregiver' && {
          label: t('health_circle.linked_patients'),
          icon: Users,
          value: `${managedPatientsCount} ${t('onboarding.patient')}`,
          action: () => onNavigate?.('health-circle')
        }
      ].filter(Boolean) as any
    },
    {
      title: t('settings.section_health_services'),
      items: [
        { label: t('settings.label_emergency_location'), icon: MapPin, value: locationSharing ? t('settings.status_active') : t('settings.status_disabled'), action: handleToggleLocation },
        (profile?.role !== 'caregiver' && profile?.role !== 'admin' ? { 
          label: t('settings.label_wearable'), 
          icon: isSyncing ? RefreshCw : Watch, 
          value: isSyncing ? t('settings.status_syncing') : (profile?.wearableConnected ? (profile?.wearableType === 'fitbit' ? t('settings.status_fitbit_connected') : profile?.wearableType) : t('settings.status_not_connected')),
          action: () => onNavigate?.('wearables')
        } : null),
      ].filter(Boolean) as any
    },
    {
      title: t('settings.section_preferences'),
      items: [
        { 
          label: t('settings.label_smart_notifications'), 
          icon: notificationsEnabled ? Bell : BellOff, 
          value: notificationsEnabled ? t('settings.status_active') : t('settings.status_disabled'),
          action: handleToggleNotifications
        },
        { 
          label: t('settings.label_narration'), 
          icon: narrationEnabled ? Volume2 : VolumeX, 
          value: narrationEnabled ? t('settings.status_active') : t('settings.status_disabled'),
          action: handleToggleNarration
        },
        { 
          label: t('settings.theme'), 
          icon: Palette, 
          value: t(`theme.${theme}`),
          action: () => setShowThemePicker(true)
        },
        { 
          label: t('settings.language'), 
          icon: Languages, 
          value: t(`language.${language}`),
          action: () => setShowLanguagePicker(true)
        },
      ]
    }
  ];

  const themeOptions: { name: ThemeName; label: string; color: string }[] = [
    { name: 'emerald', label: t('theme.emerald'), color: '#00440c' },
    { name: 'sapphire', label: t('theme.sapphire'), color: '#003366' },
    { name: 'harvest', label: t('theme.harvest'), color: '#8a4b08' },
    { name: 'lavender', label: t('theme.lavender'), color: '#4a148c' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-6 pt-12 pb-40"
    >
      <section className="mb-16 space-y-6">
        <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">{t('settings.header_tagline')}</span>
        <h2 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.9] tracking-tighter">
          {t('nav.settings')}
        </h2>
        <p className="text-on-surface-variant text-xl max-w-md leading-relaxed">{t('settings.header_desc')}</p>
      </section>

      {/* Location Simulation Banner - Editorial Style */}
      {locationSharing && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-12 bg-tertiary-container p-8 rounded-[2.5rem] flex items-center gap-8 shadow-ambient relative overflow-hidden"
        >
          <div className="bg-on-tertiary-container text-tertiary-container w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse relative z-10">
            <MapPin size={32} />
          </div>
          <div className="relative z-10">
            <h4 className="font-headline font-black text-on-tertiary-container text-2xl">{t('settings.location_sharing_active')}</h4>
            <p className="text-lg text-on-tertiary-container/80 font-headline font-bold">{simulatedLocation}</p>
          </div>
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
        </motion.div>
      )}

      {/* Profile Card - Premium Editorial */}
      <section className="mb-16">
        <div className="bg-surface-container-low rounded-[3rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-ambient border border-primary/5 relative overflow-hidden group">
          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="w-24 h-24 rounded-[2rem] p-1 bg-signature-gradient shadow-ambient relative group-hover:scale-105 transition-all">
              <img 
                className="w-full h-full rounded-[1.8rem] object-cover border-4 border-surface" 
                src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
                alt={user?.displayName || t('common.anonymous')}
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-2 -right-2 bg-on-surface text-surface w-8 h-8 rounded-full flex items-center justify-center shadow-lg">
                <ShieldCheck size={18} />
              </div>
            </div>
            <div className="text-center md:text-left">
              <h3 className="font-headline font-black text-3xl text-on-surface tracking-tight">{user?.displayName || t('common.anonymous')}</h3>
              <p className="text-sm font-headline font-black text-on-surface-variant uppercase tracking-widest mt-1 opacity-70">{user?.email}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-3">
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-headline font-black uppercase tracking-widest border border-primary/10">
                  {profile?.role === 'admin' ? 'Admin' : (profile?.role === 'caregiver' ? t('settings.role_caregiver') : t('settings.role_patient'))}
                </span>
                {profile?.role === 'patient' && (
                  <button 
                    onClick={() => setShowIDCard(true)}
                    className="px-3 py-1 bg-surface-container-highest text-outline rounded-lg text-[10px] font-headline font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-2"
                  >
                    <Eye size={12} />
                    ID: {user?.uid.slice(0, 8)}...
                  </button>
                )}
              </div>
            </div>
          </div>
          {profile?.role === 'patient' && (
            <button 
              onClick={() => setShowIDCard(true)}
              className="relative z-10 signature-gradient text-on-primary px-8 py-5 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-ambient hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              <Watch size={20} />
              {t('settings.view_id_card')}
            </button>
          )}
          
          {/* Subtle Background Accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>
      </section>

      {/* Settings List - Tonal Layering */}
      <div className="space-y-16">
        {sections.filter(s => s.items.length > 0).map((section) => (
          <div key={section.title} className="space-y-8">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-primary">{section.title}</h4>
              <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
            </div>
            <div className="bg-surface-container-low rounded-[2.5rem] overflow-hidden shadow-ambient border border-primary/5">
              {section.items.map((item, idx) => (
                <div 
                  key={item.label}
                  onClick={item.action}
                  className={cn(
                    "flex items-center justify-between p-8 cursor-pointer hover:bg-surface-container-high transition-all group",
                    idx !== section.items.length - 1 && "border-b border-outline-variant/10"
                  )}
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-all overflow-hidden",
                      ((item.label === t('settings.label_narration') && narrationEnabled) ||
                       (item.label === t('settings.label_smart_notifications') && notificationsEnabled) ||
                       (item.label === t('settings.label_emergency_location') && locationSharing))
                        ? "bg-green-600/10 text-green-600"
                        : "bg-surface-container-highest text-primary"
                    )}>
                      {item.label === t('settings.label_profile') && user?.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <item.icon size={24} strokeWidth={1.5} className={cn(item.label === t('settings.label_wearable') && isSyncing && "animate-spin")} />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-headline font-black text-xl text-on-surface">{item.label}</span>
                      {item.label === t('settings.label_profile') && (
                        <span className="text-xs font-headline font-bold text-on-surface-variant">{user?.displayName || t('common.anonymous')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {item.value && (
                      <span className={cn(
                        "text-xs font-headline font-black uppercase tracking-widest px-4 py-2 rounded-xl",
                        (item.label === t('settings.label_emergency_location') && locationSharing) ||
                        (item.label === t('settings.label_smart_notifications') && notificationsEnabled) ||
                        (item.label === t('settings.label_narration') && narrationEnabled)
                          ? "bg-green-600 text-white" 
                          : "bg-surface-container-highest text-outline"
                      )}>
                        {item.value}
                      </span>
                    )}
                    <ChevronRight size={24} className="text-outline group-hover:translate-x-2 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Logout Button - Editorial Style */}
      <div className="mt-20 flex justify-center">
        <button 
          onClick={signOut}
          className="flex items-center gap-4 px-12 py-6 bg-surface-container-low text-tertiary font-headline font-black text-sm rounded-2xl hover:bg-tertiary hover:text-on-tertiary transition-all shadow-ambient group"
        >
          <LogOut size={24} className="group-hover:-translate-x-1 transition-all" />
          <span>{t('settings.logout')}</span>
        </button>
      </div>

      {/* Virtual ID Card Modal */}
      <AnimatePresence>
        {showIDCard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-xl" 
              onClick={() => setShowIDCard(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="w-full max-w-lg relative z-10"
            >
              <div className="bg-[#f0f4f8] rounded-[3.5rem] overflow-hidden shadow-2xl relative border-8 border-white">
                {/* ID Header */}
                <div className="bg-primary p-8 flex justify-between items-center text-on-primary">
                  <div className="flex flex-col">
                    <h3 className="font-headline font-black text-2xl uppercase tracking-tighter">AIHMs Clinical ID</h3>
                    <p className="text-[8px] font-headline font-black uppercase tracking-[0.4em] opacity-60">Federated Geriatric Network</p>
                  </div>
                  <ShieldCheck size={40} strokeWidth={1} />
                </div>

                <div className="p-10 space-y-10">
                  <div className="flex gap-10">
                    {/* ID Photo */}
                    <div className="w-32 h-40 bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-1 shrink-0 overflow-hidden">
                      <img 
                        src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
                        className="w-full h-full object-cover rounded-xl grayscale-[0.2]"
                        alt="ID"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* ID Info */}
                    <div className="flex-1 space-y-6">
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.label_profile')}</span>
                        <h4 className="text-2xl font-headline font-black text-on-surface leading-none">{user?.displayName || t('common.anonymous')}</h4>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.label_role')}</span>
                        <p className="font-headline font-bold text-primary uppercase tracking-widest">{profile?.role}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[8px] font-headline font-black text-outline uppercase tracking-[0.2em]">{t('settings.blood_type')}</span>
                          <p className="font-headline font-black text-on-surface">{profile?.bloodType || 'O+'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-headline font-black text-outline uppercase tracking-[0.2em]">{t('settings.allergies')}</span>
                          <p className="font-headline font-black text-on-surface text-xs">{profile?.allergies || 'Penicillin'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ID Footer Section */}
                  <div className="bg-surface-container-high rounded-3xl p-6 flex items-center justify-between border border-outline-variant/10">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-headline font-black text-outline uppercase tracking-[0.2em]">{t('settings.full_id')}</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(user?.uid || '');
                            alert(t('settings.id_copied'));
                          }}
                          className="flex items-center gap-2 text-primary hover:text-primary-high transition-colors text-[8px] font-headline font-black uppercase tracking-widest"
                        >
                          <Share2 size={12} />
                          {t('settings.copy_id')}
                        </button>
                      </div>
                      <code className="block bg-surface-container-lowest p-3 rounded-xl text-[10px] font-mono font-bold text-on-surface-variant break-all">
                        {user?.uid}
                      </code>
                    </div>
                  </div>

                  {profile?.role === 'patient' && (
                    <div className="bg-primary/5 border border-primary/10 rounded-3xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <LinkIcon size={16} className="text-primary" />
                          <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.invite_token') || 'Invite Token'}</span>
                        </div>
                        <button 
                          onClick={handleGenerateInviteToken}
                          disabled={generatingToken}
                          className="text-[10px] font-headline font-black text-primary uppercase tracking-widest hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {generatingToken ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          {t('settings.refresh_token') || 'Refresh'}
                        </button>
                      </div>
                      <div className="bg-surface rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner border border-outline-variant/5">
                        {profile?.inviteToken && profile?.inviteTokenExpiresAt && profile.inviteTokenExpiresAt > currentTime ? (
                          <>
                            <span className="text-5xl font-mono font-black tracking-[0.4em] text-primary">{profile.inviteToken}</span>
                            <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-tertiary/10 rounded-full">
                              <span className="text-[10px] font-headline font-bold text-tertiary uppercase tracking-widest leading-none">
                                {t('settings.expires_in') || 'Expires in'}: {Math.max(0, Math.round((profile.inviteTokenExpiresAt - currentTime) / 60000))}m
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center space-y-2 py-4">
                            <span className="text-sm font-headline font-bold text-outline-variant uppercase tracking-widest block">{t('settings.no_active_token') || 'No active token'}</span>
                            <button 
                              onClick={handleGenerateInviteToken}
                              className="text-xs font-headline font-black text-primary uppercase tracking-widest border-b border-primary/20"
                            >
                              {t('settings.generate_now') || 'Generate Now'}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-on-surface-variant text-center opacity-60 font-medium px-4">
                        {t('settings.linkage_tip') || 'Share this code and your Patient ID with your caregiver to link accounts.'}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-center">
                    <div className="w-20 h-20 bg-white p-2 rounded-xl border border-outline-variant/20">
                      {/* Simulated QR Code */}
                      <div className="w-full h-full bg-on-surface/5 grid grid-cols-4 gap-1 p-1">
                        {Array.from({ length: 16 }).map((_, i) => (
                          <div key={i} className={cn("rounded-sm", Math.random() > 0.4 ? "bg-on-surface/40" : "bg-transparent")} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* ID Bottom Accent */}
                <div className="h-4 bg-signature-gradient" />
              </div>

              <div className="mt-8 flex justify-center gap-4">
                <button 
                  onClick={() => {
                    setShowIDCard(false);
                    setProfileForm({
                      displayName: user?.displayName || '',
                      photoURL: user?.photoURL || '',
                      bloodType: profile?.bloodType || 'O+',
                      allergies: profile?.allergies || 'Penicillin'
                    });
                    setShowProfileEditor(true);
                  }}
                  className="bg-primary flex items-center gap-3 text-on-primary px-8 py-5 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                >
                  <Palette size={18} />
                  Edit ID
                </button>
                <button 
                  onClick={() => setShowIDCard(false)}
                  className="bg-surface-container-low text-on-surface px-8 py-5 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-xl hover:bg-surface transition-all"
                >
                  {t('common.close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Theme Picker Modal */}
      <AnimatePresence>
        {showThemePicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowThemePicker(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.select_theme')}</h3>
                <p className="text-on-surface-variant">{t('settings.theme_desc')}</p>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.name}
                    onClick={() => {
                      setTheme(opt.name);
                      setShowThemePicker(false);
                    }}
                    className={cn(
                      "flex items-center justify-between p-6 rounded-2xl border-2 transition-all",
                      theme === opt.name 
                        ? "border-primary bg-primary/5" 
                        : "border-transparent bg-surface-container-highest hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-10 h-10 rounded-xl shadow-sm" 
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="font-headline font-black text-lg text-on-surface">{opt.label}</span>
                    </div>
                    {theme === opt.name && <Check className="text-primary" size={24} />}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setShowThemePicker(false)}
                className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Language Picker Modal */}
      <AnimatePresence>
        {showLanguagePicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowLanguagePicker(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.select_language')}</h3>
                <p className="text-on-surface-variant">{t('settings.language_desc')}</p>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {(['ms', 'en', 'zh'] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                      setFirebaseLanguage(lang);
                      setShowLanguagePicker(false);
                    }}
                    className={cn(
                      "flex items-center justify-between p-6 rounded-2xl border-2 transition-all",
                      language === lang 
                        ? "border-primary bg-primary/5" 
                        : "border-transparent bg-surface-container-highest hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-headline font-black">
                        {lang.toUpperCase()}
                      </div>
                      <span className="font-headline font-black text-lg text-on-surface">{t(`language.${lang}`)}</span>
                    </div>
                    {language === lang && <Check className="text-primary" size={24} />}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setShowLanguagePicker(false)}
                className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Editor Modal */}
      <AnimatePresence>
        {showProfileEditor && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowProfileEditor(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.update_profile_title')}</h3>
                <p className="text-on-surface-variant">{t('settings.update_profile_desc')}</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.display_name_label')}</label>
                  <input 
                    type="text" 
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder={t('settings.display_name_placeholder')}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-2">
                    <label className="text-xs font-headline font-black uppercase tracking-widest text-outline">{t('settings.photo_url_label')}</label>
                    <button 
                      onClick={() => setProfileForm({ ...profileForm, photoURL: '' })}
                      className="text-[10px] font-headline font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      {t('settings.regenerate')}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={profileForm.photoURL}
                    onChange={(e) => setProfileForm({ ...profileForm, photoURL: e.target.value })}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.blood_type') || 'Blood Type'}</label>
                    <input 
                      type="text" 
                      value={profileForm.bloodType}
                      onChange={(e) => setProfileForm({ ...profileForm, bloodType: e.target.value })}
                      className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                      placeholder="O+"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.allergies') || 'Allergies'}</label>
                    <input 
                      type="text" 
                      value={profileForm.allergies}
                      onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                      className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                      placeholder="e.g. Penicillin"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowProfileEditor(false)}
                  className="flex-1 py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 py-4 signature-gradient text-on-primary font-headline font-black uppercase tracking-widest rounded-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSaving ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Role Selector Modal */}
      <AnimatePresence>
        {showRoleSelector && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowRoleSelector(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.change_role_title')}</h3>
                <p className="text-on-surface-variant">{t('settings.change_role_desc')}</p>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {(isAdminUser ? ['patient', 'caregiver', 'admin'] : ['patient', 'caregiver'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleChangeRequest(r as UserRole)}
                    disabled={profile?.role === r || isSaving}
                    className={cn(
                      "flex items-center justify-between p-6 rounded-2xl border-2 transition-all text-left",
                      profile?.role === r 
                        ? "border-primary bg-primary/5 opacity-50 cursor-not-allowed" 
                        : "border-transparent bg-surface-container-highest hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-headline font-black text-lg text-on-surface uppercase tracking-widest">
                        {r === 'patient' ? t('settings.role_patient') : (r === 'caregiver' ? t('settings.role_caregiver') : 'Admin')}
                      </span>
                      <span className="text-xs text-on-surface-variant mt-1">
                        {r === 'patient' 
                          ? t('settings.role_patient_desc') 
                          : (r === 'caregiver' ? t('settings.role_caregiver_desc') : 'Administrator Access')}
                      </span>
                    </div>
                    {profile?.role === r && <Check className="text-primary" size={24} />}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setShowRoleSelector(false)}
                className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Role Change Confirm Modal */}
      <AnimatePresence>
        {roleToConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md" 
              onClick={() => !isSaving && setRoleToConfirm(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface rounded-[2.5rem] p-10 w-full max-w-sm relative z-10 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto text-primary">
                <ShieldCheck size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-black text-on-surface">Confirm Role Change</h3>
                <p className="text-on-surface-variant leading-relaxed">
                  {roleToConfirm === 'admin' ? 'Change your role back to Administrator?' : (roleToConfirm === 'caregiver' ? t('settings.confirm_role_caregiver') : t('settings.confirm_role_patient'))}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmRoleChange}
                  disabled={isSaving}
                  className="w-full py-4 bg-primary text-on-primary font-headline font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-ambient disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Confirm'}
                </button>
                <button 
                  onClick={() => setRoleToConfirm(null)}
                  disabled={isSaving}
                  className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Privacy Controls Modal */}
      <AnimatePresence>
        {showPrivacyControls && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowPrivacyControls(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.privacy_controls_title')}</h3>
                <p className="text-on-surface-variant">{t('settings.privacy_controls_desc')}</p>
              </div>
              
              <div className="space-y-4">
                <div className="bg-surface-container-highest p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <MapPin size={20} className="text-primary" />
                      <span className="font-headline font-bold text-on-surface">{t('settings.location_sharing_label')}</span>
                    </div>
                    <button 
                      onClick={handleToggleLocation}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        locationSharing ? "bg-primary" : "bg-outline-variant"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        locationSharing ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>
                  <p className="text-[10px] text-on-surface-variant uppercase font-headline font-black tracking-widest leading-relaxed">
                    {t('settings.location_sharing_hint')}
                  </p>
                </div>

                <div className="bg-surface-container-highest p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Eye size={20} className="text-primary" />
                      <span className="font-headline font-bold text-on-surface">{t('settings.data_sharing_label')}</span>
                    </div>
                    <div className="w-12 h-6 rounded-full bg-primary relative">
                      <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full" />
                    </div>
                  </div>
                  <p className="text-[10px] text-on-surface-variant uppercase font-headline font-black tracking-widest leading-relaxed">
                    {t('settings.data_sharing_hint')}
                  </p>
                </div>

                <div className="bg-surface-container-highest p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Globe size={20} className="text-primary" />
                      <span className="font-headline font-bold text-on-surface">{t('settings.third_party_label')}</span>
                    </div>
                    <span className="text-[10px] font-headline font-black text-primary uppercase tracking-widest">
                      {profile?.wearableConnected ? `1 ${t('settings.status_active')}` : t('settings.status_none')}
                    </span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant uppercase font-headline font-black tracking-widest leading-relaxed">
                    {t('settings.third_party_hint')}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowPrivacyControls(false)}
                className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Caregiver Picker Modal */}
      <AnimatePresence>
        {showMainCaregiverPicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowMainCaregiverPicker(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="bg-primary/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-primary mb-4">
                  <ShieldCheck size={40} />
                </div>
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('settings.main_caregiver_title') || 'Primary Caregiver'}</h3>
                <p className="text-on-surface-variant">{t('settings.main_caregiver_desc') || 'Select the main person to be contacted in case of emergency.'}</p>
              </div>
              
              <div className="grid grid-cols-1 gap-4 max-h-[40vh] overflow-y-auto no-scrollbar py-2">
                {caregiversData.length === 0 ? (
                  <p className="text-center text-outline py-8 font-headline font-bold">{t('health_circle.no_contacts')}</p>
                ) : (
                  caregiversData.map((cg) => (
                    <button
                      key={cg.uid}
                      onClick={() => handleSetMainCaregiver(cg.uid)}
                      disabled={profile?.mainCaregiverId === cg.uid}
                      className={cn(
                        "flex items-center justify-between p-6 rounded-2xl border-2 transition-all text-left",
                        profile?.mainCaregiverId === cg.uid 
                          ? "border-primary bg-primary/5" 
                          : "border-transparent bg-surface-container-highest hover:bg-surface-container-high"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center overflow-hidden">
                          {cg.photoURL ? (
                            <img 
                              src={cg.photoURL} 
                              className="w-full h-full object-cover"
                              alt={cg.displayName}
                            />
                          ) : (
                            <div className="bg-primary/10 w-full h-full flex items-center justify-center text-primary">
                              <User size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-headline font-black text-lg text-on-surface line-clamp-1">{cg.displayName}</span>
                          <span className="text-[10px] text-outline uppercase font-headline font-black tracking-widest">
                            {cg.isSystem ? t('settings.role_caregiver') : (cg.relation || t('health_circle.trusted_contact'))}
                          </span>
                        </div>
                      </div>
                      {profile?.mainCaregiverId === cg.uid && <Check className="text-primary" size={24} />}
                    </button>
                  ))
                )}
              </div>

              <button 
                onClick={() => setShowMainCaregiverPicker(false)}
                className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

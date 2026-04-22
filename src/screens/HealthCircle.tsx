import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeartHandshake, Plus, User, Mail, Phone, ShieldCheck, AlertCircle, Trash2, X, Bell, FileText, Check, Link as LinkIcon, Eye, Share2, ChevronRight, Video, MessageSquare, Sparkles } from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { useCall } from '../components/communication/CallManager';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDoc, arrayUnion, query, where } from 'firebase/firestore';
import { TrustedContact, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { ChatInterface } from '../components/ChatInterface';

export const HealthCircle: React.FC<{ onNavigate?: (screen: Screen) => void }> = ({ onNavigate }) => {
  const { user, profile } = useFirebase();
  const { t } = useTranslation();
  const { initiateCall } = useCall();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [caregivers, setCaregivers] = useState<UserProfile[]>([]);
  const [managedPatients, setManagedPatients] = useState<UserProfile[]>([]);
  const [patientProfile, setPatientProfile] = useState<UserProfile | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);
  const [patientIdInput, setPatientIdInput] = useState('');
  const [inviteTokenInput, setInviteTokenInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [activeChatRecipient, setActiveChatRecipient] = useState<UserProfile | null>(null);
  const [editPatientForm, setEditPatientForm] = useState({
    bloodType: '',
    allergies: ''
  });
  const [newContact, setNewContact] = useState<Partial<TrustedContact>>({
    name: '',
    relation: '',
    email: '',
    phone: '',
    alertsEnabled: true,
    reportsEnabled: true
  });

  const isCaregiver = profile?.role === 'caregiver' || profile?.role === 'admin';

  useEffect(() => {
    if (!user || !isCaregiver) {
      setManagedPatients([]);
      return;
    }

    // Fetch all patients linked to this caregiver
    const q = query(collection(db, 'users'), where('caregiverIds', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patients = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setManagedPatients(patients);
    }, (error) => {
      console.error("Error fetching managed patients:", error);
    });

    return () => unsubscribe();
  }, [user, isCaregiver]);

  useEffect(() => {
    if (!user || isCaregiver || !profile?.caregiverIds || profile.caregiverIds.length === 0) {
      setCaregivers([]);
      return;
    }

    // Fetch details for linked caregivers
    const q = query(collection(db, 'users'), where('uid', 'in', profile.caregiverIds));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setCaregivers(data);
    }, (error) => {
      console.error("Error fetching linked caregivers:", error);
    });

    return () => unsubscribe();
  }, [user, isCaregiver, profile?.caregiverIds]);

  useEffect(() => {
    if (profile?.role === 'caregiver' && profile.assignedPatientId) {
      setViewingPatientId(profile.assignedPatientId);
    } else {
      setViewingPatientId(user?.uid || null);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!viewingPatientId) {
      setPatientProfile(null);
      return;
    }

    // Fetch patient profile if we are viewing someone else (caregiver mode)
    if (viewingPatientId !== user?.uid) {
      const unsubscribeProfile = onSnapshot(doc(db, 'users', viewingPatientId), (snapshot) => {
        if (snapshot.exists()) {
          setPatientProfile({ uid: snapshot.id, ...snapshot.data() } as UserProfile);
        }
      });
      return () => unsubscribeProfile();
    } else {
      setPatientProfile(profile as UserProfile);
    }
  }, [viewingPatientId, profile, user]);

  useEffect(() => {
    if (!viewingPatientId) return;

    const path = `users/${viewingPatientId}/trustedContacts`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TrustedContact[];
      setContacts(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [viewingPatientId]);

  const handleSwitchPatient = async (patientId: string) => {
    if (!user || !isCaregiver || viewingPatientId === patientId) return;
    
    setViewingPatientId(patientId);
    try {
      const caregiverRef = doc(db, 'users', user.uid);
      await updateDoc(caregiverRef, { assignedPatientId: patientId });
    } catch (error) {
      console.error("Error persisting patient switch:", error);
    }
  };

  const handleLinkPatient = async () => {
    if (!user || !patientIdInput || !inviteTokenInput) return;
    setIsLinking(true);
    try {
      const patientRef = doc(db, 'users', patientIdInput.trim());
      console.log("Attempting to fetch patient with UID:", patientIdInput.trim());
      const patientSnap = await getDoc(patientRef);
      
      if (!patientSnap.exists()) {
        console.error("Patient document not found for UID:", patientIdInput.trim());
        alert(t('settings.patient_id_not_found'));
        return false;
      }

      const patientData = patientSnap.data();

      if (patientData.role !== 'patient') {
        alert(t('settings.not_a_patient'));
        return false;
      }

      // Validate Invite Token
      const currentTime = Date.now();
      if (!patientData.inviteToken || patientData.inviteToken !== inviteTokenInput) {
        alert(t('settings.invalid_token') || 'Invalid invite token');
        return false;
      }

      if (!patientData.inviteTokenExpiresAt || patientData.inviteTokenExpiresAt < currentTime) {
        alert(t('settings.token_expired') || 'Invite token has expired');
        return false;
      }

      setEditPatientForm({
        bloodType: patientData.bloodType || '',
        allergies: patientData.allergies || ''
      });

      // Update caregiver
      const caregiverRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(caregiverRef, { assignedPatientId: patientIdInput });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        return false;
      }

      // Update patient
      try {
        await updateDoc(patientRef, { 
          caregiverIds: arrayUnion(user.uid),
          inviteToken: null, // Consume token
          inviteTokenExpiresAt: null 
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${patientIdInput}`);
        return false;
      }

      setPatientIdInput('');
      setInviteTokenInput('');
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      return false;
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkPatient = async () => {
    if (!user || !profile?.assignedPatientId) return;
    if (!window.confirm("Are you sure you want to unlink this patient profile?")) return;
    
    setIsLinking(true);
    try {
      const caregiverRef = doc(db, 'users', user.uid);
      await updateDoc(caregiverRef, { assignedPatientId: null });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUpdatePatientProfile = async () => {
    if (!viewingPatientId || viewingPatientId === user?.uid) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', viewingPatientId), {
        bloodType: editPatientForm.bloodType,
        allergies: editPatientForm.allergies
      });
      setShowEditPatient(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${viewingPatientId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddContact = async () => {
    if (!viewingPatientId || !newContact.name || !newContact.relation || !newContact.email) return;
    if (contacts.length >= 3) {
      alert(t('health_circle.limit_alert'));
      return;
    }

    setIsSubmitting(true);
    const path = `users/${viewingPatientId}/trustedContacts`;
    try {
      await addDoc(collection(db, path), {
        ...newContact,
        createdAt: new Date().toISOString()
      });
      setShowAdd(false);
      setNewContact({
        name: '',
        relation: '',
        email: '',
        phone: '',
        alertsEnabled: true,
        reportsEnabled: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!viewingPatientId) return;
    
    const path = `users/${viewingPatientId}/trustedContacts/${id}`;
    try {
      await deleteDoc(doc(db, `users/${viewingPatientId}/trustedContacts`, id));
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const toggleSetting = async (id: string, field: 'alertsEnabled' | 'reportsEnabled', value: boolean) => {
    if (!viewingPatientId) return;
    const path = `users/${viewingPatientId}/trustedContacts/${id}`;
    try {
      await updateDoc(doc(db, `users/${viewingPatientId}/trustedContacts`, id), {
        [field]: value
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-6 pt-12 pb-40"
    >
      <section className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
        <div className="space-y-6">
          <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">
            {isCaregiver ? t('nav.patient_profile') : t('health_circle.header_tagline')}
          </span>
          <h2 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.9] tracking-tighter">
            {isCaregiver ? t('nav.health_circle_caregiver') : t('health_circle.header_title')}
          </h2>
          <p className="text-on-surface-variant text-xl max-w-md leading-relaxed">
            {isCaregiver 
              ? "Manage and monitor the profiles of patients under your care." 
              : t('health_circle.header_desc')}
          </p>
        </div>
        
        {isCaregiver && (
          <button 
            onClick={() => setShowLinkModal(true)}
            className="w-20 h-20 rounded-[2rem] bg-primary text-on-primary shadow-ambient flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            <Plus size={32} />
          </button>
        )}
      </section>

      {isCaregiver && managedPatients.length === 0 ? (
        <section className="bg-surface-container-low rounded-[3rem] p-12 shadow-ambient border-2 border-dashed border-outline/20 text-center space-y-10">
          <div className="w-24 h-24 bg-primary/10 rounded-[2rem] flex items-center justify-center mx-auto text-primary">
            <LinkIcon size={48} />
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl font-headline font-black text-primary tracking-tighter">{t('settings.link_patient_title')}</h3>
            <p className="text-on-surface-variant text-lg max-w-md mx-auto">{t('settings.link_patient_desc')}</p>
          </div>
          
          <div className="max-w-md mx-auto space-y-6 text-left">
            <div className="space-y-4">
              <div className="space-y-1 ml-2">
                <label className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.patient_id_label') || 'Patient ID'}</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={patientIdInput}
                    onChange={(e) => setPatientIdInput(e.target.value)}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all pr-14"
                    placeholder="e.g. 8hp2...j9k"
                  />
                  <User className="absolute right-5 top-1/2 -translate-y-1/2 text-outline" size={24} />
                </div>
              </div>

              <div className="space-y-1 ml-2">
                <label className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.invite_token_label') || 'Invite Token'}</label>
                <div className="relative">
                  <input 
                    type="text" 
                    maxLength={6}
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-black text-2xl tracking-[0.5em] text-center focus:outline-primary transition-all pr-14"
                    placeholder="000000"
                  />
                  <Check className="absolute right-5 top-1/2 -translate-y-1/2 text-outline" size={24} />
                </div>
              </div>
            </div>

            <button 
              onClick={handleLinkPatient}
              disabled={isLinking || !patientIdInput || !inviteTokenInput}
              className="w-full py-6 signature-gradient text-on-primary font-headline font-black text-xl rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isLinking ? t('settings.linking') : (t('settings.link_account') || 'Link Account')}
            </button>
            <p className="text-[10px] text-on-surface-variant text-center opacity-60 font-medium">
              {t('settings.linkage_help') || 'Ask the patient to open their profile ID card to see their ID and temporary invite token.'}
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* Patient Profile Card (Caregiver Only) */}
          {isCaregiver && patientProfile && (
            <section className="mb-16">
              <div className="bg-surface-container-low rounded-[3rem] p-10 shadow-ambient border border-primary/5 relative overflow-hidden group">
                <div className="flex flex-col md:flex-row items-center gap-10 relative z-10 text-center md:text-left">
                  <div className="w-32 h-32 rounded-[2.5rem] p-1 bg-signature-gradient shadow-ambient shrink-0">
                    <img 
                      className="w-full h-full rounded-[2.3rem] object-cover border-4 border-surface" 
                      src={patientProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${patientProfile.uid}`} 
                      alt={patientProfile.displayName || "Patient"}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <h3 className="font-headline font-black text-4xl text-on-surface tracking-tight">
                        {patientProfile.displayName || "Patient Profile"}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-headline font-black uppercase tracking-widest border border-primary/10">
                          {t('onboarding.patient')}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setActiveChatRecipient(patientProfile)} className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all">
                            <MessageSquare size={14} />
                          </button>
                          <button onClick={() => initiateCall(patientProfile, 'voice')} className="w-8 h-8 rounded-full bg-secondary/10 text-secondary flex items-center justify-center hover:bg-secondary hover:text-on-secondary transition-all">
                            <Phone size={14} />
                          </button>
                          <button onClick={() => initiateCall(patientProfile, 'video')} className="w-8 h-8 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center hover:bg-tertiary hover:text-on-tertiary transition-all">
                            <Video size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.blood_type')}</span>
                        <p className="font-headline font-black text-on-surface text-xl">{patientProfile.bloodType || 'N/A'}</p>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.allergies')}</span>
                        <p className="font-headline font-black text-on-surface text-sm">{patientProfile.allergies || 'None listed'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('settings.status_linked')}</span>
                        <p className="font-headline font-black text-primary text-xs uppercase tracking-widest">Active Monitor</p>
                      </div>
                    </div>
                    
                    <div className="pt-6 flex flex-wrap gap-4 justify-center md:justify-start">
                      <button 
                        onClick={() => {
                          setEditPatientForm({
                            bloodType: patientProfile.bloodType || '',
                            allergies: patientProfile.allergies || ''
                          });
                          setShowEditPatient(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl text-xs font-headline font-black uppercase tracking-widest hover:scale-105 transition-all shadow-sm"
                      >
                        <FileText size={14} />
                        Edit Profile
                      </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(patientProfile.uid);
                          alert(t('settings.id_copied'));
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-surface-container-highest text-outline rounded-xl text-xs font-headline font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary transition-all"
                      >
                        <Share2 size={14} />
                        {t('settings.copy_id')}
                      </button>
                      <button 
                        onClick={handleUnlinkPatient}
                        className="flex items-center gap-2 px-6 py-3 bg-surface-container-highest text-tertiary rounded-xl text-xs font-headline font-black uppercase tracking-widest hover:bg-tertiary/5 transition-all"
                      >
                        <Trash2 size={14} />
                        Unlink Profile
                      </button>
                    </div>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              </div>
            </section>
          )}

          {/* Consent Notice */}
          <section className="mb-16 bg-primary/5 p-10 rounded-[2.5rem] border border-primary/10 flex gap-8 items-start shadow-sm relative overflow-hidden">
            <div className="bg-primary/10 p-4 rounded-2xl">
              <ShieldCheck className="text-primary" size={32} />
            </div>
            <div className="relative z-10">
              <h4 className="font-headline font-black text-primary text-2xl mb-2">{t('health_circle.privacy_title')}</h4>
              <p className="text-on-surface-variant text-lg leading-relaxed max-w-xl">
                {t('health_circle.privacy_desc')}
              </p>
            </div>
            <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
          </section>

          {/* Contacts List Label */}
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-primary">
              {isCaregiver ? t('health_circle.linked_patients') : t('health_circle.my_caregivers')}
            </h3>
            <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
            {isCaregiver && (
              <button 
                onClick={() => setShowLinkModal(true)}
                className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:scale-105 transition-all disabled:opacity-50"
              >
                <Plus size={20} />
              </button>
            )}
          </div>

          <div className="space-y-8">
            {isCaregiver ? (
              managedPatients.length === 0 ? (
                <div className="text-center py-32 bg-surface-container-low rounded-[3rem] shadow-ambient border-2 border-dashed border-outline/20">
                  <User size={64} className="mx-auto text-outline mb-6 opacity-20" />
                  <p className="text-on-surface-variant text-xl font-headline font-bold">No Patients Linked</p>
                  <p className="text-on-surface-variant/60 mt-2">Link your first patient to start monitoring.</p>
                </div>
              ) : (
                managedPatients.map((patient) => (
                  <motion.div 
                    key={patient.uid}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => handleSwitchPatient(patient.uid)}
                    className={cn(
                      "bg-surface-container-low p-10 rounded-[3rem] shadow-ambient space-y-8 group hover:bg-surface-container-high transition-all border-2 cursor-pointer",
                      viewingPatientId === patient.uid ? "border-primary" : "border-transparent"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-primary/10 rounded-3xl overflow-hidden shadow-sm group-hover:scale-110 transition-all border-4 border-white">
                          <img 
                            src={patient.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${patient.uid}`} 
                            alt={patient.displayName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-3xl font-headline font-black text-on-surface">{patient.displayName}</h3>
                            {viewingPatientId === patient.uid && (
                              <span className="px-2 py-1 bg-primary text-on-primary text-[8px] font-headline font-black uppercase tracking-widest rounded-md">Currently Viewing</span>
                            )}
                          </div>
                          <p className="text-sm font-headline font-black uppercase tracking-widest text-outline">ID: {patient.uid.slice(0, 12)}...</p>
                          <div className="flex items-center gap-2 mt-2">
                             <button onClick={(e) => { e.stopPropagation(); isCaregiver ? onNavigate?.('insights') : setActiveChatRecipient(patient); }} className="px-3 py-1.5 rounded-lg bg-primary/5 text-primary text-[10px] font-headline font-black uppercase tracking-widest flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-all">
                                {isCaregiver ? <Sparkles size={12} /> : <MessageSquare size={12} />}
                                {isCaregiver ? 'Insights' : t('community.message')}
                             </button>
                             <button onClick={(e) => { e.stopPropagation(); initiateCall(patient, 'voice'); }} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline hover:text-secondary transition-all">
                                <Phone size={14} />
                             </button>
                             <button onClick={(e) => { e.stopPropagation(); initiateCall(patient, 'video'); }} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline hover:text-tertiary transition-all">
                                <Video size={14} />
                             </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                          <p className="text-xs font-headline font-black uppercase tracking-widest text-outline mb-1">Status</p>
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest">Active</span>
                        </div>
                        <ChevronRight className={cn("text-outline group-hover:text-primary transition-colors", viewingPatientId === patient.uid && "text-primary")} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-outline/10">
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('metrics.heart_rate') || 'Heart Rate'}</span>
                        <p className={cn(
                          "font-headline font-bold text-xl",
                          patient.latestVitals?.triageZone === 'Red' ? "text-tertiary" : "text-primary"
                        )}>
                          {patient.latestVitals?.heartRate || '--'} <span className="text-[10px] opacity-60">BPM</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('metrics.steps') || 'Steps'}</span>
                        <p className="font-headline font-bold text-xl text-on-surface">
                          {patient.latestVitals?.steps?.toLocaleString() || '--'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('metrics.blood_pressure') || 'BP'}</span>
                        <p className="font-headline font-bold text-xl text-on-surface">
                          {patient.latestVitals?.bloodPressure || '--'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">Zone</span>
                        <div className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-black uppercase inline-block",
                          patient.latestVitals?.triageZone === 'Red' ? "bg-tertiary text-on-tertiary" : 
                          patient.latestVitals?.triageZone === 'Yellow' ? "bg-amber-100 text-amber-700" :
                          "bg-primary/10 text-primary"
                        )}>
                          {patient.latestVitals?.triageZone || 'Stable'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )
            ) : (
              caregivers.length === 0 ? (
                <div className="text-center py-32 bg-surface-container-low rounded-[3rem] shadow-ambient border-2 border-dashed border-outline/20">
                  <ShieldCheck size={64} className="mx-auto text-outline mb-6 opacity-20" />
                  <p className="text-on-surface-variant text-xl font-headline font-bold">{t('health_circle.no_contacts')}</p>
                  <p className="text-on-surface-variant/60 mt-2">Your Profile ID is: <span className="text-primary font-black uppercase">{user?.uid.slice(0, 8)}...</span></p>
                </div>
              ) : (
                caregivers.map((caregiver) => (
                  <motion.div 
                    key={caregiver.uid}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-container-low p-10 rounded-[3rem] shadow-ambient space-y-8 group hover:bg-surface-container-high transition-all border-2 border-transparent"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-primary/10 rounded-3xl overflow-hidden shadow-sm group-hover:scale-110 transition-all border-4 border-white">
                          <img 
                            src={caregiver.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${caregiver.uid}`} 
                            alt={caregiver.displayName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-3xl font-headline font-black text-on-surface">{caregiver.displayName}</h3>
                            <span className="px-2 py-0.5 bg-tertiary/10 text-tertiary text-[8px] font-headline font-black uppercase tracking-widest rounded-md">{t('onboarding.caregiver')}</span>
                          </div>
                          <p className="text-sm font-headline font-black uppercase tracking-widest text-outline">{caregiver.relationship || 'Primary Care'}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setActiveChatRecipient(caregiver)}
                          className="w-12 h-12 rounded-2xl bg-primary text-on-primary flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
                        >
                          <MessageSquare size={20} />
                        </button>
                        <button 
                          onClick={() => initiateCall(caregiver, 'voice')}
                          className="w-12 h-12 rounded-2xl bg-surface-container-highest text-secondary flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm"
                        >
                          <Phone size={20} />
                        </button>
                         <button 
                          onClick={() => initiateCall(caregiver, 'video')}
                          className="w-12 h-12 rounded-2xl bg-surface-container-highest text-tertiary flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm"
                        >
                          <Video size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-outline/10 flex flex-wrap gap-10">
                      <div className="flex items-center gap-4 text-on-surface-variant">
                        <Mail size={20} className="text-outline" />
                        <span className="font-headline font-bold text-lg">{caregiver.email}</span>
                      </div>
                      {caregiver.phoneNumber && (
                        <div className="flex items-center gap-4 text-on-surface-variant">
                          <Phone size={20} className="text-outline" />
                          <span className="font-headline font-bold text-lg">{caregiver.phoneNumber}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )
            )}
          </div>
        </>
      )}

      {/* Edit Patient Profile Modal */}
      <AnimatePresence>
        {showEditPatient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowEditPatient(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-12 w-full max-w-xl relative z-10 shadow-2xl space-y-10"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-4xl font-headline font-black text-primary tracking-tighter">{t('settings.update_profile_title')}</h3>
                <button onClick={() => setShowEditPatient(false)} className="p-2 text-outline hover:text-primary transition-colors">
                  <X size={32} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.blood_type')}</label>
                  <input 
                    type="text" 
                    value={editPatientForm.bloodType}
                    onChange={(e) => setEditPatientForm({...editPatientForm, bloodType: e.target.value})}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder="e.g. O+"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.allergies')}</label>
                  <input 
                    type="text" 
                    value={editPatientForm.allergies}
                    onChange={(e) => setEditPatientForm({...editPatientForm, allergies: e.target.value})}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder="e.g. Penicillin"
                  />
                </div>
              </div>

              <div className="flex gap-6 pt-6">
                <button 
                  onClick={() => setShowEditPatient(false)}
                  className="flex-1 py-6 text-outline font-headline font-black uppercase tracking-widest hover:bg-surface-container-highest rounded-2xl transition-all"
                >
                  {t('health_circle.cancel')}
                </button>
                <button 
                  onClick={handleUpdatePatientProfile}
                  disabled={isSubmitting}
                  className="flex-1 py-6 signature-gradient text-on-primary font-headline font-black text-xl rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? t('health_circle.saving') : t('settings.save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowAdd(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-12 w-full max-w-xl relative z-10 shadow-2xl space-y-10"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-4xl font-headline font-black text-primary tracking-tighter">{t('health_circle.add_contact')}</h3>
                <button onClick={() => setShowAdd(false)} className="p-2 text-outline hover:text-primary transition-colors">
                  <X size={32} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('health_circle.full_name')}</label>
                  <input 
                    type="text" 
                    value={newContact.name}
                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder={t('health_circle.add_placeholder_name')}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('health_circle.relationship')}</label>
                  <input 
                    type="text" 
                    value={newContact.relation}
                    onChange={(e) => setNewContact({...newContact, relation: e.target.value})}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder={t('health_circle.add_placeholder_relation')}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('health_circle.email')}</label>
                    <input 
                      type="email" 
                      value={newContact.email}
                      onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                      className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                      placeholder={t('health_circle.placeholder_email')}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('health_circle.phone')}</label>
                    <input 
                      type="tel" 
                      value={newContact.phone}
                      onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                      className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                      placeholder={t('health_circle.placeholder_phone')}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between p-4 bg-surface-container-highest rounded-2xl">
                  <div className="flex items-center gap-4">
                    <Bell size={20} className="text-primary" />
                    <span className="font-headline font-black uppercase tracking-widest text-xs">{t('health_circle.enable_alerts')}</span>
                  </div>
                  <button 
                    onClick={() => setNewContact({...newContact, alertsEnabled: !newContact.alertsEnabled})}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      newContact.alertsEnabled ? "bg-primary" : "bg-outline/30"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                      newContact.alertsEnabled ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 bg-surface-container-highest rounded-2xl">
                  <div className="flex items-center gap-4">
                    <FileText size={20} className="text-secondary" />
                    <span className="font-headline font-black uppercase tracking-widest text-xs">{t('health_circle.enable_reports')}</span>
                  </div>
                  <button 
                    onClick={() => setNewContact({...newContact, reportsEnabled: !newContact.reportsEnabled})}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      newContact.reportsEnabled ? "bg-secondary" : "bg-outline/30"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                      newContact.reportsEnabled ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>
              </div>

              <div className="flex gap-6 pt-6">
                <button 
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-6 text-outline font-headline font-black uppercase tracking-widest hover:bg-surface-container-highest rounded-2xl transition-all"
                >
                  {t('health_circle.cancel')}
                </button>
                <button 
                  onClick={handleAddContact}
                  disabled={isSubmitting}
                  className="flex-1 py-6 signature-gradient text-on-primary font-headline font-black text-xl rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? t('health_circle.saving') : t('health_circle.add')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
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
              <div className="w-20 h-20 bg-tertiary/10 rounded-3xl flex items-center justify-center mx-auto text-tertiary">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-black text-on-surface">{t('health_circle.delete_confirm_title') || 'Delete Contact?'}</h3>
                <p className="text-on-surface-variant leading-relaxed">{t('health_circle.delete_confirm')}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleDeleteContact(showDeleteConfirm)}
                  className="w-full py-4 bg-tertiary text-on-tertiary font-headline font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-ambient"
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

      {/* Link Patient Modal for Caregivers */}
      <AnimatePresence>
        {showLinkModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setShowLinkModal(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[3rem] p-12 w-full max-w-xl relative z-10 shadow-2xl space-y-10"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                    <LinkIcon size={24} />
                  </div>
                  <h3 className="text-4xl font-headline font-black text-primary tracking-tighter">Link New Patient</h3>
                </div>
                <button onClick={() => setShowLinkModal(false)} className="p-2 text-outline hover:text-primary transition-colors">
                  <X size={32} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.patient_id')}</label>
                  <input 
                    type="text" 
                    value={patientIdInput}
                    onChange={(e) => setPatientIdInput(e.target.value)}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder="e.g. nmwFXgHwmWMZL..."
                  />
                  <p className="text-[10px] text-outline ml-2 font-medium">Find this in the Patient's Settings {'->'} ID Card</p>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('settings.invite_token')}</label>
                  <input 
                    type="text" 
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder="e.g. 1a2b3c"
                  />
                </div>
              </div>

              <button 
                onClick={async () => {
                  const success = await handleLinkPatient();
                  if (success) setShowLinkModal(false);
                }}
                disabled={isLinking || !patientIdInput || !inviteTokenInput}
                className="w-full py-6 signature-gradient text-on-primary font-headline font-black text-xl rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isLinking ? t('settings.linking') : "Link & Add Patient"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeChatRecipient && (
          <ChatInterface 
            recipient={activeChatRecipient} 
            onClose={() => setActiveChatRecipient(null)} 
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showComingSoon && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onAnimationComplete={() => setTimeout(() => setShowComingSoon(null), 2000)}
              className="bg-primary p-6 rounded-2xl shadow-2xl flex items-center gap-4 border border-on-primary/10 pointer-events-auto"
            >
              <div className="w-10 h-10 bg-on-primary/10 rounded-xl flex items-center justify-center text-on-primary">
                <Sparkles size={20} />
              </div>
              <div className="pr-4">
                <p className="text-on-primary font-headline font-black uppercase tracking-widest text-[10px] opacity-60">System Notification</p>
                <p className="text-on-primary font-headline font-black text-sm">{showComingSoon}: {t('health_circle.coming_soon')}</p>
              </div>
              <button 
                onClick={() => setShowComingSoon(null)}
                className="p-1 text-on-primary/60 hover:text-on-primary"
              >
                <X size={16} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

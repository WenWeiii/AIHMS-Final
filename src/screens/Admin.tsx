import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, Search, Filter, MoreVertical, CheckCircle2, XCircle, AlertCircle, TrendingUp, Settings, Activity, Calendar, ExternalLink, Clock, Trash2, MessageSquare, Mail } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, collectionGroup, limit, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { UserProfile, HealthData, Appointment, Feedback } from '../types';
import { useTranslation } from '../components/LanguageProvider';
import { cn, safeParseDate } from '@/src/lib/utils';

export const Admin: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'patient' | 'caregiver' | 'admin'>('all');
  const [stats, setStats] = useState({
    totalUsers: 0,
    patients: 0,
    caregivers: 0,
    newToday: 0
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [apptSearchQuery, setApptSearchQuery] = useState('');
  const [feedbackSearchQuery, setFeedbackSearchQuery] = useState('');
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [activeFeedback, setActiveFeedback] = useState<Feedback | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    action: () => Promise<void>;
  } | null>(null);

  const updateMenuPosition = (buttonId: string, isFeedback: boolean) => {
    const btn = document.getElementById(buttonId);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 256; // w-64
      const menuHeight = isFeedback ? 350 : 320; // Estimates for feedback vs user menus
      
      // Smart flipping logic: if there isn't enough space below, open upwards
      const spaceBelow = window.innerHeight - rect.bottom;
      const shouldFlip = spaceBelow < menuHeight;

      setMenuPosition({
        top: shouldFlip 
          ? rect.top + window.scrollY - menuHeight - 8
          : rect.bottom + window.scrollY + 8,
        left: rect.right + window.scrollX - menuWidth
      });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (activeUser) updateMenuPosition(`menu-button-${activeUser.uid}`, false);
      if (activeFeedback) updateMenuPosition(`feedback-button-${activeFeedback.id}`, true);
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeUser, activeFeedback]);

  useEffect(() => {
    if (activeUser) updateMenuPosition(`menu-button-${activeUser.uid}`, false);
  }, [activeUser]);

  useEffect(() => {
    if (activeFeedback) updateMenuPosition(`feedback-button-${activeFeedback.id}`, true);
  }, [activeFeedback]);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersData);
      
      const patients = usersData.filter(u => u.role === 'patient').length;
      const caregivers = usersData.filter(u => u.role === 'caregiver').length;
      const today = new Date().toISOString().split('T')[0];
      const newToday = usersData.filter(u => u.createdAt?.split('T')[0] === today).length;

      setStats({
        totalUsers: usersData.length,
        patients,
        caregivers,
        newToday
      });
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collectionGroup(db, 'appointments'), orderBy('date', 'asc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(a => (a as any).status !== 'pending') as Appointment[];
      setAppointments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'collectionGroup:appointments');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const feedbackRef = collection(db, 'feedback');
    const q = query(feedbackRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Feedback[];
      setFeedbacks(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });

    return () => unsubscribe();
  }, []);

  const getUser = (userId?: string) => {
    return users.find(u => u.uid === userId);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterRole === 'all' || user.role === filterRole;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-[600px] space-y-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-headline font-black uppercase tracking-widest border border-primary/20">
              System Admin
            </span>
            <span className="text-outline text-xs font-headline font-black uppercase tracking-widest">v1.2.4</span>
          </div>
          <h1 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.85] tracking-tighter">
            Control<br />
            <span className="text-tertiary">Center</span>
          </h1>
          <p className="text-on-surface-variant text-xl max-w-md leading-relaxed font-medium">
            Overseeing the AIHMs ecosystem. Manage users, monitor patterns, and ensure system integrity.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline/5 shadow-ambient flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">Total Users</p>
              <p className="text-2xl font-headline font-black text-on-surface">{stats.totalUsers}</p>
            </div>
          </div>
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline/5 shadow-ambient flex items-center gap-4">
            <div className="w-12 h-12 bg-tertiary/10 rounded-2xl flex items-center justify-center text-tertiary">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">New Today</p>
              <p className="text-2xl font-headline font-black text-on-surface">+{stats.newToday}</p>
            </div>
          </div>
        </div>
      </header>

      {/* User Management Section */}
      <section className="bg-surface-container-low rounded-[3rem] p-8 shadow-ambient border border-outline/5 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl text-on-primary shadow-sm">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-headline font-black text-on-surface">User Directory</h2>
              <p className="text-sm font-medium text-on-surface-variant">Active members in the Guardian network.</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 w-full md:w-auto">
            <div className="relative group flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface-container-highest/50 border border-outline/10 rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-primary transition-all outline-none w-full md:w-64"
              />
            </div>
            
            <div className="flex p-1 bg-surface-container-highest/50 rounded-2xl border border-outline/10 self-start">
              {(['all', 'patient', 'caregiver', 'admin'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setFilterRole(role)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-headline font-black uppercase tracking-widest transition-all",
                    filterRole === role 
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-outline hover:text-on-surface hover:bg-surface-container-highest"
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-outline/5 bg-surface-container-lowest">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-highest/20">
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">User</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Role</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Joined</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Status</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/5">
              <AnimatePresence mode="popLayout">
                {filteredUsers.map((user) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={user.uid}
                    className="hover:bg-primary/5 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img 
                          src={user.photoURL} 
                          alt="" 
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-xl bg-surface-container-highest object-cover border border-outline/5"
                        />
                        <div>
                          <p className="font-headline font-black text-on-surface text-sm">{user.displayName}</p>
                          <p className="text-xs text-on-surface-variant font-medium">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-headline font-black uppercase tracking-widest border",
                        user.role === 'admin' ? "bg-primary/10 text-primary border-primary/20" :
                        user.role === 'caregiver' ? "bg-tertiary/10 text-tertiary border-tertiary/20" :
                        "bg-amber-100 text-amber-700 border-amber-200"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-headline font-black text-on-surface-variant">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-headline font-black uppercase tracking-widest text-green-600">Active</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 relative">
                      <button 
                        id={`menu-button-${user.uid}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeUser?.uid === user.uid) {
                            setActiveUser(null);
                          } else {
                            setActiveUser(user);
                          }
                        }}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          activeUser?.uid === user.uid ? "bg-primary text-on-primary" : "hover:bg-surface-container-highest"
                        )}
                      >
                        <MoreVertical size={18} className={activeUser?.uid === user.uid ? "" : "text-outline"} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filteredUsers.length === 0 && !loading && (
            <div className="p-20 text-center space-y-4">
              <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center mx-auto text-outline">
                <Search size={40} />
              </div>
              <p className="font-headline font-bold text-on-surface-variant uppercase tracking-widest text-xs">No matching users found</p>
            </div>
          )}
        </div>
      </section>

      {/* Upcoming Events Section */}
      <section className="bg-surface-container-low rounded-[3rem] p-8 shadow-ambient border border-outline/5 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-tertiary p-3 rounded-2xl text-on-tertiary shadow-sm">
              <Calendar size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-headline font-black text-on-surface">Upcoming Appointments</h2>
              <p className="text-sm font-medium text-on-surface-variant">Centralized view of all scheduled health events.</p>
            </div>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <input 
              type="text"
              placeholder="Filter by patient name..."
              value={apptSearchQuery}
              onChange={(e) => setApptSearchQuery(e.target.value)}
              className="w-full bg-surface-container-highest/50 border-none rounded-2xl py-4 pl-12 pr-6 text-xs font-headline font-black focus:ring-2 focus:ring-primary transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-outline/5 bg-surface-container-lowest">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-highest/20">
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Patient</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Event</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Schedule</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/5">
              {appointments
                .filter(appt => {
                  if (!apptSearchQuery) return true;
                  const patient = getUser(appt.userId);
                  return patient?.displayName.toLowerCase().includes(apptSearchQuery.toLowerCase());
                })
                .map((appt) => {
                  const patient = getUser(appt.userId);
                  const isPast = new Date(appt.date) < new Date();
                  
                  return (
                    <tr key={appt.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-4">
                        {patient ? (
                          <div className="flex items-center gap-3">
                            <img 
                              src={patient.photoURL} 
                              alt="" 
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-lg bg-surface-container-highest object-cover"
                            />
                            <div>
                              <p className="font-headline font-black text-on-surface text-xs">{patient.displayName}</p>
                              <p className="text-[10px] text-on-surface-variant font-medium">{patient.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-outline font-bold">Unknown Patient</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-headline font-black text-on-surface text-sm">{appt.title}</p>
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{appt.type}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-on-surface-variant">
                          <Clock size={14} className="text-outline" />
                          <span className="text-xs font-headline font-black">
                            {new Date(appt.date).toLocaleDateString()} • {appt.time}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-headline font-black uppercase tracking-widest border",
                          isPast ? "bg-surface-container-highest text-outline border-outline/10" :
                          "bg-green-100 text-green-700 border-green-200"
                        )}>
                          {isPast ? 'Past' : appt.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <p className="text-xs font-headline font-black text-outline uppercase tracking-widest">No upcoming appointments</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* System Feedback Section */}
      <section className="bg-surface-container-low rounded-[3rem] p-8 shadow-ambient border border-outline/5 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-secondary p-3 rounded-2xl text-on-secondary shadow-sm">
              <MessageSquare size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-headline font-black text-on-surface">Member Feedback</h2>
              <p className="text-sm font-medium text-on-surface-variant">Review suggestions and bug reports from the community.</p>
            </div>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <input 
              type="text"
              placeholder="Search feedback content..."
              value={feedbackSearchQuery}
              onChange={(e) => setFeedbackSearchQuery(e.target.value)}
              className="w-full bg-surface-container-highest/50 border-none rounded-2xl py-4 pl-12 pr-6 text-xs font-headline font-black focus:ring-2 focus:ring-primary transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-outline/5 bg-surface-container-lowest">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-highest/20">
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Author</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Content</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Type</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Status</th>
                <th className="px-6 py-5 text-[10px] font-headline font-black uppercase tracking-widest text-outline">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/5">
              {feedbacks
                .filter(fb => fb.content.toLowerCase().includes(feedbackSearchQuery.toLowerCase()))
                .map((fb) => (
                  <tr key={fb.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-headline font-black text-on-surface text-xs">{fb.userName}</p>
                        <p className="text-[10px] text-on-surface-variant font-medium">{fb.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-sm">
                      <p className="text-sm text-on-surface line-clamp-2">{fb.content}</p>
                      <p className="text-[10px] text-outline font-headline font-black uppercase mt-1">
                        {fb.timestamp && safeParseDate(fb.timestamp)?.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded text-[8px] font-headline font-black uppercase tracking-tighter border",
                        fb.category === 'bug' ? "bg-tertiary/10 text-tertiary border-tertiary/20" :
                        fb.category === 'suggestion' ? "bg-primary/10 text-primary border-primary/20" :
                        "bg-outline/10 text-outline border-outline/20"
                      )}>
                        {fb.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          fb.status === 'new' ? "bg-tertiary animate-pulse" :
                          fb.status === 'reviewed' ? "bg-amber-500" :
                          "bg-green-500"
                        )} />
                        <span className="text-[10px] font-headline font-black uppercase tracking-widest">
                          {fb.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 relative text-right">
                      <button 
                        id={`feedback-button-${fb.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeFeedback?.id === fb.id) {
                            setActiveFeedback(null);
                          } else {
                            setActiveFeedback(fb);
                          }
                        }}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          activeFeedback?.id === fb.id ? "bg-primary text-on-primary" : "hover:bg-surface-container-highest"
                        )}
                      >
                        <MoreVertical size={18} className={activeFeedback?.id === fb.id ? "" : "text-outline"} />
                      </button>
                    </td>
                  </tr>
                ))}
              {feedbacks.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <p className="text-xs font-headline font-black text-outline uppercase tracking-widest">No feedback records found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Portal-Style Floating Menus */}
      <AnimatePresence>
        {activeUser && (
          <div className="fixed inset-0 z-[9999]" onClick={() => setActiveUser(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-[10000] w-64 bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl border border-outline/10 p-2 py-4 overflow-hidden"
              style={{
                top: menuPosition.top - window.scrollY,
                left: menuPosition.left - window.scrollX,
              }}
            >
              <div className="px-5 py-2 mb-3">
                <p className="text-[10px] font-headline font-black text-outline uppercase tracking-[0.2em]">User Profile Controls</p>
                <p className="text-xs font-medium text-on-surface truncate mt-1">{activeUser.displayName}</p>
              </div>
              <div className="space-y-1">
                <button 
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: "Change Role",
                      message: `Change role for ${activeUser.displayName} to:`,
                      type: "info",
                      action: async () => {
                        const newRole = activeUser.role === 'caregiver' ? 'patient' : 'caregiver';
                        try {
                          await updateDoc(doc(db, 'users', activeUser.uid), { role: newRole });
                          setActiveUser(null);
                        } catch (err) {
                          console.error(err);
                          alert("Role change failed.");
                        }
                      }
                    });
                  }}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-secondary/10 hover:text-secondary rounded-2xl transition-all active:scale-[0.98] group"
                >
                  <Users size={18} className="text-secondary group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">{activeUser.role === 'caregiver' ? 'Set to Patient' : 'Set to Caregiver'}</span>
                </button>
                <button 
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: "Reset Onboarding",
                      message: "Reset onboarding for this user? They will have to go through the setup process again.",
                      type: "warning",
                      action: async () => {
                        try {
                          await updateDoc(doc(db, 'users', activeUser.uid), { hasCompletedOnboarding: false });
                          setActiveUser(null);
                        } catch (err) {
                          console.error(err);
                          alert("Reset failed.");
                        }
                      }
                    });
                  }}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-tertiary/10 hover:text-tertiary rounded-2xl transition-all active:scale-[0.98] group"
                >
                  <Settings size={18} className="text-tertiary group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">Reset Onboarding</span>
                </button>
                <div className="h-px bg-outline/5 mx-5 my-2" />
                {activeUser.displayName?.includes('(Inactive)') || activeUser.bio?.includes('[DEACTIVATED]') ? (
                  <button 
                    className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-green-100/50 hover:text-green-700 rounded-2xl transition-all active:scale-[0.98] group"
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: "Reactivate Account",
                        message: "Restore this account to active status?",
                        type: "info",
                        action: async () => {
                          try {
                            const newBio = (activeUser.bio || '').replace(/\[DEACTIVATED\]\s*/g, '');
                            const newDisplayName = (activeUser.displayName || '').replace(/\s*\(Inactive\)/g, '');
                            await updateDoc(doc(db, 'users', activeUser.uid), { 
                              bio: newBio,
                              displayName: newDisplayName
                            });
                            setActiveUser(null);
                          } catch (err) {
                            console.error(err);
                            alert("Action failed.");
                          }
                        }
                      });
                    }}
                  >
                    <CheckCircle2 size={18} className="text-green-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-headline font-black uppercase tracking-widest">Reactivate Account</span>
                  </button>
                ) : (
                  <button 
                    className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-amber-100/50 hover:text-amber-700 rounded-2xl transition-all active:scale-[0.98] group"
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: "Deactivate Account",
                        message: "Are you SURE you want to deactivate this user? Their profile will be marked as inactive.",
                        type: "warning",
                        action: async () => {
                          try {
                            await updateDoc(doc(db, 'users', activeUser.uid), { 
                              role: 'patient',
                              bio: '[DEACTIVATED] ' + (activeUser.bio || ''),
                              displayName: activeUser.displayName + ' (Inactive)'
                            });
                            setActiveUser(null);
                          } catch (err) {
                            console.error(err);
                            alert("Action failed.");
                          }
                        }
                      });
                    }}
                  >
                    <XCircle size={18} className="text-amber-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-headline font-black uppercase tracking-widest">Deactivate Account</span>
                  </button>
                )}
                <button 
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-error/10 hover:text-error rounded-2xl transition-all active:scale-[0.98] group mt-1"
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: "Delete Profile Data Permanently",
                      message: "WARNING: This permanently erases the user's profile and medical data from the database. \n\nNote: Because this is a serverless app, their physical 'Login Email' will still exist in Firebase Authentication. If they want to return, they must 'Sign In' instead of 'Registering' again.",
                      type: "danger",
                      action: async () => {
                        try {
                          await deleteDoc(doc(db, 'users', activeUser.uid));
                          setActiveUser(null);
                        } catch (err: any) {
                          console.error(err);
                          alert(`Delete failed: ${err.message || String(err)}`);
                        }
                      }
                    });
                  }}
                >
                  <Trash2 size={18} className="text-error group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">Delete User</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeFeedback && (
          <div className="fixed inset-0 z-[9999]" onClick={() => setActiveFeedback(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-[10000] w-64 bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl border border-outline/10 p-2 py-4 overflow-hidden"
              style={{
                top: menuPosition.top - window.scrollY,
                left: menuPosition.left - window.scrollX,
              }}
            >
              <div className="px-5 py-2 mb-3">
                <p className="text-[10px] font-headline font-black text-outline uppercase tracking-[0.2em]">Feedback Resolution</p>
                <p className="text-xs font-medium text-on-surface truncate mt-1">From: {activeFeedback.userName}</p>
              </div>
              <div className="space-y-1">
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'feedback', activeFeedback.id), { status: 'reviewed' });
                      setActiveFeedback(null);
                      alert("Marked as reviewed.");
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-amber-100/50 hover:text-amber-700 rounded-2xl transition-all active:scale-[0.98] group"
                >
                  <Clock size={18} className="text-amber-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">Mark Reviewed</span>
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'feedback', activeFeedback.id), { status: 'closed' });
                      setActiveFeedback(null);
                      alert("Closed issue successfully.");
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-green-100/50 hover:text-green-700 rounded-2xl transition-all active:scale-[0.98] group"
                >
                  <CheckCircle2 size={18} className="text-green-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">Close Issue</span>
                </button>
                <button 
                  onClick={() => {
                    window.location.href = `mailto:${activeFeedback.userEmail}?subject=AIHMs Feedback Response&body=Hi ${activeFeedback.userName}, thank you for your feedback...`;
                    setActiveFeedback(null);
                  }}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-primary/10 hover:text-primary rounded-2xl transition-all active:scale-[0.98] group"
                >
                  <Mail size={18} className="text-primary group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">Reply via Email</span>
                </button>
                <div className="h-px bg-outline/5 mx-5 my-2" />
                <button 
                  className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-error/10 hover:text-error rounded-2xl transition-all active:scale-[0.98] group"
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: "Delete Feedback",
                      message: t('dashboard.delete_confirm') || "Are you sure you want to delete this feedback record? This action cannot be undone.",
                      type: "danger",
                      action: async () => {
                        try {
                          console.log("[Admin] Attempting deletion...");
                          console.log("[Admin] Feedback ID:", activeFeedback.id);
                          console.log("[Admin] Current User:", auth.currentUser?.email);
                          
                          const feedbackRef = doc(db, 'feedback', activeFeedback.id);
                          await deleteDoc(feedbackRef);
                          
                          console.log("[Admin] Deletion successful");
                          setActiveFeedback(null);
                        } catch (err: any) {
                          console.error("[Admin] Delete failed error:", err);
                          const errorMsg = err.message || String(err);
                          alert(`Delete failed: ${errorMsg}\n\nPlease check if you have admin rights (your email: ${auth.currentUser?.email})`);
                        }
                      }
                    });
                  }}
                >
                  <Trash2 size={18} className="text-error group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-headline font-black uppercase tracking-widest">{t('common.delete') || "Delete permanent"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unified Confirm Dialog */}
      <AnimatePresence>
        {confirmDialog?.isOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 text-on-surface">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
              onClick={() => setConfirmDialog(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-surface-container-low rounded-[2rem] p-8 shadow-ambient border border-outline/5 space-y-6"
            >
              <div>
                <h3 className={cn(
                  "text-xl font-headline font-black",
                  confirmDialog.type === 'danger' ? "text-error" : "text-on-surface"
                )}>
                  {confirmDialog.title}
                </h3>
                <p className="text-on-surface-variant text-sm font-medium mt-2 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-3.5 px-4 rounded-xl text-xs font-headline font-black uppercase tracking-widest text-on-surface bg-surface-container-highest hover:bg-surface-container-highest/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await confirmDialog.action();
                    setConfirmDialog(null);
                  }}
                  className={cn(
                    "flex-1 py-3.5 px-4 rounded-xl text-xs font-headline font-black uppercase tracking-widest text-on-primary transition-colors shadow-sm",
                    confirmDialog.type === 'danger' ? "bg-error hover:bg-error/90" : "bg-primary hover:bg-primary/90"
                  )}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

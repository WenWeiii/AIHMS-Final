import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, Clock, Plus, ChevronLeft, ChevronRight, ChevronDown, MapPin, CheckCircle2, AlertCircle, Bell, BellOff, Map as MapIcon, List, Trash2, X } from 'lucide-react';
import { Appointment } from '@/src/types';
import { cn, formatDate } from '@/src/lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, collectionGroup } from 'firebase/firestore';
import { requestNotificationPermission, checkUpcomingAppointments } from '../services/notificationService';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export const Calendar: React.FC = () => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [apptToDelete, setApptToDelete] = useState<Appointment | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [timelineView, setTimelineView] = useState<'month' | 'week' | 'day'>('month');
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>({ lat: 3.1390, lng: 101.6869 }); // Default to KL
  const [nearestHospitals, setNearestHospitals] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);

  const MapController = ({ center }: { center: [number, number] | null }) => {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.flyTo(center, 15, { duration: 1.5 });
      }
    }, [center, map]);
    return null;
  };
  
  const hospitalList = [
    // Hospitals - KL Central
    { name: 'Hospital Kuala Lumpur (HKL)', lat: 3.1719, lng: 101.7029, type: 'Government' },
    { name: 'Prince Court Medical Centre', lat: 3.1481, lng: 101.7201, type: 'Private' },
    { name: 'Gleneagles Hospital KL', lat: 3.1582, lng: 101.7456, type: 'Private' },
    { name: 'Tung Shin Hospital', lat: 3.1458, lng: 101.7036, type: 'Private' },
    { name: 'KPJ Tawakkal KL Specialist Hospital', lat: 3.1738, lng: 101.6993, type: 'Private' },
    { name: 'Pantai Hospital KL', lat: 3.1186, lng: 101.6740, type: 'Private' },
    { name: 'University Malaya Medical Centre (UMMC)', lat: 3.1118, lng: 101.6542, type: 'Government' },
    { name: 'National Heart Institute (IJN)', lat: 3.1714, lng: 101.7088, type: 'Government' },
    
    // Hospitals - Suburbs & Selangor
    { name: 'Sunway Medical Centre', lat: 3.0658, lng: 101.6068, type: 'Private' },
    { name: 'Subang Jaya Medical Centre (SJMC)', lat: 3.0764, lng: 101.5913, type: 'Private' },
    { name: 'KPJ Damansara Specialist', lat: 3.1364, lng: 101.6212, type: 'Private' },
    { name: 'Hospital Selayang', lat: 3.2427, lng: 101.6444, type: 'Government' },
    { name: 'Hospital Sungai Buloh', lat: 3.2201, lng: 101.5831, type: 'Government' },
    { name: 'Hospital Serdang', lat: 2.9774, lng: 101.7205, type: 'Government' },
    { name: 'Hospital Putrajaya', lat: 2.9294, lng: 101.6742, type: 'Government' },
    { name: 'Assunta Hospital', lat: 3.0955, lng: 101.6433, type: 'Private' },

    // Clinics 
    { name: 'Klinik Kesihatan Kuala Lumpur', lat: 3.1741, lng: 101.6996, type: 'Government Clinic' },
    { name: 'Klinik Kesihatan Tanglin', lat: 3.1436, lng: 101.6888, type: 'Government Clinic' },
    { name: 'Poliklinik Kumpulan City', lat: 3.1477, lng: 101.7130, type: 'Private Clinic' },
    { name: 'Klinik Mediviron - Bukit Bintang', lat: 3.1462, lng: 101.7115, type: 'Private Clinic' },
    { name: 'Klinik Kesihatan Cheras', lat: 3.1097, lng: 101.7249, type: 'Government Clinic' },
    { name: 'Klinik Kesihatan Petaling Bahagia', lat: 3.0805, lng: 101.6508, type: 'Government Clinic' },
    { name: 'Klinik Alam Medic - Bangsar', lat: 3.1309, lng: 101.6703, type: 'Private Clinic' },
    { name: 'Qualitas Medical Group Clinics', lat: 3.1315, lng: 101.6800, type: 'Private Clinic' }
  ];

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    if (userLocation) {
      const sorted = [...hospitalList].map(h => ({
        ...h,
        distance: calculateDistance(userLocation.lat, userLocation.lng, h.lat, h.lng)
      })).sort((a, b) => a.distance - b.distance);
      setNearestHospitals(sorted);
    }
  }, [userLocation]);

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  };
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showAIAlert, setShowAIAlert] = useState(true);
  const todayDateStr = new Date().toISOString().split('T')[0];
  const [suggestedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  });

  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayDateStr);
  };
  const [newAppt, setNewAppt] = useState<Partial<Appointment>>({
    title: '',
    date: '',
    time: '',
    type: 'follow-up',
    status: 'scheduled',
    reminderEnabled: true,
    locationName: ''
  });

  useEffect(() => {
    if (profile?.role === 'caregiver' && profile.assignedPatientId) {
      setViewingPatientId(profile.assignedPatientId);
    } else {
      setViewingPatientId(user?.uid || null);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!viewingPatientId && profile?.role !== 'admin') return;
    
    // Request permission on mount
    requestNotificationPermission();

    let q;
    let path = 'appointments';
    if (profile?.role === 'admin') {
      q = query(collectionGroup(db, 'appointments'), orderBy('date', 'asc'));
      path = 'collectionGroup:appointments';
    } else {
      path = `users/${viewingPatientId}/appointments`;
      q = query(collection(db, path), orderBy('date', 'asc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      
      // Admin & Patients don't need to see AI suggestions (pending appointments)
      if (profile?.role === 'admin' || profile?.role === 'patient') {
        data = data.filter(appt => appt.status !== 'pending');
      }
      
      setAppointments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [viewingPatientId]);

  // Appointment Reminder Checker
  useEffect(() => {
    if (!viewingPatientId || appointments.length === 0) return;

    const interval = setInterval(() => {
      checkUpcomingAppointments(appointments, viewingPatientId, t);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [viewingPatientId, appointments]);

  const handleAdd = async () => {
    if (!viewingPatientId || !newAppt.title || !newAppt.date) return;
    
    const path = `users/${viewingPatientId}/appointments`;
    
    // Simple geocoding simulation for demo
    let coords = undefined;
    if (newAppt.locationName) {
      // Mock coordinates for common Malaysian locations for demo purposes
      const locations: Record<string, {lat: number, lng: number}> = {
        'Kuala Lumpur': { lat: 3.1390, lng: 101.6869 },
        'Penang': { lat: 5.4141, lng: 100.3288 },
        'Johor Bahru': { lat: 1.4927, lng: 103.7414 },
        'Hospital': { lat: 3.1588, lng: 101.7016 },
        'Klinik': { lat: 3.1412, lng: 101.6865 }
      };
      
      const key = Object.keys(locations).find(k => newAppt.locationName?.toLowerCase().includes(k.toLowerCase()));
      if (key) {
        coords = locations[key];
      } else {
        // Default to KL if not found but location provided
        coords = { lat: 3.1390 + (Math.random() - 0.5) * 0.1, lng: 101.6869 + (Math.random() - 0.5) * 0.1 };
      }
    }

    try {
      await addDoc(collection(db, path), {
        ...newAppt,
        coordinates: coords,
        userId: viewingPatientId,
        createdAt: serverTimestamp()
      });
      setShowAdd(false);
      setNewAppt({ title: '', date: '', time: '', type: 'follow-up', status: 'scheduled', reminderEnabled: true, locationName: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDelete = async () => {
    if (!apptToDelete) return;

    const targetUserId = apptToDelete.userId || viewingPatientId;
    if (!targetUserId) return;

    const path = `users/${targetUserId}/appointments/${apptToDelete.id}`;
    try {
      await deleteDoc(doc(db, `users/${targetUserId}/appointments`, apptToDelete.id));
      setApptToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleConfirmAISuggestion = async () => {
    if (!viewingPatientId) return;
    setIsConfirming(true);
    
    const dateStr = suggestedDate.toISOString().split('T')[0];
    const path = `users/${viewingPatientId}/appointments`;

    try {
      await addDoc(collection(db, path), {
        title: t('calendar.placeholder_title').replace('cth., ', '') || 'Follow-up appointment',
        date: dateStr,
        time: '10:00',
        type: 'follow-up',
        status: 'scheduled',
        reminderEnabled: true,
        locationName: t('calendar.placeholder_location').replace('cth., ', '') || 'Hospital Kuala Lumpur',
        userId: viewingPatientId,
        createdAt: serverTimestamp()
      });
      
      alert(t('calendar.confirm_success') || 'AI Suggestion confirmed and added to your schedule!');
      setShowAIAlert(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsConfirming(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled': return <span className="text-[10px] font-bold uppercase px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> {t('calendar.confirm')}</span>;
      case 'pending': return <span className="text-[10px] font-bold uppercase px-2 py-1 bg-amber-100 text-amber-700 rounded-full flex items-center gap-1"><Clock size={10} /> {t('calendar.ai_suggestion')}</span>;
      default: return null;
    }
  };

  const AppointmentCard = ({ appt, t, language, onSelectToDelete, onSelectAppt, isPast }: { appt: Appointment, t: any, language: string, onSelectToDelete: (a: Appointment) => void, onSelectAppt?: (a: Appointment) => void, isPast?: boolean }) => (
    <div 
      onClick={() => onSelectAppt && onSelectAppt(appt)}
      className={cn(
      "bg-surface-container-highest p-8 rounded-[2rem] shadow-sm flex flex-col md:flex-row md:items-center gap-8 group transition-all",
      isPast ? "opacity-90 grayscale-[0.3] hover:grayscale-0" : "hover:bg-surface-container-high",
      onSelectAppt && "cursor-pointer"
    )}>
      <div className={cn(
        "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 shadow-sm",
        appt.type === 'checkup' ? "bg-primary text-on-primary" : "bg-tertiary text-on-tertiary",
        isPast && "opacity-80"
      )}>
        <CalendarIcon size={32} strokeWidth={1.5} />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex justify-between items-start">
          <h4 className={cn("text-2xl font-headline font-black text-on-surface", isPast && "text-on-surface-variant")}>{appt.title}</h4>
          <div className="flex items-center gap-4">
            {!isPast && appt.reminderEnabled && <Bell size={16} className="text-primary animate-pulse" />}
            {getStatusBadge(appt.status)}
            <button 
              onClick={(e) => { e.stopPropagation(); onSelectToDelete(appt); }}
              className="p-2 text-outline hover:text-tertiary transition-colors relative z-10"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-8 text-on-surface-variant">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-outline" />
            <span className="font-headline font-bold">{formatDate(appt.date, language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY')} • {appt.time}</span>
          </div>
          {(appt.locationName || appt.notes) && (
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-outline" />
              <span className="font-headline font-bold">{appt.locationName || appt.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-6 pt-12 pb-40"
    >
      <section className="mb-12 flex justify-between items-end">
        <div className="space-y-6">
          <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">{t('calendar.header_tagline')}</span>
          <h2 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.9] tracking-tighter">
            {t('calendar.header_title')}
          </h2>
          <p className="text-on-surface-variant text-xl max-w-md leading-relaxed">{t('calendar.header_desc')}</p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex bg-surface-container-low p-2 rounded-[2rem] shadow-ambient">
            {[
              { id: 'month', label: t('calendar.view_month') },
              { id: 'week', label: t('calendar.view_week') },
              { id: 'day', label: t('calendar.view_day') }
            ].map(view => (
              <button
                key={view.id}
                onClick={() => {
                  setTimelineView(view.id as any);
                  setViewMode('list');
                }}
                className={cn(
                  "px-6 py-3 rounded-full font-headline font-black text-[10px] uppercase tracking-widest transition-all",
                  timelineView === view.id && viewMode === 'list' ? "bg-primary text-on-primary shadow-sm" : "text-primary/60 hover:text-primary"
                )}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="flex gap-4 self-end">
            <button 
              onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
              className={cn(
                "w-20 h-20 rounded-[2rem] shadow-ambient flex items-center justify-center transition-all",
                viewMode === 'map' ? "bg-primary text-on-primary" : "bg-surface-container-low text-primary hover:bg-surface-container-high"
              )}
              title={viewMode === 'list' ? 'Switch to Map View' : 'Switch to List View'}
            >
              {viewMode === 'list' ? <MapIcon size={32} /> : <List size={32} />}
            </button>
            <button 
              onClick={() => setShowAdd(true)}
              className="bg-primary text-on-primary w-20 h-20 rounded-[2rem] shadow-ambient flex items-center justify-center hover:scale-105 transition-all"
            >
              <Plus size={32} />
            </button>
          </div>
        </div>
      </section>

      {viewMode === 'map' ? (
        <section className="space-y-12">
          <div className="bg-surface-container-low rounded-[2.5rem] p-4 shadow-ambient overflow-hidden h-[600px] relative">
            <MapContainer 
              center={userLocation ? [userLocation.lat, userLocation.lng] : [3.1390, 101.6869]} 
              zoom={12} 
              style={{ height: '100%', width: '100%', borderRadius: '2rem' }}
              scrollWheelZoom={false}
            >
              <MapController center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* User Location Marker */}
              {userLocation && (
                <Marker 
                  position={[userLocation.lat, userLocation.lng]}
                  icon={L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color: #4e3500; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                  })}
                >
                  <Popup>
                    <p className="font-headline font-black text-xs text-primary">Your Location</p>
                  </Popup>
                </Marker>
              )}

              {/* Appointment Markers */}
              {appointments.filter(a => a.coordinates).map(appt => (
                <Marker key={appt.id} position={[appt.coordinates!.lat, appt.coordinates!.lng]}>
                  <Popup>
                    <div className="p-2 space-y-2">
                      <h4 className="font-headline font-black text-primary">{appt.title}</h4>
                      <p className="text-xs text-on-surface-variant">{appt.date} • {appt.time}</p>
                      <p className="text-xs font-bold">{appt.locationName || appt.notes}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Hospital Markers */}
              {nearestHospitals.map((h, i) => {
                let bgColor = '#c62828'; // Default red for Private
                if (h.type === 'Government') bgColor = '#2e7d32'; // Green for Govt
                if (h.type.includes('Clinic')) bgColor = '#1565c0'; // Blue for Clinics

                return (
                  <Marker 
                    key={`hosp-${i}`} 
                    position={[h.lat, h.lng]}
                    icon={L.divIcon({
                      className: 'hospital-marker',
                      html: `<div style="background-color: ${bgColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.4);"></div>`,
                      iconSize: [14, 14]
                    })}
                  >
                    <Popup>
                      <div className="p-3 space-y-2 min-w-[150px]">
                        <h4 className="font-headline font-black text-primary text-sm leading-tight">{h.name}</h4>
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{h.type}</p>
                          <p className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md">{h.distance.toFixed(1)} km</p>
                        </div>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-center w-full bg-primary text-on-primary py-2 rounded-lg text-[10px] font-headline font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
                        >
                          Directions
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
            
            <button 
              onClick={handleGetLocation}
              className="absolute bottom-10 right-10 z-[1000] bg-primary text-on-primary px-6 py-4 rounded-2xl font-headline font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-2 hover:scale-105 transition-all"
            >
              <MapPin size={16} />
              {t('calendar.get_location')}
            </button>
          </div>

          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <h3 className="text-2xl font-headline font-black text-primary">{t('calendar.hospitals_title')}</h3>
              <div className="h-px flex-1 bg-outline-variant opacity-20" />
            </div>
            <p className="text-on-surface-variant">{t('calendar.hospitals_desc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nearestHospitals.slice(0, 6).map((h, i) => {
                let bgColorClass = "bg-red-600";
                if (h.type === 'Government') bgColorClass = "bg-green-600";
                if (h.type.includes('Clinic')) bgColorClass = "bg-blue-600";

                return (
                  <div 
                    key={i} 
                    onClick={() => {
                      setMapCenter([h.lat, h.lng]);
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className="bg-surface-container-low p-6 rounded-3xl shadow-sm border border-outline-variant/10 flex flex-col gap-4 relative overflow-hidden group cursor-pointer hover:border-primary/30 transition-all hover:-translate-y-1"
                  >
                    {i === 0 && (
                      <div className="absolute top-0 right-0 bg-tertiary text-on-tertiary px-4 py-1 rounded-bl-xl font-headline font-black text-[8px] uppercase tracking-widest">
                        {t('calendar.nearest')}
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm",
                        bgColorClass
                      )}>
                        <MapPin size={24} />
                      </div>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface-container-highest px-3 py-1.5 rounded-lg text-[10px] font-headline font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 border border-outline/5"
                      >
                        Directions
                      </a>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-headline font-black text-on-surface group-hover:text-primary transition-colors">{h.name}</h4>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline/5">
                        <span className="text-xs text-outline font-bold uppercase tracking-widest">{h.type}</span>
                        <span className="text-xs font-black text-primary">{h.distance.toFixed(1)} km</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Autonomous Scheduling Alert - Editorial Style */}
          {showAIAlert && profile?.role === 'caregiver' && (
            <section className="mb-16 bg-tertiary-container p-10 rounded-[2.5rem] flex gap-8 items-start shadow-ambient relative overflow-hidden">
              <div className="bg-on-tertiary-container/10 p-4 rounded-2xl">
                <AlertCircle className="text-on-tertiary-container" size={32} />
              </div>
              <div className="relative z-10">
                <h4 className="font-headline font-black text-on-tertiary-container text-2xl mb-2">{t('calendar.ai_suggestion')}</h4>
                <p className="text-on-tertiary-container/80 text-lg leading-relaxed max-w-xl">
                  {t('calendar.ai_suggestion_desc', { 
                    date: suggestedDate.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { day: 'numeric', month: 'long' }) 
                  })}
                </p>
                <div className="flex gap-4 mt-8">
                  <button 
                    onClick={handleConfirmAISuggestion}
                    disabled={isConfirming}
                    className={cn(
                      "bg-on-tertiary-container text-tertiary-container px-8 py-4 rounded-xl font-headline font-black text-sm uppercase tracking-widest shadow-sm transition-all",
                      isConfirming ? "opacity-50 cursor-wait" : "hover:scale-105 active:scale-95"
                    )}
                  >
                    {isConfirming ? 'Confirming...' : t('calendar.confirm')}
                  </button>
                  <button 
                    onClick={() => {
                      setShowAdd(true);
                      setShowAIAlert(false); // Also dismiss if they choose to manually add/reschedule
                    }}
                    className="bg-transparent text-on-tertiary-container px-8 py-4 rounded-xl font-headline font-black text-sm uppercase tracking-widest border border-on-tertiary-container/20 hover:bg-on-tertiary-container/5 transition-all"
                  >
                    {t('calendar.reschedule')}
                  </button>
                </div>
              </div>
              <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
            </section>
          )}

      <section className="mb-20 bg-surface-container-low rounded-[2.5rem] p-10 shadow-ambient">
        {timelineView === 'month' ? (
          <>
            <div className="flex items-center justify-between mb-10">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-headline font-black text-3xl text-primary">
                    {currentDate.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { month: 'long' })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1))}
                      className="w-8 h-8 flex items-center justify-center text-primary/40 hover:text-primary transition-colors"
                      aria-label="Previous Year"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className="font-headline font-black text-3xl text-primary tabular-nums">
                      {currentDate.getFullYear()}
                    </span>
                    <button 
                      onClick={() => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1))}
                      className="w-8 h-8 flex items-center justify-center text-primary/40 hover:text-primary transition-colors"
                      aria-label="Next Year"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
                <button 
                  onClick={handleGoToToday}
                  className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-primary/60 hover:text-primary flex items-center gap-2 group transition-all"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                  {t('calendar.return_to_today') || 'Return to Today'}
                </button>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all shadow-sm"
                  aria-label="Previous Month"
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all shadow-sm"
                  aria-label="Next Month"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-4 text-center mb-8 border-b border-outline-variant pb-4">
              {Array.from({ length: 7 }).map((_, i) => {
                const date = new Date(2024, 0, 7 + i); // Jan 7, 2024 is Sunday
                const dayInitial = date.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'narrow' });
                return (
                  <span key={i} className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{dayInitial}</span>
                );
              })}
            </div>
            
            <div className="grid grid-cols-7 gap-4 text-center">
              {/* Calendar Padding for Week Alignment */}
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay() }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const hasAppt = appointments.some(a => a.date === dateStr);
                const today = new Date();
                const isToday = today.getDate() === day && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
                const isSelected = selectedDate === dateStr;
                const isPast = new Date(dateStr) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                
                return (
                  <button 
                    key={i} 
                    onClick={() => setSelectedDate(dateStr)}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-2xl text-lg font-headline transition-all relative border border-transparent hover:border-outline-variant/30",
                      isToday ? "signature-gradient text-on-primary font-black shadow-ambient scale-105 z-10" : "bg-surface-container-highest/50 hover:bg-surface-container-highest",
                      hasAppt && !isToday && "text-primary font-black",
                      isSelected && !isToday && "ring-4 ring-primary ring-inset bg-surface-container-high",
                      isPast && !isToday && !isSelected && "opacity-70 text-outline"
                    )}
                  >
                    <span className={cn(isPast && !isToday && !isSelected && "font-normal")}>{day}</span>
                    {hasAppt && <div className={cn("w-1.5 h-1.5 rounded-full mt-1", isToday ? "bg-white" : "bg-primary")} />}
                  </button>
                );
              })}
            </div>
          </>
        ) : timelineView === 'week' ? (
          <div className="space-y-10">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-black text-3xl text-primary">
                {t('calendar.view_week')} {new Date(selectedDate || todayDateStr).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { month: 'short', day: 'numeric' })}
              </h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate || todayDateStr);
                    d.setDate(d.getDate() - 7);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all"
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate || todayDateStr);
                    d.setDate(d.getDate() + 7);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center hover:bg-primary hover:text-on-primary transition-all"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => {
                const startOfWeek = new Date(selectedDate || todayDateStr);
                startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
                const dayDate = new Date(startOfWeek);
                dayDate.setDate(dayDate.getDate() + i);
                const dayStr = dayDate.toISOString().split('T')[0];
                const isSelected = selectedDate === dayStr;
                const isToday = dayStr === todayDateStr;
                const hasAppt = appointments.some(a => a.date === dayStr);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(dayStr)}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-2xl gap-2 transition-all border border-transparent",
                      isSelected ? "bg-primary text-on-primary shadow-ambient" : "bg-surface-container-highest/40 hover:bg-surface-container-highest"
                    )}
                  >
                    <span className="text-[10px] font-headline font-black uppercase opacity-60">
                      {dayDate.toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'short' })}
                    </span>
                    <span className="text-xl font-headline font-black">{dayDate.getDate()}</span>
                    {hasAppt && <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-primary")} />}
                  </button>
                );
              })}
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
              {appointments.filter(a => {
                const start = new Date(selectedDate || todayDateStr);
                start.setDate(start.getDate() - start.getDay());
                const end = new Date(start);
                end.setDate(end.getDate() + 6);
                const apptDate = new Date(a.date);
                return apptDate >= start && apptDate <= end;
              }).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(appt => (
                <div key={appt.id} className="bg-surface-container-high/40 p-6 rounded-2xl flex items-center gap-6 border border-white/5">
                  <div className="text-primary font-headline font-black text-xs w-20">
                    {new Date(appt.date).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'short', day: 'numeric' })}
                  </div>
                  <div className="h-10 w-px bg-outline-variant/30" />
                  <div className="flex-1">
                    <p className="font-headline font-black text-on-surface">{appt.title}</p>
                    <p className="text-xs text-on-surface-variant">{appt.time} • {appt.locationName}</p>
                  </div>
                  {getStatusBadge(appt.status)}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-black text-3xl text-primary">
                {new Date(selectedDate || todayDateStr).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate || todayDateStr);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center"
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate || todayDateStr);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>
            
            <div className="relative pt-4 pl-12 space-y-12">
              <div className="absolute left-[2.25rem] top-0 bottom-0 w-px bg-outline-variant/20" />
              {Array.from({ length: 13 }).map((_, i) => {
                const hour = 8 + i;
                const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                const dayAppts = appointments.filter(a => a.date === (selectedDate || todayDateStr) && a.time.startsWith(hour.toString().padStart(2, '0')));
                
                return (
                  <div key={i} className="relative group">
                    <span className="absolute -left-12 top-0 text-[10px] font-headline font-black text-outline uppercase tabular-nums">
                      {hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`}
                    </span>
                    <div className="absolute left-[-1.125rem] top-1.5 w-3 h-3 rounded-full bg-surface-container-highest border-2 border-surface" />
                    
                    {dayAppts.length > 0 ? (
                      <div className="space-y-4">
                        {dayAppts.map(appt => (
                          <div key={appt.id} className="bg-primary/5 p-6 rounded-2xl border-l-4 border-primary shadow-sm">
                            <h4 className="font-headline font-black text-primary">{appt.title}</h4>
                            <p className="text-sm text-on-surface-variant font-bold">{appt.time} • {appt.locationName || appt.notes}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-1 bg-outline-variant/5 rounded-full w-full group-hover:bg-outline-variant/10 transition-colors" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Selected Day Events - Editorial Detail */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.section
            key={selectedDate}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-20"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-headline font-black text-on-surface">
                {new Date(selectedDate).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button 
                onClick={() => setSelectedDate(null)}
                className="text-xs font-headline font-black uppercase tracking-widest text-outline hover:text-primary transition-colors"
              >
                {t('calendar.clear_selection') || 'Clear'}
              </button>
            </div>
            
            <div className="space-y-4">
              {appointments.filter(a => a.date === selectedDate).length > 0 ? (
                appointments.filter(a => a.date === selectedDate).map(appt => (
                  <div key={appt.id} className="bg-surface-container-low p-6 rounded-2xl flex items-center justify-between shadow-sm border border-outline-variant/10">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        appt.type === 'checkup' ? "bg-primary text-on-primary" : "bg-tertiary text-on-tertiary"
                      )}>
                        <CalendarIcon size={24} />
                      </div>
                      <div>
                        <h4 className="font-headline font-black text-on-surface">{appt.title}</h4>
                        <p className="text-sm text-on-surface-variant font-bold">{appt.time} • {appt.locationName || appt.notes}</p>
                      </div>
                    </div>
                    {getStatusBadge(appt.status)}
                  </div>
                ))
              ) : (
                <div className="bg-surface-container-low p-12 rounded-[2rem] text-center border-2 border-dashed border-outline-variant/20">
                  <p className="text-on-surface-variant font-headline font-bold">
                    {t('calendar.no_events_on_day') || 'No scheduled events for this day.'}
                  </p>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Appointment History & Upcoming - Multi-view Records */}
      <section className="space-y-16">
        {/* Upcoming Section */}
        <div className="space-y-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-sm font-headline font-black tracking-[0.1em] uppercase text-primary">{t('calendar.upcoming') || 'Upcoming Events'}</h2>
            <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
            <span className="text-xs font-headline font-black text-outline uppercase tracking-widest">
              {appointments.filter(a => new Date(a.date) >= new Date(new Date().setHours(0,0,0,0))).length} {t('calendar.events') || 'Events'}
            </span>
          </div>
          
          <div className="space-y-6">
            {appointments
              .filter(a => new Date(a.date) >= new Date(new Date().setHours(0,0,0,0)))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((appt) => (
                <AppointmentCard key={appt.id} appt={appt} t={t} language={language} onSelectToDelete={setApptToDelete} onSelectAppt={setSelectedAppt} />
              ))}
            
            {appointments.filter(a => new Date(a.date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 && (
              <div className="text-center py-12 bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/30">
                <p className="text-on-surface-variant font-headline font-bold">{t('calendar.no_upcoming') || 'No upcoming appointments.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Historical Records Section */}
        <div className="space-y-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-sm font-headline font-black tracking-[0.1em] uppercase text-tertiary">{t('calendar.records') || 'Past Records'}</h2>
            <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
            <span className="text-xs font-headline font-black text-outline uppercase tracking-widest">
              {appointments.filter(a => new Date(a.date) < new Date(new Date().setHours(0,0,0,0))).length} {t('calendar.records_count') || 'Records'}
            </span>
          </div>

          <div className="space-y-6">
            {appointments
              .filter(a => new Date(a.date) < new Date(new Date().setHours(0,0,0,0)))
              .sort((a, b) => b.date.localeCompare(a.date)) // Sort newest past records first
              .map((appt) => (
                <AppointmentCard key={appt.id} appt={appt} t={t} language={language} onSelectToDelete={setApptToDelete} onSelectAppt={setSelectedAppt} isPast />
              ))}
            
            {appointments.filter(a => new Date(a.date) < new Date(new Date().setHours(0,0,0,0))).length === 0 && (
              <div className="text-center py-12 bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/30">
                <p className="text-on-surface-variant font-headline font-bold">{t('calendar.no_records') || 'No past records found.'}</p>
              </div>
            )}
          </div>
        </div>
      </section>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {apptToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-md" 
              onClick={() => setApptToDelete(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface-container-low rounded-[2.5rem] p-10 w-full max-w-md relative z-10 shadow-2xl space-y-8"
            >
              <div className="bg-tertiary/10 w-16 h-16 rounded-2xl flex items-center justify-center text-tertiary mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="text-center space-y-4">
                <h3 className="text-3xl font-headline font-black text-on-surface">{t('calendar.delete_title')}</h3>
                <p className="text-on-surface-variant text-lg">
                  {t('calendar.delete_desc', { title: apptToDelete.title })}
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setApptToDelete(null)}
                  className="flex-1 py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
                >
                  {t('calendar.cancel')}
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-4 bg-tertiary text-on-tertiary font-headline font-black uppercase tracking-widest rounded-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {t('calendar.delete_confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Appointment Modal - Glass Depth */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-on-surface/10 backdrop-blur-xl" onClick={() => setShowAdd(false)} />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-surface-container-low rounded-[3rem] p-4 sm:p-8 lg:p-12 w-full max-w-xl relative z-10 shadow-2xl space-y-4 sm:space-y-6 max-h-[95vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4 sm:mb-8">
              <h3 className="text-2xl sm:text-4xl font-headline font-black text-primary tracking-tighter">{t('calendar.add_title')}</h3>
                <button onClick={() => setShowAdd(false)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl hover:bg-on-surface/5 flex items-center justify-center transition-all">
                  <X size={32} className="w-6 h-6 sm:w-8 sm:h-8 text-outline" />
                </button>
            </div>
            <div className="space-y-4 sm:space-y-8 p-1">
              <div className="space-y-3">
                <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('calendar.event_title')}</label>
                <input 
                  type="text" 
                  placeholder={t('calendar.placeholder_title')}
                  value={newAppt.title}
                  onChange={(e) => setNewAppt({...newAppt, title: e.target.value})}
                  className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('calendar.location')}</label>
                <input 
                  type="text" 
                  placeholder={t('calendar.placeholder_location')}
                  value={newAppt.locationName}
                  onChange={(e) => setNewAppt({...newAppt, locationName: e.target.value})}
                  className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('calendar.date')}</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={newAppt.date}
                      onChange={(e) => setNewAppt({...newAppt, date: e.target.value})}
                      className="w-full h-16 bg-surface-container-highest pl-14 pr-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none text-primary/60">
                      <CalendarIcon size={20} />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('calendar.time')}</label>
                  <div className="relative">
                    <input 
                      type="time" 
                      value={newAppt.time}
                      onChange={(e) => setNewAppt({...newAppt, time: e.target.value})}
                      className="w-full h-16 bg-surface-container-highest pl-14 pr-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none text-primary/60">
                      <Clock size={20} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('calendar.category')}</label>
                <div className="relative">
                  <select 
                    value={newAppt.type}
                    onChange={(e) => setNewAppt({...newAppt, type: e.target.value as any})}
                    className="w-full h-16 bg-surface-container-highest px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all appearance-none pr-12"
                  >
                    <option value="checkup">{t('calendar.cat_checkup')}</option>
                    <option value="follow-up">{t('calendar.cat_followup')}</option>
                    <option value="specialist">{t('calendar.cat_specialist')}</option>
                    <option value="other">{t('calendar.cat_other')}</option>
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                    <ChevronDown size={20} />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-6 bg-surface-container-highest rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                    newAppt.reminderEnabled ? "bg-primary text-on-primary" : "bg-outline/20 text-outline"
                  )}>
                    {newAppt.reminderEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                  </div>
                  <div>
                    <p className="font-headline font-black text-on-surface">{t('calendar.reminders')}</p>
                    <p className="text-xs text-on-surface-variant">{t('calendar.reminders_desc')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setNewAppt({...newAppt, reminderEnabled: !newAppt.reminderEnabled})}
                  className={cn(
                    "w-14 h-8 rounded-full transition-all relative p-1",
                    newAppt.reminderEnabled ? "bg-primary" : "bg-outline/30"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 bg-white rounded-full transition-all shadow-sm",
                    newAppt.reminderEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>
            </div>
            <div className="flex gap-6 pt-6">
              <button 
                onClick={() => setShowAdd(false)}
                className="flex-1 py-6 text-outline font-headline font-black uppercase tracking-widest hover:bg-surface-container-highest rounded-2xl transition-all"
              >
                {t('calendar.cancel')}
              </button>
              <button 
                onClick={handleAdd}
                className="flex-1 py-6 signature-gradient text-on-primary font-headline font-black text-xl rounded-2xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {t('calendar.schedule')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Appointment Details Modal */}
      <AnimatePresence>
        {selectedAppt && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/10 backdrop-blur-xl" onClick={() => setSelectedAppt(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="bg-surface-container-lowest rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-2xl border border-outline/5 overflow-hidden"
            >
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 space-y-8">
                <div className="flex justify-between items-start">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm",
                    selectedAppt.type === 'checkup' ? "bg-primary text-on-primary" : "bg-tertiary text-on-tertiary"
                  )}>
                    <CalendarIcon size={32} strokeWidth={1.5} />
                  </div>
                  <button 
                    onClick={() => setSelectedAppt(null)}
                    className="p-2 text-outline hover:text-primary transition-colors bg-surface-container-highest rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div>
                  <h3 className="text-3xl font-headline font-black text-on-surface tracking-tight mb-2">
                    {selectedAppt.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-4">
                    {getStatusBadge(selectedAppt.status)}
                    <span className="text-[10px] font-headline font-black uppercase tracking-widest text-outline px-3 py-1 bg-surface-container-highest rounded-lg border border-outline/5">
                      {selectedAppt.type}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 bg-surface-container-lowest rounded-3xl border border-outline/5 p-6 shadow-ambient">
                  <div className="flex items-start gap-4">
                    <Clock className="text-primary mt-1" size={20} />
                    <div>
                      <p className="text-[10px] font-headline font-black uppercase tracking-widest text-outline">{t('calendar.date') || 'Date & Time'}</p>
                      <p className="text-base font-bold text-on-surface">
                        {new Date(selectedAppt.date).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-sm font-medium text-on-surface-variant mt-1">{selectedAppt.time}</p>
                    </div>
                  </div>
                  
                  <div className="h-px w-full bg-outline/10" />

                  <div className="flex items-start gap-4">
                    <MapPin className="text-tertiary mt-1" size={20} />
                    <div>
                      <p className="text-[10px] font-headline font-black uppercase tracking-widest text-outline">{t('calendar.location') || 'Location'}</p>
                      <p className="text-base font-bold text-on-surface">
                        {selectedAppt.locationName || t('calendar.placeholder_location') || 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-primary/5 p-5 rounded-2xl border border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="text-primary">
                      {selectedAppt.reminderEnabled ? <Bell size={24} /> : <BellOff size={24} />}
                    </div>
                    <div>
                      <p className="font-headline font-black text-sm text-primary">{t('calendar.reminders') || 'Reminders'}</p>
                      <p className="text-[10px] text-primary/70 font-bold uppercase tracking-widest">
                        {selectedAppt.reminderEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    onClick={() => { setSelectedAppt(null); setApptToDelete(selectedAppt); }}
                    className="flex-1 py-4 bg-surface-container-highest text-tertiary font-headline font-black uppercase tracking-widest rounded-xl hover:bg-tertiary/10 transition-colors flex items-center justify-center gap-2 border border-tertiary/10"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                  <button 
                    onClick={() => setSelectedAppt(null)}
                    className="flex-1 py-4 signature-gradient text-on-primary font-headline font-black uppercase tracking-widest rounded-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

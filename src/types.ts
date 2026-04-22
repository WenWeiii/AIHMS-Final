export type Screen = 'dashboard' | 'insights' | 'chat' | 'calendar' | 'community' | 'health-circle' | 'settings' | 'admin' | 'wearables' | 'health-history';

export type UserRole = 'patient' | 'caregiver' | 'admin';

export type Language = 'ms' | 'en' | 'zh';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  language: Language;
  hasCompletedOnboarding: boolean;
  assignedPatientId?: string; // For caregivers
  caregiverIds?: string[]; // For patients
  mainCaregiverId?: string; // For patients to select their primary contact
  wearableConnected?: boolean;
  wearableType?: string;
  wearableToken?: string; // For demo purposes, we'll store it here
  wearableSyncedAt?: any;
  bio?: string;
  bloodType?: string;
  allergies?: string;
  
  // New Patient Details
  gender?: 'Male' | 'Female' | 'Other';
  houseAddress?: string;
  dob?: string;
  conditions?: string;
  medications?: string;
  icNumber?: string;
  
  // New Caregiver Details
  fullName?: string;
  phoneNumber?: string;
  relationship?: 'Family' | 'Professional Caregiver' | 'Friend';
  agencyId?: string;
  licenseNumber?: string;
  
  // Linkage Logic
  inviteToken?: string;
  inviteTokenExpiresAt?: number;
  narrationEnabled?: boolean;
  
  createdAt: string;
  latestVitals?: {
    heartRate?: number;
    steps?: number;
    weight?: number;
    sleepHours?: number;
    bloodPressure?: string;
    triageZone?: TriageZone;
    timestamp?: string;
  };
}

export interface TrustedContact {
  id: string;
  name: string;
  relation: string;
  email: string;
  phone: string;
  alertsEnabled: boolean;
  reportsEnabled: boolean;
}

export type TriageZone = 'Red' | 'Yellow' | 'Green' | 'None';
export type ActionTrigger = 'Emergency' | 'Scheduling' | 'Community' | 'None';

export interface FHIRVitalSigns {
  resourceType: "Observation";
  status: "final";
  category: [{
    coding: [{
      system: "http://terminology.hl7.org/CodeSystem/observation-category",
      code: "vital-signs",
      display: "Vital Signs"
    }]
  }];
  code: {
    coding: [{
      system: "http://loinc.org",
      code: string;
      display: string;
    }]
  };
  subject: { reference: string };
  effectiveDateTime: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system: "http://unitsofmeasure.org";
    code: string;
  };
  component?: Array<{
    code: {
      coding: [{
        system: "http://loinc.org",
        code: string;
        display: string;
      }]
    };
    valueQuantity: {
      value: number;
      unit: string;
      system: "http://unitsofmeasure.org";
      code: string;
    };
  }>;
}

export interface AIHMsAnalysis {
  extractedVitals: FHIRVitalSigns[];
  triageZone: TriageZone;
  actionTrigger: ActionTrigger;
  symptoms: string[];
  clinicalReasoning: string;
}

export interface HealthData {
  id: string;
  timestamp: string;
  weight?: number;
  bloodPressure?: string;
  heartRate?: number;
  steps?: number;
  sleepHours?: number;
  mood?: string;
  notes?: string;
  triageZone?: TriageZone;
  analysis?: AIHMsAnalysis;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  analysis?: AIHMsAnalysis;
}

export interface Appointment {
  id: string;
  userId?: string;
  title: string;
  date: string;
  time: string;
  type: 'checkup' | 'follow-up' | 'specialist' | 'other';
  notes?: string;
  status: 'scheduled' | 'pending' | 'cancelled';
  reminderEnabled?: boolean;
  reminderSent?: boolean;
  locationName?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'hydration' | 'mobility' | 'social' | 'medical' | 'mental' | 'lifestyle' | 'alert';
  actionType: 'calendar' | 'reminder' | 'notify' | 'reschedule' | 'monitor' | 'none';
  actionData?: {
    date?: string;
    time?: string;
    text?: string;
    urgency?: 'high' | 'medium' | 'low';
  };
}

export interface AIInsight {
  summary: string;
  trends: string;
  proactiveAlert: string | null;
  recommendations: AIRecommendation[];
  healthScore: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  type: 'text' | 'image' | 'system';
}

export type CallType = 'voice' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface CallData {
  from: string;
  name: string;
  type: CallType;
  signal?: any;
}

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  content: string;
  category: 'bug' | 'suggestion' | 'other';
  timestamp: any;
  status: 'new' | 'reviewed' | 'closed';
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Helper to safely extract a Date object from a string, Date, or Firestore Timestamp
 */
export const safeParseDate = (dateObject: any) => {
  if (!dateObject) return null;
  if (dateObject instanceof Date) return dateObject;
  if (typeof dateObject === 'object' && 'seconds' in dateObject) {
    return new Date(dateObject.seconds * 1000);
  }
  if (typeof dateObject === 'number') {
    return new Date(dateObject);
  }
  if (typeof dateObject.toDate === 'function') {
    return dateObject.toDate();
  }
  const parsed = new Date(dateObject);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Safely formats a date for display.
 */
export const formatDate = (date: any, locale = 'en-MY') => {
  const d = safeParseDate(date);
  if (!d) return 'Invalid Date';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Safely formats a time for display.
 */
export const formatTime = (timestamp: any, locale = 'en-MY') => {
  const d = safeParseDate(timestamp);
  if (!d) return 'Invalid Time';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

/**
 * Calculates a health score from 0 to 100 based on specific health metrics.
 */
export const calculateHealthScore = (steps: number, hr: number, weight: number, sleep: number, bp: string) => {
  let score = 0;
  
  // Steps (0-20)
  if (steps < 3000) score += 5;
  else if (steps <= 7000) score += 10;
  else if (steps > 7000) score += 20;

  // HR (0-20)
  if (hr >= 60 && hr <= 80) score += 20;
  else if (hr >= 81 && hr <= 100) score += 10;
  else score += 5;

  // Weight (0-20)
  if (weight >= 50 && weight <= 90) score += 20;
  else if ((weight >= 40 && weight <= 49) || (weight >= 91 && weight <= 110)) score += 10;
  else score += 5;

  // Sleep (0-20)
  if (sleep >= 7 && sleep <= 9) score += 20;
  else if (sleep >= 5 && sleep <= 6) score += 10;
  else score += 5;

  // BP (0-20)
  const [systolic, diastolic] = bp.split('/').map(val => parseInt(val) || 0);
  if (systolic < 120 && diastolic < 80) score += 20;
  else if (systolic <= 139 && diastolic <= 89) score += 10;
  else score += 5;

  return score;
};

/**
 * Generates system recommendations based on health metrics.
 */
export const getSystemRecommendations = (steps: number, hr: number, weight: number, sleep: number) => {
  const recommendations: any[] = [];

  if (steps < 3000) {
    recommendations.push({
      title: 'Low Footsteps (Activity)',
      description: 'Increase daily physical activity by aiming for at least 5,000–7,000 steps per day. Incorporate short walks after meals to gradually improve activity levels.',
      category: 'mobility',
      actionType: 'monitor',
      priority: 'high'
    });
  }

  if (hr < 60 || hr > 100) {
    recommendations.push({
      title: 'Abnormal Heart Rate',
      description: 'Monitor your heart rate regularly and avoid excessive physical strain. Practice relaxation techniques such as deep breathing to stabilize heart rate.',
      category: 'medical',
      actionType: 'notify',
      priority: 'high'
    });
  }

  if (weight < 40 || weight > 110) {
    recommendations.push({
      title: 'Weight Out of Range',
      description: 'Maintain a balanced diet with appropriate calorie intake to support a healthy weight. Engage in light physical activity to improve overall fitness and metabolism.',
      category: 'lifestyle',
      actionType: 'none',
      priority: 'high'
    });
  }

  if (sleep < 5) {
    recommendations.push({
      title: 'Poor Sleep',
      description: 'Aim for 7–8 hours of sleep per night to support recovery and overall health. Maintain a consistent sleep schedule and reduce screen time before bedtime.',
      category: 'sleep',
      actionType: 'reminder',
      priority: 'high'
    });
  }

  return recommendations;
};

/**
 * Determines if a follow-up appointment suggestion should be generated.
 */
export const getAppointmentSuggestion = (bp: string, appointments: any[]) => {
  const [systolic, diastolic] = bp.split('/').map(val => parseInt(val) || 0);
  const isHighBP = systolic >= 140 || diastolic >= 90;
  
  // Check if an upcoming event already addresses this (e.g., BP checkup or follow-up)
  const alreadyHasThis = appointments.some(a => 
    (a.status === 'scheduled' || a.status === 'pending') && 
    (a.type === 'follow-up' || 
     a.title.toLowerCase().includes('bp') || 
     a.title.toLowerCase().includes('blood pressure') ||
     a.title.toLowerCase().includes('hypertension'))
  );

  if (alreadyHasThis) return null;
  
  if (isHighBP) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const dateStr = nextWeek.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    return `Based on the patient log readings, a follow-up with Dr. Lim on ${dateStr} is recommended. Would you like to confirm?`;
  }
  return null;
};

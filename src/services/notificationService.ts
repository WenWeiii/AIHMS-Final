import { Appointment } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.error("This browser does not support desktop notification");
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const sendNotification = (title: string, options?: NotificationOptions) => {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico', // Fallback icon
      ...options
    });
    return true;
  }
  return false;
};

export const checkUpcomingAppointments = async (appointments: Appointment[], userId: string, t: (key: string) => string) => {
  const now = new Date();
  const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60000);

  for (const appt of appointments) {
    if (appt.reminderEnabled && !appt.reminderSent && appt.status === 'scheduled') {
      const apptDateTime = new Date(`${appt.date}T${appt.time}`);
      
      // If appointment is within the next 15 minutes and hasn't passed
      if (apptDateTime > now && apptDateTime <= fifteenMinutesFromNow) {
        const success = sendNotification(t('notification.reminder_title').replace('{title}', appt.title), {
          body: t('notification.reminder_body').replace('{time}', appt.time),
          tag: appt.id
        });

        if (success) {
          // Mark as sent in Firestore
          const apptRef = doc(db, `users/${userId}/appointments`, appt.id);
          await updateDoc(apptRef, { reminderSent: true });
        }
      }
    }
  }
};

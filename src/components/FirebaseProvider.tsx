import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, UserRole, Language } from '../types';

interface FirebaseContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string, role: UserRole, extraData?: any) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (displayName: string, photoURL: string, bloodType?: string, allergies?: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  connectWearable: (type: 'fitbit' | 'google-fit' | 'apple-health', token: string) => Promise<void>;
  toggleNarration: (enabled: boolean) => Promise<void>;
  hasCompletedOnboarding: boolean;
  isAuthReady: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      // Set auth ready immediately when we know the user status
      if (!firebaseUser) {
        setIsAuthReady(true);
        setLoading(false);
        setUser(null);
        setProfile(null);
        return;
      }

      setUser(firebaseUser);
      setIsAuthReady(true); // Don't block the shell on profile fetching

      const userPath = `users/${firebaseUser.uid}`;
      try {
        if (!db) throw new Error("Firestore instance 'db' is not initialized.");
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        let userSnap = await getDoc(userRef);
        let retries = 0;
        
        // Retry loop for potential sync latency
        while (!userSnap.exists() && retries < 5) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          userSnap = await getDoc(userRef);
          retries++;
        }
        
        const isAdminEmail = firebaseUser.email === 'ongyh123@gmail.com' || firebaseUser.email === 'shumww1@gmail.com';

        if (!userSnap.exists()) {
          // Profile doesn't exist, create it immediately.
          // Role is initialized as null to ensure it is set explicitly during registration/onboarding.
          const newUser: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'New User',
            photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
            role: 'patient', // Default to patient temporarily, but this must be set by onboarding/registration
            language: 'en',
            hasCompletedOnboarding: false,
            narrationEnabled: false,
            createdAt: new Date().toISOString(),
          };
          await setDoc(userRef, newUser);
          setProfile(newUser);
          setIsAuthReady(true);
          setLoading(false);
          setHasCompletedOnboarding(false);
          return;
        }
        
        const currentData = userSnap.data() as UserProfile;
        if (isAdminEmail && currentData.role !== 'admin') {
          await updateDoc(userRef, { role: 'admin' });
        }
        setProfile(currentData);
        setHasCompletedOnboarding(currentData.hasCompletedOnboarding ?? true);
        setIsAuthReady(true);
        setLoading(false);

        unsubscribeProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, userPath);
        });

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, userPath);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      // Don't log expected authentication errors to console as messy "Errors"
      // the UI handles these via the thrown exception
      if (error.code !== 'auth/invalid-credential' && !error.message?.includes('invalid-credential')) {
        console.error("Email login error:", error);
      }
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error("Reset password error:", error);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName: string, role: UserRole, extraData?: any) => {
    try {
      // Store pending info so onAuthStateChanged can pick it up
      localStorage.setItem('pending-role', role);
      localStorage.setItem('pending-display-name', displayName);
      if (extraData) {
        localStorage.setItem('pending-extra-data', JSON.stringify(extraData));
      }
      
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Immediately update profile on the user object
      await updateProfile(cred.user, { 
        displayName, 
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cred.user.uid}` 
      });
    } catch (error: any) {
      if (error.code !== 'auth/email-already-in-use' && !error.message?.includes('email-already-in-use')) {
        console.error("Email registration error:", error);
      }
      localStorage.removeItem('pending-role');
      localStorage.removeItem('pending-display-name');
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const updateUserProfile = async (displayName: string, photoURL: string, bloodType?: string, allergies?: string) => {
    if (!auth.currentUser) return;
    
    // Generate placeholder if photoURL is empty
    const finalPhotoURL = photoURL.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser.uid}`;
    
    try {
      await updateProfile(auth.currentUser, { displayName, photoURL: finalPhotoURL });
      
      const userPath = `users/${auth.currentUser.uid}`;
      // Update Firestore
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const updates: any = {
        displayName,
        photoURL: finalPhotoURL,
        updatedAt: new Date().toISOString()
      };
      
      if (bloodType !== undefined) updates.bloodType = bloodType;
      if (allergies !== undefined) updates.allergies = allergies;

      await updateDoc(userRef, updates).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));

      // Fetch fresh profile instead of cloning user
      const freshSnap = await getDoc(userRef);
      if (freshSnap.exists()) {
        setProfile(freshSnap.data() as UserProfile);
      }
    } catch (error) {
      console.error("Update profile error:", error);
      throw error;
    }
  };

  const completeOnboarding = async () => {
    if (!user) return;
    try {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { hasCompletedOnboarding: true }).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.error("Complete onboarding error:", error);
    }
  };

  const setRole = async (role: UserRole) => {
    if (!user) return;
    try {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { role }).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));
    } catch (error) {
      console.error("Set role error:", error);
    }
  };

  const setLanguage = async (language: Language) => {
    if (!user) return;
    try {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { language }).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));
    } catch (error) {
      console.error("Set language error:", error);
    }
  };

  const connectWearable = async (type: 'fitbit' | 'google-fit' | 'apple-health', token: string) => {
    if (!user) return;
    try {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        wearableConnected: true,
        wearableType: type,
        wearableToken: token,
        wearableSyncedAt: new Date().toISOString()
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));
    } catch (error) {
      console.error("Connect wearable error:", error);
      throw error;
    }
  };

  const toggleNarration = async (enabled: boolean) => {
    if (!user) return;
    try {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { narrationEnabled: enabled }).catch(e => handleFirestoreError(e, OperationType.UPDATE, userPath));
    } catch (error) {
      console.error("Toggle narration error:", error);
    }
  };

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signIn, 
      loginWithEmail,
      resetPassword,
      registerWithEmail,
      signOut, 
      updateUserProfile, 
      completeOnboarding, 
      setRole,
      setLanguage,
      connectWearable,
      toggleNarration,
      hasCompletedOnboarding, 
      isAuthReady 
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { TopAppBar } from './components/layout/TopAppBar';
import { BottomNavBar } from './components/layout/BottomNavBar';
import { SideDrawer } from './components/layout/SideDrawer';
import { Dashboard } from './screens/Dashboard';
import { Insights } from './screens/Insights';
import { Chat } from './screens/Chat';
import { Calendar } from './screens/Calendar';
import { Community } from './screens/Community';
import { Settings } from './screens/Settings';
import { HealthCircle } from './screens/HealthCircle';
import { HealthHistory } from './screens/HealthHistory';
import { Admin } from './screens/Admin';
import { Wearables } from './screens/Wearables';
import { Screen, UserRole } from './types';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { ThemeProvider } from './components/ThemeProvider';
import { LanguageProvider, useTranslation } from './components/LanguageProvider';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { cn } from './lib/utils';
import { AihmsLogo } from './components/AihmsLogo';
import { LoginForm, RegisterForm } from './components/auth/AuthForms';
import { SocketProvider } from './components/SocketProvider';
import { CallProvider } from './components/communication/CallManager';

function AppContent() {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const { user, profile, loading, isAuthReady } = useFirebase();
  const { t } = useTranslation();

  React.useEffect(() => {
    // Left empty for now, redirect logic for admin is handled natively in render
  }, [user, profile, activeScreen]);

  if (!isAuthReady || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-8">
          <div className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center shadow-ambient animate-pulse">
            <AihmsLogo className="w-12 h-12 text-on-primary" colored />
          </div>
          <p className="text-primary font-headline font-black uppercase tracking-[0.3em] text-xs animate-pulse">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-8 overflow-hidden relative">
        {/* Background Decor */}
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-tertiary/5 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full flex flex-col items-center">
          <div className="mb-8 space-y-4">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto shadow-ambient">
              <AihmsLogo className="w-8 h-8 text-on-primary" colored />
            </div>
            <h1 className="text-2xl font-headline font-black text-primary tracking-tighter text-center">
              AIHMs <span className="text-tertiary">Guardian</span>
            </h1>
          </div>

          {authView === 'login' ? (
            <LoginForm onSwitchToRegister={() => setAuthView('register')} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setAuthView('login')} />
          )}

          <p className="mt-8 text-[10px] text-outline uppercase tracking-[0.2em] font-headline font-bold">
            {t('insights.verified')}
          </p>
        </div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveScreen} />;
      case 'insights':
        return <Insights onNavigate={setActiveScreen} />;
      case 'chat':
        return <Chat />;
      case 'calendar':
        return <Calendar />;
      case 'community':
        return <Community />;
      case 'health-circle':
        return <HealthCircle onNavigate={setActiveScreen} />;
      case 'health-history':
        return <HealthHistory onNavigate={setActiveScreen} />;
      case 'settings':
        return <Settings onNavigate={setActiveScreen} />;
      case 'admin':
        return <Admin />;
      case 'wearables':
        return <Wearables />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col selection:bg-primary/10">
      <TopAppBar 
        onProfileClick={() => setActiveScreen('settings')} 
        onLogoClick={() => setActiveScreen('dashboard')}
        onMenuClick={() => setIsDrawerOpen(true)}
      />

      <SideDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        onScreenChange={setActiveScreen}
        activeScreen={activeScreen}
      />
      
      <main className="flex-1 relative">
        {renderScreen()}
      </main>

      <BottomNavBar 
        activeScreen={activeScreen} 
        onScreenChange={setActiveScreen} 
      />

      <OnboardingTutorial onScreenChange={setActiveScreen} />

      {/* Subtle Background Decor */}
      <div className="fixed top-[20%] right-[-10%] w-[600px] h-[600px] bg-primary/5 blur-[150px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[10%] left-[-10%] w-[500px] h-[500px] bg-tertiary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <LanguageProvider>
          <ThemeProvider>
            <SocketProvider>
              <CallProvider>
                <AppContent />
              </CallProvider>
            </SocketProvider>
          </ThemeProvider>
        </LanguageProvider>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}

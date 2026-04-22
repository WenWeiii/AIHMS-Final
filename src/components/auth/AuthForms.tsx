import React, { useState } from 'react';
import { useFirebase } from '../FirebaseProvider';
import { useTranslation } from '../LanguageProvider';
import { UserRole } from '../../types';
import { Mail, Lock, User, Shield, ArrowRight, Loader2, UserCircle, Users, Chrome, Calendar, MapPin, FileText, ClipboardList, CreditCard, Phone, Stethoscope, Briefcase, PenTool, Droplets, Heart, Activity, Pill, Fingerprint, Link, FileCheck, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

export const LoginForm: React.FC<{ onSwitchToRegister: () => void }> = ({ onSwitchToRegister }) => {
  const { loginWithEmail, signIn, resetPassword } = useFirebase();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email) {
      setError(t('auth.invalid_email') || 'Please enter your email address to reset your password.');
      return;
    }
    setError(null);
    try {
      await resetPassword(email);
      // Using an alert is fine for a simple prototype flow
      alert(t('auth.reset_email_sent') || 'Password reset email sent. Please check your inbox.');
    } catch (err: any) {
      console.error("Password reset error:", err);
      // Map common Firebase errors to user-friendly messages if possible
      setError(t('auth.reset_failed') || 'Failed to send password reset email. Please ensure the email is correct.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    try {
      await loginWithEmail(trimmedEmail, password);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.message?.includes('auth/invalid-credential') || err.message?.includes('invalid-credential')) {
        setError(t('auth.invalid_credentials'));
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md space-y-8 p-8"
    >
      <div className="text-center space-y-2">
        <h2 className="text-xs font-headline font-black text-outline uppercase tracking-[0.3em] mb-4">AIHMS</h2>
        <h1 className="text-4xl font-headline font-black text-primary tracking-tight">
          {t('auth.login')}
        </h1>
        <p className="text-on-surface-variant font-medium">
          {t('app.tagline')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
            <input
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-12 font-medium transition-all outline-none"
            />
            <button
               type="button"
               onClick={() => setShowPassword(!showPassword)}
               className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
            >
               {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm font-bold bg-red-50 p-4 rounded-xl border border-red-100 italic">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleForgotPassword}
          className="text-xs text-outline hover:text-primary transition-colors font-medium ml-2"
        >
          {t('auth.forgot_password') || 'Forgot password?'}
        </button>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary rounded-2xl py-4 font-headline font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-ambient flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : t('auth.login_btn')}
          {!loading && <ArrowRight size={20} />}
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-outline/10"></span>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-headline font-black">
            <span className="bg-surface px-4 text-outline/40">Or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={signIn}
          className="w-full bg-surface-container-high text-on-surface rounded-2xl py-4 font-headline font-black uppercase tracking-widest hover:bg-surface-container-highest transition-all border border-outline/5 flex items-center justify-center gap-3"
        >
          <Chrome size={20} />
          {t('auth.google_login') || 'Continue with Google'}
        </button>

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="w-full text-on-surface-variant font-headline font-black text-xs uppercase tracking-widest hover:text-primary transition-colors"
        >
          {t('auth.no_account')}
        </button>
      </form>
    </motion.div>
  );
};


// ... (LoginForm remains unchanged)

export const RegisterForm: React.FC<{ onSwitchToLogin: () => void }> = ({ onSwitchToLogin }) => {
  const { registerWithEmail } = useFirebase();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Patient specific fields
  const [patientData, setPatientData] = useState({
    gender: 'Male',
    bloodType: '',
    houseAddress: '',
    dob: '',
    conditions: '',
    medications: '',
    icNumber: ''
  });

  // Caregiver specific fields
  const [caregiverData, setCaregiverData] = useState({
    fullName: '',
    phoneNumber: '',
    relationship: 'Family',
    agencyId: '',
    licenseNumber: '',
    signature: ''
  });

  const adminEmails = ['shumww1@gmail.com', 'ongyh123@gmail.com'];
  const isAdminEmail = adminEmails.includes(email.toLowerCase().trim());

  React.useEffect(() => {
    if (isAdminEmail) {
      setRole('admin');
    }
  }, [isAdminEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Authorization Check
    if (isAdminEmail && accessCode !== 'AIHMS2026') {
      setError(t('auth.invalid_code') || 'Invalid admin access code');
      return;
    }

    // Simple Validation
    if (password.length < 6) {
      setError(t('auth.weak_password'));
      return;
    }

    setLoading(true);
    const trimmedEmail = email.trim();
    try {
      const extraData = role === 'patient' ? patientData : (role === 'caregiver' ? caregiverData : {});
      await registerWithEmail(trimmedEmail, password, username, role, extraData);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use' || err.message?.includes('auth/email-already-in-use') || err.message?.includes('email-already-in-use')) {
        setError("This email is already registered in the system. If your account profile was previously deleted by an Admin, your login credentials still exist. Please click 'Sign In' instead.");
      } else {
        setError(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-2xl space-y-8 p-8"
    >
      <div className="text-center space-y-2">
        <h2 className="text-xs font-headline font-black text-outline uppercase tracking-[0.3em] mb-4">AIHMS</h2>
        <h1 className="text-4xl font-headline font-black text-primary tracking-tight">
          {t('auth.register')}
        </h1>
        <p className="text-on-surface-variant font-medium">
          {t('onboarding.role_desc')}
        </p>
      </div>

      {!isAdminEmail && (
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setRole('patient')}
            className={cn(
              "p-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2",
              role === 'patient' ? "bg-primary/5 border-primary" : "bg-surface-container-highest border-transparent grayscale opacity-50"
            )}
          >
            <UserCircle size={32} className="text-primary" />
            <span className="font-headline font-black text-[10px] uppercase tracking-widest">{t('onboarding.patient')}</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('caregiver')}
            className={cn(
              "p-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2",
              role === 'caregiver' ? "bg-tertiary/5 border-tertiary" : "bg-surface-container-highest border-transparent grayscale opacity-50"
            )}
          >
            <Users size={32} className="text-tertiary" />
            <span className="font-headline font-black text-[10px] uppercase tracking-widest">{t('onboarding.caregiver')}</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Common Fields */}
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
            <input
              type="text"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
            <input
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-12 font-medium transition-all outline-none"
            />
            <button
               type="button"
               onClick={() => setShowPassword(!showPassword)}
               className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
            >
               {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {isAdminEmail && (
            <div className="relative">
              <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
              <input
                type="text"
                placeholder={t('auth.access_code')}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
                className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
              />
            </div>
          )}

          {/* Patient Role Fields */}
          {role === 'patient' && (
            <>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="text"
                  placeholder={t('auth.ic_number')}
                  value={patientData.icNumber}
                  onChange={(e) => setPatientData({...patientData, icNumber: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="date"
                  placeholder={t('auth.dob')}
                  value={patientData.dob}
                  onChange={(e) => setPatientData({...patientData, dob: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <select
                  value={patientData.gender}
                  onChange={(e) => setPatientData({...patientData, gender: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-12 font-medium transition-all outline-none appearance-none"
                >
                  <option value="Male">{t('auth.male')}</option>
                  <option value="Female">{t('auth.female')}</option>
                  <option value="Other">{t('auth.other')}</option>
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
              </div>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="text"
                  placeholder={t('auth.blood_type')}
                  value={patientData.bloodType}
                  onChange={(e) => setPatientData({...patientData, bloodType: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="md:col-span-2 relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="text"
                  placeholder={t('auth.address')}
                  value={patientData.houseAddress}
                  onChange={(e) => setPatientData({...patientData, houseAddress: e.target.value})}
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="md:col-span-2 relative">
                <ClipboardList className="absolute left-4 top-6 text-outline" size={20} />
                <textarea
                  placeholder={t('auth.conditions')}
                  value={patientData.conditions}
                  onChange={(e) => setPatientData({...patientData, conditions: e.target.value})}
                  rows={2}
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="md:col-span-2 relative">
                <FileText className="absolute left-4 top-6 text-outline" size={20} />
                <textarea
                  placeholder={t('auth.medications')}
                  value={patientData.medications}
                  onChange={(e) => setPatientData({...patientData, medications: e.target.value})}
                  rows={2}
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
            </>
          )}

          {/* Caregiver Role Fields */}
          {role === 'caregiver' && (
            <>
              <div className="relative">
                <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="text"
                  placeholder={t('auth.full_name_ic')}
                  value={caregiverData.fullName}
                  onChange={(e) => setCaregiverData({...caregiverData, fullName: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="tel"
                  placeholder={t('auth.phone_number')}
                  value={caregiverData.phoneNumber}
                  onChange={(e) => setCaregiverData({...caregiverData, phoneNumber: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                />
              </div>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <select
                  value={caregiverData.relationship}
                  onChange={(e) => setCaregiverData({...caregiverData, relationship: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none appearance-none"
                >
                  <option value="Family">{t('auth.family')}</option>
                  <option value="Professional Caregiver">{t('auth.professional')}</option>
                </select>
              </div>
              {caregiverData.relationship === 'Professional Caregiver' && (
                <>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                    <input
                      type="text"
                      placeholder={t('auth.agency_id')}
                      value={caregiverData.agencyId}
                      onChange={(e) => setCaregiverData({...caregiverData, agencyId: e.target.value})}
                      required
                      className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                    <input
                      type="text"
                      placeholder={t('auth.license_number')}
                      value={caregiverData.licenseNumber}
                      onChange={(e) => setCaregiverData({...caregiverData, licenseNumber: e.target.value})}
                      required
                      className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none"
                    />
                  </div>
                </>
              )}
              <div className="md:col-span-2 relative">
                <PenTool className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
                <input
                  type="text"
                  placeholder={t('auth.signature')}
                  value={caregiverData.signature}
                  onChange={(e) => setCaregiverData({...caregiverData, signature: e.target.value})}
                  required
                  className="w-full bg-surface-container-highest border-2 border-transparent focus:border-primary/20 rounded-2xl py-4 pl-12 pr-4 font-medium transition-all outline-none italic"
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="text-red-500 text-sm font-bold bg-red-50 p-4 rounded-xl border border-red-100 italic">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary rounded-2xl py-4 font-headline font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-ambient flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : t('auth.register_btn')}
          {!loading && <ArrowRight size={20} />}
        </button>

        <button
          type="button"
          onClick={onSwitchToLogin}
          className="w-full text-on-surface-variant font-headline font-black text-xs uppercase tracking-widest hover:text-primary transition-colors"
        >
          {t('auth.have_account')}
        </button>
      </form>
    </motion.div>
  );
};

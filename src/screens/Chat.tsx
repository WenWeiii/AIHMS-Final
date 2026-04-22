import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, Bot, User, AlertCircle } from 'lucide-react';
import { getAIHMsResponseStream } from '@/src/services/geminiService';
import { speak, listen } from '@/src/services/voiceService';
import { ChatMessage, TriageZone, ActionTrigger, AIHMsAnalysis, HealthData } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

export const Chat: React.FC = () => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const formatTime = (date: Date = new Date()) => {
    return date.toLocaleTimeString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  useEffect(() => {
    if (profile?.role === 'caregiver' && profile.assignedPatientId) {
      setViewingPatientId(profile.assignedPatientId);
    } else {
      setViewingPatientId(user?.uid || null);
    }
  }, [profile, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  useEffect(() => {
    if (!viewingPatientId) return;

    const path = `users/${viewingPatientId}/chatHistory`;
    const q = query(collection(db, path), orderBy('createdAt', 'asc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [viewingPatientId]);

  const handleSend = async (text: string) => {
    if (!text.trim() || !viewingPatientId) return;

    const chatPath = `users/${viewingPatientId}/chatHistory`;
    const timestamp = formatTime();

    // Optimistic user message (local only until DB syncs back)
    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      text,
      timestamp
    };
    
    setMessages(prev => [...prev, optimisticUserMsg]);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      // Start Firestore write in background
      addDoc(collection(db, chatPath), {
        role: 'user',
        text,
        timestamp,
        createdAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, chatPath));

      // Get AI response with streaming
      const result = await getAIHMsResponseStream(messages, text, (chunk) => {
        setStreamingText(prev => prev + chunk);
      });
      
      const modelMsg = {
        role: 'model' as const,
        text: result.reply,
        timestamp: formatTime(),
        analysis: result.analysis as AIHMsAnalysis,
        createdAt: serverTimestamp()
      };

      // Save model response to Firestore
      await addDoc(collection(db, chatPath), modelMsg).catch(e => handleFirestoreError(e, OperationType.WRITE, chatPath));
      
      const langCode = language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY';
      if (!!profile?.narrationEnabled) {
        speak(result.reply, langCode);
      }

      // If AI extracted vitals or assigned a triage zone (only if vitals present to avoid empty logs), save as a health log
      if (result.analysis.extractedVitals.length > 0 || (result.analysis.triageZone !== 'None' && result.analysis.triageZone !== 'Green')) {
        const healthPath = `users/${viewingPatientId}/healthLogs`;
        
        // Map FHIR vitals back to flat fields for easier dashboard consumption
        const flatVitals: Partial<HealthData> = {};
        result.analysis.extractedVitals.forEach(v => {
          const code = v.code.coding[0].code;
          if (code === '8867-4') flatVitals.heartRate = v.valueQuantity?.value;
          if (code === '29463-7') flatVitals.weight = v.valueQuantity?.value;
          if (code === '74330-2') flatVitals.steps = v.valueQuantity?.value;
          if (code === '85354-9' && v.component) {
            const sys = v.component.find(c => c.code.coding[0].code === '8480-6')?.valueQuantity.value;
            const dia = v.component.find(c => c.code.coding[0].code === '8462-4')?.valueQuantity.value;
            if (sys && dia) flatVitals.bloodPressure = `${sys}/${dia}`;
          }
        });

        if (Object.keys(flatVitals).length > 0 || result.analysis.triageZone === 'Red' || result.analysis.triageZone === 'Yellow') {
          addDoc(collection(db, healthPath), {
            ...flatVitals,
            userId: viewingPatientId,
            timestamp: new Date().toISOString(),
            triageZone: result.analysis.triageZone,
            analysis: result.analysis,
            notes: t('chat.ai_extracted_notes').replace('{text}', text),
            createdAt: serverTimestamp()
          }).catch(e => handleFirestoreError(e, OperationType.WRITE, healthPath));
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      // Fallback message if something fails
      setStreamingText("I am sorry, I encountered an error. Please try again.");
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const handleVoiceInput = async () => {
    try {
      // Explicitly request permission to resolve "not-allowed" issues in some browsers
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setIsListening(true);
      listen(
        (text) => {
          if (text) {
            setInput(text);
            handleSend(text);
          }
          setIsListening(false);
        },
        (error) => {
          console.error("Voice input error:", error);
          setIsListening(false);
          if (error === 'not-allowed') {
            const errorMsg: ChatMessage = {
              id: Date.now().toString(),
              role: 'model',
              text: t('chat.mic_error'),
              timestamp: new Date().toLocaleTimeString()
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        }
      );
    } catch (err) {
      console.error("Microphone permission denied:", err);
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: t('chat.mic_denied'),
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-surface">
      {/* Editorial Chat Header */}
      <header className="px-8 pt-12 pb-8 space-y-4">
        <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">{t('chat.header_tagline')}</span>
        <h2 className="text-5xl font-headline font-black text-primary tracking-tighter">{t('chat.header_title')}</h2>
        <p className="text-on-surface-variant text-lg leading-relaxed">{t('chat.header_desc')}</p>
      </header>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 space-y-10 pb-40 no-scrollbar"
      >
        {messages.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <div className="bg-surface-container-low w-24 h-24 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-ambient">
              <Bot size={48} className="text-primary" />
            </div>
            <p className="text-on-surface-variant max-w-xs mx-auto text-lg font-headline font-bold">
              {t('chat.welcome')}
            </p>
          </div>
        )}
        
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-6 max-w-[90%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
              msg.role === 'user' ? "bg-primary text-on-primary" : "bg-surface-container-highest text-primary"
            )}>
              {msg.role === 'user' ? <User size={24} /> : <Bot size={24} />}
            </div>
            
            <div className="space-y-3">
              <div className={cn(
                "p-8 rounded-[2rem] text-lg leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-primary text-on-primary rounded-tr-none" 
                  : "bg-surface-container-low text-on-surface rounded-tl-none"
              )}>
                <Markdown>{msg.text}</Markdown>
              </div>
              
              {msg.analysis && msg.analysis.triageZone !== 'None' && (
                <div className="bg-tertiary-container p-6 rounded-2xl flex items-start gap-4 shadow-ambient">
                  <div className="bg-on-tertiary-container/10 p-2 rounded-xl">
                    <AlertCircle size={20} className="text-on-tertiary-container" />
                  </div>
                  <div>
                    <p className="text-xs font-headline font-black uppercase tracking-widest text-on-tertiary-container mb-1">{t('chat.ai_triage_result')}</p>
                    <p className="text-sm font-bold text-on-tertiary-container">
                      {t('chat.status')}: {t(`dashboard.zone_${(msg.analysis.triageZone || 'None').toLowerCase()}`)} {t('chat.zone')}. {t(`chat.action_${(msg.analysis.actionTrigger || 'None').toLowerCase()}`)}
                    </p>
                  </div>
                </div>
              )}
              
              <span className="text-[10px] font-headline font-black uppercase tracking-widest text-outline px-2">
                {msg.timestamp}
              </span>
            </div>
          </motion.div>
        ))}
        {((loading && !streamingText) || streamingText) && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-6 mr-auto max-w-[90%]"
          >
            <div className="w-12 h-12 rounded-2xl bg-surface-container-highest flex items-center justify-center shrink-0 shadow-sm text-primary">
              <Bot size={24} className={cn(loading && !streamingText && "animate-pulse")} />
            </div>
            
            <div className="space-y-3">
              <div className="p-8 rounded-[2rem] rounded-tl-none bg-surface-container-low text-on-surface text-lg leading-relaxed shadow-sm">
                {streamingText || (
                  <div className="flex gap-2 py-2">
                    <div className="w-2 h-2 bg-primary/20 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary/20 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-primary/20 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area - Integrated Glass */}
      <div className="fixed bottom-32 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl">
        <div className="glass-nav rounded-[2.5rem] p-4 shadow-ambient flex items-center gap-4">
          <button 
            onClick={handleVoiceInput}
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
              isListening ? "bg-tertiary text-on-tertiary animate-pulse" : "bg-surface-container-highest text-primary hover:bg-surface-container-high"
            )}
          >
            <Mic size={24} />
          </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-headline font-bold text-on-surface placeholder:text-outline/40 px-2"
            />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
            className="w-14 h-14 bg-primary text-on-primary rounded-2xl flex items-center justify-center shadow-ambient hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, X, User, Phone, Video, MoreHorizontal, ArrowLeft, Loader2 } from 'lucide-react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { DirectMessage, UserProfile } from '../types';
import { useFirebase } from './FirebaseProvider';
import { cn, formatTime, safeParseDate } from '../lib/utils';
import { useTranslation } from './LanguageProvider';
import { useSocket } from './SocketProvider';
import { useCall } from './communication/CallManager';

interface ChatInterfaceProps {
  recipient: UserProfile;
  onClose: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ recipient, onClose }) => {
  const { user, profile } = useFirebase();
  const { t } = useTranslation();
  const { socket } = useSocket();
  const { initiateCall } = useCall();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = [user?.uid, recipient.uid].sort().join('_');

  useEffect(() => {
    if (!user || !socket) return;

    socket.emit('join-room', conversationId);

    const onTyping = ({ userId, isTyping }: { userId: string, isTyping: boolean }) => {
      if (userId === recipient.uid) {
        setRecipientTyping(isTyping);
      }
    };

    socket.on('user-typing', onTyping);

    // Initial Conversation Metadata (Ensure it exists)
    const initConvo = async () => {
      await setDoc(doc(db, 'conversations', conversationId), {
        participants: [user.uid, recipient.uid],
        lastActivity: serverTimestamp()
      }, { merge: true });
    };
    initConvo();

    // Listen for Messages
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DirectMessage[];
      setMessages(data);
      setLoading(false);
    });

    return () => {
      socket.off('user-typing', onTyping);
      unsubscribe();
    };
  }, [user, socket, recipient.uid, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !user) return;

    const messageData = {
      senderId: user.uid,
      text: inputText,
      timestamp: new Date().toISOString(),
      type: 'text'
    };

    setInputText('');
    handleTyping(false);

    try {
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        ...messageData,
        timestamp: serverTimestamp()
      });
      
      socket?.emit('send-message', {
        ...messageData,
        roomId: conversationId
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleTyping = (typing: boolean) => {
    if (isTyping !== typing) {
      setIsTyping(typing);
      socket?.emit('typing', {
        roomId: conversationId,
        userId: user?.uid,
        isTyping: typing
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-on-surface/20 backdrop-blur-xl"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-2xl h-full sm:h-[80vh] sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative z-10"
      >
        {/* Header */}
        <header className="px-6 py-4 bg-surface border-b border-outline/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 -ml-2 sm:hidden text-outline">
              <ArrowLeft size={24} />
            </button>
            <div className="relative">
              <img 
                src={recipient.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recipient.uid}`}
                className="w-12 h-12 rounded-2xl object-cover bg-surface-container-highest"
                alt=""
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-surface rounded-full" />
            </div>
            <div>
              <h3 className="font-headline font-black text-on-surface line-clamp-1">{recipient.displayName}</h3>
              <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest leading-none">
                {recipientTyping ? 'Typing...' : (recipient.role === 'caregiver' ? 'Healthcare Provider' : 'Patient')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => initiateCall(recipient, 'voice')}
              className="p-3 bg-surface-container-highest rounded-xl text-primary hover:bg-primary/10 transition-all"
            >
              <Phone size={20} />
            </button>
            <button 
              onClick={() => initiateCall(recipient, 'video')}
              className="p-3 bg-surface-container-highest rounded-xl text-secondary hover:bg-secondary/10 transition-all"
            >
              <Video size={20} />
            </button>
            <button className="p-3 bg-surface-container-highest rounded-xl text-outline ml-2 sm:hidden" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-surface-container-lowest/30"
        >
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Send size={40} />
              </div>
              <p className="font-headline font-bold text-outline text-sm uppercase tracking-widest">
                Start a secure conversation with {recipient.displayName.split(' ')[0]}
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const currentMsgTime = safeParseDate(msg.timestamp)?.getTime() || 0;
              const prevMsgTime = idx > 0 ? safeParseDate(messages[idx-1].timestamp)?.getTime() || 0 : 0;
              const showTime = idx === 0 || currentMsgTime - prevMsgTime > 300000;
              
              return (
                <div key={msg.id} className="space-y-1">
                  {showTime && (
                    <div className="text-center py-4">
                      <span className="text-[8px] font-headline font-black text-outline uppercase tracking-widest">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className={cn(
                    "flex group",
                    isMe ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "max-w-[80%] px-5 py-3 rounded-2xl relative",
                      isMe 
                        ? "bg-primary text-on-primary rounded-tr-none text-right" 
                        : "bg-surface-container-high text-on-surface rounded-tl-none text-left shadow-sm"
                    )}>
                      <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {recipientTyping && (
            <div className="flex justify-start">
              <div className="bg-surface-container-high px-4 py-2 rounded-2xl flex gap-1">
                <div className="w-1 h-1 bg-outline rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1 h-1 bg-outline rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1 h-1 bg-outline rounded-full animate-bounce" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-6 bg-surface border-t border-outline/10 shrink-0">
          <div className="flex items-center gap-4 bg-surface-container-highest px-6 h-16 rounded-[1.5rem] border border-outline/5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                handleTyping(e.target.value.length > 0);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Send a secure message..."
              className="flex-1 bg-transparent border-none outline-none font-headline font-bold text-sm"
            />
            <button 
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-90 disabled:opacity-30 disabled:scale-100"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="mt-4 text-[8px] text-center text-outline font-headline font-black uppercase tracking-widest opacity-60">
            End-to-end encrypted for your protection.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

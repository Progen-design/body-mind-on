import React, { useState, useRef, useEffect } from 'react';
import { X, Brain, Sparkles, Send, Bot, User, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { WeightRecord, WorkoutDay, MealItem, AppleWatchBiometrics, UserProfile } from '../types';

interface CoachChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWeightRecord?: WeightRecord | null;
  latestWeight?: WeightRecord | null;
  todayWorkout?: WorkoutDay;
  meals?: MealItem[];
  biometrics?: AppleWatchBiometrics;
  profile?: UserProfile;
}

interface ChatMessage {
  id: string;
  sender: 'ted' | 'user';
  text: string;
  timestamp: string;
}

export const CoachChatModal: React.FC<CoachChatModalProps> = ({
  isOpen,
  onClose,
  currentWeightRecord,
  latestWeight,
  todayWorkout,
  meals = [],
  biometrics,
  profile
}) => {
  const activeRecord = currentWeightRecord || latestWeight || {
    date: 'Dnes',
    weight: 104.6,
    fatPercent: 11.6,
    muscleKg: 88.9,
    boneKg: 4.1,
    waterPercent: 62.4,
    visceralFat: 3,
    metabolicAge: 27,
    bmi: 31.6
  };

  const activeWorkoutTitle = todayWorkout?.title || 'Ramena & Triceps';
  const userName = profile?.name?.split(' ')[0] || 'Jane';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'ted',
      text: `Ahoj ${userName}! Vidím, že tvá aktuální váha je ${activeRecord.weight.toString().replace('.', ',')} kg s výborným podílem tuku ${activeRecord.fatPercent.toString().replace('.', ',')} % a svalovou hmotou ${activeRecord.muscleKg.toString().replace('.', ',')} kg. Dnes tě čeká trénink ${activeWorkoutTitle}. S čím ti mohu pomoci?`,
      timestamp: '08:45'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const quickPrompts = [
    'Jak optimalizovat dnešní trénink ramen?',
    'Mám navýšit sacharidy před tréninkem?',
    'Proč je pokles tuku -0,3 % ideální?',
    'Doporuč regenerační protokol po tréninku'
  ];

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // AI Coach response generation
    setTimeout(() => {
      let reply = '';
      const lower = text.toLowerCase();

      if (lower.includes('ramen') || lower.includes('trénink') || lower.includes('triceps')) {
        reply = `Pro dnešní trénink ${activeWorkoutTitle} se soustřeď na striktní dráhu pohybu u Military Pressu (${todayWorkout?.exercises[0]?.weightKg || 82.5} kg). Neprohýbej se v bedrech. U upažování vol raději vyšší počet opakování (12-15) s dokonalou kontrakcí bočního deltu.`;
      } else if (lower.includes('sacharid') || lower.includes('jídlo') || lower.includes('makra')) {
        const calSum = meals.reduce((a, m) => a + (m.completed ? m.calories : 0), 0);
        reply = `Dnes máš zaznamenáno ${calSum} kcal. Sacharidy tvoří hlavní zdroj energie pro dnešní silový výkon. Před tréninkem ti banánový rýžový puding dodá rychlý glykogen bez zatížení žaludku.`;
      } else if (lower.includes('tuk') || lower.includes('kompozic') || lower.includes('váh')) {
        reply = `Tělesný tuk ${activeRecord.fatPercent.toString().replace('.', ',')} % při ${activeRecord.weight.toString().replace('.', ',')} kg značí vynikající čistou hypertrofii. Přírůstek tvoří z 85 % čistá svalová tkáň a intracelulární voda, nikoli tukové zásoby. Pokračuj v nastaveném kalorickém mírném nadbytku.`;
      } else {
        reply = `Rozumím tvému dotazu, ${userName}. Z hlediska dlouhodobého plánu Body & Mind ON doporučuji udržet konzistentní spánek (min. 7,5 hodiny) a hydrataci na 3,5 litru denně. Po dnešním tréninku nezapomeň na 35g bílkovin a večerní lehký strečink deltoidů.`;
      }

      const tedMsg: ChatMessage = {
        id: `t-${Date.now()}`,
        sender: 'ted',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, tedMsg]);
      setIsTyping(false);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-2xl h-[620px] max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-[#00f2fe] shadow-[0_0_15px_rgba(0,242,254,0.3)]">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  AI Trenér Ted
                </h3>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Osobní neuro-fitness asistent a trenér Jana Nováka
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Log */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-[#090c12]/70">
          {messages.map((msg) => {
            const isTed = msg.sender === 'ted';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isTed ? 'justify-start' : 'justify-end'}`}
              >
                {isTed && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe] shrink-0 mt-0.5">
                    <Brain className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    isTed
                      ? 'bg-slate-900/90 text-slate-200 border border-slate-800 shadow-md'
                      : 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-medium shadow-[0_0_12px_rgba(0,242,254,0.25)]'
                  }`}
                >
                  <p>{msg.text}</p>
                  <div className={`text-[10px] mt-1.5 text-right ${isTed ? 'text-slate-500' : 'text-cyan-950/70'}`}>
                    {msg.timestamp}
                  </div>
                </div>

                {!isTed && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-cyan-400 pl-9">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>AI Trenér píše odpověď...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 overflow-x-auto flex gap-1.5 scrollbar-none">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-[11px] text-slate-300 hover:text-cyan-300 whitespace-nowrap transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div className="p-3.5 sm:p-4 bg-slate-900/60 border-t border-slate-800 flex items-center gap-2">
          <input
            type="text"
            placeholder="Zeptejte se trenéra Teda na cokoliv ohledně tréninku nebo stravy..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-[#00f2fe] focus:outline-none rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim()}
            className="p-2.5 rounded-2xl bg-gradient-to-r from-[#00f2fe] to-[#39ff14] text-slate-950 hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shadow-[0_0_12px_rgba(0,242,254,0.3)]"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

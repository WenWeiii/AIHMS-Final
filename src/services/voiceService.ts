export const speak = (text: string, lang: string = 'en-MY') => {
  if (!('speechSynthesis' in window)) {
    console.error("Speech synthesis not supported");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Helper to find and set voice
  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      (v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Natural')) &&
      v.lang.startsWith(lang.split('-')[0])
    ) || voices.find(v => v.lang.startsWith(lang.split('-')[0])) || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
  };

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = setVoice;
  } else {
    setVoice();
  }

  utterance.lang = lang;
  utterance.rate = 0.95; // Slightly slower for clarity and warmth
  utterance.pitch = 1.05; // Slightly higher for a gentler, more approachable tone
  
  window.speechSynthesis.speak(utterance);
};

export const listen = (onResult: (text: string) => void, onError: (error: string) => void) => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    onError("Speech recognition not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ms-MY'; // Set to Malay for Malaysian users
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false; // Stop automatically after one phrase

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onerror = (event: any) => {
    onError(event.error);
  };

  recognition.start();
};

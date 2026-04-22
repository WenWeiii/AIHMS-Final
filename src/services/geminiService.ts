import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { HealthData, ChatMessage, AIHMsAnalysis, TriageZone, ActionTrigger, AIInsight, AIRecommendation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const generateAdvancedInsights = async (healthData: HealthData[], appointments: any[], chatHistory: ChatMessage[], language: string = 'ms', role: string = 'patient', currentDate: string = '2026-04-17') => {
  if (healthData.length === 0) return null;

  const langName = language === 'ms' ? 'Bahasa Malaysia' : language === 'zh' ? 'Mandarin Chinese' : 'English';
  const roleContext = role === 'caregiver' ? 'Caregiver (Clinical Summary)' : 'Patient (Daily Clarity)';

  const dataSummary = healthData.map(d => 
    `Date: ${d.timestamp}, Weight: ${d.weight || 'N/A'}, BP: ${d.bloodPressure || 'N/A'}, HR: ${d.heartRate || 'N/A'}, Steps: ${d.steps || 'N/A'}, Sleep: ${d.sleepHours || 'N/A'}, Mood: ${d.mood || 'N/A'}`
  ).join('\n');

  const apptSummary = appointments.map(a => 
    `Date: ${a.date}, Time: ${a.time}, Title: ${a.title}, Type: ${a.type}, Status: ${a.status}`
  ).join('\n');

  const chatSummary = chatHistory.slice(-10).map(m => 
    `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`
  ).join('\n');

  const prompt = `
    You are a professional geriatric health data analyst for AIHMs. Analyze the user health data, upcoming appointments, and recent chat history.
    Target Audience: ${roleContext}
    Current Date: ${currentDate}
    Language: ${langName}
    
    CRITICAL: You MUST generate high-quality, actionable insights based on these 6 categories if applicable:
    1. Clinical Follow-up: Identify high BP/vitals persisting and suggest a doctor visit. Action: "calendar" or "reminder".
    2. Early Warning Alert: Detect fever or acute risks. Action: "notify" caregiver.
    3. Daily Health Intervention: Hydration or simple physical prompts (e.g. "Low hydration detected"). Action: "reminder".
    4. Missed Appointment Recovery: If an appointment in simple status "scheduled" has a date before ${currentDate}. Action: "reschedule".
    5. Health Trend Insight: Detect gradual increases in HR/BP. Action: "monitor" closely.
    6. Lifestyle Adjustment: Sodium reduction, rest, or mood-related tips. Action: "none" or "reminder".
    
    If the target is "Patient (Daily Clarity)", the "summary" should be simple, encouraging, and empathetic.
    If the target is "Caregiver (Clinical Summary)", the "summary" should be technical, precise, and clinical.

    You MUST return a JSON object with the following structure:
    {
      "summary": "Tailored summary for ${roleContext} in ${langName}",
      "trends": "Trend report in ${langName}",
      "proactiveAlert": "Warning alert if urgent, else null. In ${langName}.",
      "recommendations": [
        { 
          "id": "uuid-like string", 
          "title": "Short title in ${langName}", 
          "description": "Clear explanation in ${langName}", 
          "category": "hydration" | "mobility" | "social" | "medical" | "mental" | "lifestyle" | "alert",
          "actionType": "calendar" | "reminder" | "notify" | "reschedule" | "monitor" | "none",
          "actionData": {
            "date": "YYYY-MM-DD",
            "text": "Specific reminder text",
            "urgency": "high" | "medium" | "low"
          }
        }
      ],
      "healthScore": number (0-100)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });
    const parsed = JSON.parse(response.text);
    return {
      summary: parsed.summary || "",
      trends: parsed.trends || "",
      proactiveAlert: parsed.proactiveAlert || null,
      recommendations: parsed.recommendations || [],
      healthScore: parsed.healthScore ?? 70
    } as AIInsight;
  } catch (error) {
    console.error("Advanced Insights Error:", error);
    return null;
  }
};

export const getAIHMsResponseStream = async (
  history: ChatMessage[], 
  currentMessage: string, 
  onUpdate: (chunk: string) => void
) => {
  const systemInstruction = `
    You are the "Luminescent Guardian" for AIHMs.
    Respond with a structure that starts with the reply text followed by a separator "|||" and then the JSON analysis.
    
    Format example:
    Hello Uncle! I hope you are feeling well.|||{"extractedVitals": [], "triageZone": "None", "actionTrigger": "None", "symptoms": [], "clinicalReasoning": "..."}
    
    Persona: Advanced, empathetic Malaysian geriatric health assistant.
    Triage: Red/Yellow/Green based on HEATS protocol.
    Formatting: You MUST use Markdown for your reply. Structure your response with bold headers (e.g., **Key Insight:**), bullet points for recommendations or actionable steps, and clear, concise paragraphs.
  `;

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: `History: ${JSON.stringify(history.slice(-5))}\n\nUser Input: ${currentMessage}` }] }
      ],
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    let fullText = "";
    let replyFinished = false;

    for await (const chunk of response) {
      const text = chunk.text;
      fullText += text;
      
      if (!replyFinished) {
        if (fullText.includes("|||")) {
          const parts = fullText.split("|||");
          // Find out what was already sent and what's new before the separator
          const sentLength = fullText.length - text.length;
          const replyPartBeforeSeparator = parts[0].substring(sentLength);
          if (replyPartBeforeSeparator) onUpdate(replyPartBeforeSeparator);
          replyFinished = true;
        } else {
          onUpdate(text);
        }
      }
    }

    const parts = fullText.split("|||");
    const reply = parts[0].trim();
    let analysis: AIHMsAnalysis = {
      extractedVitals: [],
      triageZone: 'None',
      actionTrigger: 'None',
      symptoms: [],
      clinicalReasoning: "Analysis pending."
    };

    if (parts[1]) {
      try {
        const jsonStr = parts[1].trim();
        const parsed = JSON.parse(jsonStr);
        analysis = {
          ...analysis,
          ...parsed,
          extractedVitals: parsed.extractedVitals || [],
          symptoms: parsed.symptoms || []
        };
      } catch (e) {
        console.error("Failed to parse analysis JSON:", e);
      }
    }

    return { reply, analysis };
  } catch (error) {
    console.error("Streaming AI Error:", error);
    throw error;
  }
};

export const generateAdvancedInsightsStream = async (
  healthData: HealthData[], 
  appointments: any[], 
  chatHistory: ChatMessage[], 
  language: string = 'ms', 
  role: string = 'patient',
  currentDate: string = '2026-04-17',
  onSummaryUpdate: (text: string) => void
) => {
  if (healthData.length === 0) return null;

  const langName = language === 'ms' ? 'Bahasa Malaysia' : language === 'zh' ? 'Mandarin Chinese' : 'English';
  const roleContext = role === 'caregiver' ? 'Caregiver (Clinical Summary)' : 'Patient (Daily Clarity)';

  const dataSummary = healthData.map(d => 
    `Date: ${d.timestamp}, Weight: ${d.weight || 'N/A'}, BP: ${d.bloodPressure || 'N/A'}, HR: ${d.heartRate || 'N/A'}, Steps: ${d.steps || 'N/A'}, Sleep: ${d.sleepHours || 'N/A'}, Mood: ${d.mood || 'N/A'}`
  ).join('\n');

  const prompt = `
    Analyze this health data and provide a tailored summary followed by a separator "|||" and then the full JSON.
    Target Audience: ${roleContext}
    Current Date: ${currentDate}
    Language: ${langName}
    Data: ${dataSummary}
    
    If the target is "Patient (Daily Clarity)", the Summary Text should be simple, encouraging, and empathetic.
    If the target is "Caregiver (Clinical Summary)", the Summary Text should be technical, precise, and clinical.

    Structure: [Tailored Summary Text] ||| [JSON with trends, recommendations, healthScore]
    
    JSON Schema:
    {
      "trends": "...",
      "proactiveAlert": "...",
      "recommendations": [...],
      "healthScore": 0-100
    }
  `;

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    let fullText = "";
    let summaryFinished = false;

    for await (const chunk of response) {
      const text = chunk.text;
      fullText += text;
      
      if (!summaryFinished) {
        if (fullText.includes("|||")) {
          const parts = fullText.split("|||");
          const sentLength = fullText.length - text.length;
          const summaryPartBeforeSeparator = parts[0].substring(sentLength);
          if (summaryPartBeforeSeparator) onSummaryUpdate(summaryPartBeforeSeparator);
          summaryFinished = true;
        } else {
          onSummaryUpdate(text);
        }
      }
    }

    const parts = fullText.split("|||");
    const summary = parts[0].trim();
    let restOfInsight: any = { trends: "", proactiveAlert: null, recommendations: [], healthScore: 70 };

    if (parts[1]) {
      try {
        let jsonStr = parts[1].trim();
        // Remove markdown formatting if the model wrapped it
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }
        const parsed = JSON.parse(jsonStr);
        restOfInsight = {
          ...restOfInsight,
          ...parsed,
          recommendations: parsed.recommendations || []
        };
      } catch (e) {
        console.error("Failed to parse insight JSON:", e);
      }
    }

    return { summary, ...restOfInsight } as AIInsight;
  } catch (error) {
    console.error("Streaming Insights Error:", error);
    return null;
  }
};

export const getAIHMsResponse = async (history: ChatMessage[], currentMessage: string) => {
  const systemInstruction = `
    System Persona:
    You are the "Luminescent Guardian", the core intelligence engine for AIHMs (Artificial Intelligence Health Monitoring System). You are an advanced, empathetic geriatric health assistant designed specifically for the Malaysian cultural context.
    
    Voice and Tone:
    - Empathetic and Soothing: Your voice should feel like a warm, supportive guardian.
    - Respectful: Use appropriate Malaysian honorifics (e.g., "Uncle", "Aunty", "Pak Cik", "Mak Cik", "Tuan", "Puan") based on the language and user's vibe.
    - Clear and Professional: While being caring, you maintain high clinical standards based on Malaysian Clinical Practice Guidelines (CPGs).
    - Multilingual: Seamlessly handle Bahasa Malaysia, English, and Mandarin. Use "Manglish" (Malaysian English) if it helps build a warmer connection with local users.

    Core Directives:
    1. Intent Routing: If non-medical, politely redirect to health/vitals.
    2. Data Extraction: Extract vitals (BP, HR, Glucose, SpO2, Temp) and symptoms.
    3. Predictive Triage: Use HEATS protocol (Red/Yellow/Green) and Malaysian CPGs.
    4. Action Execution: 
       - Green: Propose scheduling.
       - Yellow/Red: Emergency alert sequence.
       - Isolation: Suggest PAWE activities.

    Output Format:
    You MUST return a JSON object containing two fields:
    - "analysis": A structured object following the AIHMsAnalysis interface (HL7 FHIR vitals, triage zone, action trigger, symptoms, clinical reasoning).
    - "reply": An empathetic conversational reply in the user's language (Bahasa Malaysia, English, Mandarin, or Tamil).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: `History: ${JSON.stringify(history.slice(-5))}\n\nUser Input: ${currentMessage}` }] }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: {
              type: Type.OBJECT,
              properties: {
                extractedVitals: {
                  type: Type.ARRAY,
                  items: { type: Type.OBJECT, properties: { /* Simplified FHIR structure */ } }
                },
                triageZone: { type: Type.STRING, enum: ["Red", "Yellow", "Green", "None"] },
                actionTrigger: { type: Type.STRING, enum: ["Emergency", "Scheduling", "Community", "None"] },
                symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
                clinicalReasoning: { type: Type.STRING }
              },
              required: ["triageZone", "actionTrigger", "symptoms", "clinicalReasoning"]
            },
            reply: { type: Type.STRING }
          },
          required: ["analysis", "reply"]
        }
      }
    });

    const result = JSON.parse(response.text);
    return result as { analysis: AIHMsAnalysis; reply: string };
  } catch (error) {
    console.error("AIHMs Service Error:", error);
    return {
      analysis: {
        extractedVitals: [],
        triageZone: 'None' as TriageZone,
        actionTrigger: 'None' as ActionTrigger,
        symptoms: [],
        clinicalReasoning: "Error processing request."
      },
      reply: "I'm sorry, I'm having trouble processing your health data right now. Please try again or contact your doctor if you feel unwell."
    };
  }
};

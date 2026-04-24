<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

#AIHMS - Artificial Intelligence Home Monitoring System
AIHMS is an AI-powered healthcare monitoring system designed to support Malaysia’s transition into an aged society.  
It can analyze vital signs, detects potential health risks, and automatically triggers actions such as alerts and notifications.

#Tech Stack
- **Gemini 2.0 (via Google AI Studio)** 
  → Used as the core AI engine for analyzing vital signs and generating health insights.  

- **Google AI Studio**  
  → Used to design, prototype, and test the application logic and prompts. 

- **Antigravity (AI Studio Runtime Environment)**  
  → Used for running, testing, and debugging the application during development.  

- **Firebase Genkit**  
  → Supports backend logic and enables structured AI workflows.  

- **Google Cloud Run**  
  → Used to deploy the application as a scalable, serverless web service.

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d0b95daf-7ccc-4405-8259-5407d150a819

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

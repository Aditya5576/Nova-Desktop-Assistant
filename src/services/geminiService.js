/**
 * Google Gemini AI Integration Service for MyAssist (with Structured Intent Parsing)
 */

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey || '';
    this.model = 'gemini-2.0-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
  }

  hasValidKey() {
    return this.apiKey && this.apiKey.length > 10;
  }

  async generateContent(prompt, systemInstruction = '') {
    if (!this.hasValidKey()) {
      return { success: false, error: 'No Google Gemini API key configured. Please add your free key in Settings!' };
    }

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
        return { success: false, error: `Gemini API Error: ${msg}` };
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: true, text: text.trim() };
    } catch (err) {
      return { success: false, error: `Network error connecting to Gemini: ${err.message}` };
    }
  }

  async assistantResponse(userInput, currentTasks = []) {
    const todayStr = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are Nova, an encouraging AI personal task assistant built into desktop app MyAssist.
Today's date is: ${todayStr}.

Your task is to respond conversationally to the user AND extract structured task actions if the user wants to add, schedule, or complete a task.

CRITICAL INSTRUCTION:
If the user wants to add or schedule a task, or log a completed task, append a JSON block at the VERY END of your response in this EXACT format:

\`\`\`json
{
  "action": "ADD_TASK",
  "task": {
    "title": "Task title here",
    "type": "scheduled",
    "category": "Work",
    "priority": "medium",
    "dueDate": "YYYY-MM-DD",
    "dueTime": "HH:MM",
    "recurring": "none"
  }
}
\`\`\`

Note for task fields:
- "type": "scheduled" or "completed"
- "priority": "high", "medium", or "low"
- "category": "Work", "Personal", "Health", or "General"
- "dueDate": ISO YYYY-MM-DD (e.g. tomorrow is calculate based on today ${todayStr})
- "dueTime": HH:MM in 24hr format or null if unspecified

Keep your conversational response before the JSON block under 100 words.`;

    const prompt = `User Input: "${userInput}"`;

    const result = await this.generateContent(prompt, systemPrompt);
    if (!result.success) return result;

    // Parse JSON block out of text if present
    let extractedTask = null;
    let cleanText = result.text;

    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsedData = JSON.parse(jsonMatch[1]);
        if (parsedData.action === 'ADD_TASK' && parsedData.task) {
          extractedTask = parsedData.task;
        }
        // Remove json block from displayed text
        cleanText = result.text.replace(/```json[\s\S]*?```/, '').trim();
      } catch (e) {
        console.error('Failed to parse AI task JSON:', e);
      }
    }

    return {
      success: true,
      text: cleanText,
      extractedTask
    };
  }

  async generateDailySummary(tasks = []) {
    const todayStr = new Date().toISOString().split('T')[0];
    const completedToday = tasks.filter(t => (t.status === 'done' || t.type === 'completed') && (t.completedAt && t.completedAt.startsWith(todayStr)));
    const pendingToday = tasks.filter(t => t.status === 'pending');

    const prompt = `Analyze today's task statistics and write a short, motivational 3-bullet daily summary:
- Completed Today: ${completedToday.length} tasks (${completedToday.map(t => t.title).join(', ') || 'None'})
- Pending Focus: ${pendingToday.length} tasks (${pendingToday.map(t => t.title).join(', ') || 'None'})`;

    const systemPrompt = `You are Nova AI. Write a punchy, 3-bullet daily progress summary with emoji. Keep it under 100 words.`;

    return await this.generateContent(prompt, systemPrompt);
  }
}

module.exports = GeminiService;

/**
 * Natural Language Processing helper for MyAssist
 * Fixes "secs", "mins", "hrs" plural word variations
 */

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeStringSec(d = new Date()) {
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${mins}:${secs}`;
}

function parseTaskInput(inputStr) {
  if (!inputStr || !inputStr.trim()) return null;

  const rawInput = inputStr.trim();
  let text = rawInput;
  let lower = text.toLowerCase();

  // 0. Detect Conversational Questions vs Tasks
  const isQuestionOrChat = lower.startsWith('how ') || lower.startsWith('what ') || 
                           lower.startsWith('why ') || lower.startsWith('who ') || 
                           lower.startsWith('where ') || lower.startsWith('can you') || 
                           lower.startsWith('tell me') || lower.startsWith('hi') || 
                           lower.startsWith('hello') || lower.endsWith('?');

  const hasExplicitTaskKeyword = lower.includes('remind') || lower.includes('schedule') || 
                                 lower.includes('todo') || lower.includes('done') || 
                                 lower.includes('completed') || lower.includes('task') ||
                                 lower.includes('in ') || lower.includes('at ') ||
                                 lower.includes('tomorrow') || lower.includes('today');

  if (isQuestionOrChat && !hasExplicitTaskKeyword) {
    return null; // Route to Gemini AI Conversational Assistant
  }

  let type = 'scheduled';
  let title = text;
  let category = 'General';
  let priority = 'medium';
  let recurring = 'none';
  let dueDate = null;
  let dueTime = null;
  let reminder = true;

  const now = new Date();
  let targetDate = new Date(now.getTime());

  // 1. Detect Category (#Work, #Personal, #Health)
  const categoryMatch = text.match(/#(\w+)/i);
  if (categoryMatch) {
    category = categoryMatch[1].charAt(0).toUpperCase() + categoryMatch[1].slice(1).toLowerCase();
    title = title.replace(/#\w+/gi, '').trim();
  }

  // 2. Detect Priority
  if (lower.match(/\b(urgent|high priority|important|asap|p1|🔴)\b/i)) {
    priority = 'high';
    title = title.replace(/\b(urgent|high priority|important|asap|p1|🔴)\b/gi, '').trim();
  } else if (lower.match(/\b(low priority|p3|🔵)\b/i)) {
    priority = 'low';
    title = title.replace(/\b(low priority|p3|🔵)\b/gi, '').trim();
  } else if (lower.match(/\b(medium priority|p2|🟡)\b/i)) {
    priority = 'medium';
    title = title.replace(/\b(medium priority|p2|🟡)\b/gi, '').trim();
  }

  // 3. Detect Recurring Patterns
  if (lower.match(/\b(every day|daily|each day)\b/i)) {
    recurring = 'daily';
    title = title.replace(/\b(every day|daily|each day)\b/gi, '').trim();
  } else if (lower.match(/\b(every week|weekly|each week)\b/i)) {
    recurring = 'weekly';
    title = title.replace(/\b(every week|weekly|each week)\b/gi, '').trim();
  } else if (lower.match(/\b(every month|monthly|each month)\b/i)) {
    recurring = 'monthly';
    title = title.replace(/\b(every month|monthly|each month)\b/gi, '').trim();
  }

  // 4. Detect Completion Keywords
  const completionPrefixes = [
    'done:', 'done ', 'completed:', 'completed ', 'finished:', 'finished ', 
    'did ', 'i did ', 'i completed ', 'i finished ', 'logged:'
  ];
  
  const isCompletedKeyword = completionPrefixes.some(prefix => lower.startsWith(prefix)) ||
    lower.includes(' completed') || lower.includes(' finished today') || lower.includes(' done today');

  if (isCompletedKeyword) {
    type = 'completed';
    for (const prefix of completionPrefixes) {
      if (lower.startsWith(prefix)) {
        title = title.substring(prefix.length).trim();
        break;
      }
    }
  }

  // 5. Detect & Clean Reminder Phrases
  const reminderPhrases = [
    'remind me to ', 'remind me ', 'remember to ', 'remember ', 
    'need to ', 'have to ', 'schedule ', 'don\'t forget to '
  ];

  for (const phrase of reminderPhrases) {
    if (lower.startsWith(phrase)) {
      title = title.substring(phrase.length).trim();
      type = 'scheduled';
      reminder = true;
      break;
    }
  }

  // 6. PARSE DECIMAL & INTEGER RELATIVE TIMING: "in 10 secs", "in 1.1 mins", "in 2 sec"
  const relSecMatch = lower.match(/\bin\s+(\d+(?:\.\d+)?)\s*(secs|sec|seconds|second|s)\b/i);
  const relMinMatch = lower.match(/\bin\s+(\d+(?:\.\d+)?)\s*(mins|min|minutes|minute|m)\b/i);
  const relHourMatch = lower.match(/\bin\s+(\d+(?:\.\d+)?)\s*(hrs|hr|hours|hour|h)\b/i);

  if (relSecMatch) {
    const addSecs = parseFloat(relSecMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addSecs * 1000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/\bin\s+\d+(?:\.\d+)?\s*(secs|sec|seconds|second|s)\b/gi, '').trim();
  } else if (relMinMatch) {
    const addMins = parseFloat(relMinMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addMins * 60000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/\bin\s+\d+(?:\.\d+)?\s*(mins|min|minutes|minute|m)\b/gi, '').trim();
  } else if (relHourMatch) {
    const addHours = parseFloat(relHourMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addHours * 3600000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/\bin\s+\d+(?:\.\d+)?\s*(hrs|hr|hours|hour|h)\b/gi, '').trim();
  }

  // 7. PARSE ABSOLUTE TIME if relative not set
  if (!dueTime) {
    lower = title.toLowerCase();

    if (lower.includes('day after tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 2);
      title = title.replace(/day after tomorrow/gi, '').trim();
    } else if (lower.includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
      title = title.replace(/tomorrow/gi, '').trim();
    } else if (lower.includes('today')) {
      title = title.replace(/today/gi, '').trim();
    } else {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (let i = 0; i < days.length; i++) {
        if (lower.includes(days[i])) {
          const currentDay = now.getDay();
          let distance = i - currentDay;
          if (distance <= 0) distance += 7;
          targetDate.setDate(targetDate.getDate() + distance);
          title = title.replace(new RegExp(`(on |this |next )?${days[i]}`, 'gi'), '').trim();
          break;
        }
      }
    }

    const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && (timeMatch[3] || lower.includes('at ' + timeMatch[1]))) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      const formattedH = String(hours).padStart(2, '0');
      const formattedM = String(minutes).padStart(2, '0');
      dueTime = `${formattedH}:${formattedM}:00`;

      title = title.replace(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '').trim();
    } else if (lower.includes('morning')) {
      dueTime = '09:00:00';
      title = title.replace(/(in the |this )?morning/gi, '').trim();
    } else if (lower.includes('afternoon')) {
      dueTime = '14:00:00';
      title = title.replace(/(in the |this )?afternoon/gi, '').trim();
    } else if (lower.includes('evening') || lower.includes('tonight')) {
      dueTime = '19:00:00';
      title = title.replace(/(in the |this )?evening|tonight/gi, '').trim();
    }
  }

  dueDate = getLocalDateString(targetDate);

  // If still no due time, calculate 1 hour from now for default scheduled task
  if (!dueTime) {
    const defaultFuture = new Date(now.getTime() + 3600000);
    dueTime = getLocalTimeStringSec(defaultFuture);
  }

  // Clean trailing punctuation & reminder phrases
  title = title.replace(/\s+remind me(\s+to)?\s*$/gi, '').trim();
  title = title.replace(/^[:\-\s]+|[:\-\s]+$/g, '');

  if (!title) title = rawInput;

  // Auto category
  if (category === 'General') {
    const titleLower = title.toLowerCase();
    if (titleLower.match(/meet|call|email|project|report|presentation|client|review|bug|code|desk|sap|api/)) {
      category = 'Work';
    } else if (titleLower.match(/health|doctor|workout|gym|run|walk|water|medicine|meditation/)) {
      category = 'Health';
    } else if (titleLower.match(/buy|shop|store|grocery|pay|bill|bank|flight|clean|home/)) {
      category = 'Personal';
    }
  }

  return {
    type,
    title,
    category,
    priority,
    recurring,
    dueDate,
    dueTime,
    reminder,
    rawText: rawInput
  };
}

module.exports = { parseTaskInput, getLocalDateString, getLocalTimeStringSec };

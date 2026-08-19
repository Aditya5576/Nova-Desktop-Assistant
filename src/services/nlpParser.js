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
  const isStrictQuestion = lower.startsWith('what is') || lower.startsWith('what are') || 
                           lower.startsWith('why is') || lower.startsWith('why did') || 
                           lower.startsWith('who is') || lower.startsWith('where is') || 
                           lower.startsWith('how to') || lower.startsWith('how do') || 
                           lower.startsWith('how can') || lower.startsWith('explain') || 
                           lower.startsWith('tell me') ||
                           (lower.endsWith('?') && !/\b(remind|schedule|add|task|done|completed|finished)\b/i.test(lower));

  const hasTaskIntent = /\b(remind|schedule|todo|task|add|create|buy|call|meet|meeting|done|completed|finished|workout|pay|bill|fix|code|email|report|send|clean|doctor|medicine)\b/i.test(lower) ||
                        /\b(sec|secs|min|mins|hr|hrs|hour|hours|day|days|tomorrow|today|morning|afternoon|evening|night|pm|am)\b/i.test(lower);

  if (isStrictQuestion && !hasTaskIntent) {
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

  // 5. Detect & Clean Conversational & Reminder Filler Phrases
  const reminderPhrases = [
    'hey please add a task to ', 'hey please add task ', 'hey please remind me to ',
    'can you please add a task to ', 'can you add a task to ', 'can you please remind me to ',
    'can you remind me to ', 'can you schedule ', 'could you add a task to ', 'could you remind me to ',
    'please add a task to ', 'please add task ', 'please schedule ', 'please remind me to ',
    'hey nova add task ', 'hey add task ', 'add task to ', 'add task ', 'create task to ', 'create task ',
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

  // 6. Convert English number words to digits for Siri / Dictation compatibility
  const numberWords = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12', 'fifteen': '15', 'twenty': '20',
    'thirty': '30', 'forty': '40', 'fifty': '50'
  };

  for (const [word, num] of Object.entries(numberWords)) {
    const wordRegex = new RegExp(`\\b(in|after)?\\s*${word}\\b`, 'gi');
    lower = lower.replace(wordRegex, (m, p1) => p1 ? `${p1} ${num}` : num);
    title = title.replace(wordRegex, (m, p1) => p1 ? `${p1} ${num}` : num);
  }

  // Also clean raw spelled-out number phrases directly from title
  title = title.replace(/(?:in|after)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\s*(secs|sec|seconds|second|mins|min|minutes|minute|hrs|hr|hours|hour)\b/gi, '').trim();

  // PARSE DECIMAL & INTEGER RELATIVE TIMING: "3 sec", "in 10 secs", "in 1.1 mins", "after 2 min", "in three seconds"
  const relSecMatch = lower.match(/(?:in|after)?\s*(\d+(?:\.\d+)?)\s*(secs|sec|seconds|second)\b/i) || lower.match(/\b(\d+(?:\.\d+)?)\s*(secs|sec|seconds|second)\b/i);
  const relMinMatch = lower.match(/(?:in|after)?\s*(\d+(?:\.\d+)?)\s*(mins|min|minutes|minute)\b/i) || lower.match(/\b(\d+(?:\.\d+)?)\s*(mins|min|minutes|minute)\b/i);
  const relHourMatch = lower.match(/(?:in|after)?\s*(\d+(?:\.\d+)?)\s*(hrs|hr|hours|hour)\b/i) || lower.match(/\b(\d+(?:\.\d+)?)\s*(hrs|hr|hours|hour)\b/i);

  if (relSecMatch) {
    const addSecs = parseFloat(relSecMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addSecs * 1000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/(?:in|after)?\s*\d+(?:\.\d+)?\s*(secs|sec|seconds|second)\b/gi, '').trim();
  } else if (relMinMatch) {
    const addMins = parseFloat(relMinMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addMins * 60000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/(?:in|after)?\s*\d+(?:\.\d+)?\s*(mins|min|minutes|minute)\b/gi, '').trim();
  } else if (relHourMatch) {
    const addHours = parseFloat(relHourMatch[1]);
    targetDate = new Date(now.getTime() + Math.round(addHours * 3600000));
    dueTime = getLocalTimeStringSec(targetDate);
    title = title.replace(/(?:in|after)?\s*\d+(?:\.\d+)?\s*(hrs|hr|hours|hour)\b/gi, '').trim();
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

    const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})[:.](\d{2})\s*(am|pm)?/i) || 
                      lower.match(/(?:at\s+)(\d{1,2})\s*(am|pm)?/i);

    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] && !isNaN(parseInt(timeMatch[2], 10)) ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = (timeMatch[3] || timeMatch[2] === 'am' || timeMatch[2] === 'pm') ? (timeMatch[3] || timeMatch[2]).toLowerCase() : null;

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      // Smart 12-Hour Fallback when no AM/PM is explicitly typed
      if (!meridiem) {
        const curHours = now.getHours();
        if (hours < 12) {
          const pmHours = hours + 12;
          const candidatePmDate = new Date(targetDate.getTime());
          candidatePmDate.setHours(pmHours, minutes, 0, 0);

          const candidateAmDate = new Date(targetDate.getTime());
          candidateAmDate.setHours(hours, minutes, 0, 0);

          // If PM time (e.g. 5:30 PM = 17:30) is in the future today, default to PM!
          if (candidatePmDate >= now && curHours >= 6) {
            hours = pmHours;
          } else if (candidateAmDate < now && candidatePmDate < now && !lower.includes('today')) {
            // Both AM and PM are in the past for today -> advance target date to tomorrow!
            targetDate.setDate(targetDate.getDate() + 1);
            if (curHours >= 12) hours = pmHours;
          }
        }
      }

      targetDate.setHours(hours, minutes, 0, 0);

      // Past time roll-over: If explicit time (e.g. 10am) is earlier today than current time, roll targetDate to TOMORROW!
      if (targetDate.getTime() < now.getTime() - 60000 && !lower.includes('today')) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      const formattedH = String(hours).padStart(2, '0');
      const formattedM = String(minutes).padStart(2, '0');
      dueTime = `${formattedH}:${formattedM}:00`;

      // Clean matched time from title string
      title = title.replace(/(?:at\s+)?\d{1,2}[:.]\d{2}\s*(?:am|pm)?/gi, '')
                   .replace(/(?:at\s+)\d{1,2}\s*(?:am|pm)?/gi, '')
                   .replace(/^[\s\-:]+/, '').trim();
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
  title = title.replace(/^to\s+/i, '').trim();
  title = title.replace(/^[:\-\s]+|[:\-\s]+$/g, '');

  // If title was stripped down because user entered relative time only (e.g. "in 5 sec" / "remind me in 5 sec"),
  // use a clean, professional title "Task Reminder" instead of unparsed relative text!
  if (!title || title.toLowerCase() === 'in' || /^remind\s+me\s+in\s+\d+/i.test(title) || /^in\s+\d+/i.test(title)) {
    title = 'Task Reminder';
  }

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

// State Management for Habits and Data
import { user, remoteMonthByHabit, writeMarkToFirestore, upsertHabitMeta, deleteHabitMeta, fetchHabitsMeta } from './firebase.js';

// Constants
const STORAGE_KEY = 'habitTracker.v2';
const LEGACY_KEY = 'habitTracker.v1';

// State variables
export let habits = []; // {id, name, type, goal, color, icon}
export let habitData = {}; // {habitId: { 'YYYY-MM': { day: value } }}
export let currentHabitId = null;
export let view = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// Date formatting helper
export const fmt = (y, m) => y + '-' + String(m).padStart(2, '0');

// Local storage helpers (fallback when signed out)
function loadLegacy() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveLegacy(d) {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(d));
}

// Multi-habit storage
export function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey())) || {};
    habits = s.habits || [];
    habitData = s.habitData || {};
    currentHabitId = s.currentHabitId || null;
  } catch (e) {
    habits = [];
    habitData = {};
    currentHabitId = null;
  }
}

export function saveStore() {
  localStorage.setItem(storageKey(), JSON.stringify({
    habits,
    habitData,
    currentHabitId
  }));
}

export function getCurrentHabit() {
  return habits.find(h => h.id === currentHabitId) || habits[0];
}

// Get month data for current habit
export function getMonthData(y, m) {
  const hid = getCurrentHabit().id;
  const key = fmt(y, m + 1);
  if (user) {
    return (remoteMonthByHabit[hid] && remoteMonthByHabit[hid][key]) || {};
  }
  
  habitData[hid] = habitData[hid] || {};
  habitData[hid][key] = habitData[hid][key] || {};
  return habitData[hid][key];
}

// Set mark for a day
export function setMark(day, val, onPaint, onStats) {
  const h = getCurrentHabit();
  
  if (user) {
    // Firebase mode - per habit (optimistic UI update)
    writeMarkToFirestore(
      h.id,
      view.getFullYear(),
      view.getMonth(),
      day,
      val,
      () => {
        if (onPaint) onPaint(day);
        if (onStats) onStats();
      },
      (err) => {
        console.error('Failed to save mark:', err);
        if (onPaint) onPaint(day);
        if (onStats) onStats();
      }
    );
    // Trigger immediate paint/stats using optimistic state updated inside write
    if (onPaint) onPaint(day);
    if (onStats) onStats();
  } else {
    // Local storage mode
    const md = getMonthData(view.getFullYear(), view.getMonth());
    
    if (h.type === 'binary') {
      if (!val) {
        delete md[day];
      } else {
        md[day] = val;
      }
    } else {
      // For numeric/time, val is number (progress). If null, do not change.
      if (val == null) return;
      md[day] = Number(val) || 0;
    }
    
    saveStore();
    if (onPaint) onPaint(day);
    if (onStats) onStats();
  }
}

// Add new habit
export function addHabit(name, type, goal, color, icon) {
  const id = String(Date.now());
  const habit = {
    id,
    name: name.trim() || 'New Habit',
    type,
    goal: type === 'binary' ? 1 : (Number(goal) || 1),
    color: color || '#93c5fd',
    icon: icon.trim()
  };
  
  habits.push(habit);
  habitData[id] = {};
  currentHabitId = id;
  saveStore();
  if (user) {
    upsertHabitMeta(habit);
  }
  
  return habit;
}

// Update existing habit
export function updateHabit(habitId, updates) {
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return false;
  
  Object.assign(habit, updates);
  saveStore();
  if (user) {
    upsertHabitMeta(habit);
  }
  return true;
}

// Delete habit
export function deleteHabit(habitId) {
  if (habits.length <= 1) return false; // Don't delete last habit
  
  habits = habits.filter(h => h.id !== habitId);
  delete habitData[habitId];
  
  if (currentHabitId === habitId) {
    currentHabitId = habits.length > 0 ? habits[0].id : null;
  }
  
  saveStore();
  if (user) {
    deleteHabitMeta(habitId);
  }
  return true;
}

// Switch current habit
export function switchHabit(habitId) {
  if (habits.find(h => h.id === habitId)) {
    currentHabitId = habitId;
    saveStore();
    return true;
  }
  return false;
}

// Calculate month completion percentage
export function monthCompletionPercent(habit) {
  const y = view.getFullYear();
  const m = view.getMonth();
  const md = habitData[habit.id]?.[fmt(y, m + 1)] || {};
  const days = new Date(y, m + 1, 0).getDate();
  
  if (habit.type === 'binary') {
    let done = 0;
    for (let d = 1; d <= days; d++) {
      if (md[d] === 'done') done++;
    }
    return Math.round((done / days) * 100);
  } else {
    const goal = Number(habit.goal) || 1;
    let completed = 0;
    for (let d = 1; d <= days; d++) {
      const v = Math.max(0, Number(md[d] || 0));
      if (v >= goal) completed++;
    }
    return Math.round((completed / days) * 100);
  }
}

// Calculate statistics for current habit and month
export function calculateStats() {
  const y = view.getFullYear();
  const m = view.getMonth();
  const md = getMonthData(y, m);
  const days = new Date(y, m + 1, 0).getDate();
  const h = getCurrentHabit();
  const now = new Date();
  
  let done = 0, miss = 0, longest = 0, cur = 0, curr = 0, rate = 0;
  
  const isDone = (dayVal) => {
    if (h.type === 'binary') return dayVal === 'done';
    const goal = Number(h.goal) || 1;
    const v = Math.max(0, Number(dayVal || 0));
    return v >= goal;
  };
  
  // Month-local aggregates (done/miss/rate) remain scoped to view month
  if (h.type === 'binary') {
    for (let d = 1; d <= days; d++) {
      if (md[d] === 'done') done++;
      else if (md[d] === 'miss') miss++;
    }
    rate = Math.round((done / days) * 100);
  } else {
    const goal = Number(h.goal) || 1;
    let completed = 0;
    let total = 0;
    for (let d = 1; d <= days; d++) {
      const v = Math.max(0, Number(md[d] || 0));
      total += Math.min(goal, v);
      if (v >= goal) completed++;
    }
    done = completed;
    miss = days - completed;
    rate = Math.round((total / (goal * days)) * 100);
  }
  
  // Cross-month longest and current streak
  const hid = getCurrentHabit().id;
  const source = user ? (remoteMonthByHabit[hid] || {}) : (habitData[hid] || {});
  let monthKeys = Object.keys(source).sort(); // 'YYYY-MM' ascending
  
  // Ensure current view month is included
  const currKey = fmt(y, m + 1);
  if (!monthKeys.includes(currKey)) monthKeys.push(currKey);
  monthKeys.sort();
  
  // Expand to a continuous month range from earliest to current view month
  const parseKey = (k) => { const [yy, mm] = k.split('-').map(Number); return new Date(yy, mm - 1, 1); };
  const formatKey = (d) => fmt(d.getFullYear(), d.getMonth() + 1);
  const start = monthKeys.length ? parseKey(monthKeys[0]) : new Date(y, m, 1);
  const end = new Date(y, m, 1);
  const fullKeys = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    fullKeys.push(formatKey(d));
  }
  
  // Build forward scan for longest
  cur = 0;
  for (let i = 0; i < fullKeys.length; i++) {
    const [yy, mm] = fullKeys[i].split('-').map(Number);
    const daysIn = new Date(yy, mm, 0).getDate();
    const data = source[fullKeys[i]] || (yy === y && mm === (m + 1) ? md : {});
    for (let d = 1; d <= daysIn; d++) {
      if (isDone(data[d])) {
        cur++;
        if (cur > longest) longest = cur;
      } else {
        cur = 0;
      }
    }
  }
  
  // Backward scan for current streak anchored at end day of view
  const endDay = (y === now.getFullYear() && m === now.getMonth()) ? now.getDate() : days;
  for (let i = fullKeys.length - 1; i >= 0; i--) {
    const [yy, mm] = fullKeys[i].split('-').map(Number);
    const data = source[fullKeys[i]] || (yy === y && mm === (m + 1) ? md : {});
    const daysIn = new Date(yy, mm, 0).getDate();
    let startD = daysIn;
    if (yy === y && mm === (m + 1)) startD = endDay;
    for (let d = startD; d >= 1; d--) {
      if (isDone(data[d])) {
        curr++;
      } else {
        i = -1; // break outer
        break;
      }
    }
  }
  
  return { done, miss, longest, curr, rate };
}

// Navigate view month
export function navigateMonth(direction) {
  if (direction === 'prev') {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  } else if (direction === 'next') {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  }
}

// Set view to specific year/month (monthIndex: 0-11)
export function setView(year, monthIndex) {
  view = new Date(year, monthIndex, 1);
}

// Get current view info
export function getViewInfo() {
  return {
    year: view.getFullYear(),
    month: view.getMonth(),
    monthName: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(view),
    daysInMonth: new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(),
    firstDayOfWeek: new Date(view.getFullYear(), view.getMonth(), 1).getDay(),
    today: new Date()
  };
}

// Compute storage key scoped by user (prevents sharing habits across users)
function storageKey() {
  try {
    // user is imported from firebase.js; may be null before auth
    return user ? (STORAGE_KEY + '.' + user.uid) : STORAGE_KEY;
  } catch (e) {
    return STORAGE_KEY;
  }
}

// Load habits from Firestore when signed in
export function loadHabitsFromRemote() {
  if (!user) return Promise.resolve(habits);
  return fetchHabitsMeta().then(list => {
    if (list && list.length) {
      habits = list;
      habitData = habitData || {};
      if (!currentHabitId || !habits.find(h => h.id === currentHabitId)) {
        currentHabitId = habits[0].id;
      }
      saveStore();
    } else {
      habits.forEach(h => upsertHabitMeta(h));
    }
    return habits;
  });
}
// Firebase Authentication and Firestore Management
import { FIREBASE_CONFIG } from './config.js';

// Initialize Firebase
firebase.initializeApp(FIREBASE_CONFIG);

// Firebase services
export const auth = firebase.auth();
export let fs = null;
export let user = null;
let firestoreConfigured = false;

// Remote data state (per habit for the current month)
export let remoteMonthByHabit = {};
let monthUnsub = null;
// Habit metadata cache
export let remoteHabits = [];

// Initialize Firestore early and configure settings once
export function initializeFirestore() {
  if (!fs) {
    fs = firebase.firestore();
  }
  if (!firestoreConfigured) {
    try {
      // Configure long polling once; avoid overriding settings thereafter
      fs.settings({ experimentalAutoDetectLongPolling: true });
      firestoreConfigured = true;
    } catch (e) {
      // Ignore if settings were already applied
    }
  }
  return fs;
}

// Fetch all habit metadata for the authenticated user
export function fetchHabitsMeta() {
  if (!user || !fs) return Promise.resolve([]);
  return fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .get()
    .then(snap => {
      const list = [];
      snap.forEach(doc => {
        const d = doc.data() || {};
        list.push({
          id: doc.id,
          name: d.name || 'Habit',
          type: d.type || 'binary',
          goal: d.goal != null ? d.goal : 1,
          color: d.color || '#93c5fd',
          icon: d.icon || '✅'
        });
      });
      remoteHabits = list;
      return list;
    })
    .catch(err => {
      console.error('Failed to fetch habits meta:', err);
      return [];
    });
}

// Create or update habit metadata
export function upsertHabitMeta(habit) {
  if (!user || !fs || !habit || !habit.id) return Promise.resolve();
  const ref = fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .doc(habit.id);
  const payload = {
    name: habit.name,
    type: habit.type,
    goal: habit.goal,
    color: habit.color,
    icon: habit.icon
  };
  return ref.set(payload, { merge: true }).catch(err => {
    console.error('Failed to upsert habit meta:', err);
  });
}

// Delete habit metadata
export function deleteHabitMeta(habitId) {
  if (!user || !fs || !habitId) return Promise.resolve();
  const ref = fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .doc(habitId);
  return ref.delete().catch(err => {
    console.error('Failed to delete habit meta:', err);
  });
}

// Subscribe to month data from Firestore for a specific habit
export function subscribeMonth(habitId, y, m, onUpdate) {
  if (monthUnsub) monthUnsub();
  if (!user || !fs || !habitId) return;
  
  const key = y + '-' + String(m + 1).padStart(2, '0');
  const ref = fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .doc(habitId)
    .collection('months')
    .doc(key);
  
  monthUnsub = ref.onSnapshot({ includeMetadataChanges: true }, snap => {
    // Avoid flicker from local pending writes (optimistic updates already handled)
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    
    const data = snap.exists ? (snap.data() || {}) : {};
    
    // Build marks by merging both shapes: map and legacy dot fields
    let marks = {};
    if (data.marks && typeof data.marks === 'object') {
      marks = { ...data.marks };
    }
    Object.keys(data).forEach(k => {
      if (k.startsWith('marks.')) {
        const day = k.split('.')[1];
        if (day && marks[day] === undefined) marks[day] = data[k];
      }
    });
    
    // Diff previous vs new marks to update UI granularly
    const prev = { ...(remoteMonthByHabit[habitId]?.[key] || {}) };
    
    // Replace state with server truth from Firestore for this habit and month
    remoteMonthByHabit[habitId] = remoteMonthByHabit[habitId] || {};
    remoteMonthByHabit[habitId][key] = marks;
    
    // Compute changed days and emit fine-grained UI events
    const union = new Set([...Object.keys(prev), ...Object.keys(marks)]);
    const changed = [];
    union.forEach(d => { if (prev[d] !== marks[d]) changed.push(Number(d)); });
    if (changed.length) {
      changed.forEach(day => {
        try { window.dispatchEvent(new CustomEvent('dayChanged', { detail: { day } })); } catch {}
      });
    }
    try { window.dispatchEvent(new CustomEvent('statsChanged')); } catch {}
    
    if (onUpdate) onUpdate();
  }, err => {
    console.error('Snapshot error:', err);
    try { window.dispatchEvent(new CustomEvent('statsChanged')); } catch {}
    if (onUpdate) onUpdate(err);
  });
}

// Write mark to Firestore for a specific habit
export function writeMarkToFirestore(habitId, y, m, day, val, onSuccess, onError) {
  if (!user || !fs || !habitId) return;
  
  const key = y + '-' + String(m + 1).padStart(2, '0');
  const ref = fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .doc(habitId)
    .collection('months')
    .doc(key);
  
  // Ensure habit-month bucket exists in local cache
  remoteMonthByHabit[habitId] = remoteMonthByHabit[habitId] || {};
  remoteMonthByHabit[habitId][key] = remoteMonthByHabit[habitId][key] || {};
  
  // Optimistic update in local cache
  const prev = remoteMonthByHabit[habitId][key][day];
  if (!val) {
    delete remoteMonthByHabit[habitId][key][day];
  } else {
    remoteMonthByHabit[habitId][key][day] = val;
  }
  
  // Targeted per-day field update to avoid overwriting entire marks object
  const fieldPath = 'marks.' + String(day);
  const payload = {};
  if (!val) {
    payload[fieldPath] = firebase.firestore.FieldValue.delete();
  } else {
    payload[fieldPath] = val;
  }
  
  // Use set with merge to create doc if missing and update only the field
  ref.set(payload, { merge: true }).then(() => {
    if (onSuccess) onSuccess();
  }).catch(err => {
    console.error('Firestore write failed:', err);
    // Revert optimistic change on failure
    if (prev === undefined) {
      delete remoteMonthByHabit[habitId][key][day];
    } else {
      remoteMonthByHabit[habitId][key][day] = prev;
    }
    if (onError) onError(err);
  });
}

// Auth state change handler
export function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(u => {
    user = u;
    if (user) {
      initializeFirestore();
    }
    callback(u);
  });
}

// Sign out
export function signOut() {
  return auth.signOut();
}

// Get redirect result
export function getRedirectResult() {
  return auth.getRedirectResult();
}

export function fetchMonthOnce(habitId, y, m) {
  if (!user || !fs || !habitId) return Promise.resolve(null);
  const key = y + '-' + String(m + 1).padStart(2, '0');
  const ref = fs
    .collection('users')
    .doc(user.uid)
    .collection('habits')
    .doc(habitId)
    .collection('months')
    .doc(key);
  return ref.get().then(snap => {
    const data = snap.exists ? (snap.data() || {}) : {};
    let marks = {};
    if (data.marks && typeof data.marks === 'object') {
      marks = { ...data.marks };
    }
    Object.keys(data).forEach(k => {
      if (k.startsWith('marks.')) {
        const day = k.split('.')[1];
        if (day && marks[day] === undefined) marks[day] = data[k];
      }
    });
    remoteMonthByHabit[habitId] = remoteMonthByHabit[habitId] || {};
    remoteMonthByHabit[habitId][key] = marks;
    try { window.dispatchEvent(new CustomEvent('statsChanged')); } catch {}
    return marks;
  }).catch(err => {
    console.error('Failed to fetch month once:', err);
    return null;
  });
}

export function prefetchHistoryMonths(habitId, y, m, count = 12) {
  if (!user || !fs || !habitId) return Promise.resolve();
  const tasks = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(y, m - i, 1);
    tasks.push(fetchMonthOnce(habitId, date.getFullYear(), date.getMonth()));
  }
  return Promise.all(tasks).then(() => {
    try { window.dispatchEvent(new CustomEvent('statsChanged')); } catch {}
  });
}
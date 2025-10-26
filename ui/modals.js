// Modal Management and UI Interactions
import { addHabit, updateHabit, deleteHabit, getCurrentHabit, setMark, view, getViewInfo, getMonthData } from '../state.js';

// Modal elements
const habitModal = document.getElementById('habitModal');
const editHabitModal = document.getElementById('editHabitModal');
const progressModal = document.getElementById('progressModal');
const infoModal = document.getElementById('infoModal');
const confirmModal = document.getElementById('confirmModal');

// Toast and status
const toastEl = document.getElementById('toast');
const statusEl = document.getElementById('status');

// Global state for modals
let editingHabitId = null;
let pmDay = null;

// Toast and status functions
export function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 4000);
}

export function setStatus(msg) {
  statusEl.textContent = msg || '';
  if (msg) {
    showToast(msg);
    setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = '';
    }, 5000);
  }
}

// Global Escape key handler for all modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any open modal
    if (habitModal.classList.contains('show')) {
      closeHabitModal();
    } else if (editHabitModal.classList.contains('show')) {
      closeEditHabitModal();
    } else if (progressModal.classList.contains('show')) {
      closeProgressModal();
    } else if (infoModal.classList.contains('show')) {
      closeInfoModal();
    } else if (confirmModal.classList.contains('show')) {
      closeConfirm();
    }
    
    // Also close month picker if open (use class toggle for consistency)
    const monthPicker = document.getElementById('monthPicker');
    if (monthPicker && monthPicker.classList.contains('show')) {
      monthPicker.classList.remove('show');
    }
  }
});

// === Add Habit Modal ===
const hmName = document.getElementById('hmName');
const hmType = document.getElementById('hmType');
const hmGoalRow = document.getElementById('hmGoalRow');
const hmGoal = document.getElementById('hmGoal');
const hmColor = document.getElementById('hmColor');
const hmIcon = document.getElementById('hmIcon');
const hmCreate = document.getElementById('hmCreate');
const hmCancel = document.getElementById('hmCancel');
const hmClose = document.getElementById('hmClose');

export function openHabitModal() {
  habitModal.classList.add('show');
  hmName.value = '';
  hmIcon.value = '';
  hmType.value = 'binary';
  hmGoal.value = '1';
  hmGoalRow.style.display = 'none';
  setTimeout(() => hmName.focus(), 0);
}

export function closeHabitModal() {
  habitModal.classList.remove('show');
}

// Event listeners for Add Habit Modal
hmCancel.addEventListener('click', closeHabitModal);
hmClose.addEventListener('click', closeHabitModal);

hmType.addEventListener('change', () => {
  hmGoalRow.style.display = (hmType.value === 'binary') ? 'none' : 'flex';
});

hmCreate.addEventListener('click', () => {
  const name = (hmName.value || '').trim() || 'New Habit';
  const type = hmType.value;
  const goal = (type === 'binary') ? 1 : Number(hmGoal.value) || 1;
  const color = hmColor.value || '#93c5fd';
  const icon = (hmIcon.value || '').trim();
  
  addHabit(name, type, goal, color, icon);
  closeHabitModal();
  
  // Trigger re-render
  window.dispatchEvent(new CustomEvent('habitChanged'));
});

// === Edit Habit Modal ===
const ehmName = document.getElementById('ehmName');
const ehmType = document.getElementById('ehmType');
const ehmGoalRow = document.getElementById('ehmGoalRow');
const ehmGoal = document.getElementById('ehmGoal');
const ehmColor = document.getElementById('ehmColor');
const ehmIcon = document.getElementById('ehmIcon');
const ehmSave = document.getElementById('ehmSave');
const ehmDelete = document.getElementById('ehmDelete');
const ehmCancel = document.getElementById('ehmCancel');
const ehmClose = document.getElementById('ehmClose');

export function editHabit(habitId) {
  const habit = getCurrentHabit(); // For now, edit current habit
  if (!habit) return;
  
  editingHabitId = habitId;
  ehmName.value = habit.name;
  ehmType.value = habit.type;
  ehmGoal.value = habit.goal;
  ehmColor.value = habit.color;
  ehmIcon.value = habit.icon || '';
  ehmGoalRow.style.display = (habit.type === 'binary') ? 'none' : 'flex';
  editHabitModal.classList.add('show');
  setTimeout(() => ehmName.focus(), 0);
}

export function closeEditHabitModal() {
  editHabitModal.classList.remove('show');
  editingHabitId = null;
}

// Event listeners for Edit Habit Modal
ehmCancel.addEventListener('click', closeEditHabitModal);
ehmClose.addEventListener('click', closeEditHabitModal);

ehmType.addEventListener('change', () => {
  ehmGoalRow.style.display = (ehmType.value === 'binary') ? 'none' : 'flex';
});

ehmSave.addEventListener('click', () => {
  if (!editingHabitId) return;
  
  const updates = {
    name: (ehmName.value || '').trim() || 'New Habit',
    type: ehmType.value,
    goal: (ehmType.value === 'binary') ? 1 : Number(ehmGoal.value) || 1,
    color: ehmColor.value || '#93c5fd',
    icon: (ehmIcon.value || '').trim()
  };
  
  updateHabit(editingHabitId, updates);
  closeEditHabitModal();
  
  // Trigger re-render
  window.dispatchEvent(new CustomEvent('habitChanged'));
});

ehmDelete.addEventListener('click', () => {
  openConfirmDelete();
});

// === Progress Modal ===
const pmValue = document.getElementById('pmValue');
const pmInfo = document.getElementById('pmInfo');
const pmSave = document.getElementById('pmSave');
const pmCancel = document.getElementById('pmCancel');
const pmClose = document.getElementById('pmClose');

export function openProgressModal(day) {
  pmDay = day;
  const h = getCurrentHabit();
  const { year, month } = getViewInfo();
  const md = getMonthData(year, month);
  
  pmValue.value = md[day] != null ? Number(md[day]) : '';
  const dateStr = new Intl.DateTimeFormat('en', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  }).format(new Date(year, month, day));
  
  pmInfo.textContent = dateStr + ' • ' + h.name + (h.type === 'time' ? ' (minutes)' : '');
  
  // Enforce sensible constraints based on type
  pmValue.min = '0';
  pmValue.step = '1';
  pmValue.placeholder = h.type === 'time' ? 'Enter minutes' : 'Enter value';
  
  progressModal.classList.add('show');
  setTimeout(() => pmValue.focus(), 0);
}

export function closeProgressModal() {
  progressModal.classList.remove('show');
  pmDay = null;
}

// Event listeners for Progress Modal
pmCancel.addEventListener('click', closeProgressModal);
pmClose.addEventListener('click', closeProgressModal);

pmSave.addEventListener('click', () => {
  if (pmDay == null) return;
  
  // Clamp to non-negative integer
  const rawValue = Number(pmValue.value);
  const v = isNaN(rawValue) ? 0 : Math.max(0, Math.floor(rawValue));
  
  setMark(pmDay, v, (day) => {
    // Trigger day repaint
    window.dispatchEvent(new CustomEvent('dayChanged', { detail: { day } }));
  }, () => {
    // Trigger stats update
    window.dispatchEvent(new CustomEvent('statsChanged'));
  });
  
  closeProgressModal();
});

// === Info Modal ===
const imClose = document.getElementById('imClose');
const imOk = document.getElementById('imOk');

export function openInfoModal() {
  infoModal.classList.add('show');
}

export function closeInfoModal() {
  infoModal.classList.remove('show');
}

// Event listeners for Info Modal
imClose.addEventListener('click', closeInfoModal);
imOk.addEventListener('click', closeInfoModal);

// === Confirm Delete Modal ===
const cmMsg = document.getElementById('cmMsg');
const cmDelete = document.getElementById('cmDelete');
const cmCancel = document.getElementById('cmCancel');
const cmClose = document.getElementById('cmClose');

export function openConfirmDelete() {
  const habit = getCurrentHabit();
  if (!habit) return;
  
  // Check if this is the last habit
  if (window.habits && window.habits.length <= 1) {
    setStatus('Cannot delete the last habit');
    return;
  }
  
  cmMsg.textContent = `Delete "${habit.name}"? This will permanently remove all progress data for this habit.`;
  confirmModal.classList.add('show');
}

export function closeConfirm() {
  confirmModal.classList.remove('show');
}

// Event listeners for Confirm Modal
cmCancel.addEventListener('click', closeConfirm);
cmClose.addEventListener('click', closeConfirm);

cmDelete.addEventListener('click', () => {
  if (!editingHabitId) return;
  
  const success = deleteHabit(editingHabitId);
  if (success) {
    closeConfirm();
    closeEditHabitModal();
    
    // Trigger re-render
    window.dispatchEvent(new CustomEvent('habitChanged'));
  } else {
    setStatus('Cannot delete the last habit');
  }
});

// Export modal state getters for other modules
export function getEditingHabitId() {
  return editingHabitId;
}

export function getProgressDay() {
  return pmDay;
}
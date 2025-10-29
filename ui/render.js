// Calendar Rendering and UI Updates
import { 
  habits, 
  getCurrentHabit, 
  getMonthData, 
  setMark, 
  view, 
  navigateMonth, 
  getViewInfo, 
  calculateStats, 
  monthCompletionPercent,
  switchHabit,
  setView 
} from '../state.js';
import { openProgressModal, editHabit, openInfoModal } from './modals.js';

const grid = document.getElementById('grid');
const label = document.getElementById('label');
const habitListEl = document.getElementById('habitList');
const addHabitBtn = document.getElementById('addHabitBtn');
const habitsInfoBtn = document.getElementById('habitsInfoBtn');
const menu = document.getElementById('menu');

const doneV = document.getElementById('doneV');
const missV = document.getElementById('missV');
const longV = document.getElementById('longV');
const currV = document.getElementById('currV');
const rateV = document.getElementById('rateV');

// Month/Year picker elements
const picker = document.getElementById('monthPicker');
// removed unused: const mpInner = document.getElementById('mpInner');
const mpMonths = document.getElementById('mpMonths');
const mpYear = document.getElementById('mpYear');
const mpApply = document.getElementById('mpApply');
const mpCancel = document.getElementById('mpCancel');
const mpClose = document.getElementById('mpClose');

let menuDay = null;
let statsRAF = null;
let selectedMonth = null; // 1-12

export function paintDay(day) {
  const { year, month } = getViewInfo();
  const md = getMonthData(year, month);
  const h = getCurrentHabit();
  const el = document.querySelector('[data-day="' + day + '"]');
  if (!el) return;
  const v = md[day];
  el.classList.remove('done', 'miss');
  el.querySelector('.mark').textContent = '';
  const valEl = el.querySelector('.val');
  if (valEl) valEl.textContent = '';
  const progEl = el.querySelector('.prog .bar');
  if (progEl) progEl.style.width = '0%';

  if (h.type === 'binary') {
    if (v === 'done') {
      el.classList.add('done');
      el.querySelector('.mark').textContent = '✅';
    } else if (v === 'miss') {
      el.classList.add('miss');
      el.querySelector('.mark').textContent = '❌';
    }
  } else {
    // Numeric/time habit
    const goal = Number(h.goal) || 1;
    const prog = Math.min(goal, Math.max(0, Number(v || 0)));
    const pct = Math.round((prog / goal) * 100);
    if (progEl) progEl.style.width = pct + '%';
    const valEl2 = el.querySelector('.val');
    if (valEl2) {
      valEl2.textContent = (v != null && v !== '') ? String(prog) : '';
    }
  }
}

// Update statistics display (debounced to avoid stutter)
export function updateStats() {
  if (statsRAF != null) cancelAnimationFrame(statsRAF);
  statsRAF = requestAnimationFrame(() => {
    statsRAF = null;
    const stats = calculateStats();
    if (doneV) doneV.textContent = String(stats.done);
    if (missV) missV.textContent = String(stats.miss);
    if (longV) longV.textContent = String(stats.longest);
    if (currV) currV.textContent = String(stats.curr);
    if (rateV) rateV.textContent = String(stats.rate) + '%';
  });
}

// Render calendar grid
export function renderCalendar() {
  const { year, month, monthName, daysInMonth, firstDayOfWeek, today } = getViewInfo();
  
  // Update month label
  label.textContent = monthName;
  
  // Clear and rebuild grid
  grid.innerHTML = '';
  
  // Add weekday headers
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(w => {
    const e = document.createElement('div');
    e.className = 'week';
    e.textContent = w;
    grid.appendChild(e);
  });
  
  // Add empty cells for days before month start
  for (let i = 0; i < firstDayOfWeek; i++) {
    const s = document.createElement('div');
    grid.appendChild(s);
  }
  
  // Add day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'day';
    el.setAttribute('data-day', String(d));
    el.innerHTML = '<div class="num">' + d + '</div><div class="mark"></div>';
    
    const h = getCurrentHabit();
    if (h.type !== 'binary') {
      const prog = document.createElement('div');
      prog.className = 'prog';
      prog.innerHTML = '<div class="bar"></div>';
      el.appendChild(prog);
      const val = document.createElement('div');
      val.className = 'val';
      el.appendChild(val);
    }
    
    if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d) {
      el.classList.add('today');
    }
    
    el.addEventListener('click', (ev) => {
      const h = getCurrentHabit();
      if (h.type === 'binary') {
        const md = getMonthData(year, month);
        const curr = md[d];
        const next = curr === 'done' ? 'miss' : (curr === 'miss' ? null : 'done');
        setMark(d, next, paintDay, updateStats);
      } else {
        openProgressModal(d, paintDay, updateStats);
      }
    });
    
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      menuDay = d;
      const r = el.getBoundingClientRect();
      menu.style.transform = 'translate(' + (r.left) + 'px,' + (r.bottom + 6) + 'px)';
    });
    
    grid.appendChild(el);
  }
  // Paint all days
  for (let d = 1; d <= daysInMonth; d++) paintDay(d);
}

// Render sidebar habits
export function renderSidebar() {
  habitListEl.innerHTML = '';
  habitListEl.setAttribute('role','listbox');
  habitListEl.setAttribute('aria-label','Habits');

  const curr = getCurrentHabit();
  
  habits.forEach(h => {
    const el = document.createElement('div');
    el.className = 'habit';
    el.setAttribute('role','option');

    const isSelected = curr && curr.id === h.id;
    if (isSelected) {
      el.classList.add('selected');
      el.setAttribute('aria-selected','true');
    } else {
      el.setAttribute('aria-selected','false');
    }

    el.style.setProperty('--color', h.color || '#93c5fd');

    // Build children safely without innerHTML to prevent injection
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = h.color || '#93c5fd';

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = (h.icon ? (h.icon + ' ') : '') + h.name;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.setAttribute('data-id', h.id);
    editBtn.setAttribute('aria-label', 'Edit');
    editBtn.textContent = '✎';

    const mini = document.createElement('div');
    mini.className = 'mini';
    const bar = document.createElement('div');
    bar.className = 'bar';
    mini.appendChild(bar);

    el.appendChild(dot);
    el.appendChild(nameEl);
    el.appendChild(editBtn);
    el.appendChild(mini);
    
    el.addEventListener('click', () => {
      if (switchHabit(h.id)) {
        window.dispatchEvent(new CustomEvent('habitChanged'));
        // Auto-hide mobile sidebar after selecting a habit
        if (window.matchMedia('(max-width: 720px)').matches) {
          const sb = document.getElementById('sidebar');
          const tgl = document.getElementById('toggleSidebar');
          if (sb) sb.classList.remove('show');
          if (tgl) tgl.setAttribute('aria-expanded', 'false');
        }
      }
    });

    bar.style.width = monthCompletionPercent(h) + '%';

    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      editHabit(h.id);
    });
    
    habitListEl.appendChild(el);
  });
}

// Render all
export function render() {
  renderSidebar();
  renderCalendar();
  updateStats();
}

// Close menu when clicking elsewhere
document.addEventListener('click', e => {
  if (!menu.contains(e.target)) {
    menu.style.transform = 'translate(-1000px,-1000px)';
  }
});

menu.addEventListener('click', e => {
  const act = e.target.getAttribute('data-act');
  if (!act) return;
  if (act === 'done') {
    setMark(menuDay, 'done', paintDay, updateStats);
  } else if (act === 'miss') {
    setMark(menuDay, 'miss', paintDay, updateStats);
  } else {
    setMark(menuDay, null, paintDay, updateStats);
  }
  
  menu.style.transform = 'translate(-1000px,-1000px)';
});

// Navigation setup
document.getElementById('prev').onclick = () => {
  navigateMonth('prev');
  render();
  // Notify app that month changed so subscriptions can update
  window.dispatchEvent(new CustomEvent('monthChanged'));
};

document.getElementById('next').onclick = () => {
  navigateMonth('next');
  render();
  // Notify app that month changed so subscriptions can update
  window.dispatchEvent(new CustomEvent('monthChanged'));
};

// Month/Year picker wiring
function populateYears(currentYear) {
  mpYear.innerHTML = '';
  const start = currentYear - 10;
  const end = currentYear + 10;
  for (let y = start; y <= end; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    mpYear.appendChild(opt);
  }
  mpYear.value = String(currentYear);
}

function highlightSelectedMonth() {
  Array.from(mpMonths.querySelectorAll('button[data-m]')).forEach(btn => {
    const m = Number(btn.getAttribute('data-m'));
    btn.classList.toggle('selected', m === selectedMonth);
  });
}

function openMonthPicker() {
  const { year, month } = getViewInfo();
  populateYears(year);
  selectedMonth = month + 1;
  highlightSelectedMonth();
  picker.classList.add('show');
}

function closeMonthPicker() {
  picker.classList.remove('show');
}

label.addEventListener('click', openMonthPicker);
mpClose.addEventListener('click', closeMonthPicker);
mpCancel.addEventListener('click', closeMonthPicker);

mpMonths.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-m]');
  if (!btn) return;
  selectedMonth = Number(btn.getAttribute('data-m'));
  highlightSelectedMonth();
});

mpApply.addEventListener('click', () => {
  const y = Number(mpYear.value);
  const mIdx = (selectedMonth != null ? selectedMonth - 1 : getViewInfo().month);
  setView(y, mIdx);
  render();
  window.dispatchEvent(new CustomEvent('monthChanged'));
  closeMonthPicker();
});

picker.addEventListener('click', (e) => {
  if (e.target === picker) closeMonthPicker();
});

document.addEventListener('keydown', (e) => {
  if (picker.classList.contains('show') && e.key === 'Escape') closeMonthPicker();
});

// Button event listeners
addHabitBtn.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('openHabitModal'));
});

habitsInfoBtn.addEventListener('click', () => {
  openInfoModal();
});

// Listen for custom events from other modules
window.addEventListener('habitChanged', () => {
  render();
});

window.addEventListener('dayChanged', (e) => {
  if (e.detail && e.detail.day) {
    paintDay(e.detail.day);
  }
});

window.addEventListener('statsChanged', () => {
  try { updateStats(); } catch {}
});

window.addEventListener('openHabitModal', () => {
  import('./modals.js').then(({ openHabitModal }) => {
    openHabitModal();
  });
});

// removed unused no-op animNum and verifyConsistency helpers
// Main Entry Point - Habit Tracker Application
import { FIREBASE_CONFIG } from './config.js';
import { 
  initializeFirestore, 
  subscribeMonth, 
  onAuthStateChanged, 
  getRedirectResult,
  user,
  signOut,
  prefetchHistoryMonths
} from './firebase.js';
import { 
  loadStore, 
  habits, 
  getCurrentHabit, 
  addHabit,
  view,
  getViewInfo,
  loadHabitsFromRemote
} from './state.js';
import { render } from './ui/render.js';
import './ui/modals.js'; // Import for side effects (event listeners)


// Initialize Firebase (already initialized in firebase.js)

// Wire login/logout buttons
const loginBtn = document.getElementById('login');
const logoutBtn = document.getElementById('logout');
const userEl = document.getElementById('user');
const toggleSidebarBtn = document.getElementById('toggleSidebar');
const sidebarEl = document.getElementById('sidebar');
if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    window.location.replace('/login/');
  });
}
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    // Only sign out; let the auth state listener handle redirect once
    signOut().catch(() => {});
  });
}

// Mobile: toggle sidebar visibility
if (toggleSidebarBtn && sidebarEl) {
  toggleSidebarBtn.addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    if (!isMobile) return;
    const showing = sidebarEl.classList.toggle('show');
    toggleSidebarBtn.setAttribute('aria-expanded', showing ? 'true' : 'false');
  });
}

// Application initialization
async function initApp() {
  try {
    // Initialize Firebase services
    initializeFirestore();
    
    // Handle authentication state changes
    onAuthStateChanged((u) => {
      // Update header title with first name
      updateTitleWithUser(u);
      
      // Toggle header actions
      if (loginBtn && logoutBtn && userEl) {
        if (u) {
          loginBtn.style.display = 'none';
          logoutBtn.style.display = '';
          userEl.textContent = u.displayName || u.email || '';
        } else {
          loginBtn.style.display = '';
          logoutBtn.style.display = 'none';
          userEl.textContent = '';
        }
      }
  
      if (u) {
        // Reload local store scoped to this user, then load remote habits
        loadStore();
        loadHabitsFromRemote().then(() => {
          if (habits.length === 0) {
            addHabit('Exercise', 'binary', 1, '#3b82f6', '💪');
          }
          const { year, month } = getViewInfo();
          const hid = getCurrentHabit().id;
          subscribeMonth(hid, year, month, null);
          // Prefetch last 12 months to enable cross-month streaks
          prefetchHistoryMonths(hid, year, month, 12).finally(() => {
            render();
          });
        });
      } else {
        // Reload shared store when signed out
        loadStore();
        // Not authenticated: redirect to login
        window.location.replace('/login/');
      }
    });

    await getRedirectResult();

    console.log('Habit Tracker initialized');

  } catch (error) {
    console.error('Failed to initialize app:', error);
    // Avoid rendering UI before auth is known; only log here
  }
}





// removed legacy onAuthChanged block; handled via onAuthStateChanged above
// Debounced/guarded prefetch to avoid redundant calls
let prefetchInFlight = false;
let lastPrefetchKey = '';
function schedulePrefetch(hid, y, m) {
  const key = hid + ':' + y + ':' + m;
  if (prefetchInFlight && key === lastPrefetchKey) return;
  lastPrefetchKey = key;
  prefetchInFlight = true;
  Promise.resolve().then(() => prefetchHistoryMonths(hid, y, m, 12)).finally(() => {
    prefetchInFlight = false;
  });
}

// Update existing listeners to use schedulePrefetch
window.addEventListener('habitChanged', () => {
  if (user) {
    const { year, month } = getViewInfo();
    const hid = getCurrentHabit().id;
    subscribeMonth(hid, year, month, null);
    schedulePrefetch(hid, year, month);
    render();
  }
});

window.addEventListener('monthChanged', () => {
  if (user) {
    const { year, month } = getViewInfo();
    const hid = getCurrentHabit().id;
    subscribeMonth(hid, year, month, null);
    schedulePrefetch(hid, year, month);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && user) {
    const { year, month } = getViewInfo();
    const hid = getCurrentHabit().id;
    subscribeMonth(hid, year, month, null);
    schedulePrefetch(hid, year, month);
  }
});

window.addEventListener('online', () => {
  if (user) {
    const { year, month } = getViewInfo();
    const hid = getCurrentHabit().id;
    subscribeMonth(hid, year, month, null);
    schedulePrefetch(hid, year, month);
  }
});

window.addEventListener('offline', () => {
  console.log('App is offline');
});

// Initialize the application (handle module async and DOMContentLoaded already fired)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export for debugging
window.habitTracker = {
  habits,
  getCurrentHabit,
  view,
  render
};

// Service Worker registration for PWA capabilities
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + N: New habit
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('openHabitModal'));
  }
  
  // Ctrl/Cmd + I: Info modal
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    import('./ui/modals.js').then(({ openInfoModal }) => {
      openInfoModal();
    });
  }
  
  // Arrow keys for month navigation (resubscribe after changing month)
  if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
    e.preventDefault();
    import('./state.js').then(({ navigateMonth }) => {
      navigateMonth('prev');
      render();
      window.dispatchEvent(new CustomEvent('monthChanged'));
    });
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
    e.preventDefault();
    import('./state.js').then(({ navigateMonth }) => {
      navigateMonth('next');
      render();
      window.dispatchEvent(new CustomEvent('monthChanged'));
    });
  }
});

// Wire title with user's first name
const titleEl = document.querySelector('header .title');
function updateTitleWithUser(u) {
  if (!titleEl) return;
  const fallback = 'Habit Tracker';
  if (u) {
    const first = (u.displayName || '').split(' ')[0] || (u.email ? u.email.split('@')[0] : '');
    titleEl.textContent = first ? `${first}'s Habit Tracker` : fallback;
  } else {
    titleEl.textContent = fallback;
  }
}
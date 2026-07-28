// WROTimer - Application Core Logic

// App State
let state = {
  globalTimeSetting: 150 * 60, // 150 minutes default in seconds
  globalRemainingTime: 150 * 60,
  globalTimerState: 'idle', // 'idle' | 'running' | 'paused' | 'finished'
  teams: [] // Array of { id, name, remainingTime, queueCount, isFinished }
};

// Web Audio API context
let audioCtx = null;
let timerInterval = null;

// DOM Elements
const elGlobalTimerText = document.getElementById('global-timer-text');
const elGlobalStatusText = document.getElementById('global-status-text');
const elGlobalProgressBar = document.getElementById('global-progress-bar');
const elBtnGlobalPlay = document.getElementById('btn-global-play');
const elBtnGlobalPause = document.getElementById('btn-global-pause');
const elBtnGlobalReset = document.getElementById('btn-global-reset');
const elInputGlobalMinutes = document.getElementById('input-global-minutes');
const elBtnApplySettings = document.getElementById('btn-apply-settings');
const elBtnSoundTest = document.getElementById('btn-sound-test');
const elFormAddTeam = document.getElementById('form-add-team');
const elInputTeamName = document.getElementById('input-team-name');
const elTeamsGrid = document.getElementById('teams-grid');
const elBtnResetTeams = document.getElementById('btn-reset-teams');
const elPwaStatus = document.getElementById('pwa-status');

// Circle stroke calculation
const CIRCLE_RADIUS = 98;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~615.75

// Load State from LocalStorage
function loadState() {
  const savedState = localStorage.getItem('wro_timer_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      // Clean running state back to paused
      if (parsed.globalTimerState === 'running') {
        parsed.globalTimerState = 'paused';
      }
      state = { ...state, ...parsed };
      
      // Update inputs
      elInputGlobalMinutes.value = Math.floor(state.globalTimeSetting / 60);
    } catch (e) {
      console.error("Error loading saved state", e);
    }
  }
}

// Save State to LocalStorage
function saveState() {
  localStorage.setItem('wro_timer_state', JSON.stringify({
    globalTimeSetting: state.globalTimeSetting,
    globalRemainingTime: state.globalRemainingTime,
    globalTimerState: state.globalTimerState,
    teams: state.teams
  }));
}

// Format Seconds to MM:SS or H:MM:SS
function formatTime(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  
  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

// Audio Initializer
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  elBtnSoundTest.classList.add('active');
  elBtnSoundTest.innerHTML = '<span class="icon">✅</span> 音效運作中';
}

// Synthesize single beep
function playTestBeep() {
  initAudio();
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

// Team Timeout Alarm (Quick Double Beeps)
function playTeamAlarm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  
  // Play two rapid beeps
  [0, 0.25].forEach((delay) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square'; // Buzzier tone for team alarm
    osc.frequency.setValueAtTime(900, now + delay);
    
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.2);
  });
}

// Global Timeout Alarm (Siren/Sweep Alert)
function playGlobalAlarm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  
  // Repeat sweep siren 5 times
  for (let i = 0; i < 5; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, now + i * 0.5);
    osc.frequency.linearRampToValueAtTime(1100, now + i * 0.5 + 0.25);
    osc.frequency.linearRampToValueAtTime(500, now + i * 0.5 + 0.5);
    
    gain.gain.setValueAtTime(0, now + i * 0.5);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.5 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.5 + 0.48);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * 0.5);
    osc.stop(now + i * 0.5 + 0.5);
  }
}

// Update Global Timer Progress Circle
function updateGlobalProgress() {
  const percent = state.globalRemainingTime / state.globalTimeSetting;
  const offset = CIRCLE_CIRCUMFERENCE - (percent * CIRCLE_CIRCUMFERENCE);
  elGlobalProgressBar.style.strokeDashoffset = offset;
}

// Render DOM based on current state
function render() {
  // 1. Global Display
  elGlobalTimerText.innerText = formatTime(state.globalRemainingTime);
  
  // Danger warnings for global text
  elGlobalTimerText.className = 'timer-text';
  if (state.globalRemainingTime <= 60) {
    elGlobalTimerText.classList.add('danger');
  } else if (state.globalRemainingTime <= 600) {
    elGlobalTimerText.classList.add('warning');
  }
  
  // Global buttons status
  if (state.globalTimerState === 'running') {
    elGlobalStatusText.innerText = '計時中...';
    elBtnGlobalPlay.disabled = true;
    elBtnGlobalPause.disabled = false;
  } else if (state.globalTimerState === 'paused') {
    elGlobalStatusText.innerText = '已暫停';
    elBtnGlobalPlay.disabled = false;
    elBtnGlobalPause.disabled = true;
  } else if (state.globalTimerState === 'finished') {
    elGlobalStatusText.innerText = '時間到！';
    elBtnGlobalPlay.disabled = true;
    elBtnGlobalPause.disabled = true;
  } else {
    elGlobalStatusText.innerText = '已準備';
    elBtnGlobalPlay.disabled = false;
    elBtnGlobalPause.disabled = true;
  }

  updateGlobalProgress();

  // 2. Teams Render
  const elPlaceholder = document.getElementById('empty-state-placeholder');
  
  if (state.teams.length === 0) {
    if (elPlaceholder) elPlaceholder.style.display = 'flex';
    // Clear other team elements
    const existingCards = elTeamsGrid.querySelectorAll('.team-card');
    existingCards.forEach(card => card.remove());
  } else {
    if (elPlaceholder) elPlaceholder.style.display = 'none';
    
    // Efficiently update or create team elements
    state.teams.forEach(team => {
      let elCard = document.getElementById(`team-card-${team.id}`);
      
      if (!elCard) {
        // Create new card
        elCard = document.createElement('div');
        elCard.id = `team-card-${team.id}`;
        elCard.className = 'team-card';
        elTeamsGrid.appendChild(elCard);
      }
      
      // Update Card State styling classes
      elCard.className = 'team-card';
      if (team.isFinished) {
        elCard.classList.add('finished');
      } else if (team.remainingTime <= 60) {
        elCard.classList.add('finished'); // low time glowing red
      } else if (team.remainingTime <= 300) {
        elCard.classList.add('warning');
      } else {
        elCard.classList.add('running');
      }

      // Calculate progress percentage
      const progressPercent = (team.remainingTime / state.globalTimeSetting) * 100;
      const progressStyle = `width: ${Math.max(0, Math.min(100, progressPercent))}%`;

      elCard.innerHTML = `
        <div class="team-header">
          <span class="team-name" title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</span>
          <button class="btn-team-delete" onclick="deleteTeam('${team.id}')" title="刪除組別">✕</button>
        </div>
        <div class="team-body">
          <div class="team-time-display">
            <span class="team-time">${formatTime(team.remainingTime)}</span>
            <span class="team-status-label">${team.isFinished ? '已結束' : '進行中'}</span>
          </div>
        </div>
        <div class="team-progress-bar-container">
          <div class="team-progress-bar" style="${progressStyle}"></div>
        </div>
        <div class="team-actions">
          <button class="btn btn-queue" onclick="queueTeam('${team.id}')" ${team.isFinished ? 'disabled' : ''}>
            <span class="icon">🏃</span> 排隊
            <span class="queue-badge">${team.queueCount}</span>
          </button>
          <button class="btn btn-team-reset" onclick="resetTeamTime('${team.id}')" title="同步/重設回全域時間">
            <span class="icon">🔄</span>
          </button>
        </div>
      `;
    });

    // Remove cards that are no longer in state
    const cards = elTeamsGrid.querySelectorAll('.team-card');
    cards.forEach(card => {
      const id = card.id.replace('team-card-', '');
      if (!state.teams.some(team => team.id === id)) {
        card.remove();
      }
    });
  }
}

// Utility to escape HTML and prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Timer Ticking Loop
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (state.globalTimerState !== 'running') return;
    
    let stateChanged = false;
    
    // 1. Decrement Global Time
    if (state.globalRemainingTime > 0) {
      state.globalRemainingTime--;
      stateChanged = true;
      
      if (state.globalRemainingTime === 0) {
        state.globalTimerState = 'finished';
        clearInterval(timerInterval);
        playGlobalAlarm();
      }
    }
    
    // 2. Decrement Active Team Timers
    state.teams.forEach(team => {
      if (!team.isFinished && team.remainingTime > 0) {
        team.remainingTime--;
        stateChanged = true;
        
        if (team.remainingTime === 0) {
          team.isFinished = true;
          playTeamAlarm();
        }
      }
    });
    
    // 3. Check if ALL teams are finished (only if there are teams)
    if (state.teams.length > 0 && state.teams.every(t => t.isFinished || t.remainingTime <= 0)) {
      if (state.globalTimerState === 'running') {
        state.globalTimerState = 'finished';
        clearInterval(timerInterval);
        playGlobalAlarm();
        stateChanged = true;
      }
    }
    
    if (stateChanged) {
      saveState();
      render();
    }
  }, 1000);
}

// Action: Play Global Timer
function playGlobal() {
  initAudio();
  if (state.globalRemainingTime <= 0) return;
  state.globalTimerState = 'running';
  saveState();
  render();
  startTimerLoop();
}

// Action: Pause Global Timer
function pauseGlobal() {
  state.globalTimerState = 'paused';
  saveState();
  render();
}

// Action: Reset Global Timer
function resetGlobal() {
  state.globalTimerState = 'idle';
  state.globalRemainingTime = state.globalTimeSetting;
  
  // Also reset teams' status but keep their queue counts
  state.teams.forEach(team => {
    team.remainingTime = state.globalTimeSetting;
    team.isFinished = false;
  });
  
  if (timerInterval) clearInterval(timerInterval);
  saveState();
  render();
}

// Action: Apply Initial Time Settings
function applySettings() {
  const mins = parseInt(elInputGlobalMinutes.value);
  if (isNaN(mins) || mins < 1 || mins > 999) {
    alert('請輸入有效的分鐘數 (1 - 999)');
    return;
  }
  
  state.globalTimeSetting = mins * 60;
  state.globalRemainingTime = state.globalTimeSetting;
  state.globalTimerState = 'idle';
  
  // Set all current teams to the new duration too
  state.teams.forEach(team => {
    team.remainingTime = state.globalTimeSetting;
    team.isFinished = false;
  });
  
  if (timerInterval) clearInterval(timerInterval);
  saveState();
  render();
}

// Action: Quick Adjust Global Time
function adjustGlobalTime(seconds) {
  state.globalRemainingTime += seconds;
  if (state.globalRemainingTime < 0) {
    state.globalRemainingTime = 0;
  }
  // Ensure remaining doesn't exceed setup
  if (state.globalRemainingTime > state.globalTimeSetting) {
    state.globalTimeSetting = state.globalRemainingTime;
  }
  
  if (state.globalRemainingTime === 0 && state.globalTimerState === 'running') {
    state.globalTimerState = 'finished';
    playGlobalAlarm();
  }
  
  saveState();
  render();
}

// Action: Add Team
function addTeam(name) {
  if (!name || name.trim() === '') return;
  
  const newTeam = {
    id: 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    remainingTime: state.globalRemainingTime, // Inherits current global time
    queueCount: 0,
    isFinished: state.globalRemainingTime <= 0
  };
  
  state.teams.push(newTeam);
  saveState();
  render();
}

// Action: Delete Team
window.deleteTeam = function(id) {
  state.teams = state.teams.filter(t => t.id !== id);
  saveState();
  render();
};

// Action: Reset single team's time back to the current global remaining time
window.resetTeamTime = function(id) {
  const team = state.teams.find(t => t.id === id);
  if (team) {
    team.remainingTime = state.globalRemainingTime;
    team.isFinished = state.globalRemainingTime <= 0;
    saveState();
    render();
  }
};

// Action: Queue Button clicked for a team (-5 minutes and increments count)
window.queueTeam = function(id) {
  initAudio();
  const team = state.teams.find(t => t.id === id);
  if (team && !team.isFinished) {
    team.queueCount += 1;
    // Deduct 5 mins (300 seconds)
    team.remainingTime -= 300;
    
    if (team.remainingTime <= 0) {
      team.remainingTime = 0;
      team.isFinished = true;
      playTeamAlarm();
    }
    
    // Check if this triggered all teams to finish
    if (state.teams.length > 0 && state.teams.every(t => t.isFinished || t.remainingTime <= 0)) {
      if (state.globalTimerState === 'running') {
        state.globalTimerState = 'finished';
        if (timerInterval) clearInterval(timerInterval);
        playGlobalAlarm();
      }
    }
    
    saveState();
    render();
  }
};

// Reset all team records
elBtnResetTeams.addEventListener('click', () => {
  if (confirm('確定要清除所有組別與排隊次數嗎？這將會清空整張名單。')) {
    state.teams = [];
    saveState();
    render();
  }
});

// Attach event listeners
elBtnGlobalPlay.addEventListener('click', playGlobal);
elBtnGlobalPause.addEventListener('click', pauseGlobal);
elBtnGlobalReset.addEventListener('click', resetGlobal);
elBtnApplySettings.addEventListener('click', applySettings);

elBtnSoundTest.addEventListener('click', () => {
  initAudio();
  playTestBeep();
});

// Setup adjustment buttons
document.querySelectorAll('.btn-adjust').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const val = parseInt(e.target.getAttribute('data-seconds'));
    adjustGlobalTime(val);
  });
});

// Add Team Form listener
elFormAddTeam.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = elInputTeamName.value;
  addTeam(name);
  elInputTeamName.value = '';
  elInputTeamName.focus();
});

// Initialize Application
loadState();
render();
if (state.globalTimerState === 'running') {
  startTimerLoop();
}

// ----------------------------------------------------
// PWA Service Worker Registration
// ----------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('ServiceWorker registered successfully with scope: ', reg.scope);
        elPwaStatus.innerText = '已下載，支援離線使用';
      })
      .catch(err => {
        console.warn('ServiceWorker registration failed: ', err);
        elPwaStatus.innerText = '一般模式';
      });
  });
} else {
  elPwaStatus.innerText = '不支援離線技術';
}

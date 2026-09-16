const session = JSON.parse(localStorage.getItem('rythora-session') || 'null');
if (!session) window.location.replace('login.html');

const storageKey = 'rythora-tracker';
const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
const account = JSON.parse(localStorage.getItem('rythora-account') || '{}');
const now = new Date();
const dayMilliseconds = 86400000;
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const cycleLength = Number(account.cycleLength) || 28;
const periodLength = Number(account.periodLength) || 5;
const lastPeriod = account.lastPeriod ? new Date(`${account.lastPeriod}T00:00:00`) : new Date(now.getTime() - (17 * 86400000));
const cycleDay = Math.max(1, Math.floor((now - lastPeriod) / 86400000) + 1);
const nextPeriod = new Date(lastPeriod);
nextPeriod.setDate(nextPeriod.getDate() + cycleLength);
const isPredictedPeriod = cycleDay <= periodLength;
const daysLate = Math.max(0, Math.floor((todayStart - nextPeriod) / dayMilliseconds));
const daysUntilPeriod = Math.max(0, Math.ceil((nextPeriod - todayStart) / dayMilliseconds));

function ensureIntimacyField() {
  const lastPeriodInput = document.querySelector('#last-period-input');
  if (!lastPeriodInput || document.querySelector('#intimacy-input')) return;
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'intimacy-input';
  label.textContent = 'Intercourse / intimacy';
  const select = document.createElement('select');
  select.className = 'modal-input';
  select.id = 'intimacy-input';
  select.innerHTML = '<option value="">Not logged</option><option value="protected">Protected sex</option><option value="unprotected">Unprotected sex</option><option value="withdrawal">Withdrawal</option><option value="other">Other / not sure</option>';
  lastPeriodInput.before(label, select);
}

const calendarGrid = document.querySelector('#calendar-grid');
const toast = document.querySelector('#toast');
const settingsModal = document.querySelector('#settings-modal');
let toastTimer;

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: state }) }).catch(() => {});
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

const chatStorageKey = 'rythora-period-chat';
const chatMessages = document.querySelector('#chat-messages');
const chatPanel = document.querySelector('#chat-panel');
const chatLauncher = document.querySelector('#chat-launcher');
const chatInput = document.querySelector('#chat-input');
const chatForm = document.querySelector('#chat-form');
const chatSendButton = chatForm.querySelector('button');
const chatCounter = document.querySelector('#chat-counter');
const chatPrompts = [...document.querySelectorAll('#chat-prompts button')];
let chatBusy = false;

function scrollChatToLatest() { chatMessages.scrollTop = chatMessages.scrollHeight; }
function updateChatInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 118)}px`;
  chatCounter.textContent = `${chatInput.value.length} / 1000`;
  chatSendButton.disabled = chatBusy || !chatInput.value.trim();
}

function getChatReply(question) {
  const q = question.toLowerCase();
  if (/(soak|soaking|faint|dizzy|passed out|severe pain|one.sided pain|shoulder pain|pregnant.*bleed|bleeding.*pregnan)/.test(q)) return 'Please seek urgent medical care now, especially if you are soaking a pad soon after putting it on, feel faint or dizzy, have severe or one-sided abdominal pain, shoulder pain, or could be pregnant. These symptoms need prompt assessment.';
  if (/(late|missed|not.*come|pregnan)/.test(q)) return 'Late periods can happen for many reasons, including stress, weight or exercise changes, illness, hormonal contraception, and pregnancy. If pregnancy is possible, take a home test from the first day of a missed period; if you do not know when it was due, test at least 21 days after unprotected sex. If it is negative and your period still does not come, repeat it in a few days and speak with a clinician if you remain concerned. <a href="https://www.nhs.uk/pregnancy/trying-for-a-baby/doing-a-pregnancy-test/" target="_blank" rel="noopener">Pregnancy-test guidance</a>';
  if (/(cramp|pain|hurt)/.test(q)) return 'Period cramps are common. Gentle movement, heat (such as a warm pack), rest, and pain relief can help some people. If you use pain medicine, follow the package directions and check with a pharmacist or clinician if you have conditions or medicines that could make it unsafe. Seek medical advice if pain is severe, new, worsening, or stops you doing everyday activities.';
  if (/(heavy|bleed|blood|clot)/.test(q)) return 'Periods vary, but bleeding that means changing a pad or tampon every 1–2 hours, needing two products together, or disrupting daily life is worth discussing with a clinician. Get urgent help if bleeding is very heavy or you feel faint, dizzy, or severely unwell. <a href="https://www.nhs.uk/conditions/periods/period-problems/" target="_blank" rel="noopener">Heavy-period guidance</a>';
  if (/(normal|cycle|regular|irregular|long)/.test(q)) return 'Cycles differ from person to person. For many adults, cycles around 21–35 days can be typical, and periods often last 2–7 days. Puberty, perimenopause, stress, and contraception can change a pattern. If your cycle changes suddenly, is persistently irregular, or worries you, a clinician can help.';
  if (/(spot|between|after sex)/.test(q)) return 'Bleeding between periods or after sex should be checked by a healthcare professional, even though it is often not serious. If it comes with a missed period and tummy or pelvic pain, seek urgent care because ectopic pregnancy must be ruled out.';
  return 'I can share general information about late or missed periods, cramps, heavy bleeding, spotting, and cycle patterns. I cannot diagnose. Tell me what is happening, how long it has been going on, and whether pregnancy could be possible.';
}

function addChatMessage(text, role, save = true) {
  const message = document.createElement('div');
  message.className = `chat-message ${role}`;
  const label = document.createElement('span');
  label.className = 'chat-message-label';
  label.textContent = role === 'bot' ? 'Rythora' : 'You';
  const body = document.createElement('p');
  body.textContent = text;
  message.append(label, body);
  chatMessages.appendChild(message);
  scrollChatToLatest();
  if (save) {
    const history = JSON.parse(localStorage.getItem(chatStorageKey) || '[]');
    history.push({ text, role });
    localStorage.setItem(chatStorageKey, JSON.stringify(history.slice(-20)));
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, role }) }).catch(() => {});
  }
}

function showTyping() {
  const typing = document.createElement('div');
  typing.className = 'chat-message bot chat-typing';
  typing.id = 'chat-typing';
  typing.setAttribute('aria-label', 'Rythora is thinking');
  typing.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(typing);
  scrollChatToLatest();
}

function setChatBusy(isBusy) {
  chatInput.disabled = isBusy;
  updateChatInput();
}

async function askChat(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || chatBusy) return;
  addChatMessage(cleanQuestion, 'user', false);
  chatInput.value = '';
  setChatBusy(true);
  const sendButton = document.querySelector('#chat-form button');
  sendButton.disabled = true;
  sendButton.textContent = '…';
  showTyping();
  try {
    const response = await fetch('/api/chat/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: cleanQuestion }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to get a response.');
    addChatMessage(result.answer, 'bot', false);
    document.querySelector('#chat-typing')?.remove();
  } catch (error) { document.querySelector('#chat-typing')?.remove(); addChatMessage(error.message, 'bot', false); }
  finally { chatInput.disabled = false; sendButton.disabled = false; sendButton.textContent = '↑'; chatInput.focus(); }
}

function openChat() { chatPanel.hidden = false; chatLauncher.setAttribute('aria-expanded', 'true'); chatInput.focus(); if (!chatMessages.children.length) addChatMessage('Hi, I’m here for general period and cycle questions. What’s on your mind?', 'bot'); }
chatLauncher.addEventListener('click', () => { if (chatPanel.hidden) openChat(); else { chatPanel.hidden = true; chatLauncher.setAttribute('aria-expanded', 'false'); } });
document.querySelector('#open-chat-nav').addEventListener('click', openChat);
document.querySelector('#chat-close').addEventListener('click', () => { chatPanel.hidden = true; chatLauncher.setAttribute('aria-expanded', 'false'); });
document.querySelector('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); askChat(chatInput.value); });
chatInput.addEventListener('input', updateChatInput);
chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askChat(chatInput.value); } });
document.querySelectorAll('#chat-prompts button').forEach((button) => button.addEventListener('click', () => askChat(button.textContent)));
document.querySelector('#chat-new').addEventListener('click', async () => {
  if (chatBusy) return;
  await fetch('/api/chat', { method: 'DELETE' }).catch(() => {});
  localStorage.removeItem(chatStorageKey);
  chatMessages.replaceChildren();
  openChat();
});
JSON.parse(localStorage.getItem(chatStorageKey) || '[]').forEach((message) => addChatMessage(message.text, message.role, false));
fetch('/api/chat').then((response) => response.ok ? response.json() : null).then((result) => {
  if (result?.messages?.length && !chatMessages.children.length) {
    result.messages.forEach((message) => addChatMessage(message.text, message.role, false));
    localStorage.setItem(chatStorageKey, JSON.stringify(result.messages));
  }
}).catch(() => {});
updateChatInput();

function buildCalendar() {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDay = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: firstDay + daysInMonth }, (_, index) => ({ number: index < firstDay ? '' : index - firstDay + 1, muted: index < firstDay }));
  calendarGrid.innerHTML = days.map((day, index) => {
    const calendarDate = day.muted ? null : new Date(now.getFullYear(), now.getMonth(), day.number);
    const isNextPeriodDay = calendarDate && calendarDate.getTime() === nextPeriod.getTime();
    const daysSinceLastPeriod = calendarDate ? Math.floor((calendarDate - lastPeriod) / 86400000) : -1;
    const cyclePosition = daysSinceLastPeriod >= 0 ? daysSinceLastPeriod % cycleLength : -1;
    const isPeriod = !day.muted && isNextPeriodDay;
    const isFertile = false;
    const isToday = !day.muted && day.number === now.getDate();
    const classes = ['calendar-day', day.muted ? 'muted' : '', isPeriod ? 'period' : '', isFertile ? 'fertile' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
    return `<div class="${classes}" aria-label="${day.number ? `${now.toLocaleString('en-US', { month: 'long' })} ${day.number}` : 'Empty day'}"><span>${day.number}</span></div>`;
  }).join('');
}

function hydrate() {
  const name = state.name || session?.name || 'Alex';
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const formattedToday = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const formattedLastPeriod = lastPeriod.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.querySelector('.breadcrumb').innerHTML = `<span>${formattedToday}</span><span class="breadcrumb-dot"></span><span class="status-text">Cycle day ${cycleDay}</span>`;
  document.querySelector('.date-pill strong').textContent = `${monthName} ${now.getFullYear()}`;
  document.querySelector('.date-pill small').textContent = formattedToday;
  document.querySelector('.section-heading h2').textContent = `${monthName} rhythm`;
  document.querySelector('.month-title strong').textContent = `${monthName} ${now.getFullYear()}`;
  document.querySelector('.month-title span').textContent = `Cycle day ${cycleDay} today`;
  document.querySelector('#cycle-day-number').textContent = cycleDay;
  document.querySelector('#period-countdown').textContent = daysLate > 0 ? `Delayed ${daysLate}d` : daysUntilPeriod === 0 ? 'Due today' : `${daysUntilPeriod} days`;
  document.querySelector('#cycle-length').textContent = `${cycleLength} days`;
  document.querySelector('#cycle-phase').textContent = cycleDay <= periodLength ? 'Menstrual phase' : cycleDay < 14 ? 'Follicular phase' : cycleDay < 21 ? 'Ovulation window' : 'Luteal phase';
  document.querySelector('.profile-copy strong').textContent = `${name}'s space`;
  document.querySelector('.profile-copy small').textContent = account.age ? `${account.age} years · Last period ${formattedLastPeriod}` : 'Personal tracker';
  const cycleAlert = document.querySelector('#cycle-alert');
  cycleAlert.textContent = daysLate > 0 ? `Your period is ${daysLate} day${daysLate === 1 ? '' : 's'} late. Delays can happen for many reasons.` : daysUntilPeriod === 0 ? 'Your period is expected today. Add a flow log if it starts.' : '';
  cycleAlert.classList.toggle('visible', daysLate > 0 || daysUntilPeriod === 0);
  document.querySelector('#late-checkin').classList.toggle('visible', daysLate > 0);
  document.querySelector('.welcome-row h1').innerHTML = `${greeting}, ${name} <span class="sparkle">✦</span>`;
  document.querySelector('#name-input').value = name;
  document.querySelector('#age-input').value = account.age || '';
  document.querySelector('#intimacy-input').value = state.intimacy || '';
  document.querySelector('#last-period-input').value = account.lastPeriod || '';
  document.querySelector('#cycle-length-input').value = account.cycleLength || 28;
  document.querySelector('#period-length-input').value = account.periodLength || 5;
  if (state.mood) {
    document.querySelectorAll('.mood-option').forEach((button) => button.classList.toggle('selected', button.dataset.mood === state.mood));
  }
  if (state.note) document.querySelector('#daily-note').value = state.note;
  if (state.flow) {
    document.querySelectorAll('.flow-options button').forEach((button) => button.classList.toggle('selected', button.dataset.flow === state.flow));
    document.querySelector('#log-status').textContent = !isPredictedPeriod && state.flow !== 'Spotting' ? 'Unexpected bleeding logged' : `${state.flow} flow logged today`;
  }
  document.querySelector('#flow-guidance').textContent = isPredictedPeriod
    ? 'You are in your predicted period window. Log your flow and add notes as usual.'
    : 'You are not in your predicted period window. Notes are okay anytime; use Spotting for unexpected bleeding.';
  document.querySelector('#flow-guidance').classList.toggle('warning', !isPredictedPeriod);
  document.querySelector('#reminder-toggle').checked = state.reminders !== false;
}

function openSettings() {
  settingsModal.classList.add('open');
  settingsModal.setAttribute('aria-hidden', 'false');
  document.querySelector('#name-input').focus();
}

function closeSettings() {
  settingsModal.classList.remove('open');
  settingsModal.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('.mood-option').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mood-option').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    state.mood = button.dataset.mood;
    saveState();
  });
});

document.querySelector('#save-note').addEventListener('click', () => {
  state.note = document.querySelector('#daily-note').value.trim();
  saveState();
  showToast(state.note ? 'Today’s check-in is saved.' : 'Your mood is saved for today.');
});

document.querySelectorAll('.flow-options button').forEach((button) => {
  button.addEventListener('click', () => {
    if (!isPredictedPeriod && button.dataset.flow !== 'Spotting') {
      document.querySelector('#log-status').textContent = 'This is outside your predicted period window';
      showToast('This may be unexpected bleeding. Use Spotting or contact a healthcare professional if it concerns you.');
      return;
    }
    document.querySelectorAll('.flow-options button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    state.flow = button.dataset.flow;
    saveState();
    document.querySelector('#log-status').textContent = `${state.flow} flow logged today`;
    showToast(`${state.flow} flow logged.`);
  });
});

document.querySelector('#open-log').addEventListener('click', () => {
  document.querySelector('#calendar').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Your cycle details are below.');
});
document.querySelector('#open-settings').addEventListener('click', openSettings);
document.querySelector('#open-settings-top').addEventListener('click', openSettings);
document.querySelector('#close-settings').addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) closeSettings(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSettings(); });

document.querySelector('#save-settings').addEventListener('click', () => {
  const nameInput = document.querySelector('#name-input').value.trim();
  state.name = nameInput || 'Alex';
  state.reminders = document.querySelector('#reminder-toggle').checked;
  account.name = state.name;
  account.age = Number(document.querySelector('#age-input').value) || account.age;
  state.intimacy = document.querySelector('#intimacy-input').value;
  account.lastPeriod = document.querySelector('#last-period-input').value || account.lastPeriod;
  account.cycleLength = Number(document.querySelector('#cycle-length-input').value) || 28;
  account.periodLength = Number(document.querySelector('#period-length-input').value) || 5;
  localStorage.setItem('rythora-account', JSON.stringify(account));
  fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) })
    .then((response) => { if (!response.ok) throw new Error(); })
    .catch(() => showToast('Your changes are saved locally. The server could not be reached.'));
  saveState();
  window.location.reload();
  closeSettings();
  showToast('Your space has been updated.');
});

document.querySelectorAll('[data-delay-reason]').forEach((button) => {
  button.addEventListener('click', () => {
    state.delayReason = button.dataset.delayReason;
    saveState();
    document.querySelectorAll('[data-delay-reason]').forEach((item) => item.classList.toggle('selected', item === button));
    showToast('Thanks for checking in with yourself.');
  });
});

document.querySelector('#logout-button').addEventListener('click', () => {
  fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
    localStorage.removeItem('rythora-session');
    localStorage.removeItem('rythora-account');
    window.location.replace('login.html');
  });
});

document.querySelector('#privacy-link').addEventListener('click', () => showToast('Your entries stay on this device.'));
document.querySelectorAll('.calendar-arrow').forEach((button) => button.addEventListener('click', () => showToast('Your current tracked month is shown.')));

ensureIntimacyField();
buildCalendar();
hydrate();
if (!account.lastPeriod) openSettings();
if (daysUntilPeriod === 0 && state.lastPeriodNotice !== todayStart.toISOString().slice(0, 10)) {
  showToast('Your period is expected today.');
  state.lastPeriodNotice = todayStart.toISOString().slice(0, 10);
  saveState();
}
setInterval(() => {
  const currentDay = new Date().toISOString().slice(0, 10);
  if (currentDay !== todayStart.toISOString().slice(0, 10)) window.location.reload();
}, 60000);

// Load the signed-in user's persisted data when this device has no current cache.
(async function syncFromServer() {
  try {
    const [meResponse, dataResponse] = await Promise.all([fetch('/api/auth/me'), fetch('/api/data')]);
    if (!meResponse.ok) { localStorage.removeItem('rythora-session'); window.location.replace('login.html'); return; }
    const { user } = await meResponse.json();
    const { data } = dataResponse.ok ? await dataResponse.json() : { data: {} };
    const cachedAccount = JSON.parse(localStorage.getItem('rythora-account') || '{}');
    const cachedState = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const profileChanged = ['name', 'email', 'age', 'lastPeriod', 'cycleLength', 'periodLength'].some((key) => cachedAccount[key] !== user[key]);
    if (profileChanged || (!Object.keys(cachedState).length && Object.keys(data).length)) {
      localStorage.setItem('rythora-account', JSON.stringify(user));
      localStorage.setItem('rythora-session', JSON.stringify({ email: user.email, name: user.name }));
      localStorage.setItem(storageKey, JSON.stringify(data));
      window.location.reload();
    }
  } catch { /* Offline cache remains usable; new logins show a helpful form error. */ }
})();

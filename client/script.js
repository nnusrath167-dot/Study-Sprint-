// StudySprint: plain JavaScript for the timer, tasks, timetable, alarm, and sleep log.
// Data is stored in this browser with localStorage; no account or server is needed.

const TASKS_KEY = "studysprint-tasks-v1";
const SESSIONS_KEY = "studysprint-sessions-v1";
const SCHEDULE_KEY = "studysprint-schedule-v1";
const SCHEDULE_COMPLETIONS_KEY = "studysprint-schedule-completions-v1";
const SCHEDULE_OVERDUE_FIRED_KEY = "studysprint-schedule-overdue-fired-v1";
const ALARM_KEY = "studysprint-alarm-v1";
const SLEEP_KEY = "studysprint-sleep-v1";
const REMINDERS_KEY = "studysprint-reminders-fired-v1";
const GOAL_KEY = "studysprint-daily-goal-v1";
const CURRICULUM_CARD_KEY = "studysprint-curriculum-card-v1";
const SUPERCHARGERS_KEY = "studysprint-superchargers-v1";
const PROFILE_KEY = "studysprint-demo-profile-v1";
const PROFILE_SESSION_KEY = "studysprint-demo-session-v1";
const FILE_DATABASE_NAME = "studysprint-files-v1";
const FILE_STORE_NAME = "saved-files";
const DAILY_GOAL_MINUTES = 120;
const TIMER_MINUTES = { focus: 25, short: 5, long: 15 };

const starterTasks = [
  { id: "starter-html", title: "Build a simple HTML page", subject: "HTML", done: false },
  { id: "starter-css", title: "Practice a CSS card layout", subject: "CSS", done: false },
  { id: "starter-js", title: "Review JavaScript variables", subject: "JavaScript", done: false },
];

const starterSchedule = [
  { id: "meal-breakfast", time: "07:30", title: "Breakfast", type: "Breakfast", reminder: false },
  { id: "study-morning", time: "09:00", title: "Morning study block", type: "Study", reminder: false },
  { id: "break-midmorning", time: "11:00", title: "Stretch and take a break", type: "Break", reminder: false },
  { id: "meal-lunch", time: "13:00", title: "Lunch", type: "Lunch", reminder: false },
  { id: "study-afternoon", time: "14:00", title: "Web development practice", type: "Study", reminder: false },
  { id: "meal-dinner", time: "19:30", title: "Dinner", type: "Dinner", reminder: false },
];

function readSaved(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.warn("StudySprint could not read saved data:", error);
    return fallback;
  }
}

let tasks = readSaved(TASKS_KEY, starterTasks);
let sessions = readSaved(SESSIONS_KEY, []);
let scheduleItems = readSaved(SCHEDULE_KEY, starterSchedule);
let scheduleCompletions = readSaved(SCHEDULE_COMPLETIONS_KEY, {});
let overdueRemindersFired = readSaved(SCHEDULE_OVERDUE_FIRED_KEY, {});
let editingScheduleId = null;
let editingTaskId = null;
let alarm = readSaved(ALARM_KEY, null);
let sleepSession = readSaved(SLEEP_KEY, null);
let lastSleep = readSaved("studysprint-last-sleep-v1", null);
let dailyGoalMinutes = readSaved(GOAL_KEY, DAILY_GOAL_MINUTES);
let remindersFired = readSaved(REMINDERS_KEY, {});
let savedDemoProfile = readSaved(PROFILE_KEY, null);
let activeDemoProfile = readSaved(PROFILE_SESSION_KEY, null);
let profileMode = "signup";
let curriculumCardIndex = Math.max(0, Math.min(11, Number(readSaved(CURRICULUM_CARD_KEY, 3)) || 0));
let superchargerSettings = { bionic: true, recall: true, focus: true, ...readSaved(SUPERCHARGERS_KEY, {}) };
let fileDatabasePromise = null;
let savedFiles = [];
let filter = "all";
let timerMode = "focus";
let secondsLeft = TIMER_MINUTES.focus * 60;
let timerIsRunning = false;
let timerInterval = null;
let alarmInterval = null;
let routineReminderInterval = null;
let sleepTicker = null;
let audioContext = null;
let birdsInterval = null;

const $ = (selector) => document.querySelector(selector);
const taskList = $("#task-list");

function getDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function getTodayMinutes() {
  const today = getDateKey(new Date());
  return sessions
    .filter((session) => session.date === today)
    .reduce((total, session) => total + session.minutes, 0);
}

function getWeekData() {
  const week = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const key = getDateKey(date);
    const minutes = sessions
      .filter((session) => session.date === key)
      .reduce((total, session) => total + session.minutes, 0);
    const completedTasks = tasks.filter((task) => task.completedAt && getDateKey(new Date(task.completedAt)) === key).length;
    week.push({
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 2),
      minutes,
      completedTasks,
    });
  }
  return week;
}

function getStreak() {
  const studiedDates = new Set(sessions.map((session) => session.date));
  const cursor = new Date();
  if (!studiedDates.has(getDateKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let days = 0;
  while (studiedDates.has(getDateKey(cursor))) {
    days += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function getSubjectClass(subject) {
  const lowerSubject = subject.toLowerCase();
  if (lowerSubject.includes("css")) return "subject-chip subject-chip--pink";
  if (lowerSubject.includes("javascript") || lowerSubject === "js") return "subject-chip subject-chip--gold";
  if (lowerSubject === "c" || lowerSubject.includes("c language")) return "subject-chip subject-chip--blue";
  return "subject-chip subject-chip--green";
}

function formatDiaryDate(dateValue) {
  if (!dateValue) return "Today";
  const date = new Date(`${dateValue}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function renderTasks() {
  const visibleTasks = tasks.filter((task) => {
    if (filter === "open") return !task.done;
    if (filter === "done") return task.done;
    return true;
  }).sort((a, b) => (a.date || getDateKey(new Date())).localeCompare(b.date || getDateKey(new Date())));

  taskList.innerHTML = "";
  if (visibleTasks.length === 0) {
    const message = filter === "done"
      ? "No finished diary entries yet — your first checkmark is waiting."
      : "Your diary is clear. Add a study or self-care plan when you’re ready.";
    taskList.innerHTML = `<div class="empty-tasks"><span>▤</span><span>${message}</span></div>`;
  } else {
    visibleTasks.forEach((task, index) => {
      const row = document.createElement("div");
      row.className = `task-row diary-row ${task.done ? "task-row--done" : ""}`;

      const checkButton = document.createElement("button");
      checkButton.className = "task-check";
      checkButton.type = "button";
      checkButton.setAttribute("aria-label", task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`);
      checkButton.setAttribute("aria-pressed", String(Boolean(task.done)));
      checkButton.innerHTML = task.done ? "<span class='checked-check'>✓</span>" : "<span class='empty-check'></span>";
      checkButton.addEventListener("click", () => toggleTask(task.id));

      const details = document.createElement("div");
      details.className = "task-detail diary-detail";
      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title;
      const meta = document.createElement("div");
      meta.className = "diary-meta";
      const date = document.createElement("span");
      date.className = "diary-date";
      date.textContent = formatDiaryDate(task.date || getDateKey(new Date()));
      const category = document.createElement("span");
      category.className = getSubjectClass(task.category || task.subject || "Study");
      category.textContent = task.category || task.subject || "Study";
      meta.append(date, category);
      details.append(title, meta);
      if (task.note) {
        const note = document.createElement("span");
        note.className = "diary-note-preview";
        note.textContent = task.note;
        details.append(note);
      }

      const order = document.createElement("span");
      order.className = "task-order";
      order.textContent = String(index + 1).padStart(2, "0");

      const editButton = document.createElement("button");
      editButton.className = "diary-edit";
      editButton.type = "button";
      editButton.setAttribute("aria-label", `Edit ${task.title}`);
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => editTask(task.id));

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-task";
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => deleteTask(task.id));

      row.append(checkButton, details, order, editButton, deleteButton);
      taskList.append(row);
    });
  }

  const completed = tasks.filter((task) => task.done).length;
  const open = tasks.length - completed;
  $("#task-total").textContent = tasks.length;
  $("#nav-task-count").textContent = open;
  $("#filter-all-count").textContent = tasks.length;
  $("#filter-open-count").textContent = open;
  $("#filter-done-count").textContent = completed;
  $("#completed-count").textContent = completed;
  $("#total-count").textContent = tasks.length;
  $("#task-stat-note").textContent = open ? `${open} more to go` : "You're all caught up!";
  $("#task-footer-label").textContent = `${completed} of ${tasks.length} diary entries done`;
  $("#task-progress-fill").style.width = `${tasks.length ? (completed / tasks.length) * 100 : 0}%`;
}

function renderProgress() {
  const todayMinutes = getTodayMinutes();
  const todayPercent = Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100));
  const week = getWeekData();
  const weekTotal = week.reduce((total, day) => total + day.minutes, 0);
  const highestDay = Math.max(30, ...week.map((day) => day.minutes));
  const highestTaskDay = Math.max(3, ...week.map((day) => day.completedTasks));
  const todayKey = getDateKey(new Date());
  const chart = $("#week-chart");

  chart.innerHTML = "";
  week.forEach((day, index) => {
    const dayColumn = document.createElement("div");
    dayColumn.className = `chart-day ${day.key === todayKey ? "chart-day--today" : ""}`;
    const barTrack = document.createElement("div");
    barTrack.className = "bar-track";
    const bar = document.createElement("span");
    bar.className = "bar-fill";
    const height = day.minutes ? Math.max(10, (day.minutes / highestDay) * 100) : 4;
    bar.style.height = `${height}%`;
    bar.title = `${day.minutes} focus minutes`;
    const taskBar = document.createElement("span");
    taskBar.className = "bar-task-fill";
    const taskHeight = day.completedTasks ? Math.max(10, (day.completedTasks / highestTaskDay) * 100) : 4;
    taskBar.style.height = `${taskHeight}%`;
    taskBar.title = `${day.completedTasks} tasks completed`;
    barTrack.append(bar, taskBar);
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = day.label;
    dayColumn.append(barTrack, label);
    if (index === 6) {
      const today = document.createElement("span");
      today.className = "today-marker";
      today.textContent = "today";
      dayColumn.append(today);
    }
    chart.append(dayColumn);
  });

  $("#chart-total").textContent = formatMinutes(weekTotal);
  $("#weekly-time").textContent = formatMinutes(weekTotal);
  $("#chart-caption").textContent = weekTotal
    ? "Nice momentum — keep it gentle."
    : "Complete a focus session and your week will appear here.";
  $("#daily-goal-subtitle").textContent = `${todayMinutes} of ${dailyGoalMinutes} focus minutes`;
  $("#daily-progress-fill").style.width = `${todayPercent}%`;
  $("#daily-progress-percent").textContent = todayPercent;
  $("#sidebar-progress").style.width = `${todayPercent}%`;
  $("#sidebar-goal-minutes").textContent = `${todayMinutes} / ${dailyGoalMinutes} min`;
  $("#sidebar-goal-percent").textContent = `${todayPercent}%`;

  updateAdminOverview(weekTotal);
  const streak = getStreak();
  $("#streak-count").textContent = streak;
  $("#streak-unit").textContent = streak === 1 ? "day" : "days";
  $("#streak-note").textContent = streak ? "Keep your rhythm going" : "Start a session to begin";
}

function showNotice(message) {
  $("#notice-text").textContent = message;
  $("#notice").hidden = false;
  window.clearTimeout(showNotice.timeoutId);
  showNotice.timeoutId = window.setTimeout(() => {
    $("#notice").hidden = true;
  }, 5000);
}

function toggleTask(id) {
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    const done = !task.done;
    return { ...task, done, completedAt: done ? new Date().toISOString() : null };
  });
  saveTasks();
  renderTasks();
  renderProgress();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  renderTasks();
  renderProgress();
}

function resetTaskForm() {
  editingTaskId = null;
  $("#editing-task-id").value = "";
  $("#new-task-input").value = "";
  $("#new-task-date").value = getDateKey(new Date());
  $("#new-task-category").value = "Study";
  $("#new-task-note").value = "";
  $("#save-task-button").textContent = "Save diary entry";
  $("#cancel-task-edit").hidden = true;
}

function editTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  editingTaskId = id;
  $("#editing-task-id").value = id;
  $("#new-task-input").value = task.title;
  $("#new-task-date").value = task.date || getDateKey(new Date());
  $("#new-task-category").value = ["Study", "Self-care", "College", "Personal"].includes(task.category) ? task.category : "Study";
  $("#new-task-note").value = task.note || "";
  $("#save-task-button").textContent = "Update diary entry";
  $("#cancel-task-edit").hidden = false;
  $("#add-task-form").hidden = false;
  $("#add-task-button").setAttribute("aria-expanded", "true");
  $("#new-task-input").focus();
}

function addTask(event) {
  event.preventDefault();
  const title = $("#new-task-input").value.trim();
  if (!title) return;
  const entry = {
    title,
    date: $("#new-task-date").value || getDateKey(new Date()),
    category: $("#new-task-category").value,
    subject: $("#new-task-category").value,
    note: $("#new-task-note").value.trim(),
  };
  if (editingTaskId) {
    tasks = tasks.map((task) => task.id === editingTaskId ? { ...task, ...entry } : task);
    showNotice("Diary entry updated.");
  } else {
    tasks.push({ id: String(Date.now()), ...entry, done: false });
    showNotice("Diary entry saved.");
  }
  saveTasks();
  resetTaskForm();
  $("#add-task-form").hidden = true;
  $("#add-task-button").setAttribute("aria-expanded", "false");
  renderTasks();
  renderProgress();
}

function formatTimer() {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  $("#timer-time").textContent = `${minutes}:${seconds}`;
  $("#timer-caption").textContent = timerIsRunning
    ? "YOU'RE IN THE ZONE"
    : timerMode === "focus" ? "READY WHEN YOU ARE" : "TAKE A BREATH";
  const duration = TIMER_MINUTES[timerMode] * 60;
  const progress = 1 - secondsLeft / duration;
  const circumference = 2 * Math.PI * 77;
  $("#timer-ring-progress").style.strokeDashoffset = `${circumference * (1 - progress)}`;
  $("#timer-control-icon").textContent = timerIsRunning ? "Ⅱ" : "▶";
  $("#timer-control-label").textContent = timerIsRunning ? "Pause session" : "Start focusing";
}

function setTimerMode(nextMode) {
  timerMode = nextMode;
  pauseTimer();
  secondsLeft = TIMER_MINUTES[timerMode] * 60;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("mode-tab--active", button.dataset.mode === timerMode);
  });
  formatTimer();
  $("#notice").hidden = true;
}

function pauseTimer() {
  timerIsRunning = false;
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  formatTimer();
}

function completeTimer() {
  pauseTimer();
  if (timerMode === "focus") {
    sessions.push({ date: getDateKey(new Date()), minutes: TIMER_MINUTES.focus });
    saveSessions();
    renderProgress();
    showNotice("Lovely work. You finished a 25-minute focus session!");
  } else {
    showNotice("Break complete. Ready when you are.");
  }
  secondsLeft = TIMER_MINUTES[timerMode] * 60;
  formatTimer();
}

function startOrPauseTimer() {
  if (timerIsRunning) {
    pauseTimer();
    return;
  }
  timerIsRunning = true;
  formatTimer();
  timerInterval = window.setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      secondsLeft = 0;
      formatTimer();
      completeTimer();
    } else {
      formatTimer();
    }
  }, 1000);
}

function resetTimer() {
  pauseTimer();
  secondsLeft = TIMER_MINUTES[timerMode] * 60;
  $("#notice").hidden = true;
  formatTimer();
}

// All timetable times use 24-hour GMT/UTC values such as "07:30".
function saveSchedule() {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduleItems));
}

function saveScheduleCompletions() {
  localStorage.setItem(SCHEDULE_COMPLETIONS_KEY, JSON.stringify(scheduleCompletions));
}

function getTodayScheduleCompletions() {
  const today = getDateKey(new Date());
  if (!Array.isArray(scheduleCompletions[today])) scheduleCompletions[today] = [];
  return scheduleCompletions[today];
}

function isScheduleItemDone(id) {
  return getTodayScheduleCompletions().includes(id);
}

function toggleScheduleCompletion(id) {
  const today = getDateKey(new Date());
  const completed = getTodayScheduleCompletions();
  scheduleCompletions[today] = completed.includes(id)
    ? completed.filter((itemId) => itemId !== id)
    : [...completed, id];
  saveScheduleCompletions();
  renderSchedule();
  updateAdminOverview();
  showNotice(scheduleCompletions[today].includes(id) ? "Routine activity marked complete." : "Routine activity marked not done yet.");
}

function renderSchedule() {
  const list = $("#schedule-list");
  list.innerHTML = "";
  scheduleItems.sort((a, b) => a.time.localeCompare(b.time));

  if (scheduleItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "schedule-empty";
    empty.textContent = "Your daily plan is empty. Add a study, meal, break, or self-care activity.";
    list.append(empty);
    return;
  }

  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nextIndex = scheduleItems.findIndex((item) => {
    const [hour, minute] = item.time.split(":").map(Number);
    return hour * 60 + minute >= currentMinutes && !isScheduleItemDone(item.id);
  });
  const nextScheduledIndex = nextIndex === -1 ? -1 : nextIndex;
  const nextIsTomorrow = nextIndex === -1 && scheduleItems.some((item) => !isScheduleItemDone(item.id));

  scheduleItems.forEach((item, index) => {
    const [hour, minute] = item.time.split(":").map(Number);
    const eventMinutes = hour * 60 + minute;
    const done = isScheduleItemDone(item.id);
    const isNext = index === nextScheduledIndex;
    const isCurrent = eventMinutes === currentMinutes && !done;
    const isOverdue = eventMinutes < currentMinutes && !done;
    const row = document.createElement("div");
    row.className = `schedule-row ${isNext ? "schedule-row--next" : ""} ${done ? "schedule-row--done" : ""} ${isOverdue ? "schedule-row--overdue" : ""}`;

    const checkButton = document.createElement("button");
    checkButton.className = `schedule-check ${done ? "schedule-check--done" : ""}`;
    checkButton.type = "button";
    checkButton.setAttribute("aria-label", done ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`);
    checkButton.setAttribute("aria-pressed", String(done));
    checkButton.innerHTML = done ? "✓" : "";
    checkButton.addEventListener("click", () => toggleScheduleCompletion(item.id));

    const time = document.createElement("time");
    time.className = "schedule-time";
    time.textContent = `${item.time} GMT`;

    const marker = document.createElement("span");
    marker.className = `schedule-marker schedule-marker--${item.type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    marker.setAttribute("aria-hidden", "true");

    const description = document.createElement("div");
    description.className = "schedule-description";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const kind = document.createElement("span");
    kind.className = "schedule-kind";
    kind.textContent = done ? "Completed today" : isCurrent ? "Now" : isNext ? (nextIsTomorrow ? "Tomorrow" : "Next up") : isOverdue ? "Still to do" : item.type;
    description.append(title, kind);

    const reminderButton = document.createElement("button");
    reminderButton.className = `schedule-reminder ${item.reminder ? "schedule-reminder--on" : ""}`;
    reminderButton.type = "button";
    reminderButton.textContent = item.reminder ? "🔔 On" : "Remind";
    reminderButton.setAttribute("aria-label", item.reminder ? `Turn off reminder for ${item.title}` : `Set reminder for ${item.title}`);
    reminderButton.setAttribute("aria-pressed", String(Boolean(item.reminder)));
    reminderButton.addEventListener("click", () => toggleScheduleReminder(item.id));

    const editButton = document.createElement("button");
    editButton.className = "schedule-edit";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${item.title} in timetable`);
    editButton.addEventListener("click", () => editScheduleItem(item.id));

    const removeButton = document.createElement("button");
    removeButton.className = "schedule-delete";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${item.title} from timetable`);
    removeButton.addEventListener("click", () => removeScheduleItem(item.id));

    row.append(checkButton, time, marker, description, reminderButton, editButton, removeButton);
    list.append(row);
  });
}

function resetScheduleForm() {
  editingScheduleId = null;
  $("#editing-event-id").value = "";
  $("#event-time").value = "16:00";
  $("#event-title").value = "";
  $("#event-type").value = "Study";
  $("#event-reminder").checked = false;
  $("#save-event-button").textContent = "Add to timetable";
  $("#cancel-event-edit").hidden = true;
}

function editScheduleItem(id) {
  const item = scheduleItems.find((entry) => entry.id === id);
  if (!item) return;
  editingScheduleId = id;
  $("#editing-event-id").value = id;
  $("#event-time").value = item.time;
  $("#event-title").value = item.title;
  $("#event-type").value = ["Study", "Self-care", "Breakfast", "Lunch", "Dinner", "Break", "Other"].includes(item.type) ? item.type : "Other";
  $("#event-reminder").checked = Boolean(item.reminder);
  $("#save-event-button").textContent = "Save changes";
  $("#cancel-event-edit").hidden = false;
  $("#schedule-form").hidden = false;
  $("#add-event-button").setAttribute("aria-expanded", "true");
  $("#event-title").focus();
}

function clearTodayReminderFlags(id) {
  const todayPrefix = `${getDateKey(new Date())}:${id}:`;
  Object.keys(remindersFired).forEach((key) => { if (key.startsWith(todayPrefix)) delete remindersFired[key]; });
  Object.keys(overdueRemindersFired).forEach((key) => { if (key.startsWith(todayPrefix)) delete overdueRemindersFired[key]; });
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(remindersFired));
  localStorage.setItem(SCHEDULE_OVERDUE_FIRED_KEY, JSON.stringify(overdueRemindersFired));
}

function toggleScheduleReminder(id) {
  scheduleItems = scheduleItems.map((item) => item.id === id ? { ...item, reminder: !item.reminder } : item);
  saveSchedule();
  renderSchedule();
  const item = scheduleItems.find((entry) => entry.id === id);
  if (item && item.reminder) {
    showNotice("Daily reminder set. Allow browser notifications and keep StudySprint open for alerts.");
  } else {
    showNotice("Reminder turned off for this activity.");
  }
  updateAdminOverview();
}

function addScheduleItem(event) {
  event.preventDefault();
  const time = $("#event-time").value;
  const title = $("#event-title").value.trim();
  const type = $("#event-type").value;
  const reminder = $("#event-reminder").checked;
  if (!time || !title) return;

  if (editingScheduleId) {
    scheduleItems = scheduleItems.map((item) => item.id === editingScheduleId ? { ...item, time, title, type, reminder } : item);
    const today = getDateKey(new Date());
    scheduleCompletions[today] = getTodayScheduleCompletions().filter((itemId) => itemId !== editingScheduleId);
    saveScheduleCompletions();
    clearTodayReminderFlags(editingScheduleId);
    showNotice("Timetable activity updated. Its today checkmark was reset.");
  } else {
    scheduleItems.push({ id: String(Date.now()), time, title, type, reminder });
    showNotice("Activity added to your repeating daily timetable.");
  }
  saveSchedule();
  renderSchedule();
  resetScheduleForm();
  $("#schedule-form").hidden = true;
  $("#add-event-button").setAttribute("aria-expanded", "false");
  updateAdminOverview();
}

function removeScheduleItem(id) {
  scheduleItems = scheduleItems.filter((item) => item.id !== id);
  const today = getDateKey(new Date());
  scheduleCompletions[today] = getTodayScheduleCompletions().filter((itemId) => itemId !== id);
  clearTodayReminderFlags(id);
  saveScheduleCompletions();
  saveSchedule();
  renderSchedule();
  updateAdminOverview();
}

function fireRoutineAlert(title, body) {
  showNotice(`${title}: ${body}`);
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: `studysprint-${Date.now()}` });
  } catch (error) {
    console.info("StudySprint could not show a browser notification:", error);
  }
}

function checkRoutineReminders() {
  const now = new Date();
  const today = getDateKey(now);
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const doneToday = getTodayScheduleCompletions();
  let updatedDue = false;
  let updatedOverdue = false;

  scheduleItems.forEach((item) => {
    if (!item.reminder || doneToday.includes(item.id)) return;
    const [hour, minute] = item.time.split(":").map(Number);
    const eventMinutes = hour * 60 + minute;
    const ageMinutes = currentMinutes - eventMinutes;
    const dueKey = `${today}:${item.id}:due`;
    const overdueKey = `${today}:${item.id}:overdue`;

    // Catch the due alert for a few minutes if the page was briefly backgrounded.
    if (ageMinutes >= 0 && ageMinutes < 5 && !remindersFired[dueKey]) {
      remindersFired[dueKey] = true;
      updatedDue = true;
      fireRoutineAlert("StudySprint timetable", `${item.title} is scheduled now (${item.time} GMT). Tap its circle when you finish.`);
    }
    // One kind follow-up, sent once, 15 minutes after an unchecked activity.
    if (ageMinutes >= 15 && !overdueRemindersFired[overdueKey]) {
      overdueRemindersFired[overdueKey] = true;
      updatedOverdue = true;
      fireRoutineAlert("StudySprint check-in", `${item.title} is still unchecked. Take a moment to do it, reschedule, or adjust your plan.`);
    }
  });

  if (updatedDue) localStorage.setItem(REMINDERS_KEY, JSON.stringify(remindersFired));
  if (updatedOverdue) localStorage.setItem(SCHEDULE_OVERDUE_FIRED_KEY, JSON.stringify(overdueRemindersFired));
  updateAdminOverview();
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

// A short, rising two-note oscillator chirp; it needs no downloaded sound file.
function playBirdChirp() {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const start = context.currentTime;

  [0, 0.24, 0.56].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const chirpStart = start + offset;
    const baseFrequency = 1900 + index * 100;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(baseFrequency, chirpStart);
    oscillator.frequency.linearRampToValueAtTime(baseFrequency + 750, chirpStart + 0.09);
    oscillator.frequency.linearRampToValueAtTime(baseFrequency + 260, chirpStart + 0.2);

    volume.gain.setValueAtTime(0.0001, chirpStart);
    volume.gain.linearRampToValueAtTime(0.075, chirpStart + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, chirpStart + 0.22);

    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(chirpStart);
    oscillator.stop(chirpStart + 0.23);
  });
}

async function startBirdsong() {
  const context = getAudioContext();
  if (!context) {
    showNotice("This browser does not support the generated birdsong sound.");
    return;
  }
  try {
    if (context.state === "suspended") await context.resume();
  } catch (error) {
    showNotice("Allow sound in your browser, then try the birdsong again.");
    return;
  }
  if (context.state !== "running") {
    showNotice("Allow sound in your browser, then try the birdsong again.");
    return;
  }
  stopBirdsong();
  playBirdChirp();
  birdsInterval = window.setInterval(playBirdChirp, 1450);
  $("#test-birds").hidden = true;
  $("#stop-birds").hidden = false;
}

function stopBirdsong() {
  if (birdsInterval) window.clearInterval(birdsInterval);
  birdsInterval = null;
  $("#test-birds").hidden = false;
  $("#stop-birds").hidden = true;
}

function renderAlarmStatus(message) {
  const status = $("#alarm-status");
  if (message) {
    status.textContent = message;
    return;
  }
  if (!alarm || !alarm.enabled) {
    status.textContent = "No alarm set.";
    return;
  }
  status.textContent = `Daily alarm set for ${alarm.time} GMT.`;
  $("#alarm-time").value = alarm.time;
}

function setAlarm() {
  const time = $("#alarm-time").value;
  if (!time) {
    renderAlarmStatus("Choose a time first.");
    return;
  }

  const now = new Date();
  const [hour, minute] = time.split(":").map(Number);
  const selectedMinutes = hour * 60 + minute;
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const today = getDateKey(now);
  alarm = { time, enabled: true, lastFiredDate: selectedMinutes <= currentMinutes ? today : null };
  localStorage.setItem(ALARM_KEY, JSON.stringify(alarm));
  const context = getAudioContext();
  if (context && context.state === "suspended") context.resume(); // A user click unlocks audio in browsers that require it.
  renderAlarmStatus(`Daily alarm set for ${time} GMT. Keep this page open for it to ring.`);
  $("#cancel-alarm").hidden = false;
}

function cancelAlarm() {
  alarm = null;
  localStorage.removeItem(ALARM_KEY);
  stopBirdsong();
  renderAlarmStatus("Alarm cancelled.");
  $("#cancel-alarm").hidden = true;
}

function checkAlarm() {
  if (!alarm || !alarm.enabled) return;
  const now = new Date();
  const today = getDateKey(now);
  const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

  if (currentTime >= alarm.time && alarm.lastFiredDate !== today) {
    alarm.lastFiredDate = today;
    localStorage.setItem(ALARM_KEY, JSON.stringify(alarm));
    renderAlarmStatus(`Your alarm is ringing — ${alarm.time} GMT.`);
    startBirdsong();
    showNotice(`Time for your StudySprint reminder (${alarm.time} GMT).`);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("StudySprint alarm", { body: `Your reminder is ringing (${alarm.time} GMT).` });
    }
  }
}

function enableNotifications() {
  if (!("Notification" in window)) {
    renderAlarmStatus("This browser does not support pop-up notifications. In-page reminders still work while StudySprint is open.");
    showNotice("Pop-up notifications are not supported here; keep StudySprint open for in-page reminders.");
    return;
  }
  Notification.requestPermission().then((permission) => {
    renderAlarmStatus(permission === "granted"
      ? "Browser reminders enabled. Keep StudySprint open; mobile push after closing this page is not available in this demo."
      : "Pop-ups were not enabled. In-page reminders still work while the page is open.");
    showNotice(permission === "granted" ? "Browser notifications enabled for timetable check-ins." : "Browser permission was not granted; in-page reminders remain available.");
  });
}

function formatSleepDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatGMTDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date) + " GMT";
}

function renderSleep() {
  const status = $("#sleep-status");
  if (sleepSession && sleepSession.startedAt) {
    const start = new Date(sleepSession.startedAt);
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
    status.textContent = `Sleep started ${formatGMTDateTime(start)} · ${formatSleepDuration(elapsedMinutes)} so far`;
    $("#start-sleep").hidden = true;
    $("#end-sleep").hidden = false;
  } else {
    status.textContent = "No sleep session running.";
    $("#start-sleep").hidden = false;
    $("#end-sleep").hidden = true;
  }

  if (lastSleep && lastSleep.startedAt && lastSleep.endedAt) {
    const start = new Date(lastSleep.startedAt);
    const end = new Date(lastSleep.endedAt);
    $("#sleep-last").textContent = `Last session: ${formatSleepDuration(lastSleep.minutes)} · ${formatGMTDateTime(start)} to ${formatGMTDateTime(end)}`;
  } else {
    $("#sleep-last").textContent = "Your last sleep duration will appear here.";
  }
}

function startSleep() {
  sleepSession = { startedAt: new Date().toISOString() };
  localStorage.setItem(SLEEP_KEY, JSON.stringify(sleepSession));
  renderSleep();
  if (sleepTicker) window.clearInterval(sleepTicker);
  sleepTicker = window.setInterval(renderSleep, 60000);
}

function endSleep() {
  if (!sleepSession || !sleepSession.startedAt) return;
  const endedAt = new Date().toISOString();
  const startedAt = new Date(sleepSession.startedAt);
  const minutes = Math.max(0, Math.round((Date.parse(endedAt) - startedAt.getTime()) / 60000));
  lastSleep = { startedAt: sleepSession.startedAt, endedAt, minutes };
  localStorage.setItem("studysprint-last-sleep-v1", JSON.stringify(lastSleep));
  localStorage.removeItem(SLEEP_KEY);
  sleepSession = null;
  if (sleepTicker) window.clearInterval(sleepTicker);
  sleepTicker = null;
  renderSleep();
  showNotice(`Sleep session saved: ${formatSleepDuration(minutes)}.`);
}

const helperLessons = [
  { subject: "C", terms: /\b(variable|variables|int|float|char|data type)\b/i, title: "C variables", text: "A variable is a named place where your program stores a value. Pick a type that matches the value, then give the variable a clear name.", code: "int age = 18;\nfloat marks = 92.5f;\nchar grade = 'A';" },
  { subject: "C", terms: /\b(if|else|condition|conditional)\b/i, title: "C if/else", text: "An if statement checks a condition. The first block runs when it is true; else runs when it is false.", code: "if (marks >= 40) {\n    printf(\"Pass\");\n} else {\n    printf(\"Try again\");\n}" },
  { subject: "C", terms: /\b(for loop|while loop|loop|iteration|repeat)\b/i, title: "C loops", text: "A loop repeats code. A for loop is handy when you know the number of repetitions. Change the counter so the loop eventually stops.", code: "for (int i = 0; i < 5; i++) {\n    printf(\"%d\", i);\n}" },
  { subject: "C", terms: /\b(function|parameter|return)\b/i, title: "C functions", text: "A function is a reusable block of code. Its return type says what kind of value it gives back; void means it returns no value.", code: "int add(int a, int b) {\n    return a + b;\n}" },
  { subject: "C", terms: /\b(array|arrays)\b/i, title: "C arrays", text: "An array stores several values of one type under one name. Indexing starts at zero, so the first item is at position 0.", code: "int scores[3] = {80, 90, 75};\nprintf(\"%d\", scores[0]);" },
  { subject: "C", terms: /\b(pointer|pointers|address)\b/i, title: "C pointers", text: "A pointer stores the memory address of another variable. The & operator gets an address; * reads the value at an address. Practice carefully and initialize pointers before using them.", code: "int number = 7;\nint *pointer = &number;\nprintf(\"%d\", *pointer);" },
  { subject: "HTML", terms: /\b(tag|tags|element|elements|structure|html)\b/i, title: "HTML elements", text: "HTML describes what content is on a page. Most elements have an opening tag, content, and a closing tag. Use headings in order and add labels to form fields.", code: "<h1>My study page</h1>\n<p>I am learning HTML.</p>" },
  { subject: "CSS", terms: /\b(flexbox|flex|align|justify)\b/i, title: "CSS Flexbox", text: "Flexbox arranges items along a row or column. display:flex turns it on; justify-content positions items along the main axis, while align-items handles the cross axis.", code: ".row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}" },
  { subject: "CSS", terms: /\b(box model|margin|padding|border)\b/i, title: "The CSS box model", text: "Every element is a box: content, padding inside the border, border, then margin outside. box-sizing:border-box makes sizing easier to reason about.", code: "* { box-sizing: border-box; }\n.card { padding: 16px; margin: 12px; }" },
  { subject: "CSS", terms: /\b(grid|columns|rows)\b/i, title: "CSS Grid", text: "Grid lays things out in rows and columns. Define the columns on a parent, then put each card inside it.", code: ".cards {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 16px;\n}" },
  { subject: "CSS", terms: /\b(responsive|mobile|media query)\b/i, title: "Responsive CSS", text: "A media query applies styles only when the screen meets a condition. Start with a simple one-column layout, then add columns for wider screens.", code: "@media (min-width: 700px) {\n  .cards { grid-template-columns: repeat(2, 1fr); }\n}" },
  { subject: "JavaScript", terms: /\b(variable|variables|let|const)\b/i, title: "JavaScript variables", text: "Use const when you will not reassign the variable. Use let when its value needs to change. Keep names clear so you can read your code later.", code: "const subject = \"Web development\";\nlet minutesStudied = 0;\nminutesStudied = minutesStudied + 25;" },
  { subject: "JavaScript", terms: /\b(for loop|while loop|loop|iteration|repeat)\b/i, title: "JavaScript loops", text: "A loop repeats instructions. A for loop has a starting value, a condition, and an update. Make sure the condition eventually becomes false.", code: "for (let i = 0; i < 5; i++) {\n  console.log(i);\n}" },
  { subject: "JavaScript", terms: /\b(function|parameter|return)\b/i, title: "JavaScript functions", text: "A function is a named set of steps you can reuse. Parameters are inputs; return sends a result back to the caller.", code: "function add(a, b) {\n  return a + b;\n}\nconsole.log(add(2, 3));" },
  { subject: "JavaScript", terms: /\b(array|arrays)\b/i, title: "JavaScript arrays", text: "An array keeps an ordered list of values. Positions start at zero, and length tells you how many values it has.", code: "const subjects = [\"HTML\", \"CSS\", \"JavaScript\"];\nconsole.log(subjects[0]);" },
  { subject: "JavaScript", terms: /\b(dom|button|click|event|events|html page)\b/i, title: "JavaScript and the page (DOM)", text: "The DOM is the browser's object version of your HTML. Select an element, then add an event listener to respond when someone clicks it.", code: "const button = document.querySelector(\"button\");\nbutton.addEventListener(\"click\", () => {\n  alert(\"You clicked!\");\n});" },
];

function answerStudyQuestion(event) {
  event.preventDefault();
  const question = $("#helper-question").value.trim();
  const subject = $("#helper-subject").value;
  const answer = $("#helper-answer");
  const lesson = helperLessons.find((item) => item.subject === subject && item.terms.test(question));
  const title = answer.querySelector("strong");
  const body = answer.querySelector("p");
  const code = answer.querySelector("pre");

  if (!lesson) {
    title.textContent = "Try asking about a smaller beginner topic";
    body.textContent = `This offline helper has prepared ${subject} lessons for variables, conditions, loops, functions, and common basics. It is not a live AI and cannot answer every question. Try asking “What is a loop?”`;
    code.hidden = true;
    code.textContent = "";
    return;
  }

  title.textContent = lesson.title;
  body.textContent = lesson.text;
  code.textContent = lesson.code;
  code.hidden = false;
}

function safeEmail(value) {
  return value.trim().toLowerCase();
}

function setProfileMode(mode) {
  profileMode = mode;
  document.querySelectorAll("[data-profile-mode]").forEach((button) => {
    button.classList.toggle("profile-mode--active", button.dataset.profileMode === mode);
  });
  const signup = mode === "signup";
  $("#profile-name-label").hidden = !signup;
  $("#profile-name").required = signup;
  $("#profile-submit").textContent = signup ? "Create demo profile" : "Sign in (demo)";
  if (!signup && savedDemoProfile) $("#profile-email").value = savedDemoProfile.email;
}

function renderProfile() {
  const hasSession = Boolean(activeDemoProfile && activeDemoProfile.email);
  $("#profile-form").hidden = hasSession;
  $("#profile-signout").hidden = !hasSession;
  document.querySelectorAll("[data-profile-mode]").forEach((button) => { button.disabled = hasSession; });
  if (hasSession) {
    const name = activeDemoProfile.name || activeDemoProfile.email.split("@")[0];
    $("#profile-greeting").textContent = `Hello, ${name}`;
    $("#profile-status").textContent = `Demo session active for ${activeDemoProfile.email}. This is only a local label, not a verified account.`;
    $("#profile-avatar-large").textContent = name.slice(0, 1).toUpperCase();
    $(".avatar").textContent = name.slice(0, 1).toUpperCase();
    $("#admin-profile-status").textContent = "Demo profile active";
  } else {
    $("#profile-greeting").textContent = savedDemoProfile ? "Welcome back" : "Welcome to StudySprint";
    $("#profile-status").textContent = savedDemoProfile
      ? "Sign in with the same email label to resume this browser demo. No password is used."
      : "Sign up to create a demo profile, or sign in to the saved demo profile on this browser.";
    $("#profile-avatar-large").textContent = "S";
    $(".avatar").textContent = "S";
    $("#admin-profile-status").textContent = "Signed out";
  }
  updateAdminOverview();
}

function submitDemoProfile(event) {
  event.preventDefault();
  const email = safeEmail($("#profile-email").value);
  const name = $("#profile-name").value.trim();
  if (!email) return;

  if (profileMode === "signup") {
    if (savedDemoProfile && savedDemoProfile.email !== email) {
      showNotice("This local demo supports one profile label per browser. Use the existing email label to sign in.");
      return;
    }
    savedDemoProfile = { name: name || email.split("@")[0], email, createdAt: new Date().toISOString() };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(savedDemoProfile));
  } else {
    if (!savedDemoProfile || savedDemoProfile.email !== email) {
      showNotice("No matching demo profile on this browser. Create a demo profile first.");
      return;
    }
    if (name) savedDemoProfile.name = name;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(savedDemoProfile));
  }

  activeDemoProfile = { name: savedDemoProfile.name, email: savedDemoProfile.email };
  localStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify(activeDemoProfile));
  renderProfile();
  showNotice("Demo profile opened on this browser. It is not a secure account.");
}

function signOutDemoProfile() {
  activeDemoProfile = null;
  localStorage.removeItem(PROFILE_SESSION_KEY);
  renderProfile();
  showNotice("Signed out of the demo profile. Your local files and study data remain on this device.");
}

function openFileDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("This browser does not support local file storage."));
  if (fileDatabasePromise) return fileDatabasePromise;
  fileDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) database.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser file storage."));
    request.onblocked = () => reject(new Error("Close other StudySprint tabs, then try again."));
  });
  return fileDatabasePromise;
}

async function getAllSavedFiles() {
  const database = await openFileDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(FILE_STORE_NAME, "readonly").objectStore(FILE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Could not list saved files."));
  });
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshSavedFiles(message) {
  try {
    savedFiles = await getAllSavedFiles();
    savedFiles.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    renderSavedFiles();
    setFileStatus(message || `${savedFiles.length} saved file${savedFiles.length === 1 ? "" : "s"} on this browser. Nothing was uploaded.`);
  } catch (error) {
    setFileStatus(error.message || "Local file storage is unavailable in this browser.", true);
  }
}

function setFileStatus(message, isError = false) {
  const status = $("#file-storage-status");
  status.textContent = message;
  status.classList.toggle("file-storage-status--error", isError);
}

function renderSavedFiles() {
  const list = $("#file-list");
  list.innerHTML = "";
  $("#file-count").textContent = savedFiles.length;
  $("#admin-file-count").textContent = savedFiles.length;

  if (savedFiles.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-empty";
    empty.textContent = "No saved files yet. Choose files or a folder to start.";
    list.append(empty);
    return;
  }

  savedFiles.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = file.type && file.type.startsWith("image/") ? "▧" : "▤";
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const location = document.createElement("span");
    location.textContent = file.relativePath || "Saved from this PC";
    meta.append(name, location);
    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = humanFileSize(file.size || 0);
    const download = document.createElement("button");
    download.className = "file-action";
    download.type = "button";
    download.textContent = "Download";
    download.addEventListener("click", () => downloadSavedFile(file.id));
    const remove = document.createElement("button");
    remove.className = "file-action file-action--delete";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove the saved copy of ${file.name}`);
    remove.addEventListener("click", () => deleteSavedFile(file.id));
    row.append(icon, meta, size, download, remove);
    list.append(row);
  });
}

async function saveFilesFromComputer(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > 100) {
    setFileStatus("Choose up to 100 files at a time.", true);
    return;
  }
  if (totalBytes > 100 * 1024 * 1024) {
    setFileStatus("This selection is over 100 MB. Choose a smaller group to fit browser storage.", true);
    return;
  }

  setFileStatus(`Saving ${files.length} file${files.length === 1 ? "" : "s"} in this browser…`);
  try {
    const database = await openFileDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(FILE_STORE_NAME);
      files.forEach((file) => {
        const id = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        store.put({
          id,
          name: file.name,
          relativePath: file.webkitRelativePath || "",
          size: file.size,
          type: file.type || "application/octet-stream",
          lastModified: file.lastModified,
          addedAt: new Date().toISOString(),
          blob: file,
        });
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save these files."));
      transaction.onabort = () => reject(transaction.error || new Error("The browser cancelled this save."));
    });
    await refreshSavedFiles(`${files.length} file${files.length === 1 ? "" : "s"} saved locally. No file was uploaded.`);
  } catch (error) {
    setFileStatus(`Could not save these files: ${error.message || "browser storage is full or unavailable"}`, true);
  }
}

async function downloadSavedFile(id) {
  try {
    const database = await openFileDatabase();
    const record = await new Promise((resolve, reject) => {
      const request = database.transaction(FILE_STORE_NAME, "readonly").objectStore(FILE_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!record || !record.blob) throw new Error("Saved file not found.");
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = record.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    setFileStatus(`Could not download the file: ${error.message}`, true);
  }
}

async function deleteSavedFile(id) {
  try {
    const database = await openFileDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
      transaction.objectStore(FILE_STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    await refreshSavedFiles("Saved copy removed from this browser. The original PC file is unchanged.");
  } catch (error) {
    setFileStatus(`Could not remove the saved copy: ${error.message}`, true);
  }
}

function updateAdminOverview(weekTotal) {
  const todayKey = getDateKey(new Date());
  const doneToday = tasks.filter((task) => task.done && task.completedAt && getDateKey(new Date(task.completedAt)) === todayKey).length;
  const focusToday = getTodayMinutes();
  const totalWeek = typeof weekTotal === "number"
    ? weekTotal
    : getWeekData().reduce((sum, day) => sum + day.minutes, 0);
  $("#admin-today-focus").textContent = formatMinutes(focusToday);
  $("#admin-today-tasks").textContent = doneToday;
  $("#admin-week-focus").textContent = formatMinutes(totalWeek);
  $("#admin-file-count").textContent = savedFiles.length;
  $("#admin-reminder-count").textContent = scheduleItems.filter((item) => item.reminder).length;
  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const upcoming = scheduleItems.filter((item) => item.reminder).map((item) => {
    const [hour, minute] = item.time.split(":").map(Number);
    const at = hour * 60 + minute;
    return { item, at, delta: (at - nowMinutes + 1440) % 1440, tomorrow: at < nowMinutes };
  }).sort((a, b) => a.delta - b.delta)[0];
  $("#admin-next-reminder").textContent = upcoming
    ? `${upcoming.tomorrow ? "Tomorrow " : ""}${upcoming.item.time} GMT`
    : "None set";
}

const curriculumCards = [
  { topic:"WEB FOUNDATIONS", title:"Your first HTML page", summary:"Build the page skeleton with headings, paragraphs, links, and images.", question:"What does HTML describe in a web page?", recall:"HTML describes the meaning and structure of content in the browser." },
  { topic:"WEB FOUNDATIONS", title:"Semantic page structure", summary:"Use header, main, nav, section, and footer to make page regions clear.", question:"Why use semantic elements such as main and nav?", recall:"Semantic tags tell browsers and assistive tools what each region is for." },
  { topic:"STYLE SYSTEMS", title:"CSS selectors and cascade", summary:"Choose elements with selectors, then use the cascade to keep styles predictable.", question:"What helps the browser choose between conflicting CSS rules?", recall:"Specificity and source order help the browser choose a winning style rule." },
  { topic:"WEB LAYOUT", title:"Responsive layouts", summary:"Learn how flexible grids and breakpoints help one page work on both a laptop and a phone.", question:"What does a CSS media query let you do?", recall:"A CSS media query applies styles only when its screen condition is met." },
  { topic:"STYLE SYSTEMS", title:"Color, type, and spacing", summary:"Create visual hierarchy by repeating a small, consistent set of design tokens.", question:"What is a design token?", recall:"Design tokens are named values for colors, spacing, type, and other repeated styles." },
  { topic:"JAVASCRIPT BASICS", title:"Variables and values", summary:"Store information with const and let, then choose a useful data type.", question:"When should you use let instead of const?", recall:"Use const by default; use let only when you need to reassign the variable." },
  { topic:"JAVASCRIPT BASICS", title:"Events and interactions", summary:"Listen for a click or form submit and make the page respond to the user.", question:"What makes an event listener run?", recall:"An event listener runs a function when an event such as click occurs." },
  { topic:"JAVASCRIPT BASICS", title:"Updating the page with DOM", summary:"Select an element and change its text, classes, or attributes with JavaScript.", question:"What does DOM stand for in front-end development?", recall:"The DOM is the browser's object model of the document's HTML elements." },
  { topic:"JAVASCRIPT BASICS", title:"Arrays and reusable functions", summary:"Group related values in arrays and split repeated logic into small functions.", question:"At which index does a JavaScript array begin?", recall:"An array is an ordered list; its first element is at index zero." },
  { topic:"C FOUNDATIONS", title:"C variables and types", summary:"Practice int, float, and char with clear names and a matching value type.", question:"What does a variable's type describe in C?", recall:"A variable is a named place to store a value; its type describes that value." },
  { topic:"C FOUNDATIONS", title:"Conditions and loops", summary:"Make decisions with if/else, then repeat steps with a loop that eventually ends.", question:"What must be true for a loop to stop normally?", recall:"A loop needs a condition that eventually becomes false so it can stop." },
  { topic:"SPRINT PROJECT", title:"Build and explain your project", summary:"Combine your page, styles, and interactions, then describe how each part works.", question:"What are the three core front-end technologies and what does each contribute?", recall:"HTML structures content, CSS styles it, and JavaScript adds behavior." },
];

function renderCurriculumCard() {
  const card = curriculumCards[curriculumCardIndex];
  const number = curriculumCardIndex + 1;
  $("#curriculum-card-number").textContent = number;
  $("#curriculum-topic").textContent = `${card.topic} · CARD ${String(number).padStart(2, "0")}`;
  $("#curriculum-title").textContent = card.title;
  $("#curriculum-summary").textContent = card.summary;
  $("#curriculum-progress-fill").style.width = `${(number / curriculumCards.length) * 100}%`;
  $("#curriculum-previous").disabled = curriculumCardIndex === 0;
  $("#curriculum-next").disabled = curriculumCardIndex === curriculumCards.length - 1;
  const recallQuiz = $("#recall-quiz");
  recallQuiz.querySelector(".recall-label").textContent = `QUICK RECALL · ${card.topic.split(" ")[0]}`;
  recallQuiz.querySelector("p").textContent = card.question;
  $("#recall-answer").textContent = card.recall;
  $("#recall-answer").hidden = true;
  $("#recall-reveal").setAttribute("aria-expanded", "false");
  $("#recall-reveal").textContent = "Reveal answer";
}

function applySuperchargerSettings() {
  document.body.classList.toggle("bionic-reading", Boolean(superchargerSettings.bionic));
  document.body.classList.toggle("focus-lane-active", Boolean(superchargerSettings.focus));
  document.querySelectorAll("[data-supercharger]").forEach((button) => {
    const enabled = Boolean(superchargerSettings[button.dataset.supercharger]);
    button.setAttribute("aria-checked", String(enabled));
    button.classList.toggle("super-toggle--on", enabled);
  });
  $("#recall-quiz").hidden = !superchargerSettings.recall;
  $("#supercharger-active-count").textContent = Object.values(superchargerSettings).filter(Boolean).length;
}

function toggleSupercharger(name) {
  superchargerSettings[name] = !superchargerSettings[name];
  localStorage.setItem(SUPERCHARGERS_KEY, JSON.stringify(superchargerSettings));
  applySuperchargerSettings();
  const label = ({ bionic: "Bionic Reading Mode", recall: "Active Recall Injections", focus: "Focus Lane" })[name];
  showNotice(`${label} ${superchargerSettings[name] ? "enabled" : "disabled"}.`);
}


const APP_PAGE_TITLES = {
  today: "Today",
  sprint: "Sprint path",
  tasks: "To Do diary",
  focus: "Focus room",
  alarm: "Daily alarm",
  progress: "My progress",
  timetable: "Daily timetable",
  sleep: "Sleep session",
  "study-helper": "Study helper",
  files: "Important files",
  admin: "Profile & admin demo",
};

function setActivePage(page, { scroll = true } = {}) {
  const safePage = APP_PAGE_TITLES[page] ? page : "today";
  document.body.dataset.activePage = safePage;
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== safePage;
  });
  const dashboardViews = new Set(["tasks", "focus", "alarm", "progress", "timetable", "sleep", "study-helper", "files", "admin"]);
  $("#dashboard-grid").hidden = !dashboardViews.has(safePage);
  document.querySelectorAll("[data-app-page]").forEach((link) => {
    const active = link.dataset.appPage === safePage;
    link.classList.toggle("nav-link--active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $("#current-page-title").textContent = APP_PAGE_TITLES[safePage];
  if (scroll) window.scrollTo(0, 0);
}

function navigateToFeature(target) {
  if (!target) return;
  const targetId = target.replace(/^#/, "");
  if (targetId === "today") return setActivePage("today");
  const section = document.getElementById(targetId);
  if (!section) return;
  const page = section.dataset.view || (targetId === "curriculum" || targetId === "superchargers" ? "sprint" : null);
  if (page) setActivePage(page);
}

function updateGMTClock() {
  $("#today-date").textContent = new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function initializeStudySprint() {
  setActivePage("today", { scroll: false });
  document.querySelectorAll("[data-app-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActivePage(link.dataset.appPage);
    });
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute("data-app-page")) return;
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    const page = target.dataset.view || (href === "#today" ? "today" : href === "#curriculum" || href === "#superchargers" ? "sprint" : href === "#alarm" ? "alarm" : null);
    if (page) {
      event.preventDefault();
      setActivePage(page);
    }
  });
  updateGMTClock();
  window.setInterval(updateGMTClock, 60000);
  renderCurriculumCard();
  applySuperchargerSettings();
  $("#curriculum-previous").addEventListener("click", () => {
    if (curriculumCardIndex === 0) return;
    curriculumCardIndex -= 1;
    localStorage.setItem(CURRICULUM_CARD_KEY, JSON.stringify(curriculumCardIndex));
    renderCurriculumCard();
  });
  $("#curriculum-next").addEventListener("click", () => {
    if (curriculumCardIndex >= curriculumCards.length - 1) return;
    curriculumCardIndex += 1;
    localStorage.setItem(CURRICULUM_CARD_KEY, JSON.stringify(curriculumCardIndex));
    renderCurriculumCard();
  });
  document.querySelectorAll("[data-supercharger]").forEach((button) => {
    button.addEventListener("click", () => toggleSupercharger(button.dataset.supercharger));
  });
  $("#recall-reveal").addEventListener("click", () => {
    const answer = $("#recall-answer");
    answer.hidden = !answer.hidden;
    $("#recall-reveal").setAttribute("aria-expanded", String(!answer.hidden));
    $("#recall-reveal").textContent = answer.hidden ? "Reveal answer" : "Hide answer";
  });

  const goalInput = $("#goal-minutes");
  goalInput.value = dailyGoalMinutes;
  $("#goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const requestedGoal = Number(goalInput.value);
    if (!Number.isFinite(requestedGoal) || requestedGoal < 15 || requestedGoal > 600) {
      showNotice("Choose a daily target between 15 and 600 minutes.");
      return;
    }
    dailyGoalMinutes = Math.round(requestedGoal / 15) * 15;
    goalInput.value = dailyGoalMinutes;
    localStorage.setItem(GOAL_KEY, JSON.stringify(dailyGoalMinutes));
    renderProgress();
    showNotice(`Daily focus target set to ${dailyGoalMinutes} minutes.`);
  });

  $("#helper-form").addEventListener("submit", answerStudyQuestion);
  // Supabase Auth controls the account form in cloud.js; the local demo profile is disabled here.

  $("#choose-files").addEventListener("click", () => $("#file-picker").click());
  $("#choose-folder").addEventListener("click", () => $("#folder-picker").click());
  $("#file-picker").addEventListener("change", (event) => {
    saveFilesFromComputer(event.target.files);
    event.target.value = "";
  });
  $("#folder-picker").addEventListener("change", (event) => {
    saveFilesFromComputer(event.target.files);
    event.target.value = "";
  });
  refreshSavedFiles();

  $("#add-task-button").addEventListener("click", () => {
    const form = $("#add-task-form");
    form.hidden = !form.hidden;
    $("#add-task-button").setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) {
      resetTaskForm();
      $("#new-task-input").focus();
    }
  });
  $("#add-task-form").addEventListener("submit", addTask);
  $("#cancel-task-edit").addEventListener("click", () => {
    resetTaskForm();
    $("#add-task-form").hidden = true;
    $("#add-task-button").setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("filter-button--active", item === button);
      });
      renderTasks();
    });
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setTimerMode(button.dataset.mode));
  });
  $("#timer-control").addEventListener("click", startOrPauseTimer);
  $("#reset-timer").addEventListener("click", resetTimer);

  $("#add-event-button").addEventListener("click", () => {
    const form = $("#schedule-form");
    form.hidden = !form.hidden;
    $("#add-event-button").setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) {
      resetScheduleForm();
      $("#event-title").focus();
    }
  });
  $("#schedule-form").addEventListener("submit", addScheduleItem);
  $("#cancel-event-edit").addEventListener("click", () => {
    resetScheduleForm();
    $("#schedule-form").hidden = true;
    $("#add-event-button").setAttribute("aria-expanded", "false");
  });

  $("#set-alarm").addEventListener("click", setAlarm);
  $("#cancel-alarm").addEventListener("click", cancelAlarm);
  $("#test-birds").addEventListener("click", startBirdsong);
  $("#stop-birds").addEventListener("click", stopBirdsong);
  $("#enable-notifications").addEventListener("click", enableNotifications);
  $("#start-sleep").addEventListener("click", startSleep);
  $("#end-sleep").addEventListener("click", endSleep);

  renderTasks();
  renderProgress();
  renderSchedule();
  renderSleep();
  formatTimer();
  renderAlarmStatus();
  $("#cancel-alarm").hidden = !(alarm && alarm.enabled);
  alarmInterval = window.setInterval(checkAlarm, 5000);
  checkRoutineReminders();
  routineReminderInterval = window.setInterval(checkRoutineReminders, 15000);
  if (sleepSession && sleepSession.startedAt) sleepTicker = window.setInterval(renderSleep, 60000);
}

document.addEventListener("DOMContentLoaded", initializeStudySprint);

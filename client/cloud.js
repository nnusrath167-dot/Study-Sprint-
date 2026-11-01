import { createClient } from "@supabase/supabase-js";

const APP_PREFIX = "studysprint-";
const PRIVATE_LOCAL_KEYS = new Set(["studysprint-demo-profile-v1", "studysprint-demo-session-v1"]);
const FILES_BUCKET = "studysprint-files";
const form = document.querySelector("#profile-form");
const status = document.querySelector("#profile-status");
const nameInput = document.querySelector("#profile-name");
const emailInput = document.querySelector("#profile-email");
const passwordInput = document.querySelector("#profile-password");
const submitButton = document.querySelector("#profile-submit");
const signoutButton = document.querySelector("#profile-signout");
const deleteAccountButton = document.querySelector("#profile-delete-account");
const deleteAccountForm = document.querySelector("#profile-delete-form");
const deleteAccountEmailInput = document.querySelector("#profile-delete-email");
const deleteAccountPasswordInput = document.querySelector("#profile-delete-password");
const deleteAccountSubmit = document.querySelector("#profile-delete-submit");
const deleteAccountCancel = document.querySelector("#profile-delete-cancel");
const nameLabel = document.querySelector("#profile-name-label");
const privacyConsentLabel = document.querySelector("#profile-consent-label");
const privacyConsent = document.querySelector("#profile-privacy-consent");
const modeButtons = [...document.querySelectorAll("[data-profile-mode]")];
let mode = "signup";
let client = null;
let currentSession = null;
let syncTimer = null;
let syncing = false;
let suppressSync = false;

function appData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) {
      data[key] = localStorage.getItem(key);
    }
  }
  return data;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function renderAccount() {
  const user = currentSession?.user;
  const email = user?.email || "";
  const displayName = user?.user_metadata?.display_name || email.split("@")[0] || "Student";
  const signedIn = Boolean(user);
  form.hidden = signedIn;
  signoutButton.hidden = !signedIn;
  deleteAccountButton.hidden = !signedIn;
  deleteAccountForm.hidden = !signedIn || deleteAccountForm.hidden;
  modeButtons.forEach((button) => {
    button.disabled = signedIn;
    button.classList.toggle("profile-mode--active", button.dataset.profileMode === mode);
  });
  nameLabel.hidden = mode !== "signup";
  privacyConsentLabel.hidden = mode !== "signup";
  privacyConsent.required = mode === "signup";
  nameInput.required = mode === "signup";
  passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  passwordInput.value = "";
  submitButton.textContent = mode === "signup" ? "Create account" : "Sign in";
  if (signedIn) {
    document.querySelector("#profile-greeting").textContent = `Hello, ${displayName}`;
    status.textContent = `Signed in as ${email}. Your StudySprint data is connected to your Supabase account.`;
    document.querySelector("#profile-avatar-large").textContent = displayName.slice(0, 1).toUpperCase();
    document.querySelector(".avatar").textContent = displayName.slice(0, 1).toUpperCase();
    document.querySelector("#admin-profile-status").textContent = "Supabase account active";
  } else {
    document.querySelector("#profile-greeting").textContent = "Your StudySprint account";
    document.querySelector("#profile-avatar-large").textContent = "S";
    document.querySelector(".avatar").textContent = "S";
    document.querySelector("#admin-profile-status").textContent = "Signed out";
  }
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#ff9f9f" : "";
}

function showPageNotice(message) {
  const notice = document.querySelector("#notice");
  if (notice) {
    document.querySelector("#notice-text").textContent = message;
    notice.hidden = false;
    window.setTimeout(() => { notice.hidden = true; }, 4200);
  }
}

async function saveCloudState() {
  if (!client || !currentSession || syncing || suppressSync) return;
  syncing = true;
  try {
    const { error } = await client.from("study_state").upsert({
      user_id: currentSession.user.id,
      data: appData(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (error) {
    console.error("StudySprint cloud save failed:", error);
    showStatus("Cloud sync paused: " + (error.message || "check your Supabase setup"), true);
  } finally {
    syncing = false;
  }
}

function queueSave() {
  if (!currentSession || suppressSync) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(saveCloudState, 900);
}

function watchLocalChanges() {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (String(key).startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) queueSave();
  };
  localStorage.removeItem = (key) => {
    originalRemoveItem(key);
    if (String(key).startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) queueSave();
  };
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(APP_PREFIX)) queueSave();
  });
  window.setInterval(() => { if (currentSession) saveCloudState(); }, 20000);
}

async function restoreCloudState(user) {
  const { data: row, error } = await client.from("study_state").select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!row) {
    const local = appData();
    if (Object.keys(local).length) {
      const migrate = window.confirm("This Supabase account has no saved StudySprint data yet. Upload this browser's current StudySprint data to this account? Choose Cancel to clear the local app data instead.");
      if (!migrate) {
        suppressSync = true;
        try {
          for (let i = localStorage.length - 1; i >= 0; i -= 1) {
            const key = localStorage.key(i);
            if (key?.startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) localStorage.removeItem(key);
          }
        } finally {
          suppressSync = false;
        }
        window.location.reload();
        return;
      }
    }
    await saveCloudState();
    return;
  }
  const remoteData = row.data || {};
  if (stable(remoteData) === stable(appData())) return;
  suppressSync = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) localStorage.removeItem(key);
    }
    Object.entries(remoteData).forEach(([key, value]) => {
      if (key.startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) localStorage.setItem(key, String(value));
    });
  } finally {
    suppressSync = false;
  }
  window.location.reload();
}

function setMode(nextMode) {
  mode = nextMode;
  renderAccount();
  showStatus(mode === "signup" ? "Create an account with your email and a strong password." : "Sign in to load your personal StudySprint data.");
}

async function submitAuth(event) {
  event.preventDefault();
  submitButton.disabled = true;
  showStatus(mode === "signup" ? "Creating your account…" : "Signing in…");
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  try {
    if (mode === "signup") {
      const displayName = nameInput.value.trim();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      if (data.session) {
        currentSession = data.session;
        renderAccount();
        await restoreCloudState(data.user);
        showStatus("Account created and signed in. Your data is syncing.");
      } else {
        setMode("signin");
        emailInput.value = email;
        showStatus("Account created. Check your email to confirm it, then sign in.");
      }
    } else {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentSession = data.session;
      renderAccount();
      await restoreCloudState(data.user);
      showStatus("Signed in. Your StudySprint data is syncing.");
    }
  } catch (error) {
    showStatus(error.message || "Authentication failed. Check your details and Supabase settings.", true);
  } finally {
    submitButton.disabled = false;
  }
}

async function signOut() {
  signoutButton.disabled = true;
  await saveCloudState();
  suppressSync = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(APP_PREFIX) && !PRIVATE_LOCAL_KEYS.has(key)) localStorage.removeItem(key);
    }
  } finally {
    suppressSync = false;
  }
  const { error } = await client.auth.signOut();
  if (error) {
    showStatus(error.message, true);
    signoutButton.disabled = false;
    return;
  }
  currentSession = null;
  window.location.reload();
}

function clearLocalFileStore() {
  if (!("indexedDB" in window)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("studysprint-files-v1", 1);
    request.onerror = () => reject(request.error || new Error("Could not open browser file storage."));
    request.onblocked = () => reject(new Error("Close other StudySprint tabs before deleting this account."));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("saved-files")) {
        database.close();
        resolve();
        return;
      }

      const transaction = database.transaction("saved-files", "readwrite");
      transaction.objectStore("saved-files").clear();
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("Could not clear browser file storage."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Could not clear browser file storage."));
      };
    };
  });
}

async function deleteAccount(event) {
  event.preventDefault();
  const user = currentSession?.user;
  const email = user?.email || "";
  if (!user || !email) return;

  if (deleteAccountEmailInput.value.trim().toLowerCase() !== email.toLowerCase()) {
    showStatus("The email address does not match your signed-in account.", true);
    return;
  }

  deleteAccountSubmit.disabled = true;
  showStatus("Confirming your password…");
  let accountDeleted = false;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: deleteAccountPasswordInput.value,
    });
    if (error) throw error;
    if (!data.session?.access_token) throw new Error("Could not confirm your account. Sign in again and retry.");

    currentSession = data.session;
    showStatus("Deleting your account and private data…");
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Account deletion failed (${response.status}).`);
    accountDeleted = true;

    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;
    await clearLocalFileStore();

    suppressSync = true;
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(APP_PREFIX)) localStorage.removeItem(key);
      }
    } finally {
      suppressSync = false;
    }

    currentSession = null;
    window.location.reload();
  } catch (error) {
    console.error("StudySprint account deletion request failed:", error);
    if (accountDeleted) {
      currentSession = null;
      renderAccount();
    }
    const message = accountDeleted
      ? `Your cloud account was deleted, but this browser could not clear all local data: ${error.message || "unknown error"}. Clear this site's browser data or contact nnusrath167@gmail.com.`
      : error.message || "Account deletion failed. Please retry or contact support.";
    showStatus(message, true);
  } finally {
    deleteAccountPasswordInput.value = "";
    deleteAccountSubmit.disabled = false;
  }
}

function initCloudFilePanel() {
  const panel = document.querySelector(".files-panel");
  const localList = document.querySelector("#file-list");
  if (!panel || !localList) return null;
  let cloudPanel = document.querySelector("#cloud-file-vault");
  if (!cloudPanel) {
    cloudPanel = document.createElement("section");
    cloudPanel.id = "cloud-file-vault";
    cloudPanel.className = "cloud-vault";
    cloudPanel.innerHTML = '<div class="cloud-vault-head"><div><h3>Private cloud files</h3><p>Uploaded to your personal Supabase storage.</p></div><button type="button" class="sound-test" id="refresh-cloud-files">Refresh</button></div><div id="cloud-file-list" class="cloud-file-list" aria-live="polite"></div>';
    localList.insertAdjacentElement("afterend", cloudPanel);
  }
  document.querySelector("#refresh-cloud-files").addEventListener("click", () => renderCloudFiles());
  return cloudPanel;
}

function cloudFileStatus(message, isError = false) {
  const el = document.querySelector("#file-storage-status");
  if (el) {
    el.textContent = message;
    el.style.color = isError ? "#ff9f9f" : "";
  }
}

async function renderCloudFiles() {
  const list = document.querySelector("#cloud-file-list");
  if (!list) return;
  if (!currentSession) {
    list.textContent = "Sign in to view files stored in your private cloud vault.";
    return;
  }
  list.textContent = "Loading cloud files…";
  const { data, error } = await client.from("study_files").select("id,storage_path,original_name,byte_size,created_at").order("created_at", { ascending: false });
  if (error) { list.textContent = "Could not load files: " + error.message; return; }
  list.replaceChildren();
  if (!data.length) { list.textContent = "No cloud files yet. Choose a file or folder above while signed in to upload."; return; }
  data.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cloud-file-row";
    const name = document.createElement("span");
    name.className = "cloud-file-name";
    name.textContent = item.original_name;
    const size = document.createElement("small");
    size.textContent = `${Math.max(1, Math.round(item.byte_size / 1024))} KB`;
    const download = document.createElement("button");
    download.type = "button"; download.className = "sound-test"; download.textContent = "Download";
    download.addEventListener("click", async () => {
      const { data: signed, error: urlError } = await client.storage.from(FILES_BUCKET).createSignedUrl(item.storage_path, 60);
      if (urlError) { cloudFileStatus(urlError.message, true); return; }
      const link = document.createElement("a"); link.href = signed.signedUrl; link.download = item.original_name; link.click();
    });
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "file-action file-action--delete"; remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Delete ${item.original_name} from your private cloud vault?`)) return;
      const { error: storageError } = await client.storage.from(FILES_BUCKET).remove([item.storage_path]);
      if (storageError) { cloudFileStatus(storageError.message, true); return; }
      const { error: rowError } = await client.from("study_files").delete().eq("id", item.id);
      if (rowError) { cloudFileStatus(rowError.message, true); return; }
      await renderCloudFiles();
    });
    row.append(name, size, download, remove);
    list.append(row);
  });
}

async function uploadCloudFiles(fileList) {
  if (!currentSession || !fileList?.length) return;
  const files = Array.from(fileList);
  cloudFileStatus(`Uploading ${files.length} file(s) to your private cloud…`);
  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const safe = relative.split("/").map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).join("/");
    const storagePath = `${currentSession.user.id}/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await client.storage.from(FILES_BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) { cloudFileStatus(`Upload failed for ${file.name}: ${uploadError.message}`, true); continue; }
    const { error: insertError } = await client.from("study_files").insert({
      user_id: currentSession.user.id,
      storage_path: storagePath,
      original_name: relative,
      content_type: file.type || "application/octet-stream",
      byte_size: file.size,
    });
    if (insertError) {
      await client.storage.from(FILES_BUCKET).remove([storagePath]);
      cloudFileStatus(`Could not save file details for ${file.name}: ${insertError.message}`, true);
    }
  }
  await renderCloudFiles();
  cloudFileStatus("Files saved in this browser and uploaded to your private Supabase vault.");
}

async function start() {
  form.addEventListener("submit", submitAuth);
  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.profileMode)));
  signoutButton.addEventListener("click", signOut);
  deleteAccountButton.addEventListener("click", () => {
    deleteAccountForm.hidden = false;
    deleteAccountEmailInput.value = currentSession?.user?.email || "";
    deleteAccountPasswordInput.focus();
  });
  deleteAccountCancel.addEventListener("click", () => {
    deleteAccountForm.reset();
    deleteAccountForm.hidden = true;
    showStatus("Account deletion cancelled.");
  });
  deleteAccountForm.addEventListener("submit", deleteAccount);
  setMode("signup");
  watchLocalChanges();
  initCloudFilePanel();
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    if (!response.ok || !config.configured || !config.supabaseUrl || !config.supabaseAnonKey) {
      showStatus("Supabase is not configured yet. Copy .env.example to .env, add your project URL and anon/publishable key, then restart the server.", true);
      document.querySelector("#cloud-file-list").textContent = "Set up Supabase and sign in to enable private cloud file uploads.";
      return;
    }
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    currentSession = session;
    renderAccount();
    if (currentSession) {
      await restoreCloudState(currentSession.user);
      await renderCloudFiles();
      showStatus(`Signed in as ${currentSession.user.email}. Your cloud account is ready.`);
    } else {
      renderCloudFiles();
    }
    client.auth.onAuthStateChange((_event, sessionNow) => {
      currentSession = sessionNow;
      renderAccount();
      if (!sessionNow) renderCloudFiles();
    });
    ["file-picker", "folder-picker"].forEach((id) => {
      document.querySelector(`#${id}`).addEventListener("change", (event) => {
        uploadCloudFiles(event.target.files);
      });
    });
    if (currentSession) window.setInterval(renderCloudFiles, 60000);
  } catch (error) {
    console.error("StudySprint Supabase setup error:", error);
    showStatus("Could not connect to Supabase: " + (error.message || "check configuration"), true);
  }
}

document.addEventListener("DOMContentLoaded", start);

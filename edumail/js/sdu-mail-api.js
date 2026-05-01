const API_BASE = localStorage.getItem("API_BASE") || "http://localhost:8000";
const SESSION_KEY = "sdumailSession";
const STICKERS = ["👍", "👏", "🔥", "🎓", "✅", "🙏", "📚", "🙂"];
const CERTIFICATE_TERMS = ["certificate", "enrollment", "document", "grade certificate"];
const ASSISTANT_TEMPLATES = {
  assignment: "Dear Professor [Name],\n\nI hope this message finds you well. I am writing to ask about the requirements and deadline for [Assignment] in [Course].\n\nBest regards,\n[Your Name]",
  grade: "Dear Professor [Name],\n\nI hope you are doing well. I would like to understand my grade and feedback in [Course].\n\nSincerely,\n[Your Name]",
  absence: "Dear Professor [Name],\n\nI am writing to explain my absence from [Course] on [Date]. Please let me know how I can catch up.\n\nBest regards,\n[Your Name]",
  certificate: "Dear Office,\n\nI would like to request a certificate. My details are:\n- Name: [Your Name]\n- ID: [Your ID]\n- Program: [Program]\n\nRespectfully,\n[Your Name]",
  extension: "Dear Professor [Name],\n\nI respectfully request an extension for [Assignment] in [Course] because of [Reason].\n\nSincerely,\n[Your Name]"
};

const state = {
  session: loadSession(),
  profile: null,
  activeSection: "dashboard",
  activePanel: "dashboard",
  mailboxFolder: "inbox",
  inbox: [],
  sent: [],
  deadlines: [],
  conversations: [],
  selectedEmailId: null,
  selectedChatUser: null,
  chatUsers: new Map(),
  composeUsers: new Map(),
  crmUsers: new Map(),
  chatPoller: null,
  mediaRecorder: null,
  mediaChunks: [],
  recordingStream: null
};

function byId(id) {
  return document.getElementById(id);
}

function normalizeRole(role) {
  return role === "teacher" ? "professor" : role === "professor" ? "professor" : "student";
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  state.session = session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  state.session = null;
}

function currentSession() {
  if (!state.session) {
    state.session = loadSession();
  }
  return state.session;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function formatDateTime(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleString();
}

function previewText(value, size = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "No text content";
  return text.length > size ? `${text.slice(0, size)}...` : text;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function setInlineMessage(targetId, message, tone = "error") {
  const target = byId(targetId);
  if (!target) return;
  if (!message) {
    target.className = "inline-message hidden";
    target.textContent = "";
    return;
  }
  target.className = `inline-message ${tone}`;
  target.textContent = message;
}

function getAllEmails() {
  return [...state.inbox, ...state.sent];
}

function countUnreadEmails(items) {
  return items.filter((item) => !item.is_read).length;
}

function emailMatchesFilter(email, filter) {
  const query = normalizeText(filter);
  if (!query) return false;
  const haystack = normalizeText([
    email.subject,
    email.body,
    email.category,
    email.sender_email,
    email.receiver_email
  ].join(" "));
  return haystack.includes(query);
}

function emailMatchesAnyTerm(email, terms) {
  return terms.some((term) => emailMatchesFilter(email, term));
}

function activeButtonElement() {
  return document.querySelector("[data-section].active");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (options.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === "object" && data ? data.detail : data;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }

  return data;
}

function roleDashboardPath(role) {
  return normalizeRole(role) === "student" ? "dashboard-student.html" : "dashboard-teacher.html";
}

function redirectToAuth(role) {
  window.location.href = `auth.html?role=${normalizeRole(role)}`;
}

function redirectToDashboard(role) {
  window.location.href = roleDashboardPath(role);
}

function renderSharedIdentity(profile) {
  document.querySelectorAll("[data-user-name]").forEach((node) => {
    node.textContent = profile.full_name;
  });

  const roleText = profile.role === "student"
    ? `Student · ID ${profile.details.student_id || profile.user_id}`
    : `${profile.details.position || "Professor"} · ${profile.details.department || profile.faculty}`;

  document.querySelectorAll("[data-user-role]").forEach((node) => {
    node.textContent = roleText;
  });

  const fallback = initials(profile.full_name);
  document.querySelectorAll("[data-avatar-fallback]").forEach((node) => {
    node.textContent = fallback;
    node.style.display = profile.profile_photo ? "none" : "flex";
  });

  document.querySelectorAll("[data-avatar-image]").forEach((node) => {
    if (profile.profile_photo) {
      node.src = profile.profile_photo;
      node.alt = `${profile.full_name} profile photo`;
      node.style.display = "block";
    } else {
      node.removeAttribute("src");
      node.style.display = "none";
    }
  });
}

function renderProfile(profile) {
  renderSharedIdentity(profile);

  const profileTitle = byId("profileHeroTitle");
  const profileSubtitle = byId("profileHeroSubtitle");
  const profileStatus = byId("profileStatusChip");
  if (profileTitle) profileTitle.textContent = profile.full_name;
  if (profileSubtitle) {
    profileSubtitle.textContent = "Your dashboard now keeps the original frontend structure while loading personal information from the backend database.";
  }
  if (profileStatus) {
    profileStatus.textContent = `Status: ${profile.account_status}`;
  }

  const chips = byId("profileHighlightRow");
  if (chips) {
    const items = profile.role === "student"
      ? [
          `Faculty: ${profile.faculty}`,
          `Major: ${profile.details.major || "Not set"}`,
          `Year: ${profile.details.year_of_study || "Not set"}`,
          `GPA: ${profile.details.gpa ?? "Not set"}`
        ]
      : [
          `Faculty: ${profile.faculty}`,
          `Department: ${profile.details.department || "Not set"}`,
          `Position: ${profile.details.position || "Not set"}`,
          `Office: ${profile.details.office_room || "Not set"}`
        ];

    chips.innerHTML = items.map((item) => `<div class="profile-chip">${escapeHtml(item)}</div>`).join("");
  }

  const detailGrid = byId("profileDetailsGrid");
  if (detailGrid) {
    const commonDetails = [
      ["University Email", profile.sdu_email],
      ["Personal Email", profile.personal_email || "Not provided"],
      ["Phone Number", profile.phone_number || "Not provided"],
      ["Faculty", profile.faculty]
    ];
    const roleSpecific = profile.role === "student"
      ? [
          ["Student ID", profile.details.student_id || profile.user_id],
          ["Major", profile.details.major || "Not provided"],
          ["Year Of Study", profile.details.year_of_study || "Not provided"],
          ["Advisor", profile.details.advisor || "Not provided"],
          ["GPA", profile.details.gpa ?? "Not provided"],
          ["Account Status", profile.account_status]
        ]
      : [
          ["Employee ID", profile.details.employee_id || profile.user_id],
          ["Department", profile.details.department || "Not provided"],
          ["Position", profile.details.position || "Not provided"],
          ["Office Room", profile.details.office_room || "Not provided"],
          ["Account Status", profile.account_status],
          ["Created", formatDateTime(profile.created_at)]
        ];

    detailGrid.innerHTML = [...commonDetails, ...roleSpecific].map(([label, value]) => `
      <div class="detail-item">
        <div class="detail-label">${escapeHtml(label)}</div>
        <div class="detail-value">${escapeHtml(value)}</div>
      </div>
    `).join("");
  }

  if (byId("profilePhotoName")) byId("profilePhotoName").textContent = profile.full_name;
  if (byId("profilePhotoMeta")) {
    byId("profilePhotoMeta").textContent = profile.role === "student" ? `ID ${profile.user_id}` : `Employee ${profile.user_id}`;
  }
}

function activeMailboxItems() {
  return state.mailboxFolder === "sent" ? state.sent : state.inbox;
}

function renderMailboxList() {
  const list = byId("mailList");
  if (!list) return;

  const search = byId("mailSearchInput");
  const folderLabel = byId("mailFolderLabel");
  const folderCount = byId("mailFolderCount");
  const query = normalizeText(search?.value || "");
  const items = activeMailboxItems().filter((item) => {
    if (!query) return true;
    return normalizeText([item.subject, item.body, item.sender_email, item.receiver_email, item.category].join(" ")).includes(query);
  });

  if (folderLabel) folderLabel.textContent = state.mailboxFolder === "sent" ? "Sent Messages" : "Inbox";
  if (folderCount) folderCount.textContent = String(items.length);

  if (!items.length) {
    list.innerHTML = `<div class="mail-empty">No ${state.mailboxFolder === "sent" ? "sent emails" : "emails"} found in the database.</div>`;
    renderEmailDetail(null);
    return;
  }

  if (!items.some((item) => item.id === state.selectedEmailId)) {
    state.selectedEmailId = items[0].id;
  }

  list.innerHTML = items.map((item) => {
    const peer = state.mailboxFolder === "sent" ? item.receiver_email : item.sender_email;
    return `
      <button class="mail-row ${item.is_read ? "" : "unread"} ${item.id === state.selectedEmailId ? "active" : ""}" data-email-id="${item.id}">
        <div class="mail-row-meta">
          <strong>${escapeHtml(peer)}</strong>
          <span class="app-note">${escapeHtml(formatDateTime(item.timestamp))}</span>
        </div>
        <div class="mail-row-subject">${escapeHtml(item.subject)}</div>
        <div class="mail-row-preview">${escapeHtml(previewText(item.body))}</div>
      </button>
    `;
  }).join("");

  const selected = items.find((item) => item.id === state.selectedEmailId) || items[0];
  renderEmailDetail(selected);
}

function renderEmailDetail(email) {
  const head = byId("mailDetailHead");
  const body = byId("mailDetailBody");
  const empty = byId("mailDetailEmpty");
  if (!head || !body || !empty) return;

  if (!email) {
    head.classList.add("hidden");
    body.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  head.classList.remove("hidden");
  body.classList.remove("hidden");
  head.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h3 style="font-size:22px;font-weight:800;margin-bottom:8px;">${escapeHtml(email.subject)}</h3>
        <div class="app-note">From: ${escapeHtml(email.sender_email)}</div>
        <div class="app-note">To: ${escapeHtml(email.receiver_email)}</div>
      </div>
      <div style="text-align:right;">
        <div class="badge badge-primary" style="margin-bottom:10px;">${escapeHtml(email.category || "Other")}</div>
        <div class="app-note">${escapeHtml(formatDateTime(email.timestamp))}</div>
      </div>
    </div>
  `;
  body.innerHTML = escapeHtml(email.body).replace(/\n/g, "<br>");
}

async function loadMailbox() {
  const session = currentSession();
  if (!session) return;

  const [inbox, sent, unread] = await Promise.all([
    api(`/emails/inbox?user_email=${encodeURIComponent(session.email)}&limit=200`),
    api(`/emails/sent?user_email=${encodeURIComponent(session.email)}&limit=200`),
    api(`/emails/inbox/unread-count?user_email=${encodeURIComponent(session.email)}`)
  ]);

  state.inbox = inbox || [];
  state.sent = sent || [];
  const badge = byId("inboxUnreadBadge");
  if (badge) {
    badge.textContent = String(unread?.unread_count || 0);
    badge.style.display = unread?.unread_count ? "inline-flex" : "none";
  }
  renderMailboxList();
  renderSupplementalPanels();
}

async function openEmail(emailId) {
  state.selectedEmailId = Number(emailId);
  const email = getAllEmails().find((item) => item.id === state.selectedEmailId);
  if (!email) return;
  renderMailboxList();

  if (state.mailboxFolder === "inbox" && !email.is_read) {
    await api(`/emails/${email.id}/read`, { method: "PATCH" }).catch(() => null);
    email.is_read = 1;
    await loadMailbox();
  }
}

async function loadProfile() {
  const session = currentSession();
  if (!session) return null;

  const profile = await api(`/users/profile?role=${encodeURIComponent(session.role)}&user_id=${encodeURIComponent(session.user_id)}`);
  state.profile = profile;
  saveSession({
    ...session,
    email: profile.sdu_email,
    full_name: profile.full_name,
    profile_photo: profile.profile_photo
  });
  renderProfile(profile);
  return profile;
}

async function uploadProfilePhoto(file) {
  if (!file || !currentSession()) return;
  if (!file.type.startsWith("image/")) {
    setInlineMessage("appNotice", "Please select an image file for the profile photo.", "error");
    return;
  }

  const dataUrl = await blobToDataUrl(file);
  const profile = await api(`/users/profile-photo?role=${encodeURIComponent(state.session.role)}&user_id=${encodeURIComponent(state.session.user_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ profile_photo: dataUrl })
  });

  state.profile = profile;
  renderProfile(profile);
  setInlineMessage("appNotice", "Profile photo updated from the database successfully.", "success");
}

function renderComposeSearchResults(users, emptyText = "No users found in the database.") {
  const box = byId("composeRecipientResults");
  if (!box) return;
  state.composeUsers = new Map(users.map((user) => [user.id, user]));
  if (!users.length && !emptyText) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = users.length ? users.map((user) => `
    <button class="picker-row" data-compose-user-id="${escapeHtml(user.id)}">
      <strong>${escapeHtml(user.full_name)}</strong><br>
      <span class="app-note">${escapeHtml(user.email)} · ${escapeHtml(user.role)} · ${escapeHtml(user.meta || "")}</span>
    </button>
  `).join("") : `<div class="mail-empty" style="min-height:unset;padding:16px;">${escapeHtml(emptyText)}</div>`;
}

async function searchComposeUsers(query) {
  const value = query.trim();
  if (!value) {
    state.composeUsers = new Map();
    const box = byId("composeRecipientResults");
    if (box) box.innerHTML = "";
    return;
  }
  const users = await api(`/users/search?q=${encodeURIComponent(value)}&limit=10`);
  renderComposeSearchResults(users.filter((user) => user.id !== state.session.user_id));
}

function openComposeModal(prefill = {}) {
  const modal = byId("composeModal");
  if (!modal) return;
  modal.classList.add("open");
  setInlineMessage("composeStatus", "");

  const fields = {
    receiver: byId("composeToInput"),
    category: byId("composeCategoryInput"),
    subject: byId("composeSubjectInput"),
    body: byId("composeBodyInput"),
    search: byId("composeSearchInput")
  };

  if (fields.receiver) fields.receiver.value = prefill.receiver || "";
  if (fields.category) fields.category.value = prefill.category || "";
  if (fields.subject) fields.subject.value = prefill.subject || "";
  if (fields.body) fields.body.value = prefill.body || "";
  if (fields.search && prefill.search) fields.search.value = prefill.search;

  byId("composeSearchInput")?.focus();
}

function closeComposeModal() {
  const modal = byId("composeModal");
  if (!modal) return;
  modal.classList.remove("open");
  ["composeSearchInput", "composeToInput", "composeSubjectInput", "composeCategoryInput", "composeBodyInput"].forEach((id) => {
    const field = byId(id);
    if (field) field.value = "";
  });
  state.composeUsers = new Map();
  const box = byId("composeRecipientResults");
  if (box) box.innerHTML = "";
}

async function sendComposeEmail() {
  const session = currentSession();
  if (!session) return;

  const receiver = byId("composeToInput")?.value.trim();
  const subject = byId("composeSubjectInput")?.value.trim();
  const category = byId("composeCategoryInput")?.value.trim() || "Other";
  const body = byId("composeBodyInput")?.value.trim();

  if (!receiver || !subject || !body) {
    setInlineMessage("composeStatus", "Receiver, subject, and message are required.", "error");
    return;
  }

  await api("/emails/compose", {
    method: "POST",
    body: JSON.stringify({
      sender_email: session.email,
      receiver_email: receiver,
      subject,
      body,
      category
    })
  });

  setInlineMessage("composeStatus", "Email sent and stored in the database.", "success");
  await loadMailbox();
  state.mailboxFolder = "sent";
  updateFolderTabs();
  renderMailboxList();
  setTimeout(closeComposeModal, 650);
}

function updateFolderTabs() {
  document.querySelectorAll("[data-mail-folder]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mailFolder === state.mailboxFolder);
  });
}

function renderChatDirectory(items, activeId = null) {
  const list = byId("chatDirectoryList");
  if (!list) return;
  state.chatUsers = new Map(items.map((item) => [item.id, item]));
  list.innerHTML = items.length ? items.map((item) => `
    <button class="chat-contact ${item.id === activeId ? "active" : ""}" data-chat-user-id="${escapeHtml(item.id)}">
      <div class="contact-avatar">
        ${item.profile_photo ? `<img src="${escapeHtml(item.profile_photo)}" alt="${escapeHtml(item.full_name)}">` : escapeHtml(initials(item.full_name))}
      </div>
      <div style="flex:1;text-align:left;">
        <div style="font-size:14px;font-weight:800;color:var(--text-primary);">${escapeHtml(item.full_name)}</div>
        <div class="app-note">${escapeHtml(item.email)}</div>
        <div class="app-note">${escapeHtml(item.preview || item.meta || item.role)}</div>
      </div>
    </button>
  `).join("") : `<div class="mail-empty" style="min-height:200px;">Search for a user or start a conversation from the database.</div>`;
}

async function loadConversations() {
  const session = currentSession();
  if (!session) return;

  const conversations = await api(`/messages/conversations?user_id=${encodeURIComponent(session.user_id)}`);
  const unreadData = await api(`/messages/unread-count?user_id=${encodeURIComponent(session.user_id)}`);
  const badge = byId("chatUnreadBadge");
  if (badge) {
    badge.textContent = String(unreadData?.unread_messages || 0);
    badge.style.display = unreadData?.unread_messages ? "inline-flex" : "none";
  }

  state.conversations = (conversations || []).map((entry) => ({
    ...entry.user,
    preview: entry.last_message,
    last_type: entry.last_type,
    timestamp: entry.timestamp
  }));

  const search = byId("chatDirectorySearch");
  if (!search || !search.value.trim()) {
    renderChatDirectory(state.conversations, state.selectedChatUser?.id);
  }

  if (!state.selectedChatUser && state.conversations.length) {
    await openChatWithUser(state.conversations[0], false);
  }
  renderSupplementalPanels();
}

async function searchChatUsers(query) {
  const value = query.trim();
  if (!value) {
    await loadConversations();
    return;
  }
  const users = await api(`/users/search?q=${encodeURIComponent(value)}&limit=20`);
  renderChatDirectory(users.filter((user) => user.id !== state.session.user_id), state.selectedChatUser?.id);
}

function renderChatHeader(user) {
  if (byId("chatPartnerName")) byId("chatPartnerName").textContent = user.full_name;
  if (byId("chatPartnerMeta")) byId("chatPartnerMeta").textContent = user.meta || user.email;

  const avatarImage = byId("threadAvatarImage");
  const avatarFallback = byId("threadAvatarFallback");
  if (avatarImage && avatarFallback) {
    if (user.profile_photo) {
      avatarImage.src = user.profile_photo;
      avatarImage.style.display = "block";
      avatarFallback.style.display = "none";
    } else {
      avatarImage.removeAttribute("src");
      avatarImage.style.display = "none";
      avatarFallback.style.display = "flex";
      avatarFallback.textContent = initials(user.full_name);
    }
  }
}

function renderChatMessages(messages) {
  const list = byId("chatMessageList");
  const empty = byId("chatEmptyState");
  if (!list || !empty) return;

  if (!state.selectedChatUser) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = messages.length ? messages.map((message) => {
    const mine = message.sender_id === state.session.user_id;
    let content = escapeHtml(message.content || "");
    if (message.message_type === "sticker") {
      content = `<span style="font-size:28px;">${escapeHtml(message.sticker || "🙂")}</span>`;
    } else if (message.message_type === "voice") {
      content = `<audio controls src="${escapeHtml(message.media_url || "")}" style="max-width:240px;"></audio>`;
    } else {
      content = content.replace(/\n/g, "<br>");
    }

    return `
      <div class="chat-message ${mine ? "me" : "them"}">
        <div class="chat-bubble">
          ${content}
          <div style="margin-top:8px;font-size:11px;opacity:${mine ? "0.85" : "0.55"};">${escapeHtml(formatDateTime(message.timestamp))}</div>
        </div>
      </div>
    `;
  }).join("") : `<div class="mail-empty" style="min-height:220px;">No chat messages yet. Start the conversation here.</div>`;

  list.scrollTop = list.scrollHeight;
}

async function openChatWithUser(user, reloadDirectory = true) {
  if (!user) return;
  state.selectedChatUser = user;
  renderChatHeader(user);
  await loadChatHistory();
  if (reloadDirectory) {
    await loadConversations();
  }
}

async function loadChatHistory() {
  const session = currentSession();
  if (!session || !state.selectedChatUser) return;

  const messages = await api(`/messages/history?user1_id=${encodeURIComponent(session.user_id)}&user2_id=${encodeURIComponent(state.selectedChatUser.id)}&limit=200`);
  renderChatMessages(messages || []);

  const unreadIncoming = (messages || []).filter((message) => message.receiver_id === session.user_id && message.is_read === 0);
  if (unreadIncoming.length) {
    await Promise.all(unreadIncoming.map((message) => api(`/messages/${message.id}/read`, { method: "PATCH" }).catch(() => null)));
    await loadConversations();
  }
}

async function sendChatText() {
  const input = byId("chatTextInput");
  if (!input || !state.selectedChatUser) return;
  const content = input.value.trim();
  if (!content) return;

  await api("/messages/send", {
    method: "POST",
    body: JSON.stringify({
      sender_id: state.session.user_id,
      receiver_id: state.selectedChatUser.id,
      content,
      message_type: "text"
    })
  });

  input.value = "";
  await loadChatHistory();
  await loadConversations();
}

async function sendSticker(sticker) {
  if (!state.selectedChatUser) return;
  await api("/messages/send", {
    method: "POST",
    body: JSON.stringify({
      sender_id: state.session.user_id,
      receiver_id: state.selectedChatUser.id,
      message_type: "sticker",
      sticker
    })
  });
  await loadChatHistory();
  await loadConversations();
}

function resetRecorderButton() {
  const button = byId("chatVoiceButton");
  if (!button) return;
  button.classList.remove("recording");
  button.textContent = "🎙️";
  button.title = "Record voice message";
}

async function toggleVoiceRecording() {
  if (!state.selectedChatUser) return;
  const button = byId("chatVoiceButton");
  if (!button) return;

  if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
    state.mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setInlineMessage("appNotice", "This browser does not support audio recording.", "error");
    return;
  }

  state.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.mediaChunks = [];
  state.mediaRecorder = new MediaRecorder(state.recordingStream);

  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size) state.mediaChunks.push(event.data);
  };

  state.mediaRecorder.onstop = async () => {
    try {
      const blob = new Blob(state.mediaChunks, { type: "audio/webm" });
      const audioDataUrl = await blobToDataUrl(blob);

      await api("/messages/send", {
        method: "POST",
        body: JSON.stringify({
          sender_id: state.session.user_id,
          receiver_id: state.selectedChatUser.id,
          message_type: "voice",
          media_url: audioDataUrl
        })
      });

      await loadChatHistory();
      await loadConversations();
    } catch (error) {
      setInlineMessage("appNotice", error.message, "error");
    } finally {
      state.recordingStream?.getTracks().forEach((track) => track.stop());
      state.recordingStream = null;
      state.mediaRecorder = null;
      state.mediaChunks = [];
      resetRecorderButton();
    }
  };

  state.mediaRecorder.start();
  button.classList.add("recording");
  button.textContent = "■";
  button.title = "Stop recording and send";
}

async function loadDeadlines() {
  if (normalizeRole(document.body.dataset.role) !== "student") {
    state.deadlines = [];
    renderRemindersPanel();
    return;
  }
  try {
    state.deadlines = await api(`/deadlines?student_id=${encodeURIComponent(state.session.user_id)}`);
  } catch (_error) {
    state.deadlines = [];
  }
  renderRemindersPanel();
  renderSupplementalPanels();
}

function renderCourseDetail(button) {
  const title = button?.dataset.sectionTitle || "Course Overview";
  const subtitle = button?.dataset.sectionSubtitle || "Course tab restored from the original frontend.";
  const filter = button?.dataset.courseFilter || "";
  if (byId("courseDetailTitle")) byId("courseDetailTitle").textContent = title;
  if (byId("courseDetailSubtitle")) byId("courseDetailSubtitle").textContent = subtitle;

  const relatedEmails = getAllEmails().filter((email) => emailMatchesFilter(email, filter));
  const unreadRelated = countUnreadEmails(relatedEmails.filter((email) => email.receiver_email === state.session.email));
  const relatedDeadlines = state.deadlines.filter((deadline) => normalizeText(deadline.course).includes(normalizeText(filter)));
  const grid = byId("courseInsightGrid");
  if (grid) {
    const cards = normalizeRole(document.body.dataset.role) === "student"
      ? [
          ["Emails", relatedEmails.length, "Messages connected to this course from inbox or sent records"],
          ["Unread", unreadRelated, "Unread course-related emails in the inbox"],
          ["Deadlines", relatedDeadlines.filter((deadline) => !deadline.is_done).length, "Upcoming course deadlines from the backend"]
        ]
      : [
          ["Inbox", relatedEmails.filter((email) => email.receiver_email === state.session.email).length, "Incoming email records related to this course"],
          ["Sent", relatedEmails.filter((email) => email.sender_email === state.session.email).length, "Sent announcements and replies related to this course"],
          ["Conversations", state.conversations.filter((item) => normalizeText(item.meta).includes(normalizeText(filter))).length, "Chat contacts that mention this course or department"]
        ];
    grid.innerHTML = cards.map(([label, value, note]) => `
      <div class="insight-card">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
        <span style="margin-top:8px;">${escapeHtml(note)}</span>
      </div>
    `).join("");
  }

  const courseEmailList = byId("courseEmailList");
  if (courseEmailList) {
    courseEmailList.innerHTML = relatedEmails.length ? relatedEmails.slice(0, 5).map((email) => `
      <div class="stack-item">
        <strong>${escapeHtml(email.subject)}</strong>
        <p>${escapeHtml(previewText(email.body))}</p>
        <div class="app-note">${escapeHtml(formatDateTime(email.timestamp))}</div>
      </div>
    `).join("") : `<div class="mail-empty" style="min-height:140px;">No course-related emails found yet.</div>`;
  }

  const courseDeadlineList = byId("courseDeadlineList");
  if (courseDeadlineList) {
    if (normalizeRole(document.body.dataset.role) === "student") {
      courseDeadlineList.innerHTML = relatedDeadlines.length ? relatedDeadlines.map((deadline) => `
        <div class="stack-item">
          <strong>${escapeHtml(deadline.title)}</strong>
          <p>${escapeHtml(deadline.course)}</p>
          <div class="app-note">${escapeHtml(formatDateTime(deadline.due_at))}</div>
        </div>
      `).join("") : `<div class="mail-empty" style="min-height:140px;">No deadlines were found for this course.</div>`;
    } else {
      courseDeadlineList.innerHTML = `
        <div class="stack-item">
          <strong>Compose a course message</strong>
          <p>Use the restored Emails tab to send announcements or course updates.</p>
        </div>
        <div class="stack-item">
          <strong>Review related inbox items</strong>
          <p>Open Inbox and search for ${escapeHtml(filter)} to inspect course-specific messages.</p>
        </div>
        <div class="stack-item">
          <strong>Message students directly</strong>
          <p>Open Student CRM or Chat to continue course communication with specific users.</p>
        </div>
      `;
    }
  }
}

async function runAssistant() {
  const input = byId("assistantInput");
  const output = byId("assistantOutput");
  if (!input || !output) return;
  if (!input.value.trim()) {
    output.textContent = "Write some text first, then run the assistant.";
    return;
  }

  output.textContent = "Working...";
  try {
    const response = await api("/ai/assist", {
      method: "POST",
      body: JSON.stringify({
        text: input.value,
        task: byId("assistantTask")?.value || "translate_and_correct",
        target_language: byId("assistantLanguage")?.value || "English"
      })
    });
    output.textContent = response.result;
  } catch (error) {
    output.textContent = error.message;
  }
}

function fillAssistantTemplate(templateKey) {
  const input = byId("assistantInput");
  const output = byId("assistantOutput");
  if (input) input.value = ASSISTANT_TEMPLATES[templateKey] || "";
  if (output) output.textContent = "Template loaded. You can edit it and run the AI helper.";
}

function renderRemindersPanel() {
  const insightGrid = byId("remindersInsightGrid");
  const list = byId("remindersList");
  if (!insightGrid || !list) return;

  const deadlines = [...state.deadlines].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const pending = deadlines.filter((deadline) => !deadline.is_done);
  const today = new Date();
  const next48 = pending.filter((deadline) => new Date(deadline.due_at).getTime() - today.getTime() <= 48 * 60 * 60 * 1000);

  insightGrid.innerHTML = [
    ["Pending", pending.length, "Deadlines not marked as done"],
    ["Next 48h", next48.length, "Items due within the next two days"],
    ["Completed", deadlines.filter((deadline) => deadline.is_done).length, "Deadlines already marked done"]
  ].map(([label, value, note]) => `
    <div class="insight-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <span style="margin-top:8px;">${escapeHtml(note)}</span>
    </div>
  `).join("");

  list.innerHTML = pending.length ? pending.map((deadline) => `
    <div class="stack-item">
      <strong>${escapeHtml(deadline.title)}</strong>
      <p>${escapeHtml(deadline.course)}</p>
      <div class="app-note">${escapeHtml(formatDateTime(deadline.due_at))}</div>
    </div>
  `).join("") : `<div class="mail-empty" style="min-height:180px;">No reminders were found in the backend for this user.</div>`;
}

function prepareCertificateCompose() {
  const profile = state.profile;
  openComposeModal({
    category: "Certificate",
    subject: "Certificate Request",
    body: `Dear Office,\n\nI would like to request a certificate.\n\nName: ${profile?.full_name || "[Your Name]"}\nID: ${profile?.user_id || "[Your ID]"}\nProgram: ${profile?.details?.major || "[Program]"}\n\nThank you.`
  });
}

function renderCertificatesPanel() {
  const list = byId("certificateMessageList");
  if (!list) return;

  const role = normalizeRole(document.body.dataset.role);
  const source = role === "student" ? getAllEmails() : state.inbox;
  const items = source.filter((email) => emailMatchesAnyTerm(email, CERTIFICATE_TERMS));

  list.innerHTML = items.length ? items.slice(0, 8).map((email) => `
    <div class="stack-item">
      <strong>${escapeHtml(email.subject)}</strong>
      <p>${escapeHtml(previewText(email.body))}</p>
      <div class="app-note">${escapeHtml(email.sender_email)} · ${escapeHtml(formatDateTime(email.timestamp))}</div>
    </div>
  `).join("") : `<div class="mail-empty" style="min-height:180px;">No certificate-related emails were found yet.</div>`;
}

function renderEmailsHub() {
  const list = byId("emailsSentList");
  if (!list) return;
  list.innerHTML = state.sent.length ? state.sent.slice(0, 6).map((email) => `
    <div class="stack-item">
      <strong>${escapeHtml(email.subject)}</strong>
      <p>${escapeHtml(previewText(email.body))}</p>
      <div class="app-note">To ${escapeHtml(email.receiver_email)} · ${escapeHtml(formatDateTime(email.timestamp))}</div>
    </div>
  `).join("") : `<div class="mail-empty" style="min-height:180px;">No sent emails are stored for this professor yet.</div>`;
}

async function loadStudentCrm(query = "") {
  if (normalizeRole(document.body.dataset.role) !== "professor") return;
  const value = query.trim();
  const users = await api(`/users/search?role=student&q=${encodeURIComponent(value)}&limit=50`);
  state.crmUsers = new Map(users.map((user) => [user.id, user]));
  renderCrmResults(users);
}

function renderCrmResults(users) {
  const container = byId("crmResults");
  if (!container) return;

  container.innerHTML = users.length ? users.map((user) => `
    <div class="result-card">
      <h4>${escapeHtml(user.full_name)}</h4>
      <p>${escapeHtml(user.email)}</p>
      <div class="pill-list" style="margin-bottom:12px;">
        <span class="muted-pill">ID ${escapeHtml(user.id)}</span>
        <span class="muted-pill">${escapeHtml(user.major || user.meta || "Student")}</span>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" data-crm-user-id="${escapeHtml(user.id)}">Open Chat</button>
    </div>
  `).join("") : `<div class="mail-empty" style="grid-column:1/-1;min-height:220px;">No student records matched your search.</div>`;
}

function renderReportsPanel() {
  const grid = byId("reportsInsightGrid");
  const summary = byId("reportsSummary");
  if (!grid || !summary) return;

  const role = normalizeRole(document.body.dataset.role);
  const certificateItems = state.inbox.filter((email) => emailMatchesAnyTerm(email, CERTIFICATE_TERMS));
  const cards = role === "student"
    ? [
        ["Total Emails", getAllEmails().length, "Inbox and sent records"],
        ["Unread Emails", countUnreadEmails(state.inbox), "Unread inbox messages"],
        ["Conversations", state.conversations.length, "Users in current chat history"],
        ["Pending Deadlines", state.deadlines.filter((deadline) => !deadline.is_done).length, "Upcoming student reminders"]
      ]
    : [
        ["Total Emails", getAllEmails().length, "Inbox and sent records"],
        ["Unread Emails", countUnreadEmails(state.inbox), "Unread inbox messages"],
        ["Conversations", state.conversations.length, "Active chat connections"],
        ["Certificate Requests", certificateItems.length, "Certificate related inbox items"]
      ];

  grid.innerHTML = cards.map(([label, value, note]) => `
    <div class="insight-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <span style="margin-top:8px;">${escapeHtml(note)}</span>
    </div>
  `).join("");

  summary.textContent = role === "student"
    ? `This report summarizes the restored original tabs using backend data. You currently have ${getAllEmails().length} stored emails, ${state.conversations.length} chat conversations, and ${state.deadlines.filter((deadline) => !deadline.is_done).length} pending reminders.`
    : `This report summarizes the restored original tabs using backend data. You currently have ${getAllEmails().length} stored emails, ${state.conversations.length} chat conversations, and ${certificateItems.length} certificate-related inbox items.`;
}

function renderSupplementalPanels() {
  renderEmailsHub();
  renderCertificatesPanel();
  renderRemindersPanel();
  renderReportsPanel();
  const activeButton = activeButtonElement();
  if (activeButton?.dataset.targetPanel === "course-detail") {
    renderCourseDetail(activeButton);
  }
}

function applyHeaderAction(actionType) {
  const button = byId("headerActionButton");
  if (!button) return;

  const actions = {
    photo: ["Change Photo", () => byId("photoUploadInput")?.click()],
    compose: ["Compose", () => openComposeModal()],
    "refresh-chat": ["Refresh Chat", async () => {
      await loadConversations();
      await loadChatHistory();
    }],
    "run-assistant": ["Run AI", runAssistant],
    "refresh-reminders": ["Refresh Reminders", loadDeadlines],
    "certificate-request": ["Compose Request", prepareCertificateCompose],
    "refresh-crm": ["Refresh CRM", () => loadStudentCrm(byId("crmSearchInput")?.value || "")],
    "refresh-certificates": ["Refresh Certificates", renderCertificatesPanel],
    "refresh-automation": ["Review Automation", () => setInlineMessage("appNotice", "The original Auto-Replies tab has been restored. You can connect it to n8n or backend automation next.", "success")],
    "refresh-reports": ["Refresh Reports", renderReportsPanel]
  };

  const config = actions[actionType];
  if (!config) {
    button.classList.add("hidden");
    button.onclick = null;
    return;
  }

  button.classList.remove("hidden");
  button.textContent = config[0];
  button.onclick = () => Promise.resolve(config[1]()).catch((error) => setInlineMessage("appNotice", error.message, "error"));
}

function openSection(section, sourceButton = null) {
  const button = sourceButton || document.querySelector(`[data-section="${section}"]`);
  if (!button) return;

  const panelKey = button.dataset.targetPanel || section;
  state.activeSection = section;
  state.activePanel = panelKey;

  document.querySelectorAll("[data-section]").forEach((node) => {
    node.classList.toggle("active", node === button);
  });

  document.querySelectorAll(".section-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === panelKey);
  });

  if (byId("topPageTitle")) byId("topPageTitle").textContent = button.dataset.sectionTitle || "Dashboard";
  if (byId("topPageSubtitle")) byId("topPageSubtitle").textContent = button.dataset.sectionSubtitle || "";
  applyHeaderAction(button.dataset.action || "");

  if (panelKey === "course-detail") renderCourseDetail(button);
  if (panelKey === "reminders") renderRemindersPanel();
  if (panelKey === "certificates") renderCertificatesPanel();
  if (panelKey === "emails") renderEmailsHub();
  if (panelKey === "reports") renderReportsPanel();
  if (panelKey === "student-crm") {
    loadStudentCrm(byId("crmSearchInput")?.value || "").catch((error) => setInlineMessage("appNotice", error.message, "error"));
  }
}

function bindMailboxEvents() {
  document.querySelectorAll("[data-mail-folder]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mailboxFolder = button.dataset.mailFolder;
      updateFolderTabs();
      renderMailboxList();
    });
  });

  byId("mailSearchInput")?.addEventListener("input", renderMailboxList);
  byId("mailList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-email-id]");
    if (row) openEmail(row.dataset.emailId);
  });
}

function bindComposeEvents() {
  byId("composeOpenButton")?.addEventListener("click", () => openComposeModal());
  byId("emailsComposeButton")?.addEventListener("click", () => openComposeModal());
  byId("composeCloseButton")?.addEventListener("click", closeComposeModal);
  byId("composeSendButton")?.addEventListener("click", () => sendComposeEmail().catch((error) => setInlineMessage("composeStatus", error.message, "error")));

  byId("composeModal")?.addEventListener("click", (event) => {
    if (event.target.id === "composeModal") closeComposeModal();
  });

  byId("composeSearchInput")?.addEventListener("input", (event) => {
    searchComposeUsers(event.target.value).catch((error) => setInlineMessage("composeStatus", error.message, "error"));
  });

  byId("composeRecipientResults")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-compose-user-id]");
    if (!row) return;
    const user = state.composeUsers.get(row.dataset.composeUserId);
    if (!user) return;
    if (byId("composeToInput")) byId("composeToInput").value = user.email;
    if (byId("composeSearchInput")) byId("composeSearchInput").value = user.full_name;
    renderComposeSearchResults([], "");
  });

  byId("certificateComposeButton")?.addEventListener("click", prepareCertificateCompose);
}

function bindChatEvents() {
  byId("chatDirectorySearch")?.addEventListener("input", (event) => {
    searchChatUsers(event.target.value).catch((error) => setInlineMessage("appNotice", error.message, "error"));
  });

  byId("chatDirectoryList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-chat-user-id]");
    if (!row) return;
    const user = state.chatUsers.get(row.dataset.chatUserId);
    if (user) {
      openChatWithUser(user).catch((error) => setInlineMessage("appNotice", error.message, "error"));
    }
  });

  byId("chatSendButton")?.addEventListener("click", () => {
    sendChatText().catch((error) => setInlineMessage("appNotice", error.message, "error"));
  });

  byId("chatTextInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChatText().catch((error) => setInlineMessage("appNotice", error.message, "error"));
    }
  });

  byId("chatVoiceButton")?.addEventListener("click", () => {
    toggleVoiceRecording().catch((error) => {
      resetRecorderButton();
      setInlineMessage("appNotice", error.message, "error");
    });
  });

  const tray = byId("chatStickerTray");
  if (tray) {
    tray.innerHTML = STICKERS.map((sticker) => `<button class="sticker-btn" type="button" data-sticker="${escapeHtml(sticker)}">${escapeHtml(sticker)}</button>`).join("");
    tray.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sticker]");
      if (!button) return;
      sendSticker(button.dataset.sticker).catch((error) => setInlineMessage("appNotice", error.message, "error"));
    });
  }
}

function bindAuxiliaryEvents() {
  document.querySelectorAll("[data-assistant-template]").forEach((button) => {
    button.addEventListener("click", () => fillAssistantTemplate(button.dataset.assistantTemplate));
  });
  byId("assistantRunButton")?.addEventListener("click", () => runAssistant().catch((error) => setInlineMessage("appNotice", error.message, "error")));
  byId("crmSearchInput")?.addEventListener("input", (event) => {
    loadStudentCrm(event.target.value).catch((error) => setInlineMessage("appNotice", error.message, "error"));
  });
  byId("crmResults")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-crm-user-id]");
    if (!button) return;
    const user = state.crmUsers.get(button.dataset.crmUserId);
    if (!user) return;
    const chatButton = document.querySelector('[data-section="chat"]');
    openSection("chat", chatButton);
    openChatWithUser(user).catch((error) => setInlineMessage("appNotice", error.message, "error"));
  });
}

function bindDashboardEvents() {
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => openSection(button.dataset.section, button));
  });

  byId("logoutButton")?.addEventListener("click", (event) => {
    event.preventDefault();
    clearSession();
    window.location.href = "index.html";
  });

  byId("photoUploadInput")?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    uploadProfilePhoto(file).catch((error) => setInlineMessage("appNotice", error.message, "error"));
  });

  byId("profileUploadButton")?.addEventListener("click", () => byId("photoUploadInput")?.click());

  bindMailboxEvents();
  bindComposeEvents();
  bindChatEvents();
  bindAuxiliaryEvents();
}

async function refreshDashboardData() {
  await loadProfile();
  await Promise.all([loadMailbox(), loadConversations(), loadDeadlines()]);
  renderSupplementalPanels();
}

function startChatPolling() {
  stopChatPolling();
  state.chatPoller = window.setInterval(async () => {
    try {
      await loadConversations();
      if (state.selectedChatUser) await loadChatHistory();
    } catch (_error) {
      return null;
    }
  }, 5000);
}

function stopChatPolling() {
  if (state.chatPoller) {
    clearInterval(state.chatPoller);
    state.chatPoller = null;
  }
}

async function initDashboardPage() {
  const expectedRole = normalizeRole(document.body.dataset.role || "student");
  const session = currentSession();
  if (!session) {
    redirectToAuth(expectedRole);
    return;
  }

  const actualRole = normalizeRole(session.role);
  if (actualRole !== expectedRole) {
    redirectToDashboard(actualRole);
    return;
  }

  bindDashboardEvents();
  openSection("dashboard", document.querySelector('[data-section="dashboard"]'));

  try {
    await refreshDashboardData();
    startChatPolling();
    window.addEventListener("beforeunload", stopChatPolling);
  } catch (error) {
    clearSession();
    setInlineMessage("appNotice", `${error.message}. Please sign in again.`, "error");
    setTimeout(() => redirectToAuth(expectedRole), 900);
  }
}

function selectAuthRole(role) {
  const resolvedRole = normalizeRole(role);
  document.querySelectorAll("[data-auth-role]").forEach((button) => {
    button.classList.toggle("active", normalizeRole(button.dataset.authRole) === resolvedRole);
  });
  if (byId("selectedRoleInput")) byId("selectedRoleInput").value = resolvedRole;
  if (byId("accountIdLabel")) byId("accountIdLabel").textContent = resolvedRole === "student" ? "Student ID" : "Employee ID";
  if (byId("accountIdInput")) byId("accountIdInput").placeholder = resolvedRole === "student" ? "Enter your SDU student ID" : "Enter your employee ID";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setInlineMessage("authStatus", "");

  const button = byId("loginButton");
  const email = byId("emailInput")?.value.trim();
  const accountId = byId("accountIdInput")?.value.trim();
  const role = normalizeRole(byId("selectedRoleInput")?.value || "student");

  if (!email || !accountId) {
    setInlineMessage("authStatus", "University email and account ID are required.", "error");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Checking database...";
  }

  try {
    const response = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        role,
        email,
        account_id: accountId
      })
    });

    saveSession({
      role: response.role,
      user_id: response.user_id,
      email: response.email,
      full_name: response.full_name,
      profile_photo: response.profile_photo
    });

    redirectToDashboard(response.role);
  } catch (error) {
    setInlineMessage("authStatus", error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Sign In";
    }
  }
}

function initAuthPage() {
  const roleParam = normalizeRole(new URLSearchParams(window.location.search).get("role") || "student");
  selectAuthRole(roleParam);

  document.querySelectorAll("[data-auth-role]").forEach((button) => {
    button.addEventListener("click", () => selectAuthRole(button.dataset.authRole));
  });

  byId("authForm")?.addEventListener("submit", (event) => {
    handleAuthSubmit(event).catch((error) => setInlineMessage("authStatus", error.message, "error"));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "auth") {
    initAuthPage();
  } else if (page === "dashboard") {
    initDashboardPage().catch((error) => setInlineMessage("appNotice", error.message, "error"));
  }
});

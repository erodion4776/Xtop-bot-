(() => {
  const API = "https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/engr-ero-portal";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZHl3YXJubndqaXRmdnFwZ2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjg0OTYsImV4cCI6MjEwNTYwNDQ5Nn0.wCYnY-7wlxg0hN9GYIytfpr9mIMc2rURlqM3g2_aN-U";
  const params = new URLSearchParams(location.search);
  const accessToken = params.get("token") || "";
  const statusEl = document.getElementById("status");
  const verifyEl = document.getElementById("verify");
  const contentEl = document.getElementById("content");
  const codeArea = document.getElementById("codeArea");
  const deviceId = getDeviceId();
  let sessionToken = localStorage.getItem("engr_ero_session_" + accessToken) || "";
  let sessionPurpose = localStorage.getItem("engr_ero_purpose_" + accessToken) || "";
  let selectedAnswer = "";
  let timerHandle = null;

  function getDeviceId() {
    let value = localStorage.getItem("engr_ero_device");
    if (!value) {
      value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2));
      localStorage.setItem("engr_ero_device", value);
    }
    return value;
  }
  function status(message, error = false) {
    statusEl.textContent = message;
    statusEl.classList.remove("hidden");
    statusEl.style.background = error ? "#fde9e7" : "#fff5dd";
    statusEl.style.color = error ? "#8b2520" : "#77510a";
  }
  async function api(action, data = {}) {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON },
      body: JSON.stringify({ action, token: accessToken, session_token: sessionToken, device_id: deviceId, ...data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || "The request could not be completed.");
    return result;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  document.getElementById("requestCode").addEventListener("click", async () => {
    try {
      status("Sending a verification code to your registered WhatsApp number…");
      await api("request_otp");
      codeArea.classList.remove("hidden");
      status("Code sent. Check WhatsApp on the number you used to register.");
    } catch (error) { status(error.message, true); }
  });
  document.getElementById("verifyCode").addEventListener("click", async () => {
    try {
      const code = document.getElementById("code").value.trim();
      status("Verifying your code…");
      const result = await api("verify_otp", { code });
      sessionToken = result.session_token;
      sessionPurpose = result.purpose;
      localStorage.setItem("engr_ero_session_" + accessToken, sessionToken);
      localStorage.setItem("engr_ero_purpose_" + accessToken, sessionPurpose);
      verifyEl.classList.add("hidden");
      if (sessionPurpose === "EXAM") await restoreExam();
      else await loadLesson();
    } catch (error) { status(error.message, true); }
  });

  async function loadLesson() {
    try {
      const data = await api("lesson");
      if (data.course_complete) return showCourseComplete();
      contentEl.classList.remove("hidden");
      contentEl.innerHTML = `
        <article class="panel">
          <p class="muted">${escapeHtml(data.course?.course_code)} · Lesson ${data.order} of ${data.total}</p>
          <h2 class="lesson-title">${escapeHtml(data.lesson?.title)}</h2>
          <p class="muted">${escapeHtml(data.lesson?.module_title || "")} · Estimated duration: ${escapeHtml(data.lesson?.duration || "15 mins")}</p>
          ${data.lesson?.objectives ? `<div class="section"><h3>Learning outcomes</h3><div class="section-content">${escapeHtml(data.lesson.objectives)}</div></div>` : ""}
          ${data.lesson?.image_url ? `<img class="hero-img" src="${escapeHtml(data.lesson.image_url)}" alt="Lesson illustration" loading="lazy">` : ""}
        </article>
        <article class="panel">
          <h3>Lecture content</h3>
          ${(data.sections || []).map((section, i) => `<section class="section"><h3>${i + 1}. ${escapeHtml(section.title)}</h3><div class="section-content">${escapeHtml(section.content)}</div></section>`).join("")}
          ${(data.media || []).map(item => item.file_url ? `<div class="section media"><img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.caption || "Course diagram")}" loading="lazy"><p class="muted">${escapeHtml(item.caption || item.description || "")}</p></div>` : "").join("")}
          <p class="muted">Read the lecture and study the diagrams before marking it complete. Your progress is saved to your student record.</p>
          <button id="completeLesson">Complete this lecture and continue</button>
        </article>`;
      document.getElementById("completeLesson").addEventListener("click", async () => {
        const button = document.getElementById("completeLesson");
        button.disabled = true; button.textContent = "Saving your progress…";
        try {
          const result = await api("complete_lesson", { lesson_id: data.lesson.id });
          if (result.course_complete) showCourseComplete();
          else { status("Lecture completed. Opening your next lecture…"); await loadLesson(); }
        } catch (error) { button.disabled = false; button.textContent = "Complete this lecture and continue"; status(error.message, true); }
      });
    } catch (error) { status(error.message, true); }
  }
  function showCourseComplete() {
    contentEl.classList.remove("hidden");
    contentEl.innerHTML = `<article class="panel"><h2>🎉 All course lectures completed</h2><p class="muted">Your lecture progress has been saved. Return to your WhatsApp chat with Engr. Ero Learning Centre. Your CBT payment and personal examination link will be handled there.</p><button id="backWhatsApp">Return to WhatsApp</button></article>`;
    document.getElementById("backWhatsApp").addEventListener("click", () => {
      status("Return to the WhatsApp conversation where you received your classroom link.");
    });
  }
  async function restoreExam() {\n    try {\n      const result = await api("exam_status");\n      if (result.completed) showExamResult(result);\n      else if (result.ready) showExamIntro();\n      else renderQuestion(result);\n    } catch (error) { status(error.message, true); }\n  }\n  function showExamIntro() {
    contentEl.classList.remove("hidden");
    contentEl.innerHTML = `<article class="panel"><h2>Personal CBT Examination</h2><p class="muted">You have 50 questions and 30 minutes. The timer is controlled by the server and will continue if you refresh or close this page. Your answers are saved as you go.</p><button id="startExam">Start 30-minute exam</button></article>`;
    document.getElementById("startExam").addEventListener("click", async () => {
      try { status("Starting your examination…"); await examAction("start_exam"); }
      catch (error) { status(error.message, true); }
    });
  }
  async function examAction(action, data = {}) {
    const result = await api(action, data);
    if (result.completed) return showExamResult(result);
    renderQuestion(result);
  }
  function renderQuestion(state) {
    contentEl.classList.remove("hidden");
    selectedAnswer = "";
    contentEl.innerHTML = `
      <article class="panel">
        <div class="muted">${state.index + 1} of ${state.total} questions</div>
        <div class="timer" id="timer">30:00</div>
        <h2 class="lesson-title">${escapeHtml(state.question.question)}</h2>
        <div id="choices">
          ${["A","B","C","D"].map(letter => `<button class="choice" data-answer="${letter}"><strong>${letter}.</strong> ${escapeHtml(state.question["option_" + letter.toLowerCase()])}</button>`).join("")}
        </div>
        <button id="submitAnswer" disabled>Save answer and continue</button>
        <p class="muted">Your answer is saved on the server before the next question opens. Do not close this page until you submit.</p>
      </article>`;
    document.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
      selectedAnswer = button.dataset.answer;
      document.querySelectorAll("[data-answer]").forEach(item => item.classList.toggle("selected", item === button));
      document.getElementById("submitAnswer").disabled = false;
    }));
    document.getElementById("submitAnswer").addEventListener("click", async () => {
      const button = document.getElementById("submitAnswer");
      button.disabled = true; button.textContent = "Saving answer…";
      try { await examAction("submit_answer", { index: state.index, answer: selectedAnswer }); }
      catch (error) { status(error.message, true); button.disabled = false; button.textContent = "Save answer and continue"; }
    });
    const expires = new Date(state.expires_at).getTime();
    if (timerHandle) clearInterval(timerHandle);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
      const el = document.getElementById("timer");
      if (el) el.textContent = String(Math.floor(remaining / 60)).padStart(2,"0") + ":" + String(remaining % 60).padStart(2,"0");
      if (remaining <= 0) {
        clearInterval(timerHandle);
        examAction("exam_state").catch(error => status(error.message, true));
      }
    };
    tick(); timerHandle = setInterval(tick, 1000);
  }
  function showExamResult(result) {
    if (timerHandle) clearInterval(timerHandle);
    contentEl.classList.remove("hidden");
    contentEl.innerHTML = `<article class="panel"><h2>CBT submitted</h2><p class="timer">${escapeHtml(result.percentage ?? 0)}%</p><p class="muted">Score: ${escapeHtml(result.score ?? 0)} · Result: ${escapeHtml(result.pass_status || (result.percentage >= 50 ? "PASS" : "FAIL"))}</p><p class="muted">Your result has been saved and sent to your registered WhatsApp number.</p></article>`;
  }
  if (!accessToken) {
    verifyEl.classList.add("hidden");
    status("This classroom link is missing its secure token. Open the original link sent to your WhatsApp.", true);
  } else if (sessionToken) {
    verifyEl.classList.add("hidden");
    api("lesson").then(data => {
      if (data.purpose === "EXAM") showExamIntro();
      else if (data.course_complete) showCourseComplete();
      else loadLesson();
    }).catch(() => {
      localStorage.removeItem("engr_ero_session_" + accessToken);
      sessionToken = "";
      verifyEl.classList.remove("hidden");
      status("Your browser session needs verification again. Request a fresh code from WhatsApp.");
    });
  }
})();
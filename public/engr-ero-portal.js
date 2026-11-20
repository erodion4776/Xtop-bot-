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
  let completingLesson = false;
  let activeCourseCode = localStorage.getItem("engr_ero_course_" + accessToken) || "";

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
      if (data.course?.course_code) {
        activeCourseCode = String(data.course.course_code).toUpperCase();
        localStorage.setItem("engr_ero_course_" + accessToken, activeCourseCode);
      }
      if (data.course_complete) return showCourseComplete();
      contentEl.classList.remove("hidden");
      if (data.presentation_html) {
        contentEl.innerHTML = `
          <article class="panel">
            <p class="muted">${escapeHtml(data.course?.course_code)} · Lecture ${data.order} of ${data.total}</p>
            <h2 class="lesson-title">${escapeHtml(data.lesson?.title)}</h2>
            <p class="muted">70-minute interactive lecture · 39 scenes · 10 sections</p>
            <iframe id="lecturePresentation" title="History of the Automobile lecture" sandbox="allow-scripts allow-presentation" allowfullscreen style="display:block;width:100%;height:78vh;min-height:580px;border:0;border-radius:14px;background:#050d19"></iframe>
            <p class="muted" style="margin-top:12px">Use the Play, scene, chapter, speed and Voice controls inside the lecture. Browser voice narration is enabled by default; availability depends on your phone's speech engine.</p>
          </article>
          <article class="panel">
            <p class="muted">Study the complete presentation before continuing. Your progress is saved when you complete this lecture.</p>
            <button id="completeLesson" data-lesson-id="${escapeHtml(data.lesson.id)}">Complete this lecture and continue</button>
          </article>`;
        const lectureFrame = document.getElementById("lecturePresentation");
        lectureFrame.srcdoc = data.presentation_html;
        document.getElementById("completeLesson").addEventListener("click", () => completeCurrentLesson(data.lesson.id));
        return;
      }
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
          <button id="completeLesson" data-lesson-id="${escapeHtml(data.lesson.id)}">Complete this lecture and continue</button>
        </article>`;
      document.getElementById("completeLesson").addEventListener("click", () => completeCurrentLesson(data.lesson.id));
    } catch (error) { status(error.message, true); }
  }
  async function completeCurrentLesson(lessonId) {
    if (completingLesson) return;
    completingLesson = true;
    const button = document.getElementById("completeLesson");
    if (button) { button.disabled = true; button.textContent = "Saving your progress…"; }
    try {
      const result = await api("complete_lesson", { lesson_id: lessonId });
      if (result.course_complete) {
        if (activeCourseCode === "ELA401") showMtmSimulation();
        else showCourseComplete();
      } else {
        status("Lecture completed. Opening lecture " + result.next_order + " of the course…");
        await loadLesson();
      }
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "Complete this lecture and continue"; }
      status(error.message, true);
    } finally {
      completingLesson = false;
    }
  }
  window.addEventListener("message", event => {
    const frame = document.getElementById("lecturePresentation");
    if (!frame || event.source !== frame.contentWindow || event.data?.type !== "ENGR_ERO_COMPLETE_LESSON") return;
    const lessonId = document.getElementById("completeLesson")?.dataset.lessonId;
    if (lessonId) completeCurrentLesson(lessonId);
  });
  function showCourseComplete() {
    if (activeCourseCode === "ELA401") return showMtmSimulation();
    contentEl.classList.remove("hidden");
    contentEl.innerHTML = `<article class="panel"><h2>🎉 All course lectures completed</h2><p class="muted">Your lecture progress has been saved. You are being returned to WhatsApp. Choose Final CBT Exam there to pay and unlock your secure examination.</p><a id="backWhatsApp" href="https://wa.me/2348024988555?text=I%20have%20completed%20all%20my%20lectures.%20Please%20help%20me%20continue%20to%20the%20CBT%20payment." style="display:block;text-align:center;text-decoration:none;background:#146b4a;color:white;padding:14px 17px;border-radius:12px;font-weight:700;margin-top:16px">Return to WhatsApp and continue to CBT</a></article>`;
    const backLink = document.getElementById("backWhatsApp");
    setTimeout(() => { if (backLink) window.location.href = backLink.href; }, 1800);
  }

  function showMtmSimulation() {
    contentEl.classList.remove("hidden");
    const stages = [
      { label:"Reach for the plug body", expected:"body", choices:[["body","Pick up the three-point plug body"],["driver","Pick up the screwdriver"],["cover","Replace the plug cover"]] },
      { label:"Reach for and grasp the screwdriver", expected:"driver", choices:[["wire","Pick up the cable"],["driver","Reach for and grasp the screwdriver"],["body","Move the plug body"]] },
      { label:"Loosen the terminal screws", expected:"loosen", choices:[["tighten","Tighten the terminal screws immediately"],["loosen","Use the screwdriver to loosen the terminal screws"],["cover","Remove the cover without loosening screws"]] },
      { label:"Prepare the cable end", expected:"strip", choices:[["strip","Prepare/strip the cable end with the supply disconnected"],["energize","Connect the cable to a live supply"],["tighten","Tighten the terminal screws"]] },
      { label:"Identify the marked L, N and E conductors", expected:"identify", choices:[["identify","Identify conductors using the L, N and E markings"],["guess","Guess the terminal positions"],["cover","Close the plug cover"]] },
      { label:"Insert conductors into the correct marked terminals", expected:"insert", choices:[["insert","Insert each conductor into its matching L, N or E terminal"],["twist","Twist all conductors together"],["grip","Fit the cable grip first"]] },
      { label:"Tighten the terminal screws", expected:"secure", choices:[["secure","Tighten the terminal screws and secure the conductors"],["loosen","Loosen the screws again"],["remove","Remove the conductors"]] },
      { label:"Secure the cable grip and replace the cover", expected:"finish", choices:[["finish","Secure the outer cable with the grip and replace the cover"],["pull","Leave the cable grip loose"],["energize","Energize the plug before inspection"]] },
      { label:"Return the screwdriver and inspect the assembly", expected:"inspect", choices:[["inspect","Return the screwdriver, inspect the assembly and rest both hands"],["leave","Leave the screwdriver in the plug"],["energize","Test with a live supply"]] }
    ];
    let index = 0, errors = 0, started = Date.now(), lastAction = started;
    const records = [];

    contentEl.innerHTML = '<article class="panel"><p class="muted">400 LEVEL · EXPERIMENT 17</p><h2 class="lesson-title">Interactive MTM Plug-Assembly Simulation</h2><p class="muted">You are at a workbench. Assemble a three-point electric plug using the screwdriver. Follow the work sequence, select the correct action at each stage and observe how your work is measured.</p><div style="background:#fff4dc;border-radius:12px;padding:12px;color:#704b08;font-size:14px;margin:12px 0"><strong>Safety:</strong> This is a computer simulation only. The cable is disconnected from every power source. Never work on a live plug.</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0"><span style="background:#e7f1eb;padding:7px 10px;border-radius:9px;font-size:13px">Plug body</span><span style="background:#e7f1eb;padding:7px 10px;border-radius:9px;font-size:13px">Cable</span><span style="background:#e7f1eb;padding:7px 10px;border-radius:9px;font-size:13px">Screwdriver</span></div><div id="simVisual" style="border:1px solid #e0e8e3;border-radius:14px;padding:16px;text-align:center;background:#f7faf8"><svg viewBox="0 0 320 150" role="img" aria-label="Illustration of a three-pin plug and screwdriver" style="width:100%;max-width:340px;height:auto"><rect x="48" y="35" width="118" height="84" rx="15" fill="#dfe8e2" stroke="#315d49" stroke-width="3"/><circle cx="107" cy="58" r="7" fill="#b2c1b7" stroke="#315d49" stroke-width="2"/><rect x="70" y="74" width="12" height="25" rx="3" fill="#bdc8c0"/><rect x="132" y="74" width="12" height="25" rx="3" fill="#bdc8c0"/><path d="M166 76 C202 76 207 96 236 96" stroke="#315d49" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M230 25 L275 70" stroke="#7b4b2a" stroke-width="11" stroke-linecap="round"/><path d="M222 17 L234 29" stroke="#b7bec0" stroke-width="5" stroke-linecap="round"/><text x="107" y="137" font-size="10" text-anchor="middle" fill="#315d49">THREE-POINT PLUG</text><text x="257" y="91" font-size="10" text-anchor="middle" fill="#315d49">SCREWDRIVER</text></svg><p id="simProgress" class="muted">Stage 1 of 9</p><h3 id="simStage" style="margin:8px 0">Reach for the plug body</h3><div id="simChoices"></div><p id="simFeedback" class="muted" aria-live="polite">Choose the action that should happen next.</p></div><p class="muted" style="margin-top:12px">Your performance record includes sequence accuracy, incorrect choices and elapsed time. The simulation time is your observed practice time; it is not a substitute for the official MTM table values.</p></article>';
    function renderStage() {
      const stage = stages[index];
      document.getElementById("simProgress").textContent = "Stage " + (index + 1) + " of " + stages.length + " · Errors: " + errors;
      document.getElementById("simStage").textContent = stage.label;
      document.getElementById("simFeedback").textContent = "Choose the action that should happen next.";
      document.getElementById("simChoices").innerHTML = stage.choices.map(choice => '<button class="choice" data-sim="' + choice[0] + '">' + escapeHtml(choice[1]) + '</button>').join("");
      document.querySelectorAll("[data-sim]").forEach(button => button.addEventListener("click", () => {
        const now = Date.now();
        const correct = button.dataset.sim === stage.expected;
        if (!correct) {
          errors++;
          document.getElementById("simFeedback").textContent = "Not quite. Review the operation and try again. This attempt is recorded as an error.";
          document.getElementById("simProgress").textContent = "Stage " + (index + 1) + " of " + stages.length + " · Errors: " + errors;
          return;
        }
        records.push({ label:stage.label, correct:true, duration_seconds:Number(((now-lastAction)/1000).toFixed(2)) });
        lastAction = now;
        index++;
        if (index >= stages.length) finishSimulation();
        else renderStage();
      }));
    }
    function finishSimulation() {
      const elapsed = Number(((Date.now()-started)/1000).toFixed(2));
      const accuracy = Math.max(0, Math.round((stages.length/(stages.length+errors))*100));
      const weak = errors >= 2 ? "operation sequence and safe work practice" : errors === 1 ? "careful selection of the correct operation" : "consistent operation sequence";
      const state = {steps:records, errors, elapsed_seconds:elapsed, accuracy_percent:accuracy, weak_area:weak, experiment_code:"ELA401-EXP17"};
      contentEl.innerHTML = '<article class="panel"><p class="muted">SIMULATION COMPLETED · PERSONAL PERFORMANCE REVIEW</p><h2 class="lesson-title">Your plug assembly result</h2><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Sequence accuracy</div><div class="timer">' + accuracy + '%</div></div><div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Observed time</div><div class="timer">' + elapsed + 's</div></div><div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Correct stages</div><div class="timer">' + records.length + '/9</div></div><div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Incorrect choices</div><div class="timer">' + errors + '</div></div></div><section class="section"><h3>What your result tells you</h3><p class="section-content">' + (errors===0 ? 'Excellent. You followed all nine operations in the intended sequence. Continue to keep the work sequence consistent and inspect the completed assembly.' : 'Your main improvement area is ' + escapeHtml(weak) + '. Review the sequence below, especially the stages where you made an incorrect selection, before attempting the practical again.') + '</p><p class="muted">Your measured time is the elapsed time for this simulation. It is useful for comparing practice attempts, but it is not the MTM predetermined time.</p></section><section class="section"><h3>MTM formulas</h3><p class="section-content"><strong>Time in minutes = Total TMU × 0.0006</strong><br><strong>Time in seconds = Total TMU × 0.036</strong><br><strong>1 TMU = 0.0006 minute = 0.036 second</strong></p><p class="muted">Use the official MTM table to find each motion value, add the applicable limiting times to obtain total TMU, then apply the conversion above. Do not use the simulation stopwatch as the total TMU.</p><label for="mtmTmu">Optional: enter the total TMU you calculated from your official MTM table</label><input id="mtmTmu" type="number" min="0" step="0.1" placeholder="Enter total TMU from your table" style="letter-spacing:0"><div id="mtmCalc" class="muted">Enter a TMU total to calculate the MTM time.</div></section></article>';
      const tmuInput = document.getElementById("mtmTmu");
      tmuInput.addEventListener("input", () => {
        const tmu = Number(tmuInput.value);
        document.getElementById("mtmCalc").textContent = tmuInput.value && tmu >= 0
          ? "MTM time: " + (tmu*0.0006).toFixed(4) + " minutes · " + (tmu*0.036).toFixed(3) + " seconds."
          : "Enter a TMU total to calculate the MTM time.";
      });
      document.getElementById("submitPersonalCbt").addEventListener("click",async()=>{
        const button=document.getElementById("submitPersonalCbt");
        button.disabled=true;button.textContent="Saving your simulation result…";
        const tmuValue=tmuInput.value===""?null:Number(tmuInput.value);
        state.mtm_total_tmu=tmuValue;
        state.mtm_time_minutes=tmuValue===null?null:Number((tmuValue*0.0006).toFixed(4));
        state.mtm_time_seconds=tmuValue===null?null:Number((tmuValue*0.036).toFixed(3));
        
        try {
          await api("save_mtm_simulation",{result:state});
          document.getElementById("personalFeedback").textContent="Your Experiment 17 simulation result has been saved. Returning you to WhatsApp for Final CBT payment…";
          button.textContent="Result saved";
          const back=document.createElement("a");
          back.href="https://wa.me/2348024988555?text=I%20have%20completed%20my%20400%20Level%20Experiment%2017%20plug%20assembly%20simulation.%20Please%20continue%20to%20my%20Final%20CBT%20payment.";
          back.textContent="Return to WhatsApp and continue to Final CBT";
          back.style.cssText="display:block;text-align:center;text-decoration:none;background:#146b4a;color:white;padding:14px 17px;border-radius:12px;font-weight:700;margin-top:14px";
          button.after(back);
          setTimeout(() => { window.location.href = back.href; }, 1800);
        } catch(error) {
          document.getElementById("personalFeedback").textContent=error.message;
          button.disabled=false;button.textContent="Retry saving my result";
        }
      });
    }
    renderStage();
  }

  async function restoreExam() {
    try {
      const result = await api("exam_status");
      if (result.completed) showExamResult(result);
      else if (result.ready) showExamIntro();
      else renderQuestion(result);
    } catch (error) { status(error.message, true); }
  }
  function showExamIntro() {
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
    if (sessionPurpose === "EXAM") {
      restoreExam();
    } else {
      loadLesson().catch(() => {
        localStorage.removeItem("engr_ero_session_" + accessToken);
        localStorage.removeItem("engr_ero_purpose_" + accessToken);
        sessionToken = "";
        verifyEl.classList.remove("hidden");
        status("Your browser session needs verification again. Request a fresh code from WhatsApp.");
      });
    }
  }
})();
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
    const steps = [
      { label:"Position the plug body", item:"plug", itemLabel:"Plug body", target:"bench", targetLabel:"Assembly mat", feedback:"The plug body is positioned on the workbench." },
      { label:"Open the plug", item:"cover", itemLabel:"Plug cover", target:"coverTray", targetLabel:"Cover tray", feedback:"The cover is safely removed and placed aside." },
      { label:"Loosen the terminal screws", item:"driver", itemLabel:"Screwdriver", target:"terminals", targetLabel:"Terminal screws", feedback:"The screwdriver is used on the terminal screws." },
      { label:"Bring the cable to the plug", item:"cable", itemLabel:"Three-core cable", target:"entry", targetLabel:"Cable entry", feedback:"The cable is positioned at the plug entry." },
      { label:"Prepare the conductors", item:"cable", itemLabel:"Prepared cable", target:"prep", targetLabel:"Cable preparation area", feedback:"The cable end is prepared in the simulation." },
      { label:"Connect the protective-earth conductor", item:"earth", itemLabel:"Green/yellow conductor", target:"earthTerminal", targetLabel:"E terminal", feedback:"The green/yellow conductor is placed at the marked E terminal." },
      { label:"Connect the neutral conductor", item:"neutral", itemLabel:"Blue conductor", target:"neutralTerminal", targetLabel:"N terminal", feedback:"The blue conductor is placed at the marked N terminal." },
      { label:"Connect the live conductor", item:"live", itemLabel:"Brown conductor", target:"liveTerminal", targetLabel:"L terminal", feedback:"The brown conductor is placed at the marked L terminal." },
      { label:"Tighten the terminal screws", item:"driver", itemLabel:"Screwdriver", target:"tighten", targetLabel:"Terminal screws", feedback:"The terminal connections are secured in the simulation." },
      { label:"Secure the cable grip", item:"grip", itemLabel:"Cable grip", target:"gripSlot", targetLabel:"Cable grip position", feedback:"The outer cable is secured by the cable grip." },
      { label:"Replace the plug cover", item:"cover", itemLabel:"Plug cover", target:"plugTop", targetLabel:"Plug body", feedback:"The cover is returned to the plug body." },
      { label:"Return the screwdriver and inspect", item:"driver", itemLabel:"Screwdriver", target:"toolTray", targetLabel:"Tool tray", feedback:"The tool is returned and the completed assembly is inspected." }
    ];
    const inventory = [
      ["plug","Plug body","🧩"],["cover","Plug cover","▱"],["driver","Screwdriver","🪛"],
      ["cable","Three-core cable","〰️"],["earth","Green/yellow conductor","🟩"],
      ["neutral","Blue conductor","🟦"],["live","Brown conductor","🟫"],["grip","Cable grip","▰"]
    ];
    let index = 0, errors = 0, started = Date.now(), lastAction = started;
    let selectedItem = "";
    const records = [];
    const placed = new Set();
    const itemNames = Object.fromEntries(inventory.map(item => [item[0],item[1]]));

    contentEl.innerHTML =
      '<article class="panel">' +
      '<p class="muted">400 LEVEL · ELA401 · EXPERIMENT 17</p>' +
      '<h2 class="lesson-title">Three-point plug assembly workbench</h2>' +
      '<p class="muted">Interactive practical simulation. Tap a component below to pick it up, then tap the correct workbench position to place or use it. No dragging is required.</p>' +
      '<div style="background:#fff4dc;border-radius:12px;padding:12px;color:#704b08;font-size:14px;margin:12px 0"><strong>Simulation safety:</strong> The plug is disconnected from every power source. This is not a guide to working on a live electrical installation. Follow your laboratory instructor and official manual during any real practical.</div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:12px 0"><span id="simProgress" class="muted">Operation 1 of 12</span><strong id="simClock">00:00</strong><span id="simErrors" class="muted">Errors: 0</span></div>' +
      '<div style="height:8px;background:#e6eee9;border-radius:20px;overflow:hidden"><div id="simBar" style="height:8px;width:0%;background:#238455;transition:width .2s"></div></div>' +
      '<div style="background:#f5f8f6;border:1px solid #dce7e0;border-radius:14px;padding:14px;margin-top:14px">' +
      '<h3 id="simStage" style="margin:0 0 6px">Position the plug body</h3><p id="simInstruction" class="muted" style="margin:0 0 12px">Tap the plug body, then tap the assembly mat.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<section><strong style="font-size:13px">1. PICK A COMPONENT</strong><div id="simInventory" style="display:grid;gap:7px;margin-top:8px"></div></section>' +
      '<section><strong style="font-size:13px">2. PLACE / USE IT</strong><div id="simTargets" style="display:grid;gap:7px;margin-top:8px"></div></section>' +
      '</div><p id="simFeedback" class="muted" aria-live="polite" style="margin:12px 0 0">Select the component required for this operation.</p></div>' +
      '<section style="margin-top:14px"><h3 style="font-size:17px">Assembly workbench</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px">' +
      '<div id="zoneBench" class="sim-zone">🧩<br><small>Assembly mat</small></div>' +
      '<div id="zoneTerminals" class="sim-zone">🔩<br><small>Terminal screws</small></div>' +
      '<div id="zoneEntry" class="sim-zone">〰️<br><small>Cable entry</small></div><div id="zonePrep" class="sim-zone">✂️<br><small>Preparation area</small></div>' +
      '<div id="zoneEarthTerminal" class="sim-zone">🟩<br><small>E terminal</small></div>' +
      '<div id="zoneNeutralTerminal" class="sim-zone">🟦<br><small>N terminal</small></div>' +
      '<div id="zoneLiveTerminal" class="sim-zone">🟫<br><small>L terminal</small></div>' +
      '<div id="zoneCoverTray" class="sim-zone">▱<br><small>Cover tray</small></div>' +
      '<div id="zoneGripSlot" class="sim-zone">▰<br><small>Cable grip</small></div>' +
      '<div id="zoneToolTray" class="sim-zone">🪛<br><small>Tool tray</small></div><div id="zonePlugTop" class="sim-zone">🔒<br><small>Plug body / cover</small></div>' +
      '</div><p class="muted" style="font-size:12px;margin-top:8px">Completed operations will be marked on the workbench.</p></section>' +
      '</article>';
    const style = document.createElement("style");
    style.textContent = '.sim-pick,.sim-target{width:100%;margin:0;padding:10px 7px;border-radius:10px;font-size:12px;line-height:1.3;min-height:54px}.sim-pick{background:#fff;color:#214331;border:1px solid #cbd9d0}.sim-pick.selected{background:#d9f0e2;border:2px solid #238455}.sim-pick:disabled{opacity:.45}.sim-target{background:#e8efeb;color:#244433;border:1px dashed #9aafa1}.sim-target:disabled{opacity:.4}.sim-zone{min-height:74px;border:1px solid #d6e2da;border-radius:10px;background:#fff;text-align:center;padding:10px 3px;font-size:22px}.sim-zone small{display:block;color:#52675b;font-size:11px}.sim-zone.done{background:#e0f2e6;border-color:#238455}';
    contentEl.appendChild(style);

    function render() {
      const step = steps[index];
      selectedItem = "";
      document.getElementById("simProgress").textContent = "Operation " + (index + 1) + " of " + steps.length;
      document.getElementById("simStage").textContent = step.label;
      document.getElementById("simInstruction").textContent = "Tap " + step.itemLabel + " in the component list, then tap " + step.targetLabel + " on the right.";
      document.getElementById("simErrors").textContent = "Errors: " + errors;
      document.getElementById("simBar").style.width = Math.round(index / steps.length * 100) + "%";
      document.getElementById("simFeedback").textContent = "Select the component required for this operation.";
      document.getElementById("simInventory").innerHTML = inventory.map(item =>
        '<button type="button" class="sim-pick" data-pick="' + item[0] + '"' +
        "" + '>' + item[2] + '<br>' + escapeHtml(item[1]) + '</button>'
      ).join("");
      document.getElementById("simTargets").innerHTML = [
        ["bench","Assembly mat"],["coverTray","Cover tray"],["terminals","Terminal screws"],
        ["entry","Cable entry"],["prep","Preparation area"],["earthTerminal","E terminal"],
        ["neutralTerminal","N terminal"],["liveTerminal","L terminal"],["tighten","Tighten screws"],
        ["gripSlot","Cable grip position"],["plugTop","Plug body"],["toolTray","Tool tray"]
      ].map(target => '<button type="button" class="sim-target" data-target="' + target[0] + '"' +
        "" + '>' + escapeHtml(target[1]) + '</button>').join("");
      document.querySelectorAll("[data-pick]").forEach(button => button.addEventListener("click", () => {
        selectedItem = button.dataset.pick;
        document.querySelectorAll("[data-pick]").forEach(el => el.classList.toggle("selected", el === button));
        document.getElementById("simFeedback").textContent = itemNames[selectedItem] + " selected. Now tap " + step.targetLabel + ".";
      }));
      document.querySelectorAll("[data-target]").forEach(button => button.addEventListener("click", () => {
        const now = Date.now();
        if (!selectedItem) {
          document.getElementById("simFeedback").textContent = "Pick up the required component first.";
          return;
        }
        if (button.dataset.target !== step.target || selectedItem !== step.item) {
          errors++;
          document.getElementById("simErrors").textContent = "Errors: " + errors;
          document.getElementById("simFeedback").textContent = "That component or position is not correct for this operation. Try again.";
          selectedItem = "";
          document.querySelectorAll("[data-pick]").forEach(el => el.classList.remove("selected"));
          return;
        }
        records.push({operation:step.label, component:step.item, destination:step.target, correct:true, duration_seconds:Number(((now-lastAction)/1000).toFixed(2))});
        lastAction = now;
        placed.add(step.target);
        const zoneId = "zone" + step.target.charAt(0).toUpperCase() + step.target.slice(1);
        const zone = document.getElementById(zoneId);
        if (zone) zone.classList.add("done");
        document.getElementById("simFeedback").textContent = step.feedback;
        index++;
        if (index >= steps.length) {
          setTimeout(finishSimulation, 450);
        } else {
          setTimeout(render, 450);
        }
      }));
    }

    function finishSimulation() {
      clearInterval(clockHandle);
      const elapsed = Number(((Date.now() - started) / 1000).toFixed(2));
      const accuracy = Math.max(0, Math.round((steps.length / (steps.length + errors)) * 100));
      const weak = errors >= 3 ? "component identification and operation sequence" : errors >= 1 ? "careful component selection and placement" : "consistent component handling and assembly sequence";
      const state = {
        steps:records, errors, elapsed_seconds:elapsed, accuracy_percent:accuracy,
        weak_area:weak, experiment_code:"ELA401-EXP17", interaction_mode:"tap_to_select_tap_to_place"
      };
      contentEl.innerHTML =
        '<article class="panel"><p class="muted">SIMULATION COMPLETED · PERSONAL PERFORMANCE REVIEW</p><h2 class="lesson-title">Your plug assembly result</h2>' +
        '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">' +
        '<div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Sequence accuracy</div><div class="timer">' + accuracy + '%</div></div>' +
        '<div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Observed time</div><div class="timer">' + elapsed + 's</div></div>' +
        '<div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Completed operations</div><div class="timer">' + records.length + '/' + steps.length + '</div></div>' +
        '<div style="background:#edf5ef;padding:14px;border-radius:12px"><div class="muted">Incorrect placements</div><div class="timer">' + errors + '</div></div></div>' +
        '<section class="section"><h3>Performance feedback</h3><p class="section-content">' +
        (errors === 0 ? 'Excellent. You selected and placed every component in the correct sequence.' : 'Your improvement area is ' + escapeHtml(weak) + '. Review the operations and repeat the simulation to improve accuracy.') +
        '</p><p class="muted">The stopwatch records simulation practice time. It is not an MTM predetermined time.</p></section>' +
        '<section class="section"><h3>MTM calculation</h3><p class="section-content"><strong>Time in minutes = Total TMU × 0.0006</strong><br><strong>Time in seconds = Total TMU × 0.036</strong><br><strong>1 TMU = 0.0006 minute = 0.036 second</strong></p>' +
        '<p class="muted">Use the official MTM table to determine each motion value and total TMU. The simulation does not invent MTM values.</p>' +
        '<label for="mtmTmu">Enter total TMU from your official MTM table (optional)</label><input id="mtmTmu" type="number" min="0" step="0.1" placeholder="Total TMU" style="letter-spacing:0"><div id="mtmCalc" class="muted">Enter a TMU total to calculate the MTM time.</div></section>' +
        '<button id="submitPersonalCbt">Save simulation result and return to WhatsApp for CBT payment</button><p id="personalFeedback" class="muted" aria-live="polite"></p></article>';
      const tmuInput = document.getElementById("mtmTmu");
      tmuInput.addEventListener("input", () => {
        const tmu = Number(tmuInput.value);
        document.getElementById("mtmCalc").textContent = tmuInput.value && tmu >= 0
          ? "MTM time: " + (tmu * 0.0006).toFixed(4) + " minutes · " + (tmu * 0.036).toFixed(3) + " seconds."
          : "Enter a TMU total to calculate the MTM time.";
      });
      document.getElementById("submitPersonalCbt").addEventListener("click", async () => {
        const button = document.getElementById("submitPersonalCbt");
        button.disabled = true;
        button.textContent = "Saving your simulation result…";
        const tmuValue = tmuInput.value === "" ? null : Number(tmuInput.value);
        state.mtm_total_tmu = tmuValue;
        state.mtm_time_minutes = tmuValue === null ? null : Number((tmuValue * 0.0006).toFixed(4));
        state.mtm_time_seconds = tmuValue === null ? null : Number((tmuValue * 0.036).toFixed(3));
        try {
          await api("save_mtm_simulation", {result:state});
          document.getElementById("personalFeedback").textContent = "Your Experiment 17 simulation result has been saved. Returning you to WhatsApp for Final CBT payment…";
          button.textContent = "Result saved";
          const back = document.createElement("a");
          back.href = "https://wa.me/2348024988555?text=I%20have%20completed%20my%20400%20Level%20Experiment%2017%20plug%20assembly%20simulation.%20Please%20continue%20to%20my%20Final%20CBT%20payment.";
          back.textContent = "Return to WhatsApp and continue to Final CBT";
          back.style.cssText = "display:block;text-align:center;text-decoration:none;background:#146b4a;color:white;padding:14px 17px;border-radius:12px;font-weight:700;margin-top:14px";
          button.after(back);
          setTimeout(() => { window.location.href = back.href; }, 1800);
        } catch (error) {
          document.getElementById("personalFeedback").textContent = error.message;
          button.disabled = false;
          button.textContent = "Retry saving my result";
        }
      });
    }
    render();
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
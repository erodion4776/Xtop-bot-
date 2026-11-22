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
  const portalStageKey = "engr_ero_stage_" + accessToken;
  const simulationProgressKey = "engr_ero_simulation_" + accessToken;

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
      // A successful lesson response means the classroom session is valid.
      // Hide any stale expiry warning left from an earlier request or page state.
      statusEl.classList.add("hidden");
      statusEl.textContent = "";
      if (data.course?.course_code) {
        activeCourseCode = String(data.course.course_code).toUpperCase();
        localStorage.setItem("engr_ero_course_" + accessToken, activeCourseCode);
      }
      if (data.course_complete) return showCourseComplete();
      contentEl.classList.remove("hidden");
      if (data.lesson?.video_url) {
        contentEl.innerHTML = `
          <article class="panel">
            <p class="muted">${escapeHtml(data.course?.course_code)} · Video ${data.order} of ${data.total}</p>
            <h2 class="lesson-title">${escapeHtml(data.lesson?.title)}</h2>
            <p class="muted">Estimated viewing time: ${escapeHtml(data.lesson?.duration || "Video lesson")}</p>
            <video id="courseVideo" controls playsinline preload="metadata" style="display:block;width:100%;max-height:72vh;background:#050d19;border-radius:14px;object-fit:contain" aria-label="${escapeHtml(data.lesson?.title)}">
              <source src="${escapeHtml(data.lesson.video_url)}" type="video/mp4">
              Your browser does not support HTML video.
            </video>
          </article>
          <article class="panel">
            <h3>What you will learn in this video</h3>
            <p class="section-content">${escapeHtml(data.lesson?.summary || data.lesson?.objectives || "")}</p>
            ${data.lesson?.objectives ? `<div class="section"><h3>Learning outcomes</h3><div class="section-content">${escapeHtml(data.lesson.objectives)}</div></div>` : ""}
            <p class="muted">Watch the video to the end. The completion button will unlock when playback finishes. Your progress is saved to your student record.</p>
            <button id="completeLesson" data-lesson-id="${escapeHtml(data.lesson.id)}" disabled>Finish watching to unlock next video</button>
          </article>`;
        const courseVideo = document.getElementById("courseVideo");
        const completeButton = document.getElementById("completeLesson");
        courseVideo.addEventListener("ended", () => {
          completeButton.disabled = false;
          completeButton.textContent = data.order < data.total ? "Video completed — continue to next part" : "Complete course videos and return to WhatsApp";
        });
        courseVideo.addEventListener("error", () => status("This video could not be loaded. Refresh the page to request a new secure video link.", true));
        completeButton.addEventListener("click", () => completeCurrentLesson(data.lesson.id));
        return;
      }
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
        if (activeCourseCode === "ELA401") {
          localStorage.setItem(portalStageKey, "SIMULATION");
          showMtmSimulation();
        }
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
    contentEl.innerHTML = `<article class="panel"><h2>🎉 All course lectures completed</h2><p class="muted">Your lecture progress has been saved. Returning to WhatsApp now. Lizzy will send your secure Paystack link for the ₦1,000 CBT access fee. After payment is confirmed, your personal CBT link will be sent to this WhatsApp chat.</p><a id="backWhatsApp" href="https://wa.me/2348024988555?text=I%20have%20completed%20all%20my%20lectures.%20Please%20help%20me%20continue%20to%20the%20CBT%20payment." style="display:block;text-align:center;text-decoration:none;background:#146b4a;color:white;padding:14px 17px;border-radius:12px;font-weight:700;margin-top:16px">Return to WhatsApp for ₦1,000 CBT payment</a></article>`;
    const backLink = document.getElementById("backWhatsApp");
    setTimeout(() => { if (backLink) window.location.href = backLink.href; }, 1800);
  }

  function showMtmSimulation() {
    contentEl.classList.remove("hidden");
    const steps = [
      {name:"Place the plug base", part:"Plug base", symbol:"▰", target:"the assembly mat", action:"Tap the plug base, then tap the assembly mat.", done:"The plug base is now on the mat."},
      {name:"Remove the plug cover", part:"Plug cover", symbol:"▱", target:"the cover tray", action:"Tap the plug cover, then tap the cover tray.", done:"The cover is safely set aside."},
      {name:"Loosen the three terminal screws", part:"Screwdriver", symbol:"🪛", target:"the terminal screws", action:"Tap the screwdriver, then tap the terminal screws.", done:"The terminal screws are loosened."},
      {name:"Position the cable", part:"Three-core cable", symbol:"〰️", target:"the cable entry", action:"Tap the cable, then tap the cable entry on the plug.", done:"The cable is positioned at the plug entry."},
      {name:"Prepare the cable end", part:"Cable end", symbol:"✂️", target:"the preparation area", action:"Tap the cable end, then tap the preparation area.", done:"The cable end is prepared in this virtual exercise."},
      {name:"Connect the earth wire", part:"Green/yellow wire", symbol:"🟩", target:"the E terminal", action:"Tap the green/yellow wire, then tap the E terminal.", done:"The green/yellow earth wire is placed at E."},
      {name:"Connect the neutral wire", part:"Blue wire", symbol:"🟦", target:"the N terminal", action:"Tap the blue wire, then tap the N terminal.", done:"The blue neutral wire is placed at N."},
      {name:"Connect the live wire", part:"Brown wire", symbol:"🟫", target:"the L terminal", action:"Tap the brown wire, then tap the L terminal.", done:"The brown live wire is placed at L."},
      {name:"Tighten the terminal screws", part:"Screwdriver", symbol:"🪛", target:"the terminal screws", action:"Tap the screwdriver, then tap the terminal screws.", done:"The three terminal connections are secured."},
      {name:"Secure the cable grip", part:"Cable grip", symbol:"▰", target:"the cable grip position", action:"Tap the cable grip, then tap the cable grip position.", done:"The cable is held by the cable grip."},
      {name:"Replace the plug cover", part:"Plug cover", symbol:"▱", target:"the plug base", action:"Tap the plug cover, then tap the plug base.", done:"The cover is back in place."},
      {name:"Return the screwdriver and inspect", part:"Screwdriver", symbol:"🪛", target:"the tool tray", action:"Tap the screwdriver, then tap the tool tray.", done:"The tool is returned. The virtual plug assembly is complete."}
    ];
    const savedProgress = (() => { try { return JSON.parse(localStorage.getItem(simulationProgressKey) || "null"); } catch (_) { return null; } })();
    let stepIndex = Math.max(0, Math.min(steps.length, Number(savedProgress?.stepIndex || 0)));
    let errors = Math.max(0, Number(savedProgress?.errors || 0));
    let started = Number(savedProgress?.started || Date.now());
    let selected = false;
    const records = Array.isArray(savedProgress?.records) ? savedProgress.records.slice(0, steps.length).map((r, i) => ({...r, _at: Number(r._at || (started + (Array.isArray(savedProgress.records) ? savedProgress.records.slice(0, i + 1).reduce((sum, x) => sum + Number(x.duration_seconds || 0), 0) : 0) * 1000))})) : [];
    const completed = records.map((_, i) => i);
    function saveSimulationProgress() {
      localStorage.setItem(simulationProgressKey, JSON.stringify({stepIndex, errors, started, records: records.map(r => ({operation:r.operation,component:r.component,destination:r.destination,correct:r.correct,duration_seconds:r.duration_seconds,_at:r._at}))}));
    }
    const itemNames = ["Plug base","Plug cover","Screwdriver","Three-core cable","Cable end","Green/yellow wire","Blue wire","Brown wire","Cable grip"];
    const itemSymbols = ["▰","▱","🪛","〰️","✂️","🟩","🟦","🟫","▰"];

    contentEl.innerHTML =
      '<article class="panel">' +
      '<p class="muted">400 LEVEL · ELA401 · EXPERIMENT 17</p>' +
      '<h2 class="lesson-title">Three-pin plug assembly</h2>' +
      '<p class="muted">A simple 2D practical workbench. Follow one instruction at a time. Tap the named part, then tap the highlighted work area. You do not need to drag anything.</p>' +
      '<div style="background:#fff4dc;border-radius:12px;padding:11px;color:#704b08;font-size:13px;margin:12px 0"><strong>Safety:</strong> This is a disconnected virtual plug only. Never practise on a live plug or power supply. Follow your laboratory instructor for the real practical.</div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span id="simProgress" class="muted">Step 1 of 12</span><strong id="simClock">00:00</strong><span id="simErrors" class="muted">Mistakes: 0</span></div>' +
      '<div style="height:7px;background:#e6eee9;border-radius:20px;overflow:hidden;margin:8px 0 14px"><div id="simBar" style="height:7px;width:0%;background:#238455"></div></div>' +
      '<section style="border:1px solid #dce7e0;border-radius:14px;padding:12px;background:#f7faf8">' +
      '<div style="font-size:12px;font-weight:700;color:#52705e;margin-bottom:6px">YOUR 2D WORKBENCH</div>' +
      '<svg id="plugDrawing" viewBox="0 0 340 205" role="img" aria-label="Illustration of a three-pin plug, cable and workbench" style="width:100%;height:auto;display:block;background:#eef3ef;border-radius:10px">' +
      '<rect x="9" y="9" width="322" height="187" rx="12" fill="#e5eee8" stroke="#c7d7cc"/>' +
      '<rect x="18" y="158" width="304" height="26" rx="6" fill="#d2dfd6"/>' +
      '<path d="M18 171 H322" stroke="#b3c7ba" stroke-width="2"/>' +
      '<path d="M28 99 C65 99 75 99 106 99" stroke="#333" stroke-width="15" fill="none" stroke-linecap="round"/>' +
      '<path d="M28 99 C65 99 75 99 106 99" stroke="#777" stroke-width="8" fill="none" stroke-linecap="round"/>' +
      '<rect x="104" y="43" width="176" height="112" rx="17" fill="#fdfefe" stroke="#52675b" stroke-width="3"/>' +
      '<rect x="116" y="55" width="152" height="88" rx="11" fill="#e9efeb" stroke="#9aafa1" stroke-width="2"/>' +
      '<text x="192" y="70" text-anchor="middle" font-size="10" fill="#42584b" font-weight="bold">THREE-PIN PLUG</text>' +
      '<circle cx="192" cy="91" r="9" fill="#c6d2ca" stroke="#64786b"/><text x="192" y="94" text-anchor="middle" font-size="8" fill="#26392e">E</text>' +
      '<circle cx="153" cy="119" r="9" fill="#c6d2ca" stroke="#64786b"/><text x="153" y="122" text-anchor="middle" font-size="8" fill="#26392e">N</text>' +
      '<circle cx="231" cy="119" r="9" fill="#c6d2ca" stroke="#64786b"/><text x="231" y="122" text-anchor="middle" font-size="8" fill="#26392e">L</text>' +
      '<g id="wireEarth" opacity="0"><path d="M192 150 L192 91" stroke="#4d8c45" stroke-width="5" stroke-dasharray="5 3"/></g>' +
      '<g id="wireNeutral" opacity="0"><path d="M112 99 L153 119" stroke="#2677c9" stroke-width="5"/></g>' +
      '<g id="wireLive" opacity="0"><path d="M112 105 L231 119" stroke="#8b542f" stroke-width="5"/></g>' +
      '<rect id="plugCover" x="109" y="48" width="166" height="102" rx="14" fill="#c9d8cf" stroke="#52675b" stroke-width="2" opacity="0"/>' +
      '<text x="192" y="178" text-anchor="middle" font-size="10" fill="#476052">ASSEMBLY MAT</text></svg>' +
      '<div id="simVisualStatus" style="font-size:12px;color:#52675b;margin-top:7px">Plug base ready · Cover fitted · Wires not yet connected</div>' +
      '</section>' +
      '<section style="margin-top:14px;border-radius:14px;background:#f5f8f6;padding:14px;border:1px solid #dce7e0">' +
      '<div id="simStepTitle" style="font-size:18px;font-weight:750;margin-bottom:6px">Step 1: Place the plug base</div>' +
      '<p id="simInstruction" style="margin:0 0 12px;color:#52675b;font-size:14px">Tap the plug base, then tap the assembly mat.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div><div style="font-size:11px;font-weight:700;color:#52705e;margin-bottom:6px">① PICK UP THIS PART</div><button id="simPart" type="button" class="sim-action" style="width:100%;min-height:76px"><span id="simPartIcon" style="font-size:25px">▰</span><br><strong id="simPartName">Plug base</strong><br><small id="simPartHint">Tap to select</small></button></div>' +
      '<div><div style="font-size:11px;font-weight:700;color:#52705e;margin-bottom:6px">② PLACE IT HERE</div><button id="simTarget" type="button" class="sim-action sim-destination" style="width:100%;min-height:76px"><span style="font-size:25px">⬇️</span><br><strong id="simTargetName">Assembly mat</strong><br><small>Tap after selecting</small></button></div>' +
      '</div><p id="simFeedback" aria-live="polite" style="font-size:13px;margin:12px 0 0;color:#52675b">Start by tapping the plug base.</p></section>' +
      '<section style="margin-top:12px"><div style="font-weight:700;font-size:13px;margin-bottom:6px">YOUR PROGRESS</div><div id="simChecklist" style="display:grid;grid-template-columns:1fr 1fr;gap:5px"></div></section>' +
      '</article>';
    const style = document.createElement("style");
    style.textContent = '.sim-action{border:1px solid #9fb5a6;border-radius:11px;background:#fff;color:#244433;padding:10px 6px;font-size:12px;line-height:1.4}.sim-action.selected{background:#d9f0e2;border:2px solid #238455;box-shadow:0 0 0 2px #d9f0e2}.sim-action.sim-destination{background:#eaf2ed;border-style:dashed}.sim-action:focus{outline:3px solid #91c8a5;outline-offset:2px}';
    contentEl.appendChild(style);

    function renderChecklist() {
      document.getElementById("simChecklist").innerHTML = steps.map((s,i) =>
        '<div style="font-size:11px;padding:6px;border-radius:7px;background:' + (i < stepIndex ? '#e0f2e6' : '#fff') + ';color:' + (i < stepIndex ? '#286443' : '#68786e') + '">' +
        (i < stepIndex ? '✓ ' : (i + 1) + '. ') + escapeHtml(s.name) + '</div>'
      ).join("");
    }
    function updateDrawing() {
      const show = (id, yes) => { const el = document.getElementById(id); if (el) el.setAttribute("opacity", yes ? "1" : "0"); };
      show("plugCover", !completed.includes(1) || completed.includes(10));
      show("wireEarth", completed.includes(5));
      show("wireNeutral", completed.includes(6));
      show("wireLive", completed.includes(7));
      const labels = [];
      labels.push(completed.includes(0) ? "Base positioned" : "Base not positioned");
      labels.push(completed.includes(1) ? "Cover removed" : "Cover fitted");
      labels.push(completed.includes(5) ? "Earth connected" : "Earth pending");
      labels.push(completed.includes(6) ? "Neutral connected" : "Neutral pending");
      labels.push(completed.includes(7) ? "Live connected" : "Live pending");
      document.getElementById("simVisualStatus").textContent = labels.join(" · ");
    }
    function renderStep() {
      const s = steps[stepIndex];
      selected = false;
      document.getElementById("simProgress").textContent = "Step " + (stepIndex + 1) + " of " + steps.length;
      document.getElementById("simStepTitle").textContent = "Step " + (stepIndex + 1) + ": " + s.name;
      document.getElementById("simInstruction").textContent = s.action;
      document.getElementById("simPartIcon").textContent = s.symbol;
      document.getElementById("simPartName").textContent = s.part;
      document.getElementById("simPartHint").textContent = "Tap to select";
      document.getElementById("simTargetName").textContent = s.target;
      document.getElementById("simPart").classList.remove("selected");
      document.getElementById("simFeedback").textContent = "First, tap the " + s.part.toLowerCase() + ".";
      document.getElementById("simBar").style.width = Math.round(stepIndex / steps.length * 100) + "%";
      document.getElementById("simErrors").textContent = "Mistakes: " + errors;
      document.getElementById("simPart").onclick = () => {
        selected = true;
        document.getElementById("simPart").classList.add("selected");
        document.getElementById("simPartHint").textContent = "Selected ✓";
        document.getElementById("simFeedback").textContent = "Good. Now tap the highlighted destination: " + s.target + ".";
      };
      document.getElementById("simTarget").onclick = () => {
        if (!selected) {
          errors++;
          saveSimulationProgress();
          document.getElementById("simErrors").textContent = "Mistakes: " + errors;
          document.getElementById("simFeedback").textContent = "Pick up the " + s.part.toLowerCase() + " first. Tap the left box.";
          return;
        }
        const now = Date.now();
        records.push({operation:s.name, component:s.part, destination:s.target, correct:true, duration_seconds:Number(((now - (records.length ? records[records.length - 1]._at : started))/1000).toFixed(2))});
        records[records.length - 1]._at = now;
        completed.push(stepIndex);
        document.getElementById("simFeedback").textContent = s.done;
        stepIndex++;
        saveSimulationProgress();
        updateDrawing();
        renderChecklist();
        if (stepIndex >= steps.length) setTimeout(finishSimulation, 500);
        else setTimeout(renderStep, 500);
      };
      renderChecklist();
      updateDrawing();
    }
    const clock = setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      const el = document.getElementById("simClock");
      if (el) el.textContent = String(Math.floor(sec / 60)).padStart(2,"0") + ":" + String(sec % 60).padStart(2,"0");
    }, 1000);

    function finishSimulation() {
      clearInterval(clock);
      const elapsed = Number(((Date.now() - started) / 1000).toFixed(2));
      const accuracy = Math.max(0, Math.round((steps.length / (steps.length + errors)) * 100));
      const state = {
        steps:records.map(r => ({operation:r.operation,component:r.component,destination:r.destination,correct:r.correct,duration_seconds:r.duration_seconds})),
        errors, elapsed_seconds:elapsed, accuracy_percent:accuracy,
        weak_area:errors ? "careful component handling and assembly sequence" : "consistent component handling and assembly sequence",
        experiment_code:"ELA401-EXP17", interaction_mode:"2d_tap_to_select_tap_to_place"
      };
      contentEl.innerHTML =
        '<article class="panel"><p class="muted">SIMULATION COMPLETED · PERSONAL PERFORMANCE REVIEW</p><h2 class="lesson-title">Your plug assembly result</h2>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">' +
        '<div style="background:#edf5ef;padding:12px;border-radius:10px"><div class="muted">Sequence accuracy</div><div class="timer">' + accuracy + '%</div></div>' +
        '<div style="background:#edf5ef;padding:12px;border-radius:10px"><div class="muted">Observed practice time</div><div class="timer">' + elapsed + 's</div></div>' +
        '<div style="background:#edf5ef;padding:12px;border-radius:10px"><div class="muted">Completed steps</div><div class="timer">' + records.length + '/12</div></div>' +
        '<div style="background:#edf5ef;padding:12px;border-radius:10px"><div class="muted">Mistakes</div><div class="timer">' + errors + '</div></div></div>' +
        '<section class="section"><h3>Performance feedback</h3><p class="section-content">' +
        (errors === 0 ? 'Excellent. You completed all 12 operations in the correct sequence.' : 'Review the assembly sequence and repeat the practical to improve your accuracy.') +
        '</p><p class="muted">The stopwatch measures practice time only. It is not an MTM predetermined time.</p></section>' +
        '<section class="section"><h3>MTM calculation</h3><p class="section-content"><strong>Time in minutes = Total TMU × 0.0006</strong><br><strong>Time in seconds = Total TMU × 0.036</strong><br><strong>1 TMU = 0.0006 minute = 0.036 second</strong></p>' +
        '<p class="muted">Use the official MTM table for each motion value. No MTM values are invented by this simulation.</p>' +
        '<label for="mtmTmu">Total TMU from your official MTM table (optional)</label><input id="mtmTmu" type="number" min="0" step="0.1" placeholder="Enter total TMU" style="letter-spacing:0"><div id="mtmCalc" class="muted">Enter a TMU total to calculate the MTM time.</div></section>' +
        '<button id="submitPersonalCbt">Save result and return to WhatsApp for CBT payment</button><p id="personalFeedback" class="muted" aria-live="polite"></p></article>';
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
          localStorage.removeItem(simulationProgressKey);
          localStorage.setItem(portalStageKey, "RESULT_SAVED");
          document.getElementById("personalFeedback").textContent = "Your Experiment 17 result is saved. Returning to WhatsApp for Final CBT payment…";
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
    renderStep();
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
    const passed = String(result.pass_status || (Number(result.percentage || 0) >= 50 ? "PASS" : "FAIL")).toUpperCase() === "PASS";
    const whatsappUrl = "https://wa.me/2348024988555?text=" + encodeURIComponent("COURSE MENU");
    contentEl.innerHTML = `
      <article class="panel">
        <h2>CBT submitted</h2>
        <p class="timer">${escapeHtml(result.percentage ?? 0)}%</p>
        <p class="muted">Score: ${escapeHtml(result.score ?? 0)} · Result: ${escapeHtml(result.pass_status || (passed ? "PASS" : "FAIL"))}</p>
        <p class="muted">Your result has been saved and sent to your registered WhatsApp number.</p>
        <div style="display:grid;gap:10px;margin-top:18px">
          <a href="${whatsappUrl}" style="display:block;text-align:center;text-decoration:none;background:#146b4a;color:white;padding:14px 17px;border-radius:12px;font-weight:700">Return to WhatsApp / Course Menu</a>
          <p class="muted" style="margin:0;text-align:center;font-size:13px">${passed ? "You have passed this CBT. Return to WhatsApp to view your course menu and result." : "You may request a retake from the WhatsApp Course Menu, subject to the three-attempt limit and the applicable retake payment."}</p>
        </div>
      </article>`;
  }
  if (!accessToken) {
    verifyEl.classList.add("hidden");
    status("This classroom link is missing its secure token. Open the original link sent to your WhatsApp.", true);
  } else if (sessionToken) {
    verifyEl.classList.add("hidden");
    if (sessionPurpose === "EXAM") {
      restoreExam();
    } else if (activeCourseCode === "ELA401" && localStorage.getItem(portalStageKey) === "SIMULATION") {
      showMtmSimulation();
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
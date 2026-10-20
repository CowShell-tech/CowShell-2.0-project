(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "cowshell2_data_v1";
  const todayKey = (date = new Date()) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const parseDate = (key) => {
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y,m-1,d);
  };
  const prettyDate = (key, options = {weekday:"short",month:"short",day:"numeric",year:"numeric"}) => parseDate(key).toLocaleDateString(undefined, options);
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
  const escapeHtml = (str="") => String(str).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const defaultData = () => ({version:1,missions:[],goals:[],skills:[],activity:{},focusSessions:[],createdAt:Date.now()});
  let data = loadData();
  let missionFilter = "all", goalFilter = "all", selectedDay = null;
  let timerDuration = 25*60, timerRemaining = timerDuration, timerInterval = null, timerRunning = false;
  let activePage = "dashboard";

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (parsed && typeof parsed === "object") return {...defaultData(),...parsed, activity:parsed.activity || {}};
    } catch (err) { console.warn("CowShell data could not be read.", err); }
    return defaultData();
  }
  function saveData() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
    catch (err) { toast("Couldn't save. Browser storage may be full."); }
    renderAll();
  }
  function toast(message) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = message;
    $("toastContainer").appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  function goTo(page) {
    activePage = page;
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("active-page", p.id === `page-${page}`));
    document.querySelectorAll(".nav-link[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    const label = document.querySelector(`.nav-link[data-page="${page}"]`);
    $("pageCrumb").textContent = label ? label.textContent.trim().replace(/^\S+\s/,"") : "Dashboard";
    $("sidebar").classList.remove("mobile-open"); $("mobileOverlay").classList.remove("visible");
    window.scrollTo({top:0,behavior:"smooth"});
    if (page === "activity") renderActivityPage();
    if (page === "focus") updateFocusPage();
  }
  function dueLabel(key) {
    if (!key) return "No deadline";
    const today = todayKey(), diff = Math.round((parseDate(key)-parseDate(today))/86400000);
    if (diff < 0) return `${Math.abs(diff)} day${diff===-1?"":"s"} overdue`;
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return `Due ${prettyDate(key,{month:"short",day:"numeric"})}`;
  }
  function missionDone(m) { return !!m.completed; }
  function scoreFor(day) { return data.activity[day]?.total ?? null; }
  function getStreaks(year = new Date().getFullYear()) {
    const today = todayKey();
    const keys = Object.keys(data.activity).filter(k => data.activity[k]?.total >= 9 && k <= today).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const dt = parseDate(k);
      if (prev && (dt-parseDate(prev))/86400000 === 1) run++;
      else run = 1;
      best = Math.max(best,run); prev = k;
    }
    let current = 0;
    let cursor = today;
    if (!(data.activity[cursor]?.total >= 9)) {
      const yesterday = todayKey(new Date(parseDate(today).getTime()-86400000));
      if (data.activity[yesterday]?.total >= 9) cursor = yesterday;
      else cursor = null;
    }
    while (cursor && data.activity[cursor]?.total >= 9) {
      current++;
      cursor = todayKey(new Date(parseDate(cursor).getTime()-86400000));
    }
    return {best,current};
  }
  function activityStats(year = new Date().getFullYear()) {
    const entries = Object.entries(data.activity).filter(([k,v]) => k.startsWith(`${year}-`) && v && typeof v.total === "number");
    const scores = entries.map(([,v])=>v.total);
    const streak = getStreaks(year);
    return {active:entries.length, avg:scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):"—",best:streak.best,god:scores.filter(s=>s>=9).length};
  }
  function getLevel() {
    const xp = data.missions.filter(m=>m.completed).reduce((sum,m)=>sum+(m.xpAwarded || (m.priority==="high"?25:m.priority==="medium"?15:10)),0) + Object.values(data.activity).filter(a=>a.total>=9).length*10;
    return {xp,level:Math.floor(xp/100)+1,into:xp%100};
  }
  function renderAll() {
    renderHeader(); renderDashboard(); renderMissions(); renderGoals(); renderSkills(); renderActivityPage(); renderAchievements(); updateFocusPage();
  }
  function renderHeader() {
    const now = new Date();
    $("todayLabel").textContent = now.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
    $("missionNavCount").textContent = data.missions.filter(m=>!m.completed).length;
    const done = data.missions.filter(m=>m.completed).length;
    $("eraProgress").style.width = `${Math.min(100,done*10)}%`;
    $("eraProgressText").textContent = `${done} mission${done===1?"":"s"} completed`;
    const lv = getLevel(); $("levelNumber").textContent = String(lv.level).padStart(2,"0"); $("xpText").textContent = `${lv.xp} XP earned`; $("xpBar").style.width = `${lv.into}%`;
  }
  function emptyState(icon,title,desc) { return `<div class="empty-state"><span>${icon}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p></div>`; }
  function missionRow(m) {
    const due = m.due ? dueLabel(m.due) : "No deadline";
    return `<div class="mission-row ${m.completed?"completed":""}">
      <button class="check-button ${m.completed?"done":""}" data-complete="${m.id}" aria-label="${m.completed?"Mark incomplete":"Complete mission"}">${m.completed?"✓":""}</button>
      <div class="mission-row-main"><strong>${escapeHtml(m.title)}</strong><small><i class="priority-dot priority-${m.priority||"medium"}"></i>${escapeHtml(m.category||"Other")} · ${escapeHtml(due)}</small></div>
    </div>`;
  }
  function renderDashboard() {
    const today = todayKey(), todayActivity = data.activity[today];
    $("todayScore").textContent = todayActivity ? todayActivity.total : "—";
    $("todayScoreCaption").textContent = todayActivity ? "Activity logged today" : "Log today's effort";
    const completed = data.missions.filter(m=>m.completed).length;
    $("completedCount").textContent = completed;
    $("missionFoot").textContent = completed ? `${completed} win${completed===1?"":"s"} in the books` : "Every win counts";
    $("activeGoalCount").textContent = data.goals.filter(g=>!g.archived).length;
    $("godStreakValue").textContent = getStreaks().current;
    const todayMissions = data.missions.filter(m=>!m.completed && (!m.due || m.due<=today)).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority)).slice(0,5);
    $("todayMissionList").innerHTML = todayMissions.length ? todayMissions.map(missionRow).join("") : emptyState("✦","Clear runway","No missions due today. Add one meaningful task or take a deliberate rest.");
    $("todayMissionList").querySelectorAll("[data-complete]").forEach(b=>b.addEventListener("click",()=>toggleMission(b.dataset.complete)));
    const stats = activityStats();
    $("activeDays").textContent = stats.active; $("avgScore").textContent = stats.avg; $("bestStreak").textContent = stats.best;
    renderHeatmap("dashboardHeatmap","dashboardMonths",new Date().getFullYear(),true);
    const goals = data.goals.filter(g=>!g.archived).slice(0,3);
    $("dashboardGoals").innerHTML = goals.length ? goals.map(g=>`<div class="goal-preview-row"><div class="goal-preview-top"><span>${escapeHtml(g.title)}</span><span>${goalPercent(g)}%</span></div><div class="progress-track"><span style="width:${goalPercent(g)}%"></span></div></div>`).join("") : emptyState("◎","No goals yet","Add a goal to connect daily effort to your bigger picture.");
    const upcoming = data.missions.filter(m=>!m.completed && m.due && m.due>=today).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,4);
    $("upcomingList").innerHTML = upcoming.length ? upcoming.map(m=>{const d=parseDate(m.due);return `<div class="upcoming-item"><div class="upcoming-date"><strong>${d.getDate()}</strong><small>${d.toLocaleDateString(undefined,{month:"short"}).toUpperCase()}</small></div><div><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(dueLabel(m.due))}</small></div></div>`}).join("") : emptyState("⌁","Nothing looming","Add a deadline to a mission and it'll appear here.");
  }
  function priorityOrder(p) { return ({high:0,medium:1,low:2})[p] ?? 1; }
  function renderMissions() {
    const today=todayKey();
    let list=[...data.missions];
    if(missionFilter==="today") list=list.filter(m=>!m.completed&&(!m.due||m.due===today));
    if(missionFilter==="upcoming") list=list.filter(m=>!m.completed&&m.due&&m.due>today);
    if(missionFilter==="overdue") list=list.filter(m=>!m.completed&&m.due&&m.due<today);
    if(missionFilter==="completed") list=list.filter(m=>m.completed);
    list.sort((a,b)=>(a.completed-b.completed)||priorityOrder(a.priority)-priorityOrder(b.priority)||(a.due||"9999").localeCompare(b.due||"9999"));
    $("missionBoard").innerHTML = list.length ? list.map(m=>{
      const overdue=!m.completed&&m.due&&m.due<today;
      const linked=data.goals.find(g=>g.id===m.goalId);
      return `<article class="mission-card ${m.completed?"is-complete":""}"><div class="mission-card-top"><span class="tag ${m.priority}">${m.priority.toUpperCase()} PRIORITY</span><span class="tag">${escapeHtml(m.category||"Other")}</span>${m.completed?'<span class="tag">COMPLETED</span>':""}</div><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.description||"No notes added.")}</p><div class="card-bottom"><div class="due-text ${overdue?"overdue":""}">${m.due?escapeHtml(dueLabel(m.due)):"No deadline"}${m.minutes?` · ${m.minutes} min`:""}${linked?`<br>↳ ${escapeHtml(linked.title)}`:""}</div><div class="card-actions"><button class="mini-action" data-edit-mission="${m.id}">Edit</button><button class="mini-action" data-complete="${m.id}">${m.completed?"Undo":"Complete"}</button><button class="mini-action" data-delete-mission="${m.id}">×</button></div></div></article>`;
    }).join("") : emptyState("◈","No missions here","Create a mission, give it a deadline, and make the next step obvious.");
    $("missionBoard").querySelectorAll("[data-complete]").forEach(b=>b.addEventListener("click",()=>toggleMission(b.dataset.complete)));
    $("missionBoard").querySelectorAll("[data-edit-mission]").forEach(b=>b.addEventListener("click",()=>openMissionModal(b.dataset.editMission)));
    $("missionBoard").querySelectorAll("[data-delete-mission]").forEach(b=>b.addEventListener("click",()=>deleteMission(b.dataset.deleteMission)));
    document.querySelectorAll("#missionFilters [data-filter]").forEach(b=>b.classList.toggle("selected",b.dataset.filter===missionFilter));
  }
  function toggleMission(id) {
    const m=data.missions.find(x=>x.id===id); if(!m)return;
    m.completed=!m.completed;
    if(m.completed){m.completedAt=todayKey();m.xpAwarded=m.priority==="high"?25:m.priority==="medium"?15:10;toast(`Mission complete. +${m.xpAwarded} XP. Keep going.`);}
    else {m.completedAt=null;toast("Mission reopened.");}
    saveData();
  }
  function deleteMission(id) { if(!confirm("Delete this mission?"))return; data.missions=data.missions.filter(m=>m.id!==id);saveData();toast("Mission deleted."); }
  function openMissionModal(id=null, dueToday=false) {
    $("editorForm").reset(); $("editId").value="";
    $("itemPriority").value="medium"; $("itemDue").value=dueToday?todayKey():"";
    $("modalTitle").textContent=id?"Edit mission":"New mission";
    $("itemGoal").innerHTML='<option value="">No linked goal</option>'+data.goals.filter(g=>!g.archived).map(g=>`<option value="${g.id}">${escapeHtml(g.title)}</option>`).join("");
    if(id){const m=data.missions.find(x=>x.id===id);if(!m)return;$("editId").value=id;$("itemTitle").value=m.title;$("itemDescription").value=m.description||"";$("itemCategory").value=m.category||"Other";$("itemPriority").value=m.priority||"medium";$("itemDue").value=m.due||"";$("itemMinutes").value=m.minutes||"";$("itemGoal").value=m.goalId||"";}
    $("modalBackdrop").classList.add("open");$("itemTitle").focus();
  }
  function closeMissionModal(){$("modalBackdrop").classList.remove("open");}
  $("editorForm").addEventListener("submit",e=>{
    e.preventDefault();const id=$("editId").value;
    const item={id:id||uid(),title:$("itemTitle").value.trim(),description:$("itemDescription").value.trim(),category:$("itemCategory").value,priority:$("itemPriority").value,due:$("itemDue").value,minutes:Number($("itemMinutes").value)||0,goalId:$("itemGoal").value,completed:false,createdAt:Date.now()};
    if(!item.title)return;
    if(id){const old=data.missions.find(m=>m.id===id);Object.assign(old,item,{completed:old.completed,completedAt:old.completedAt,xpAwarded:old.xpAwarded,createdAt:old.createdAt});}
    else data.missions.push(item);
    closeMissionModal();saveData();toast(id?"Mission updated.":"Mission added. Make it count.");
  });
  function goalPercent(g){const ms=g.milestones||[];return ms.length?Math.round(ms.filter(m=>m.done).length/ms.length*100):(g.progress||0);}
  function renderGoals() {
    let goals=data.goals.filter(g=>!g.archived);
    if(goalFilter!=="all")goals=goals.filter(g=>g.horizon===goalFilter);
    $("goalsGrid").innerHTML=goals.length?goals.map(g=>`<article class="goal-card"><div class="goal-card-head"><div><span class="horizon-label">${({now:"01 / NOW",next:"02 / NEXT",vision:"03 / VISION"})[g.horizon]||"GOAL"}</span><h3>${escapeHtml(g.title)}</h3></div><div class="card-actions"><button class="mini-action" data-edit-goal="${g.id}">Edit</button><button class="mini-action" data-delete-goal="${g.id}">×</button></div></div><p class="goal-why">${escapeHtml(g.why||"Your next milestone starts here.")}</p><div class="goal-progress-row"><span>Milestone progress</span><strong>${goalPercent(g)}%</strong></div><div class="progress-track"><span style="width:${goalPercent(g)}%"></span></div><div class="milestone-list">${(g.milestones||[]).length?(g.milestones||[]).map((m,i)=>`<label class="milestone-item ${m.done?"done":""}"><input class="milestone-check" type="checkbox" data-goal="${g.id}" data-milestone="${i}" ${m.done?"checked":""}><span>${escapeHtml(m.text)}</span></label>`).join(""):'<p class="muted tiny">No milestones yet. Edit this goal to add a plan.</p>'}</div><div class="goal-card-foot"><span class="tag">${escapeHtml(g.category||"Other")}</span><span class="due-text">${g.due?escapeHtml(dueLabel(g.due)):"No target date"}</span></div></article>`).join(""):emptyState("◎","Your goal vault is empty","Add one meaningful goal. Break it into milestones and make it real.");
    $("goalsGrid").querySelectorAll("[data-edit-goal]").forEach(b=>b.addEventListener("click",()=>openGoalModal(b.dataset.editGoal)));
    $("goalsGrid").querySelectorAll("[data-delete-goal]").forEach(b=>b.addEventListener("click",()=>deleteGoal(b.dataset.deleteGoal)));
    $("goalsGrid").querySelectorAll("[data-milestone]").forEach(input=>input.addEventListener("change",()=>{const g=data.goals.find(x=>x.id===input.dataset.goal);if(!g)return;g.milestones[Number(input.dataset.milestone)].done=input.checked;saveData();if(input.checked)toast("Milestone complete. Progress is progress.");}));
    document.querySelectorAll("#goalFilters [data-horizon]").forEach(b=>b.classList.toggle("selected",b.dataset.horizon===goalFilter));
  }
  function openGoalModal(id=null) {
    $("goalForm").reset();$("goalEditId").value="";$("goalModalTitle").textContent=id?"Edit goal":"New goal";
    if(id){const g=data.goals.find(x=>x.id===id);if(!g)return;$("goalEditId").value=id;$("goalTitle").value=g.title;$("goalWhy").value=g.why||"";$("goalHorizon").value=g.horizon||"next";$("goalDue").value=g.due||"";$("goalCategory").value=g.category||"Other";$("goalMilestones").value=(g.milestones||[]).map(m=>m.text).join("\n");}
    $("goalModalBackdrop").classList.add("open");$("goalTitle").focus();
  }
  function closeGoalModal(){$("goalModalBackdrop").classList.remove("open");}
  $("goalForm").addEventListener("submit",e=>{
    e.preventDefault();const id=$("goalEditId").value;const old=id?data.goals.find(g=>g.id===id):null;
    const milestoneTexts=$("goalMilestones").value.split("\n").map(s=>s.trim()).filter(Boolean);
    const milestones=milestoneTexts.map(text=>{const prev=old?.milestones?.find(m=>m.text===text);return {text,done:prev?.done||false};});
    const goal={id:id||uid(),title:$("goalTitle").value.trim(),why:$("goalWhy").value.trim(),horizon:$("goalHorizon").value,due:$("goalDue").value,category:$("goalCategory").value,milestones,createdAt:old?.createdAt||Date.now()};
    if(id)Object.assign(old,goal);else data.goals.push(goal);
    closeGoalModal();saveData();toast(id?"Goal updated.":"Goal added to your vault.");
  });
  function deleteGoal(id){if(!confirm("Delete this goal? Missions linked to it will remain."))return;data.goals=data.goals.filter(g=>g.id!==id);saveData();toast("Goal removed.");}
  function renderSkills(){
    $("skillCount").textContent=data.skills.length;
    $("skillsList").innerHTML=data.skills.length?data.skills.map(s=>{const steps=s.steps||[];const pct=steps.length?Math.round(steps.filter(x=>x.done).length/steps.length*100):0;return `<article class="skill-card"><div class="skill-card-top"><div><h3>${escapeHtml(s.title)}</h3><span class="skill-level">${pct===100?"✓ MASTERY UNLOCKED":pct?"◉ IN PROGRESS":"○ READY TO START"}</span></div><div class="card-actions"><button class="mini-action" data-edit-skill="${s.id}">Edit</button><button class="mini-action" data-delete-skill="${s.id}">×</button></div></div><p>${escapeHtml(s.description||"A skill worth building.")}</p><div class="goal-progress-row"><span>Progress</span><strong>${pct}%</strong></div><div class="progress-track"><span style="width:${pct}%"></span></div><div class="skill-steps">${steps.length?steps.map((step,i)=>`<label class="skill-step"><input type="checkbox" data-skill="${s.id}" data-step="${i}" ${step.done?"checked":""}>${escapeHtml(step.text)}</label>`).join(""):'<span class="muted tiny">Edit to add learning milestones.</span>'}</div></article>`}).join(""):emptyState("⌘","No skills mapped yet","Add a skill such as C, DSA, Linux, or a project skill. Define a few milestones to make the path visible.");
    $("skillsList").querySelectorAll("[data-edit-skill]").forEach(b=>b.addEventListener("click",()=>openSkillEditor(b.dataset.editSkill)));
    $("skillsList").querySelectorAll("[data-delete-skill]").forEach(b=>b.addEventListener("click",()=>{if(confirm("Delete this skill?")){data.skills=data.skills.filter(s=>s.id!==b.dataset.deleteSkill);saveData();}}));
    $("skillsList").querySelectorAll("[data-step]").forEach(input=>input.addEventListener("change",()=>{const s=data.skills.find(x=>x.id===input.dataset.skill);if(!s)return;s.steps[Number(input.dataset.step)].done=input.checked;saveData();if(input.checked)toast("Skill milestone updated.");}));
  }
  function openSkillEditor(id=null){
    const s=id?data.skills.find(x=>x.id===id):null;
    const title=prompt("Skill name:",s?.title||"");if(title===null)return;if(!title.trim()){toast("Give your skill a name.");return;}
    const description=prompt("What are you learning? (optional)",s?.description||"")??s?.description??"";
    const raw=prompt("Milestones, one per line:",(s?.steps||[]).map(x=>x.text).join("\n"));if(raw===null)return;
    const steps=raw.split("\n").map(x=>x.trim()).filter(Boolean).map(text=>({text,done:s?.steps?.find(x=>x.text===text)?.done||false}));
    if(s){s.title=title.trim();s.description=description;s.steps=steps;}else data.skills.push({id:uid(),title:title.trim(),description,steps});
    saveData();toast("Skill tree updated.");
  }
  function renderHeatmap(gridId,monthsId,year,compact=false){
    const grid=$(gridId),months=$(monthsId);if(!grid||!months)return;
    grid.innerHTML="";months.innerHTML="";
    const first=new Date(year,0,1),last=new Date(year,11,31);
    const offset=(first.getDay()+6)%7;
    const totalDays=Math.round((last-first)/86400000)+1;
    const weeks=Math.ceil((offset+totalDays)/7);
    const monthStarts=[];
    for(let m=0;m<12;m++){const d=new Date(year,m,1);monthStarts.push({name:d.toLocaleDateString(undefined,{month:"short"}),week:Math.floor(((d-first)/86400000+offset)/7)});}
    months.style.gridTemplateColumns=`repeat(${weeks}, minmax(0, 1fr))`;
    months.style.minWidth=compact?"700px":"820px";
    monthStarts.forEach((m,i)=>{const span=document.createElement("span");span.textContent=m.name;span.style.gridColumnStart=String(m.week+1);months.appendChild(span);});
    grid.style.gridTemplateColumns=`repeat(${weeks}, ${compact?"11px":"13px"})`;
    grid.style.gridTemplateRows=`repeat(7, ${compact?"11px":"13px"})`;
    grid.style.gridAutoColumns=compact?"11px":"13px";
    grid.style.minWidth=`${weeks*(compact?14:17)}px`;
    for(let w=0;w<weeks;w++)for(let dow=0;dow<7;dow++){
      const dayIndex=w*7+dow-offset;const cell=document.createElement("button");cell.type="button";cell.className="heat-cell level-0";
      if(dayIndex<0||dayIndex>=totalDays){cell.style.visibility="hidden";cell.disabled=true;grid.appendChild(cell);continue;}
      const dt=new Date(year,0,1+dayIndex),key=todayKey(dt),future=key>todayKey(),entry=data.activity[key];
      cell.dataset.date=key;cell.title=`${prettyDate(key,{month:"short",day:"numeric",year:"numeric"})} · ${entry?`${entry.total}/10`:"No activity logged"}`;
      if(future){cell.classList.add("future");cell.disabled=true;cell.title=`${prettyDate(key,{month:"short",day:"numeric"})} · Future date`;}
      else if(entry){const total=entry.total;cell.classList.remove("level-0");cell.classList.add(total<=3?"level-1":total<=6?"level-2":total<=8?"level-3":"level-4");}
      cell.addEventListener("click",()=>{if(future)return;if(activePage==="activity")showDayDetail(key);else{goTo("activity");setTimeout(()=>showDayDetail(key),50);}});
      grid.appendChild(cell);
    }
  }
  function renderActivityPage(){
    const yearSelect=$("heatmapYear");if(!yearSelect)return;
    const currentYear=new Date().getFullYear();const years=new Set([currentYear,...Object.keys(data.activity).map(k=>Number(k.slice(0,4))).filter(Number.isFinite)]);
    if(![...yearSelect.options].some(o=>Number(o.value)===currentYear)){yearSelect.innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join("");}
    const year=Number(yearSelect.value)||currentYear;yearSelect.value=String(year);
    $("activityYearTitle").textContent=`Activity in ${year}`;
    renderHeatmap("activityHeatmap","activityMonths",year,false);
    const stats=activityStats(year);
    $("activityActiveDays").textContent=stats.active;$("activityAvgScore").textContent=stats.avg;$("activityBestStreak").textContent=stats.best;$("activityGodDays").textContent=stats.god;
    if(selectedDay && selectedDay.startsWith(`${year}-`))showDayDetail(selectedDay);
  }
  function showDayDetail(key){
    selectedDay=key;const entry=data.activity[key];const isFuture=key>todayKey();
    if(isFuture){$("dayDetail").innerHTML=emptyState("◷","That day hasn't happened yet","Future days can't be logged in advance.");return;}
    if(!entry){$("dayDetail").innerHTML=`<div class="day-detail-content"><div><div class="eyebrow">ACTIVITY CHECK-IN</div><h3>${escapeHtml(prettyDate(key))}</h3><p class="muted small-text">No activity has been logged for this day.</p></div><button class="primary-button" id="editSelectedDay">＋ Log activity</button></div>`;$("editSelectedDay").addEventListener("click",()=>openActivityModal(key));return;}
    $("dayDetail").innerHTML=`<div class="day-detail-content"><div><div class="eyebrow">DAILY RECORD</div><h3>${escapeHtml(prettyDate(key))}</h3><p class="muted small-text">${entry.reflection?escapeHtml(entry.reflection):"No reflection saved for this day."}</p></div><div class="detail-score">${entry.total}<small class="muted">/10</small><br><button class="mini-action" id="editSelectedDay">Edit entry</button></div><div class="detail-metrics"><div class="detail-metric">Study <strong>${entry.study}/5</strong></div><div class="detail-metric">Sleep <strong>${entry.sleep}/2</strong></div><div class="detail-metric">Food <strong>${entry.food}/1</strong></div><div class="detail-metric">Fitness <strong>${entry.fitness}/1</strong></div><div class="detail-metric">Extra <strong>${entry.extra}/1</strong></div></div></div>`;
    $("editSelectedDay").addEventListener("click",()=>openActivityModal(key));
  }
  function openActivityModal(key=todayKey()){
    if(key>todayKey()){toast("You can't log a future day.");return;}
    const entry=data.activity[key]||{study:0,sleep:0,food:0,fitness:0,extra:0,reflection:""};
    $("activityDate").value=key;$("activityModalDate").textContent=prettyDate(key);
    $("studyScore").value=entry.study;$("sleepScore").value=entry.sleep;$("foodScore").value=entry.food;$("fitnessScore").value=entry.fitness;$("extraScore").value=entry.extra;$("dayReflection").value=entry.reflection||"";
    updateScorePreview();$("activityModalBackdrop").classList.add("open");
  }
  function closeActivityModal(){$("activityModalBackdrop").classList.remove("open");}
  function updateScorePreview(){const total=["studyScore","sleepScore","foodScore","fitnessScore","extraScore"].reduce((sum,id)=>sum+(Number($(id).value)||0),0);$("scorePreview").textContent=total;}
  $("activityForm").addEventListener("input",updateScorePreview);
  $("activityForm").addEventListener("submit",e=>{
    e.preventDefault();const key=$("activityDate").value;
    const limits={studyScore:5,sleepScore:2,foodScore:1,fitnessScore:1,extraScore:1};
    for(const [id,max] of Object.entries(limits)){const v=Number($(id).value);if(!Number.isInteger(v)||v<0||v>max){toast(`Check the ${id.replace("Score","")} score.`);$(id).focus();return;}}
    const item={study:Number($("studyScore").value),sleep:Number($("sleepScore").value),food:Number($("foodScore").value),fitness:Number($("fitnessScore").value),extra:Number($("extraScore").value),reflection:$("dayReflection").value.trim()};
    item.total=item.study+item.sleep+item.food+item.fitness+item.extra;data.activity[key]=item;closeActivityModal();saveData();showDayDetail(key);toast(`Activity saved: ${item.total}/10.`);
  });
  function renderAchievements(){
    const totalDone=data.missions.filter(m=>m.completed).length,activityDays=Object.keys(data.activity).length,streak=getStreaks().best,goalsDone=data.goals.filter(g=>goalPercent(g)===100&&g.milestones?.length).length,focusCount=data.focusSessions.length;
    const defs=[
      ["first","✦","First Steps","Log your first day of activity.",activityDays>=1,activityDays>=1?"Unlocked":"Log activity"],
      ["mission1","✓","Mission Accepted","Complete your first mission.",totalDone>=1,totalDone>=1?"Unlocked":"Complete a mission"],
      ["ten","◈","Getting It Done","Complete 10 missions.",totalDone>=10,`${Math.min(totalDone,10)}/10 missions`],
      ["streak7","♨","Seven-Day Warrior","Log a 9+ score seven days in a row.",streak>=7,`${Math.min(streak,7)}/7 best streak`],
      ["god","✧","God Mode","Log a perfect 10/10 day.",Object.values(data.activity).some(a=>a.total===10),Object.values(data.activity).some(a=>a.total===10)?"Unlocked":"Log a 10/10 day"],
      ["goal","◎","Milestone Maker","Complete every milestone in a goal.",goalsDone>=1,goalsDone?`${goalsDone} goal${goalsDone===1?"":"s"} completed`:"Complete a goal's milestones"],
      ["focus","◷","Deep Work","Complete your first focus session.",focusCount>=1,focusCount?`${focusCount} session${focusCount===1?"":"s"}`:"Complete a focus session"],
      ["hundred","⬆","Century Club","Earn 100 XP.",getLevel().xp>=100,`${Math.min(getLevel().xp,100)}/100 XP`],
      ["builder","⌘","The Builder","Track your first skill.",data.skills.length>=1,data.skills.length?"Unlocked":"Add a skill to your tree"]
    ];
    $("achievementCount").textContent=defs.filter(x=>x[4]).length;
    $("achievementsGrid").innerHTML=defs.map(a=>`<article class="achievement-card ${a[4]?"":"locked"}"><div class="achievement-icon">${a[1]}</div><h3>${a[2]}</h3><p>${a[3]}</p><small>${a[5]}</small></article>`).join("");
  }
  function updateFocusPage(){
    const today=todayKey();const sessions=data.focusSessions.filter(s=>s.date===today);
    $("focusSessionsToday").textContent=sessions.length;$("focusMinutesToday").textContent=`${sessions.reduce((sum,s)=>sum+s.minutes,0)} min`;
    const select=$("focusMissionSelect");if(select){const old=select.value;select.innerHTML='<option value="">No linked mission</option>'+data.missions.filter(m=>!m.completed).map(m=>`<option value="${m.id}">${escapeHtml(m.title)}</option>`).join("");if([...select.options].some(o=>o.value===old))select.value=old;const m=data.missions.find(m=>m.id===select.value);$("focusMissionName").textContent=m?m.title:"Focus on one thing.";}
    syncTimerDisplays();
  }
  function syncTimerDisplays(){
    const mm=String(Math.floor(timerRemaining/60)).padStart(2,"0"),ss=String(timerRemaining%60).padStart(2,"0"),text=`${mm}:${ss}`;
    $("timerDisplay").textContent=text;$("focusTimerDisplay").textContent=text;
    $("timerStatus").textContent=timerRunning?"FOCUS IN PROGRESS":"READY TO FOCUS";
    $("focusTimerStatus").textContent=timerRunning?"FOCUS IN PROGRESS":"READY TO FOCUS";
    const degrees=360*(1-timerRemaining/timerDuration);
    document.querySelectorAll(".timer-ring").forEach(r=>r.style.background=`radial-gradient(circle at center,#17151e 59%,transparent 60%),conic-gradient(var(--purple) ${degrees}deg,#a78bfa20 ${degrees}deg)`);
    $("timerStart").textContent=timerRunning?"Ⅱ Pause focus":"▶ Start focus";$("focusStart").textContent=timerRunning?"Ⅱ Pause focus":"▶ Start focus";
  }
  function startTimer(){
    if(timerRunning){clearInterval(timerInterval);timerRunning=false;syncTimerDisplays();return;}
    if(timerRemaining<=0)timerRemaining=timerDuration;
    timerRunning=true;syncTimerDisplays();
    timerInterval=setInterval(()=>{
      timerRemaining--;syncTimerDisplays();
      if(timerRemaining<=0){clearInterval(timerInterval);timerRunning=false;const minutes=Math.round(timerDuration/60);data.focusSessions.push({id:uid(),date:todayKey(),minutes,missionId:$("focusMissionSelect").value||"",createdAt:Date.now()});saveData();toast(`Focus session complete. ${minutes} minutes invested.`);syncTimerDisplays();}
    },1000);
  }
  function resetTimer(){clearInterval(timerInterval);timerRunning=false;timerRemaining=timerDuration;syncTimerDisplays();}
  function setTimer(minutes){resetTimer();timerDuration=minutes*60;timerRemaining=timerDuration;document.querySelectorAll("[data-minutes]").forEach(b=>b.classList.toggle("selected",Number(b.dataset.minutes)===minutes));syncTimerDisplays();}
  function closeAllModals(){document.querySelectorAll(".modal-backdrop").forEach(m=>m.classList.remove("open"));}
  // Navigation and buttons
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();goTo(b.dataset.page);}));
  document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>goTo(b.dataset.goto)));
  $("mobileMenu").addEventListener("click",()=>{$("sidebar").classList.toggle("mobile-open");$("mobileOverlay").classList.toggle("visible");});
  $("mobileOverlay").addEventListener("click",()=>{$("sidebar").classList.remove("mobile-open");$("mobileOverlay").classList.remove("visible");});
  $("topAddMission").addEventListener("click",()=>openMissionModal());$("newMissionBtn").addEventListener("click",()=>openMissionModal());$("addTodayMission").addEventListener("click",()=>openMissionModal(null,true));
  $("newGoalBtn").addEventListener("click",()=>openGoalModal());$("newSkillBtn").addEventListener("click",()=>openSkillEditor());
  $("quickCaptureBtn").addEventListener("click",()=>{const text=prompt("Quick capture — what do you want to remember?");if(text===null||!text.trim())return;data.missions.push({id:uid(),title:text.trim(),description:"Captured from the idea inbox.",category:"Personal",priority:"low",due:"",minutes:0,goalId:"",completed:false,createdAt:Date.now()});saveData();toast("Captured as a mission. You can edit it anytime.");});
  $("closeModal").addEventListener("click",closeMissionModal);$("cancelModal").addEventListener("click",closeMissionModal);
  $("closeGoalModal").addEventListener("click",closeGoalModal);$("cancelGoalModal").addEventListener("click",closeGoalModal);
  $("closeActivityModal").addEventListener("click",closeActivityModal);$("cancelActivityModal").addEventListener("click",closeActivityModal);
  document.querySelectorAll(".modal-backdrop").forEach(backdrop=>backdrop.addEventListener("click",e=>{if(e.target===backdrop)backdrop.classList.remove("open");}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAllModals();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("quickCaptureBtn").click();}});
  document.querySelectorAll("#missionFilters [data-filter]").forEach(b=>b.addEventListener("click",()=>{missionFilter=b.dataset.filter;renderMissions();}));
  document.querySelectorAll("#goalFilters [data-horizon]").forEach(b=>b.addEventListener("click",()=>{goalFilter=b.dataset.horizon;renderGoals();}));
  $("heatmapYear").addEventListener("change",renderActivityPage);$("logTodayBtn").addEventListener("click",()=>openActivityModal(todayKey()));
  ["timerStart","focusStart"].forEach(id=>$(id).addEventListener("click",startTimer));["timerReset","focusReset"].forEach(id=>$(id).addEventListener("click",resetTimer));
  document.querySelectorAll("[data-minutes]").forEach(b=>b.addEventListener("click",()=>setTimer(Number(b.dataset.minutes))));
  $("focusMissionSelect").addEventListener("change",()=>{const m=data.missions.find(m=>m.id===$("focusMissionSelect").value);$("focusMissionName").textContent=m?m.title:"Focus on one thing.";});
  $("exportData").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`cowshell-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);toast("Backup exported.");
  });
  $("importData").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const parsed=JSON.parse(await file.text());if(!parsed||!Array.isArray(parsed.missions)||!Array.isArray(parsed.goals)||typeof parsed.activity!=="object")throw new Error("Invalid backup");if(!confirm("Import this backup and replace the data currently in this browser?"))return;data={...defaultData(),...parsed};saveData();toast("Backup imported.");}
    catch(err){toast("That file doesn't look like a valid CowShell backup.");}
    finally{e.target.value="";}
  });
  $("resetData").addEventListener("click",()=>{if(!confirm("This will permanently delete CowShell data saved in this browser. Export a backup first if you want to keep it. Continue?"))return;if(!confirm("Final check: delete all missions, goals, activity, skills, and focus history?"))return;data=defaultData();saveData();selectedDay=null;toast("Local data reset.");});
  // Activity score editor quick actions and accessibility
  document.querySelectorAll(".score-fields input").forEach(input=>input.addEventListener("input",updateScorePreview));
  // Seed a small number of achievements by behavior only; never invent user history.
  renderAll();
})();

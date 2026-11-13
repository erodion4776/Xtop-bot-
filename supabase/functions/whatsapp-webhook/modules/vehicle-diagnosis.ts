// Engr. Ero Vehicle Diagnosis — shared practical and learning experiences.
// Preliminary educational decision support only; not a substitute for physical inspection.
import { Conversation, updateConversation } from "../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../whatsapp.ts";

type System = "cooling"|"starting"|"brakes"|"electrical"|"engine"|"transmission"|"steering"|"fuel"|"ac"|"unknown";
const norm=(s:string)=>String(s||"").toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").trim();
const menuWords=new Set(["menu","back","main menu","exit","quit","cancel","stop"]);
function detectSystem(s:string):System {
 const t=norm(s);
 if(/\b[pcbu][0-9a-f]{4}\b/i.test(t)) return "engine";
 if(/overheat|hot in traffic|temperature|coolant|radiator/.test(t)) return "cooling";
 if(/won't start|wont start|not start|no start|crank|starter|clicking/.test(t)) return "starting";
 if(/brake|abs|stopping|braking/.test(t)) return "brakes";
 if(/battery|alternator|charging|dim light|electrical/.test(t)) return "electrical";
 if(/misfire|rough idle|low power|engine knock|smoke|oil pressure|stall/.test(t)) return "engine";
 if(/gearbox|transmission|gear shift|clutch|slipping gear/.test(t)) return "transmission";
 if(/steering|suspension|pulls to one side|vibration|wheel wobble/.test(t)) return "steering";
 if(/fuel leak|petrol smell|diesel smell|fuel smell|injector|fuel pump/.test(t)) return "fuel";
 if(/air condition|air-conditioning|\bac\b|not cooling|warm air|blower/.test(t)) return "ac";
 return "unknown";
}
const names:Record<System,string>={cooling:"Engine cooling",starting:"Starting system",brakes:"Braking system",electrical:"Battery and electrical",engine:"Engine performance",transmission:"Transmission",steering:"Steering and suspension",fuel:"Fuel system",ac:"Air conditioning",unknown:"General vehicle fault"};
const lessons:Record<string,{title:string;body:string;question:string;answer:string;why:string}>={
 "1":{title:"Engine cooling and overheating",body:"The cooling system removes excess heat. Its main parts include the radiator, cooling fan, thermostat, water pump, hoses, coolant and pressure cap. The thermostat regulates warm-up and coolant flow; the fan improves airflow at low road speed.",question:"A vehicle overheats mainly in traffic but cools down at highway speed. Which should be checked early?",answer:"A — Cooling fan operation and airflow.",why:"At low speed the radiator receives less natural airflow, so a fan or fan-control fault becomes a priority. This is a clue, not proof; coolant level, circulation and radiator condition still matter."},
 "2":{title:"Starting and cranking diagnosis",body:"First separate a no-crank fault from a crank-no-start fault. No-crank means the starter does not turn the engine. Crank-no-start means the engine turns but does not run. The two paths require different tests.",question:"The starter turns the engine normally, but it will not run. Which three broad areas should be checked?",answer:"Fuel delivery, ignition/injection control and mechanical compression/timing.",why:"A scan for codes and systematic checks of fuel pressure, spark or injector pulse, and compression help isolate the cause. Do not replace a sensor just because a code mentions it."},
 "3":{title:"Brake system fundamentals",body:"Hydraulic brakes use pedal force, a master cylinder, brake fluid, pipes/hoses and wheel actuators to create friction at pads/shoes and discs/drums. ABS helps prevent wheel lock during hard braking; it does not compensate for worn or leaking brakes.",question:"A brake pedal slowly sinks while held. What is the safest response?",answer:"Do not drive; arrange recovery and immediate brake-system inspection.",why:"A sinking pedal can indicate hydraulic leakage or master-cylinder bypass. It is a safety-critical symptom and must not be tested on public roads."},
 "4":{title:"Battery and charging diagnosis",body:"The battery supplies energy for starting and stabilises the electrical system. The alternator and regulator replenish charge while the engine runs. Diagnosis should include battery condition, terminals, earth paths, belt, alternator output and wiring.",question:"The battery warning lamp stays on while the engine is running. Which system needs testing?",answer:"The charging system, including alternator, regulator, belt and wiring.",why:"The lamp indicates a charging-system concern, not automatic proof that the alternator itself has failed. Test voltage and wiring under the vehicle maker's procedure."},
 "5":{title:"OBD-II trouble codes",body:"OBD-II codes are clues that identify a monitored circuit or condition. A code does not automatically identify a failed component. Record the exact code, freeze-frame data and symptoms; inspect wiring and verify with tests before replacing parts.",question:"A scan tool reports P0301. What does it generally indicate?",answer:"Cylinder 1 misfire detected.",why:"Possible causes include ignition, fuel delivery, compression or wiring. Confirm the cause with inspection and tests; do not assume the spark plug is always faulty."},
 "6":{title:"Transmission diagnosis",body:"Start by identifying manual or automatic transmission, the exact symptom, temperature and operating condition. Slipping, delayed engagement, harsh shifts, noise and fluid leaks have different diagnostic paths. Fluid type and checking procedure are vehicle-specific.",question:"An automatic transmission slips under acceleration. What should be recorded first?",answer:"Vehicle details, when slipping occurs, warning messages, leaks and service history; then scan and test to specification.",why:"Fluid level/condition, control data, pressure and internal wear may be relevant. Never add a guessed fluid or condemn the gearbox from one symptom."}
};
async function save(conv:Conversation,state:string,ctx:Record<string,unknown>) {
 await updateConversation(conv.id,{current_module:"VEHICLE_DIAGNOSIS",current_state:state,context_json:ctx});
}
async function showMode(phone:string,conv:Conversation,ctx:Record<string,unknown>) {
 await save(conv,"VEHICLE_DIAG_MODE",{...ctx,vehicleDiagnosisActive:true});
 await sendButtonMessage(phone,"🚗 *ENGR. ERO — VEHICLE DIAGNOSIS*\n\nChoose how you want to use the Automobile Engineering assistant.\n\n*Practical Diagnosis:* investigate a real vehicle complaint.\n*Learning Mode:* study automotive systems, diagnostic reasoning and test your understanding.",[makeButton("vd_practical","🔧 Practical Diagnosis"),makeButton("vd_learning","🎓 Learning Mode"),makeButton("vd_exit","Exit")],"Vehicle Diagnosis","Engr. Ero");
}
export async function startVehicleDiagnosis(phone:string,conv:Conversation):Promise<void>{
 const ctx=(conv.context_json||{}) as Record<string,unknown>;
 await showMode(phone,conv,ctx);
}
export async function handleVehicleDiagnosis(phone:string,text:string,conv:Conversation):Promise<void>{
 const raw=String(text||"").trim();
 const t=norm(raw);
 const ctx=(conv.context_json||{}) as Record<string,unknown>;
 const state=String(conv.current_state||"");
 if(t==="vd_exit"||menuWords.has(t)){
  await save(conv,"MAIN_MENU",{...ctx,vehicleDiagnosisActive:false,vehicleDiagnosisMode:null,vehicleDiagnosisStep:null});
  await sendTextMessage(phone,"Vehicle Diagnosis closed. Your Engr. Ero Learning Centre course progress is unchanged. Reply *Engr Ero* to return.");
  return;
 }
 if(t==="vd_mode"||t==="vehicle diagnosis"||t==="vehicle fault diagnosis"){await showMode(phone,conv,ctx);return;}
 if(state==="VEHICLE_DIAG_MODE"){
  if(t==="vd_practical"||t.includes("practical")){
   await save(conv,"VEHICLE_DIAG_PRACTICAL_INPUT",{...ctx,vehicleDiagnosisMode:"PRACTICAL",vehicleDiagnosisStep:"vehicle_and_symptom"});
   await sendTextMessage(phone,"🔧 *PRACTICAL DIAGNOSIS*\n\nSend the vehicle make, model, year (if known), engine/fuel type, transmission and exact complaint. Include when it happens and any dashboard warning.\n\nExample: 2012 Honda Accord, petrol automatic. It cranks but does not start.\n\nYou can also send an OBD-II code such as P0301. Do not send a photo of a dangerous situation or touch moving/hot parts.");
   return;
  }
  if(t==="vd_learning"||t.includes("learning")){
   await save(conv,"VEHICLE_DIAG_LEARN_TOPIC",{...ctx,vehicleDiagnosisMode:"LEARNING"});
   await sendTextMessage(phone,"🎓 *AUTOMOBILE ENGINEERING — LEARNING MODE*\n\nChoose a lesson by replying with its number:\n1. Engine cooling and overheating\n2. Starting and cranking diagnosis\n3. Brake system fundamentals\n4. Battery and charging diagnosis\n5. OBD-II trouble codes\n6. Transmission diagnosis\n\nEach lesson includes the engineering principle, a diagnostic example and a knowledge check. Reply *MENU* to return.");
   return;
  }
  await showMode(phone,conv,ctx);return;
 }
 if(state==="VEHICLE_DIAG_LEARN_TOPIC"){
  const lesson=lessons[t];
  if(!lesson){await sendTextMessage(phone,"Please choose a lesson number from 1 to 6, or reply *MENU*.");return;}
  await save(conv,"VEHICLE_DIAG_LEARN_QUIZ",{...ctx,vehicleDiagnosisLesson:t});
  await sendTextMessage(phone,"🎓 *"+lesson.title+"*\n\n"+lesson.body+"\n\n*Knowledge check*\n"+lesson.question+"\n\nReply with your answer in your own words. You can also reply *MENU*.");
  return;
 }
 if(state==="VEHICLE_DIAG_LEARN_QUIZ"){
  const lesson=lessons[String(ctx.vehicleDiagnosisLesson||"")];
  if(!lesson){await showMode(phone,conv,ctx);return;}
  const answerKeys:Record<string,RegExp>={"1":/fan|airflow|coolant|thermostat/i,"2":/fuel|spark|ignition|injector|compression|timing/i,"3":/do not drive|recovery|inspection|hydraulic/i,"4":/charging|alternator|regulator|belt|wiring/i,"5":/cylinder\\s*1|misfire|p0301/i,"6":/fluid|scan|slip|pressure|vehicle details/i};
  const correct=answerKeys[String(ctx.vehicleDiagnosisLesson||"")]?.test(raw)||false;
  await save(conv,"VEHICLE_DIAG_LEARN_TOPIC",{...ctx,vehicleDiagnosisLesson:null});
  await sendTextMessage(phone,(correct?"✅ *Good answer — you identified an important diagnostic point.*":"📘 *Let's review the model answer.*")+"\\n\\n*Model answer:* "+lesson.answer+"\\n\\n*Why:* "+lesson.why+"\\n\\nChoose another lesson (1–6), or reply *MENU* to change mode.");
  return;
 }
 if(state==="VEHICLE_DIAG_PRACTICAL_INPUT"){
  const system=detectSystem(raw);
  await save(conv,"VEHICLE_DIAG_PRACTICAL_FOLLOWUP",{...ctx,vehicleDiagnosisComplaint:raw,vehicleDiagnosisSystem:system});
  const followups:Record<System,string>={
   cooling:"When does the temperature rise? A) traffic/idling B) highway speed C) both D) immediately after start. Never open a hot coolant cap.",
   starting:"What happens? A) nothing B) rapid clicks C) one click D) cranks but will not run E) starts then stops.",
   brakes:"Which symptom? A) soft/sinking pedal B) hard pedal C) grinding D) pulls sideways E) warning light. Do not drive if braking is reduced.",
   electrical:"What do you notice? A) battery light while running B) weak cranking C) dim lights D) battery goes flat while parked.",
   engine:"When is it worst? A) idle B) acceleration C) uphill/load D) all the time E) stalling. Is the engine warning light on or flashing?",
   transmission:"Is it manual or automatic, and is the symptom slipping, delayed engagement, hard shifting, noise or a leak?",
   steering:"When does it happen: at a particular speed, while braking, while turning, stationary or all the time?",
   fuel:"Is there an active leak or strong fuel smell? If yes, stop: do not start or drive. Otherwise, where/when is the smell noticed?",
   ac:"Is airflow strong but warm, weak, cool only at speed, or intermittent?",
   unknown:"Which area is affected (engine, starting, brakes, steering, tyres, gearbox, electrical, cooling, A/C or fuel)? Add when it happens and any warning light."
  };
  await sendTextMessage(phone,"🔎 *Complaint recorded — "+names[system]+"*\n\nThis identifies a symptom area, not a confirmed fault.\n\n"+followups[system]+"\n\nReply with the letter or details.");
  return;
 }
 if(state==="VEHICLE_DIAG_PRACTICAL_FOLLOWUP"){
  const complaint=String(ctx.vehicleDiagnosisComplaint||"");
  const system=String(ctx.vehicleDiagnosisSystem||"unknown") as System;
  const urgent=system==="fuel"&&/leak|strong smell|petrol|diesel/.test(norm(complaint))?"URGENT: If fuel is leaking or the smell is strong, switch off if safe, keep ignition sources away, move people clear and arrange recovery. Do not start or drive."
   :system==="brakes"&&/soft|sink|failed|no brake|fluid leak/.test(norm(complaint))?"URGENT: Do not drive. Arrange recovery and immediate brake-system inspection."
   :system==="cooling"&&/steam|boil|red|coolant pouring/.test(norm(complaint+" "+raw))?"URGENT: Stop safely, switch off and allow the engine to cool. Never open a hot coolant cap."
   :system==="engine"&&/oil pressure|oil light|deep knock/.test(norm(complaint+" "+raw))?"URGENT: Switch off and do not restart until oil pressure/engine condition is checked."
   :"No immediate emergency is established from the information supplied. This does not prove the vehicle is safe; stop if braking, steering, tyres, fuel containment or engine temperature becomes unsafe.";
  const causes:Record<System,string>={
   cooling:"Possible causes: low coolant/leak, fan or fan-control fault, thermostat, radiator restriction, water pump, belt or temperature sensor. Traffic-only overheating makes fan/airflow a priority.",
   starting:"Separate no-crank from crank-no-start. Possible causes include battery/terminals, starter circuit, immobiliser, fuel pressure, ignition/injector control, crank/cam sensors, compression or timing.",
   brakes:"Possible causes include worn pads/shoes, air or leakage in hydraulics, master-cylinder fault, seized caliper, damaged discs/drums, brake-assist or ABS fault.",
   electrical:"Possible causes include weak battery, poor terminals/earth, alternator/regulator, belt, wiring fault or parked-current drain.",
   engine:"Possible causes include air/fuel restriction, ignition misfire, sensor/wiring fault, intake leak, exhaust restriction, oil/lubrication or mechanical compression/timing fault.",
   transmission:"Possible causes depend on manual/automatic type: clutch/hydraulic/linkage faults, fluid specification/level, leaks, solenoids, sensors, control strategy or internal wear.",
   steering:"Possible causes include tyre pressure/damage, wheel imbalance, alignment, worn joints/bushes, bearing, damaged wheel, brake drag or dampers.",
   fuel:"Possible causes include hose/pipe joints, injector seals, fuel rail, tank, pump seal, filler neck or damaged line. Never use a flame to find a leak.",
   ac:"Weak airflow may involve cabin filter, blower or air doors. Strong warm airflow may involve refrigerant leak, compressor control, condenser airflow, expansion device or blend door.",
   unknown:"There is not enough evidence to rank causes. Record exact behaviour and perform a symptom-led visual inspection and scan where appropriate."
  };
  const owner:Record<System,string>={
   cooling:"When fully cold, check coolant reservoir level and visible leaks. Never open a hot pressure cap or touch a fan.",
   starting:"Note whether the engine cranks, lights dim and terminals show corrosion with engine off. Never bridge starter terminals.",
   brakes:"Do not road-test if braking is reduced, pedal sinks, fluid leaks or grinding is severe. Arrange recovery.",
   electrical:"With engine off, visually inspect battery case, terminals and belt. Never disconnect the battery while running.",
   engine:"Record warning lamps, noise, smoke and operating conditions. Avoid hard acceleration; a flashing engine lamp or severe knock needs prompt attention.",
   transmission:"Record cold/hot behaviour, gear and warning messages. Do not add unspecified fluid or crawl under an unsupported vehicle.",
   steering:"Check tyres visually and note speed/conditions. Do not drive if steering is loose or a wheel wobbles.",
   fuel:"If leaking or strong smell, keep ignition sources away, move people clear and arrange recovery. Do not start or drive.",
   ac:"Note blower speeds and filter history. Do not open refrigerant lines or release refrigerant.",
   unknown:"Record exact behaviour, conditions, warning lights, recent repairs, smell, noise, heat or leakage."
  };
  const technician:Record<System,string>={
   cooling:"Pressure-test the cooling circuit; verify fan command, thermostat, coolant circulation, radiator temperature distribution and scan-tool coolant temperature. Test for combustion gases if indicated.",
   starting:"Load-test battery; voltage-drop test power/earth and starter. For crank-no-start, verify fuel pressure, spark/injector pulse, scan data, compression and timing.",
   brakes:"Inspect hydraulic circuit, pads/shoes, discs/drums, calipers, hoses, booster and ABS data; measure against manufacturer limits.",
   electrical:"Battery health/load test, charging test under load, voltage-drop tests and controlled parasitic-current test to vehicle specifications.",
   engine:"Scan codes/freeze-frame/live data; inspect intake/filter/hoses; test fuel pressure, ignition, injectors, boost and compression logically. A code does not prove a component is faulty.",
   transmission:"Identify transmission code and specified fluid; scan control data; inspect leaks/mounts; perform specified pressure and functional tests.",
   steering:"Inspect linkage, joints, bushes, bearings, dampers and fasteners; measure balance/run-out and alignment after correcting worn parts.",
   fuel:"Inspect low/high-pressure circuits using specified depressurisation and leak-test procedures.",
   ac:"Measure vent temperature and system pressures; inspect condenser fan, compressor command and leaks; recover/recharge by specified refrigerant type and mass.",
   unknown:"Confirm complaint, inspect visually, scan where appropriate and run system-specific tests. Verify faults before recommending repairs."
  };
  await save(conv,"VEHICLE_DIAG_MODE",{...ctx,vehicleDiagnosisActive:true,vehicleDiagnosisLastReportAt:new Date().toISOString()});
  await sendTextMessage(phone,"🧰 *ENGR. ERO — PRELIMINARY DIAGNOSTIC REPORT*\n\n*Vehicle / complaint:* "+complaint+"\n*Follow-up:* "+raw+"\n*System:* "+names[system]+"\n\n*Possible causes — not confirmed*\n"+causes[system]+"\n\n*Safe owner checks*\n"+owner[system]+"\n\n*Tests for a qualified technician*\n"+technician[system]+"\n\n*Urgency*\n"+urgent+"\n\nThis is preliminary decision support, not a confirmed diagnosis. Do not replace parts based only on this report.\n\nReply *PRACTICAL* for another assessment, *LEARN* for lessons or *MENU* to choose a mode.");
  return;
 }
 if(t==="practical"||t==="vd_practical"){await save(conv,"VEHICLE_DIAG_PRACTICAL_INPUT",{...ctx,vehicleDiagnosisMode:"PRACTICAL"});await sendTextMessage(phone,"Send vehicle make, model, year, engine/fuel type and exact complaint.");return;}
 if(t==="learn"||t==="vd_learning"){await save(conv,"VEHICLE_DIAG_LEARN_TOPIC",{...ctx,vehicleDiagnosisMode:"LEARNING"});await sendTextMessage(phone,"Choose a lesson: 1 Cooling, 2 Starting, 3 Brakes, 4 Electrical, 5 OBD-II, 6 Transmission. Reply with a number.");return;}
 await showMode(phone,conv,ctx);
}

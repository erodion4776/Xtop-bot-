// ELA301 guided preliminary vehicle assessment.
// Educational decision support only; never a substitute for inspection by a qualified technician.
import { Conversation, updateConversation } from "../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../whatsapp.ts";

type Category = "overheating"|"starting"|"brakes"|"smoke"|"transmission"|"steering"|"charging"|"performance"|"air_conditioning"|"oil_noise"|"tyres"|"fuel_leak"|"unknown";
const EXIT = new Set(["EXIT","QUIT","CANCEL","STOP","END","DONE","0"]);
const MENU = new Set(["MENU","MAIN MENU","COURSE MENU","BACK"]);
const RESTART = new Set(["NEW","START","RESTART","AGAIN","NEW DIAGNOSIS"]);

function norm(s:string):string { return s.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").trim(); }
function categoryOf(s:string):Category {
 const t=norm(s);
 if(/fuel leak|petrol leak|diesel leak|smell of fuel|fuel smell/.test(t)) return "fuel_leak";
 if(/overheat|temperature gauge|engine hot|runs hot|hot in traffic|coolant temperature/.test(t)) return "overheating";
 if(/brake|braking|stopping distance|abs light|brake fluid/.test(t)) return "brakes";
 if(/smoke|blue smoke|white smoke|black smoke|exhaust smoke/.test(t)) return "smoke";
 if(/won't start|wont start|not start|no start|crank|starter|clicking when i start|doesn't start|doesnt start/.test(t)) return "starting";
 if(/gearbox|transmission|gear shift|gear change|clutch|slipping gear|won't shift|wont shift/.test(t)) return "transmission";
 if(/steering|pulls to one side|pulling to one side|vibrat|shak|suspension|wheel alignment|wobbl|loose steering/.test(t)) return "steering";
 if(/tyre|tire|puncture|flat tyre|flat tire|blowout|wheel bearing/.test(t)) return "tyres";
 if(/battery|alternator|charging|battery light|dim lights|electrical power/.test(t)) return "charging";
 if(/low power|loss of power|poor acceleration|hesitat|misfire|stall|fuel consumption|rough idle/.test(t)) return "performance";
 if(/air condition|air-conditioning|air conditioning|ac not|not cooling|warm air|weak airflow|blower/.test(t)) return "air_conditioning";
 if(/oil pressure|oil leak|engine knock|knocking|rattling|unusual engine noise|ticking noise/.test(t)) return "oil_noise";
 return "unknown";
}
function label(c:Category):string {
 const names:Record<Category,string>={overheating:"ENGINE COOLING",starting:"STARTING / ENGINE START",brakes:"BRAKING",smoke:"EXHAUST SMOKE",transmission:"TRANSMISSION / DRIVETRAIN",steering:"STEERING / SUSPENSION",charging:"BATTERY / CHARGING",performance:"ENGINE PERFORMANCE",air_conditioning:"AIR CONDITIONING",oil_noise:"ENGINE OIL / NOISE",tyres:"TYRES / WHEELS",fuel_leak:"FUEL SYSTEM LEAK",unknown:"GENERAL VEHICLE FAULT"};
 return names[c];
}
function question(c:Category):string {
 const q:Record<Category,string>={
 overheating:"When does temperature rise? Reply *A* in traffic/idling, *B* at highway speed, *C* both, or *D* coolant disappears while temperature seems normal. Never open a hot coolant cap.",
 starting:"When starting, what happens? *A* nothing, *B* rapid clicks, *C* one click, *D* engine cranks but will not run, or *E* starts then stops.",
 brakes:"Which symptom? *A* soft/sinking pedal, *B* hard pedal, *C* grinding/squealing, *D* pulls sideways, *E* warning light, or *F* weak braking. Do not drive if braking is reduced.",
 smoke:"Choose smoke: *A* blue, *B* persistent white after warm-up, *C* black, or *D* brief white vapour on cold start. Say whether it occurs at idle or acceleration.",
 transmission:"Which symptom? *A* slipping, *B* delayed engagement, *C* difficult shifting, *D* noise, or *E* fluid leak. Is it manual or automatic?",
 steering:"When does it happen? *A* certain speed, *B* only braking, *C* turning, *D* stationary, or *E* pulls constantly.",
 charging:"What do you notice? *A* battery light stays on while running, *B* weak cranking, *C* dim lights, or *D* battery goes flat while parked.",
 performance:"When is it worst? *A* idle, *B* acceleration, *C* uphill/under load, *D* all the time, or *E* stalls. Is the engine warning light on or flashing?",
 air_conditioning:"Which describes it? *A* strong airflow but warm, *B* weak airflow, *C* cool at speed but warm in traffic, or *D* intermittent.",
 oil_noise:"Which? *A* oil-pressure warning, *B* deep knocking, *C* light ticking, *D* rattling, or *E* visible oil leak. If A or B, switch off.",
 tyres:"What is happening? *A* slow pressure loss, *B* puncture, *C* vibration at speed, *D* uneven wear, or *E* wheel wobble. Do not drive on a damaged/loose wheel.",
 fuel_leak:"Where is the smell/leak? *A* engine area, *B* tank/rear, *C* under vehicle, or *D* after refuelling. If fuel is actively leaking, do not start the engine.",
 unknown:"Which area is affected: engine, starting, brakes, steering, tyres, gearbox, electrical, cooling, A/C or fuel? Describe exactly what happens and when."
 };
 return q[c];
}
function urgency(c:Category,s:string):string {
 const t=norm(s);
 if(c==="fuel_leak") return "URGENT: If fuel is leaking or the smell is strong, switch off if safe, keep flames/sparks away, move people clear and arrange recovery. Do not start or drive.";
 if(c==="brakes" && /soft pedal|sinking pedal|no brake|brakes failed|cannot stop|fluid leak/.test(t)) return "URGENT: Do not drive. Arrange recovery and immediate brake-system inspection.";
 if(c==="overheating" && /red|steam|boiling|coolant pouring/.test(t)) return "URGENT: Stop safely and switch off. Never open a hot coolant cap. Arrange assistance.";
 if(c==="oil_noise" && /oil pressure|oil light|deep knock|heavy knocking/.test(t)) return "URGENT: Switch off and do not restart until oil pressure has been checked.";
 if(c==="tyres" && /blowout|wheel wobbl|tyre burst|tire burst/.test(t)) return "URGENT: Stop safely away from traffic. Do not continue on a damaged or loose wheel.";
 if(c==="steering" && /steering failed|no steering|very loose steering|wheel wobbl/.test(t)) return "URGENT: Stop safely and arrange recovery. Do not continue if steering control is doubtful.";
 return "No immediate emergency is established from the information supplied. This does not prove the vehicle is safe; stop if braking, steering, tyres, fuel containment or engine temperature becomes unsafe.";
}
function assessment(c:Category,vehicle:string,answer:string):string {
 const t=norm(answer);
 const data:Record<Category,{causes:string;owner:string;tech:string}>={
 overheating:{causes:"Possible causes: low coolant/leak, cooling fan or control fault, thermostat, radiator restriction, water pump, belt or temperature sensor. Traffic-only overheating makes fan/airflow a priority; overheating at speed also raises concern about coolant circulation or radiator capacity.",owner:"When fully cold, inspect reservoir level and visible leaks. Note fan behaviour without touching moving parts. Never open a hot pressure cap.",tech:"Pressure-test the circuit; verify fan command, thermostat, coolant circulation, radiator temperature distribution and scan-tool coolant temperature. Test for combustion gases if indicated."},
 starting:{causes:/crank|turns over|cranks|d/.test(t)?"Crank/no-start causes include fuel pressure, injector control, ignition/spark on petrol engines, crank/cam sensors, immobiliser, compression or timing.":"No-crank causes include weak battery, poor terminals/earth, starter relay/fuse, starter motor, ignition switch or clutch/park-neutral interlock. Rapid clicking often accompanies low voltage.",owner:"Check for unusually dim lamps and visible battery-terminal corrosion with engine off. Confirm Park/Neutral or clutch-start condition. Never bridge starter terminals.",tech:"Load-test battery; voltage-drop test power/earth circuits; check starter current. For crank/no-start, verify fuel pressure, spark/injector pulse, scan data, compression and timing."},
 brakes:{causes:"Possible causes: worn pads/shoes, damaged discs/drums, air or leakage in hydraulics, master-cylinder fault, seized caliper, contaminated friction material, brake-assist fault or ABS issue.",owner:"Do not road-test with reduced braking, sinking pedal, fluid leak, severe grinding or brake warning. Note warning lights and visible fluid from a safe position.",tech:"Inspect the complete hydraulic circuit, pads/shoes, discs/drums, calipers, hoses, booster and ABS data. Measure against manufacturer limits."},
 smoke:{causes:"Blue smoke may indicate oil burning; persistent white smoke after warm-up may indicate coolant entry (brief cold-start vapour can be normal); black smoke often indicates excess fuel or insufficient air. Turbo, injector, sensor, air-filter or EGR faults may contribute.",owner:"Record colour and when it appears: cold start, idle, acceleration or overrun. Check oil/coolant only when safe and cold. Avoid inhaling exhaust.",tech:"Check codes/live fuel-air data, intake/turbo plumbing, injector operation and EGR/DPF where fitted. Compression, leak-down or coolant tests may be needed. Colour alone is not proof."},
 transmission:{causes:"Manual faults may involve clutch wear, hydraulics or linkage. Automatic faults may involve specified-fluid level/condition, leaks, solenoids, sensors, control strategy or internal wear.",owner:"Note whether cold/hot and which gear is affected. Look for warning messages or fluid spots without going underneath. Do not add unspecified fluid.",tech:"Identify transmission code/fluid specification; scan control data; inspect leaks and mounts; perform specified pressure and functional tests."},
 steering:{causes:"Possible causes: tyre pressure/damage, wheel imbalance, alignment error, worn steering/suspension joints, wheel bearing, damaged wheel, brake drag or dampers. Vibration during braking may involve brakes rather than balance.",owner:"Check visible tyre/wheel condition and cold pressures. Note speed and conditions. Do not drive if steering is loose or a wheel wobbles.",tech:"Inspect linkage, joints, bushes, bearings, dampers and fasteners; measure wheel balance/run-out and alignment after correcting worn parts."},
 charging:{causes:"Possible causes: weak battery, corroded terminals, poor earth, alternator/regulator fault, damaged belt, wiring fault or excessive parked-current draw.",owner:"With engine off, inspect battery case, terminals and belt visually. Never disconnect the battery while engine runs or short its terminals.",tech:"Battery health/load test, charging test under load, voltage-drop tests and controlled parasitic-current test against vehicle specifications."},
 performance:{causes:"Possible causes: restricted air filter, fuel-pressure/injector fault, ignition misfire, airflow/pressure sensor, intake/boost leak, exhaust restriction, poor fuel or low compression.",owner:"Record idle/acceleration/load conditions and warning lamps. Avoid hard acceleration. A flashing engine warning or severe misfire needs prompt attention.",tech:"Scan codes/freeze-frame/live data; inspect intake/filter/hoses; test fuel pressure, ignition, injectors, boost and compression logically. A code does not automatically identify a failed part."},
 air_conditioning:{causes:/weak|airflow/.test(t)?"Weak airflow often points to a blocked cabin filter, blower motor/resistor/control fault, evaporator restriction or air-door issue.":"Strong but warm air may involve refrigerant loss/leak, compressor control, condenser fan/airflow, expansion device or blend door.",owner:"Check blower speed, vent selection and cabin-filter history. Do not open refrigerant lines or release refrigerant.",tech:"Measure vent temperature and system pressures; inspect condenser fan, compressor command and leaks. Recover and recharge by specified refrigerant type/mass."},
 oil_noise:{causes:"Oil leak sources include gasket, seal, filter, sump or oil cooler. Ticking/rattling has several causes; deep knocking can indicate serious bearing damage. Oil-pressure warning may indicate low level, pump/pickup trouble or excessive clearance.",owner:"Park level and check oil by maker procedure. If oil-pressure warning or deep knocking occurs, switch off and do not restart.",tech:"Verify oil pressure with a mechanical gauge, locate leaks and identify noise before further running."},
 tyres:{causes:"Pressure loss may be puncture, valve or bead leak; vibration may be imbalance, tyre damage or wheel run-out; uneven wear may result from pressure, alignment, suspension or loading.",owner:"Inspect tread/sidewalls for cuts, bulges and exposed cords; check cold pressure. Do not drive on a bulging or structurally damaged tyre.",tech:"Leak-test tyre/valve/bead; inspect rim and fasteners; measure balance/run-out; check alignment and suspension after tyre defects are corrected."},
 fuel_leak:{causes:"Possible sources: fuel hose/pipe joints, injector seals, fuel rail, tank, pump seal, filler neck or damaged line. Location and timing after refuelling help narrow inspection.",owner:"If leaking or strong smell, keep ignition sources away, move people clear and arrange recovery. Do not start or drive.",tech:"Inspect low/high-pressure fuel circuits using specified depressurisation and leak-test procedures. Never use a flame to find leaks."},
 unknown:{causes:"There is not enough information to rank causes responsibly. A symptom-led inspection is safer than guessing or replacing parts.",owner:"Record exact behaviour, conditions, warning lights, recent repairs, smell, noise, heat or leakage. Stop if safety-critical control is affected.",tech:"Confirm complaint, inspect visually, scan where appropriate and run system-specific tests. Verify faults before recommending repair."}
 };
 const d=data[c];
 return ["🧰 *ELA301 — PRELIMINARY VEHICLE ASSESSMENT*","", "*Vehicle / complaint:* "+vehicle,"*Follow-up:* "+answer,"*System:* "+label(c),"","*1. Possible causes — not confirmed*",d.causes,"","*2. Safe checks for the owner*",d.owner,"","*3. Tests for a qualified technician*",d.tech,"","*4. Urgency*",urgency(c,vehicle+" "+answer),"","This is an educational preliminary assessment, not a confirmed diagnosis. Do not replace parts based only on this message.","","Reply *NEW* for another vehicle, *MENU* for course menu, or *EXIT* to leave diagnosis."].join("\n");
}
async function clear(conversationId:string,ctx:Record<string,unknown>,state="COURSE_MENU"):Promise<void>{
 const next={...ctx,automobileDiagnosisActive:false,automobileDiagnosisStep:null};
 delete next.automobileDiagnosisDescription; delete next.automobileDiagnosisCategory;
 await updateConversation(conversationId,{current_module:"LEARNING",current_state:state,context_json:next});
}
export async function startAutomobileDiagnosis(phone:string,conversationId:string,context:Record<string,unknown>):Promise<void>{
 await updateConversation(conversationId,{current_module:"LEARNING",current_state:"AUTOMOBILE_DIAGNOSIS_INPUT",context_json:{...context,automobileDiagnosisActive:true,automobileDiagnosisStep:"symptom"}});
 await sendButtonMessage(phone,"🚗 *ELA301 — VEHICLE FAULT ASSESSMENT*\n\nTell me the vehicle make, model, year (if known), engine/transmission type and exact problem. Include when it happens and any dashboard warning.\n\n*Example:* 2010 Toyota Corolla, petrol automatic. Temperature rises in traffic but returns to normal on the highway.\n\nI will identify the system, ask a focused question, separate possible causes from confirmed faults and provide safe owner checks plus technician tests.\n\n*Commands at any time:* EXIT = leave · MENU = course menu · NEW = restart.\n\n*Safety:* If brakes/steering fail, a tyre is damaged, fuel is leaking, the engine overheats severely or oil-pressure warning appears, stop safely and seek professional help.",[makeButton("auto_new","🔄 Start Diagnosis"),makeButton("auto_exit","✖️ Exit Diagnosis"),makeButton("auto_menu","📋 Course Menu")],"Vehicle Assessment","ELA301 Practical");
}
export async function handleAutomobileDiagnosis(phone:string,text:string,conv:Conversation):Promise<void>{
 const ctx=(conv.context_json||{}) as Record<string,unknown>;
 const raw=text.trim(); const cmd=raw.toUpperCase().replace(/[.!]/g,"").trim();
 if(cmd==="auto_exit"||EXIT.has(cmd)){await clear(conv.id,ctx);await sendButtonMessage(phone,"You have exited vehicle diagnosis. Your course progress is unchanged.",[makeButton("cm_auto_diag","🚗 Vehicle Diagnosis"),makeButton("cm_menu","📋 Course Menu")],"Diagnosis Closed");return;}
 if(cmd==="auto_menu"||MENU.has(cmd)){await clear(conv.id,ctx);await sendTextMessage(phone,"Vehicle diagnosis closed. Reply *MENU* to display your course options.");return;}
 if(cmd==="auto_new"||RESTART.has(cmd)){await startAutomobileDiagnosis(phone,conv.id,ctx);return;}
 if(!raw){await sendTextMessage(phone,"Enter the vehicle details and symptom, or reply *EXIT*, *MENU* or *NEW*.");return;}
 if(conv.current_state==="AUTOMOBILE_DIAGNOSIS_INPUT"){
  const c=categoryOf(raw);
  if(c==="unknown"){await updateConversation(conv.id,{current_module:"LEARNING",current_state:"AUTOMOBILE_DIAGNOSIS_INPUT",context_json:{...ctx,automobileDiagnosisActive:true,automobileDiagnosisDescription:raw,automobileDiagnosisCategory:"unknown"}});await sendTextMessage(phone,"I could not confidently identify the system. Add the exact symptom and choose the closest area: *engine / starting / brakes / steering / tyres / gearbox / electrical / cooling / A/C / fuel leak*. Include when it happens and any warning light. Commands: *EXIT*, *MENU*, *NEW*.");return;}
  await updateConversation(conv.id,{current_module:"LEARNING",current_state:"AUTOMOBILE_DIAGNOSIS_FOLLOWUP",context_json:{...ctx,automobileDiagnosisActive:true,automobileDiagnosisDescription:raw,automobileDiagnosisCategory:c,automobileDiagnosisStep:"followup"}});
  await sendButtonMessage(phone,"🔎 *System identified:* "+label(c)+"\n\nThis is a symptom category, not a confirmed fault.\n\n"+question(c)+"\n\nReply with the letter and any extra detail. If unsure, reply *NOT SURE*.",[makeButton("auto_not_sure","Not sure"),makeButton("auto_new","Start over"),makeButton("auto_exit","Exit")],"Focused Follow-up");return;
 }
 if(conv.current_state==="AUTOMOBILE_DIAGNOSIS_FOLLOWUP"){
  const c=String(ctx.automobileDiagnosisCategory||"unknown") as Category;
  const vehicle=String(ctx.automobileDiagnosisDescription||"Vehicle symptom not recorded");
  const msg=assessment(c,vehicle,raw);
  await clear(conv.id,ctx);
  await sendTextMessage(phone,msg);
  await sendButtonMessage(phone,"What would you like to do next?",[makeButton("auto_new","🔄 New Diagnosis"),makeButton("cm_menu","📋 Course Menu")],"Assessment Complete");return;
 }
 await startAutomobileDiagnosis(phone,conv.id,ctx);
}

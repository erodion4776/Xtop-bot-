// supabase/functions/whatsapp-webhook/modules/automobile-diagnostics.ts
// Guided, rule-based preliminary vehicle fault diagnosis for AET301 students.
// This module does not replace a qualified technician's inspection.

import { Conversation, updateConversation } from "../database.ts";
import { sendTextMessage } from "../whatsapp.ts";

type DiagnosisCategory =
  | "overheating"
  | "starting"
  | "brakes"
  | "smoke"
  | "transmission"
  | "steering"
  | "charging"
  | "performance"
  | "air_conditioning"
  | "oil_noise"
  | "unknown";

function matchCategory(input: string): DiagnosisCategory {
  const t = input.toLowerCase();
  if (/overheat|overheating|temperature gauge|engine hot|runs hot|hot in traffic/.test(t)) return "overheating";
  if (/won't start|wont start|not start|no start|crank|starter|clicking when i start|starting problem/.test(t)) return "starting";
  if (/brake|braking|brake pedal|stopping distance|abs light/.test(t)) return "brakes";
  if (/smoke|blue smoke|white smoke|black smoke|exhaust smoke/.test(t)) return "smoke";
  if (/gearbox|transmission|gear shift|gear change|clutch|slipping gear|won't shift|wont shift/.test(t)) return "transmission";
  if (/steering|pulls to one side|pulling to one side|vibrat|shak|suspension|wheel alignment|wobbl/.test(t)) return "steering";
  if (/battery|alternator|charging|battery light|dim lights|electrical power/.test(t)) return "charging";
  if (/low power|loss of power|poor acceleration|hesitat|misfire|stall|fuel consumption|using too much fuel/.test(t)) return "performance";
  if (/air condition|air-conditioning|air conditioning|ac not|ac is not|not cooling|warm air|weak airflow|blower/.test(t)) return "air_conditioning";
  if (/oil pressure|oil leak|engine knock|knocking|rattling|unusual engine noise/.test(t)) return "oil_noise";
  return "unknown";
}

function followUp(category: DiagnosisCategory): string {
  const questions: Record<DiagnosisCategory, string> = {
    overheating: "Does the temperature rise mainly when the car is stationary/in traffic, while driving, or in both conditions? If safe to observe, does the radiator cooling fan switch on?",
    starting: "When you turn the key or press START, what happens: (A) engine does not turn and you hear silence, (B) rapid clicking, (C) one click, or (D) engine turns/cranks but does not start?",
    brakes: "What exactly do you notice: (A) soft or sinking pedal, (B) very hard pedal, (C) grinding/squealing, (D) vehicle pulls to one side, or (E) brake warning light?",
    smoke: "What colour is the smoke: (A) blue, (B) persistent white, (C) black, or (D) only a little white vapour on a cold start?",
    transmission: "Is it a manual or automatic transmission, and is the main symptom slipping, delayed engagement, difficult shifting, unusual noise, or fluid leakage?",
    steering: "When does the vibration or pulling happen: at a particular road speed, during braking, while turning, or even when stationary?",
    charging: "Does the battery warning light remain on while the engine is running, and does the vehicle start again after being switched off?",
    performance: "Does the loss of power happen during acceleration, uphill driving, at idle, or all the time? Is the check-engine light on?",
    air_conditioning: "Is the air coming out strongly but warm, or is the airflow itself weak? Does the problem change with engine speed?",
    oil_noise: "Is an oil-pressure warning light on, and is the noise a deep knocking, light ticking, or rattling? If the oil-pressure warning is on or there is deep knocking, switch the engine off.",
    unknown: "Please add the vehicle make, model, approximate year, engine type if known, the exact symptom, when it occurs, and any dashboard warning light.",
  };
  return questions[category];
}

function diagnosticReport(category: DiagnosisCategory, vehicleDescription: string, followUpAnswer: string): string {
  const answer = followUpAnswer.toLowerCase();
  const reports: Record<DiagnosisCategory, { causes: string; checks: string; safety: string }> = {
    overheating: {
      causes: "Possible areas include low coolant or a leak, a cooling fan or fan-control fault, a stuck thermostat, a restricted radiator, a weak water pump, a faulty temperature sensor, or (less commonly) an internal engine leak such as a head-gasket failure.",
      checks: "With the engine completely cold, check the coolant reservoir level and look for visible leaks. Observe whether the fan operates when commanded; inspect the drive belt and radiator exterior; scan the engine coolant-temperature reading; and have the cooling system pressure-tested. If it overheats mainly in traffic, fan operation and airflow deserve early attention. If it overheats at road speed too, coolant circulation, radiator restriction and engine load also need investigation.",
      safety: "Never remove a radiator cap or pressurised coolant cap while hot. If the gauge enters the red, a warning appears, steam is visible, or coolant is escaping, stop safely, switch off and arrange recovery."
    },
    starting: {
      causes: answer.includes("d") || answer.includes("crank") || answer.includes("turns") ?
        "Because the engine cranks but does not start, investigate fuel delivery, ignition/spark on petrol engines, injector operation, crankshaft-position sensing, immobiliser authorisation and engine compression." :
        "If the engine does not crank, investigate battery state and terminals, earth connections, starter relay/fuse, starter solenoid/motor, ignition switch or start button, and the park/neutral or clutch safety switch. Rapid clicking often accompanies low battery voltage or poor connections; one click can also indicate a starter circuit or motor fault.",
      checks: "Record battery voltage and terminal condition, confirm the correct gear/neutral or clutch-start condition, check relevant fuses and scan for diagnostic codes. For a crank/no-start condition, a technician should verify fuel pressure, spark/injector pulse and crankshaft/camshaft sensor signals before replacing parts.",
      safety: "Do not keep cranking for long periods; allow the starter to cool. Keep sparks and flames away from fuel. Do not bridge starter terminals or bypass safety interlocks."
    },
    brakes: {
      causes: "Possible causes include worn pads or shoes, damaged discs/drums, air or leakage in the hydraulic circuit, a failing master cylinder, seized caliper, contaminated friction surfaces, a brake booster fault or an ABS sensor/control issue.",
      checks: "A qualified technician should inspect fluid level and leaks, pads/shoes, discs/drums, hoses, calipers, wheel cylinders and warning codes. A soft/sinking pedal requires immediate hydraulic-system investigation; a hard pedal may involve the brake-assist system.",
      safety: "BRAKE SAFETY: Do not continue driving with a soft/sinking pedal, fluid leak, severe grinding, brake warning, or reduced stopping ability. Stop in a safe place and arrange towing or professional recovery."
    },
    smoke: {
      causes: "Blue smoke can indicate engine oil entering combustion; persistent white smoke after warm-up can indicate coolant entering a cylinder, although condensation can be normal briefly on a cold start; black smoke often indicates excessive fuel or insufficient air. Turbocharger, injector, sensor, air-filter and engine-wear faults may be involved depending on engine type.",
      checks: "Record when the smoke appears (cold start, idle, acceleration or deceleration), check oil and coolant levels only when safe, inspect for external leaks, scan for codes and assess fuel/air data. A compression or leak-down test may be needed. Smoke colour alone cannot confirm a failed component.",
      safety: "If smoke is heavy, the engine is overheating, oil pressure is low, or there is a strong fuel/burning smell, stop safely and switch off. Do not open a hot cooling system."
    },
    transmission: {
      causes: "On a manual vehicle, clutch wear, clutch hydraulic faults or linkage problems may cause slipping or difficult shifts. On an automatic, low/incorrect fluid, leaks, solenoids, sensors, control faults or internal wear may cause slipping or delayed engagement.",
      checks: "Identify the exact transmission type and symptom. Inspect for leaks and warning messages; check fluid only using the manufacturer's specified temperature and procedure; scan the transmission control module where supported. Do not add universal fluid or attempt adjustment without the correct specification.",
      safety: "Avoid driving if the transmission slips severely, loses drive, makes loud mechanical noises, overheats or leaks substantial fluid. Arrange professional inspection."
    },
    steering: {
      causes: "Possible causes include incorrect tyre pressure, tyre damage, wheel imbalance, wheel-alignment error, worn steering or suspension joints, wheel-bearing faults, damaged wheels, brake drag or worn dampers. Vibration during braking may point toward brake-disc or suspension issues rather than wheel balance alone.",
      checks: "Check tyre condition and pressures when cold; note the exact speed and condition where the symptom occurs; inspect wheels, fasteners, joints, bushes, bearings and dampers in an approved workshop; then measure alignment and wheel balance as appropriate.",
      safety: "If steering becomes loose, a wheel wobbles, a tyre is damaged, or control is affected, stop safely and do not continue at road speed. Steering and suspension components are safety-critical."
    },
    charging: {
      causes: "Possible causes include a weak or aged battery, loose/corroded terminals, poor earth connection, a slipping or damaged alternator belt, alternator/regulator failure, wiring/ground faults or excessive parasitic current when parked.",
      checks: "Inspect terminals and belt with the engine off. Test battery condition and charging voltage with a suitable multimeter and compare readings with the vehicle manufacturer's specification. If charging output is correct but the battery drains while parked, perform a controlled parasitic-draw test.",
      safety: "Do not disconnect the battery while the engine is running. Avoid shorting battery terminals; batteries can deliver very high current. Use eye protection and follow battery handling precautions."
    },
    performance: {
      causes: "Possible causes include a restricted air filter, fuel-delivery or injector problem, ignition misfire, faulty airflow/pressure sensor, boost leak, exhaust restriction, poor fuel quality or low engine compression.",
      checks: "Record whether the fault occurs at idle, under acceleration or under load. Scan diagnostic trouble codes and live data; inspect air-filter condition and intake hoses; then test fuel pressure, ignition and sensor readings according to the manufacturer's procedure. Avoid replacing sensors based only on a code description.",
      safety: "If the engine misfires severely, stalls in traffic, overheats, or the check-engine light flashes, reduce load, stop safely and seek professional diagnosis."
    },
    air_conditioning: {
      causes: answer.includes("weak") || answer.includes("airflow") ?
        "Weak airflow is more consistent with a restricted cabin filter, blower motor/resistor or control fault, blocked evaporator, or air-door problem." :
        "Strong but warm airflow may involve low refrigerant from a leak, compressor or clutch/control fault, condenser fan/airflow restriction, expansion device or temperature-control door.",
      checks: "Check cabin-filter condition and blower settings. A qualified HVAC technician should measure system pressures and temperatures, inspect condenser-fan operation, leak-test the circuit and verify compressor control. Refrigerant type and charge mass must match the vehicle label.",
      safety: "Do not vent refrigerant or open pressurised A/C lines. Refrigerant can cause cold burns and requires suitable recovery and charging equipment."
    },
    oil_noise: {
      causes: "A leak may come from a gasket, seal, filter, sump or oil cooler. Ticking can have several causes including valve-train or injector noise; deep knocking may indicate serious bearing or internal engine damage. The oil-pressure warning may indicate low oil level, pump/pickup trouble or excessive internal clearance.",
      checks: "Park safely on level ground and check the oil level using the manufacturer's procedure. Look for the source of any external leak without reaching near moving or hot parts. A technician should verify oil pressure with a suitable gauge and locate the noise before further running.",
      safety: "If the oil-pressure warning is on, the engine is knocking deeply, or oil is leaking rapidly, switch off immediately and do not restart until inspected. Continuing to run can destroy the engine."
    },
    unknown: {
      causes: "The symptom description is not yet specific enough to rank likely causes safely.",
      checks: "Collect the vehicle make/model/year, engine and transmission type, mileage if known, exact symptom, when it happens, recent repairs, warning lights and any diagnostic trouble codes. Then test one system at a time rather than replacing parts by guesswork.",
      safety: "If the complaint affects brakes, steering, tyres, fuel leakage, smoke/fire, severe overheating or oil pressure, stop using the vehicle and arrange professional inspection."
    },
  };
  const r = reports[category];
  return `🔧 *ENGR ERO — PRELIMINARY VEHICLE DIAGNOSIS*\n\n*Vehicle and complaint:*\n${vehicleDescription}\n\n*Additional observation:*\n${followUpAnswer}\n\n*Possible causes (not confirmed):*\n${r.causes}\n\n*Recommended diagnostic checks:*\n${r.checks}\n\n*Safety instruction:*\n${r.safety}\n\n_This is an educational, preliminary assessment—not a confirmed diagnosis or repair instruction. Confirm faults with the correct service information, tools and a qualified technician. Do not replace parts based only on this message._\n\nReply *MENU* to return to the AET301 course menu or start another diagnosis from the practical diagnosis option.`;
}

export async function startAutomobileDiagnosis(
  phone: string,
  conversationId: string,
  context: Record<string, unknown>
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "LEARNING",
    current_state: "AUTOMOBILE_DIAGNOSIS_INPUT",
    context_json: {
      ...context,
      automobileDiagnosisActive: true,
      automobileDiagnosisStep: "symptom",
    },
  });
  await sendTextMessage(phone,
    "🚗 *AET301 — VEHICLE FAULT DIAGNOSIS*\n\n" +
    "Describe the vehicle and the problem in your own words. Include the make, model, approximate year, engine/transmission if known, the symptom, when it happens and any dashboard warning light.\n\n" +
    "Example: *2010 Toyota Corolla, petrol, automatic. Temperature rises in traffic but returns to normal on the highway. No warning light.*\n\n" +
    "I will ask a follow-up question, explain possible causes and suggest safe diagnostic checks. I will not claim a fault is confirmed without test evidence.\n\n" +
    "If the problem involves failed brakes, loose steering, a damaged tyre, fuel leak, fire, severe overheating or an oil-pressure warning, stop safely and do not continue driving."
  );
}

export async function handleAutomobileDiagnosis(
  phone: string,
  text: string,
  conv: Conversation
): Promise<void> {
  const context = (conv.context_json || {}) as Record<string, unknown>;
  const state = String(conv.current_state || "");
  const raw = text.trim();
  if (!raw) {
    await sendTextMessage(phone, "Please describe the vehicle and its symptoms, or reply *MENU* to return to the course.");
    return;
  }

  if (state === "AUTOMOBILE_DIAGNOSIS_INPUT") {
    const category = matchCategory(raw);
    if (category === "unknown") {
      await updateConversation(conv.id, {
        current_module: "LEARNING",
        current_state: "AUTOMOBILE_DIAGNOSIS_INPUT",
        context_json: { ...context, automobileDiagnosisDescription: raw, automobileDiagnosisCategory: "unknown" },
      });
      await sendTextMessage(phone,
        "I need a little more detail before narrowing this down. Please send the vehicle make/model/year, exact symptom, when it occurs (cold start, idle, acceleration, traffic or highway), and any warning light or OBD-II code.\n\nFor example: *Honda Accord 2008, engine cranks but will not start; check-engine light is on.*"
      );
      return;
    }

    await updateConversation(conv.id, {
      current_module: "LEARNING",
      current_state: "AUTOMOBILE_DIAGNOSIS_FOLLOWUP",
      context_json: {
        ...context,
        automobileDiagnosisActive: true,
        automobileDiagnosisDescription: raw,
        automobileDiagnosisCategory: category,
      },
    });
    await sendTextMessage(phone,
      `I have identified the main system to investigate: *${category.replace(/_/g, " ").toUpperCase()}*. This is not yet a confirmed fault.\n\n*${followUp(category)}*\n\nReply with what you observe. If you do not know, say *NOT SURE*.`
    );
    return;
  }

  if (state === "AUTOMOBILE_DIAGNOSIS_FOLLOWUP") {
    const category = String(context.automobileDiagnosisCategory || "unknown") as DiagnosisCategory;
    const description = String(context.automobileDiagnosisDescription || "Vehicle symptom not recorded");
    const report = diagnosticReport(category, description, raw);
    await updateConversation(conv.id, {
      current_module: "LEARNING",
      current_state: "COURSE_MENU",
      context_json: {
        ...context,
        automobileDiagnosisActive: false,
        automobileDiagnosisLastCategory: category,
        automobileDiagnosisLastCompletedAt: new Date().toISOString(),
      },
    });
    await sendTextMessage(phone, report);
    return;
  }

  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "AUTOMOBILE_DIAGNOSIS_INPUT",
    context_json: { ...context, automobileDiagnosisActive: true },
  });
  await sendTextMessage(phone, "Please describe the vehicle and the problem again. Include the make, model, year and exact symptom.");
}

export async function handlePersonalizedDemoToken(
  phone: string,
  text: string,
  token: string,
  contact: Contact,
  conversation: Conversation
): Promise<boolean> {
  let v;

  try {
    v = await validateToken(token, text);
  } catch (error) {
    safeErrorLog("handlePersonalizedDemoToken: validation failed", error);

    await sendTextMessage(
      phone,
      "⚠️ We could not verify that demo reference right now.\n\nPlease try again shortly, or type *menu* to explore our demos."
    );

    // Stop this message from falling through into unrelated demo routing.
    return true;
  }

  if (!v) {
    await logEvent(phone, "invalid_token", null, {
      prefix: token.substring(0, 8),
    });

    await sendTextMessage(
      phone,
      "⚠️ This demo reference is invalid, expired, or unavailable.\n\nYou can still explore our demos. Type *menu* to continue."
    );

    // The invalid token was handled; do not process the same message again.
    return true;
  }

  let leadId: string | null = null;

  try {
    const lead = await createDemoLead(
      phone,
      contact.name || "Prospect",
      v.businessName,
      v.businessCategory,
      v.demoTemplate,
      `${v.businessName} Demo`,
      `Token ${v.tokenPrefix}`
    );

    leadId = lead?.id || null;
  } catch (error) {
    safeErrorLog("handlePersonalizedDemoToken: lead creation failed", error);
  }

  if (!leadId) {
    await sendTextMessage(
      phone,
      "⚠️ Your demo reference is valid, but we could not save your enquiry right now.\n\nPlease try again shortly or contact Xtop on 08024988555."
    );

    // Do not create a personalized session that silently loses its lead.
    return true;
  }

  await logEvent(phone, "inbound_demo_request", leadId, {
    business: v.businessName,
    campaign: v.campaignSource,
  });

  await updateConversation(conversation.id, {
    current_module: "DEMOS",
    current_state: "PERSONALIZED_WELCOME",
    context_json: {
      personalizedDemo: true,
      businessName: v.businessName,
      businessCategory: v.businessCategory,
      demoTemplate: v.demoTemplate,
      businessConfigId: v.businessConfigId,
      tokenPrefix: v.tokenPrefix,
      leadId,
    },
  });

  await sendTextMessage(
    phone,
    `Hello *${v.businessName}*! 👋\n\n` +
    "Welcome to your personalized Xtop WhatsApp business demo.\n\n" +
    "We've prepared an example of how a WhatsApp system could help " +
    "your business present services, handle enquiries, collect leads, " +
    "and connect customers to your team.\n\nWhat would you like to do?"
  );

  await sendButtonMessage(phone, "👇 Choose an option:", [
    makeButton("demo_view_my_biz", "View My Demo"),
    makeButton("demo_try_related", "Related Demos"),
    makeButton("demo_try_tools", "Free Xtop Tools"),
  ]);

  await sendTextMessage(
    phone,
    "Or type *agent* anytime to talk to our team."
  );

  return true;
}

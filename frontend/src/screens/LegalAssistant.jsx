import { useEffect, useRef, useState } from "react";
import { askLegalAssistant, getLegalAssistantSession } from "../api/legalAssistantClient";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { Card, Button, Badge, Callout } from "../components/ui";
import { stripHtmlTags } from "../lib/format";

// Conversational AI Legal Assistant ("Vidhira") — distinct from the Case law search
// screen (which is a faceted research tool for browsing judgments directly). This
// screen is the RAG chat surface: natural-language questions in, a grounded + structured
// answer out, always with citations and a safety disclaimer.

const EXAMPLE_PROMPTS = [
  "Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?",
  "What are my rights if I am arrested?",
  "Section 138 NI Act ka kya meaning hai?",
  "Can an employer terminate me without notice?",
  "What does the Supreme Court say about anticipatory bail?",
  "Mere against FIR ho gayi hai, ab mujhe kya karna chahiye?",
];

// Fixed (non-LLM) UI strings, translated once and reviewed — never machine-translated
// per-request. Mirrors the server's own policy for the disclaimer/emergency text
// (see legalAssistant.js): safety-critical copy must never depend on a model call.
//
// Six distinct language/script keys, none interchangeable: hi/mr are Devanagari
// (Hindi vs Marathi vocabulary), ur is Perso-Arabic, hinglish/marathlish are Hindi
// or Marathi meaning transliterated STRICTLY into Roman/English letters (no
// Devanagari at all) — mixing scripts mid-answer is exactly the bug this split fixes.
const UI_STRINGS = {
  timeSensitive: {
    en: "Time-sensitive",
    hi: "समय-संवेदनशील",
    hinglish: "Samay-sanvedansheel",
    mr: "वेळ-संवेदनशील",
    marathlish: "Vel-samvedansheel",
    ur: "وقت کی نزاکت والا",
  },
  unparsedWarning: {
    en: "The assistant's response couldn't be split into structured sections — shown below as a summary.",
    hi: "सहायक की प्रतिक्रिया को संरचित अनुभागों में विभाजित नहीं किया जा सका — इसे नीचे सारांश के रूप में दिखाया गया है।",
    hinglish: "Assistant ka jawab structured sections mein nahi baant paya — isliye neeche summary ke roop mein dikhaya gaya hai.",
    mr: "सहाय्यकाचा प्रतिसाद संरचित विभागांमध्ये विभागता आला नाही — म्हणून खाली सारांश म्हणून दाखवला आहे.",
    marathlish: "Assistant cha javab structured sections madhe vibhagata aala nahi — mhanun khali saransh mhanun dakhavla aahe.",
    ur: "معاون کے جواب کو منظم حصوں میں تقسیم نہیں کیا جا سکا — اس لیے اسے نیچے خلاصے کے طور پر دکھایا گیا ہے۔",
  },
  sources: { en: "Sources", hi: "स्रोत", hinglish: "Strot", mr: "स्रोत", marathlish: "Strot", ur: "ذرائع" },
  fallbackNextSteps: {
    en: "Practical next steps: consult a qualified Indian lawyer for guidance specific to your situation, and keep any documents (FIR, notice, agreement, etc.) related to the matter ready to show them.",
    hi: "व्यावहारिक अगले कदम: अपनी स्थिति के अनुसार सलाह के लिए किसी योग्य भारतीय वकील से संपर्क करें, और मामले से जुड़े दस्तावेज़ (FIR, नोटिस, एग्रीमेंट आदि) उन्हें दिखाने के लिए तैयार रखें।",
    hinglish: "Practical agle kadam: apni situation ke hisaab se salah ke liye ek qualified Indian vakil se sampark karein, aur is mamle se jude documents (FIR, notice, agreement, waghera) unhe dikhane ke liye taiyaar rakhein.",
    mr: "व्यावहारिक पुढील पावले: तुमच्या परिस्थितीनुसार सल्ल्यासाठी एका पात्र भारतीय वकिलाशी संपर्क साधा, आणि या प्रकरणाशी संबंधित कागदपत्रे (FIR, नोटीस, करार इ.) त्यांना दाखवण्यासाठी तयार ठेवा.",
    marathlish: "Vyavaharik pudhil paavale: tumchya paristhitinusar sallyasathi ek patra Bharatiya vakilashi sampark sadha, ani ya prakaranashi sambandhit kagadpatre (FIR, notice, karar itr) tyanna dakhavnyasathi taiyar theva.",
    ur: "عملی اگلے اقدامات: اپنی صورتحال کے مطابق مشورے کے لیے کسی مستند بھارتی وکیل سے رابطہ کریں، اور اس معاملے سے متعلق دستاویزات (FIR، نوٹس، معاہدہ وغیرہ) انہیں دکھانے کے لیے تیار رکھیں۔",
  },
  disclaimer: {
    en: "This is general legal information to help you understand your situation, generated only from the Indian Kanoon sources listed below — it is not legal advice from a lawyer, it does not create a lawyer-client relationship, and it cannot guarantee any outcome. For anything serious, urgent, criminal, financial, family, property, or litigation-related, please consult a qualified Indian lawyer.",
    hi: "यह सामान्य कानूनी जानकारी आपकी स्थिति समझने में मदद के लिए दी गई है, और नीचे सूचीबद्ध Indian Kanoon स्रोतों पर आधारित है — यह किसी वकील की कानूनी सलाह नहीं है, इससे वकील-मुवक्किल संबंध स्थापित नहीं होता, और यह किसी परिणाम की गारंटी नहीं देती। किसी भी गंभीर, तत्काल, आपराधिक, वित्तीय, पारिवारिक, संपत्ति संबंधी, या मुकदमेबाज़ी से जुड़े मामले के लिए कृपया किसी योग्य भारतीय वकील से सलाह लें।",
    hinglish: "Yeh general legal jaankari hai, taaki aap apni situation samajh sakein, aur neeche diye gaye Indian Kanoon sources par based hai — yeh kisi vakil ki legal advice nahi hai, isse vakil-client relationship nahi banta, aur yeh kisi outcome ki guarantee nahi deta. Kisi bhi serious, urgent, criminal, financial, family, property, ya litigation se judi baat ke liye kripya ek qualified Indian vakil se salah lein.",
    mr: "ही सामान्य कायदेशीर माहिती तुम्हाला तुमची परिस्थिती समजण्यासाठी दिली आहे, आणि खाली दिलेल्या Indian Kanoon स्रोतांवर आधारित आहे — ही वकिलाचा कायदेशीर सल्ला नाही, यामुळे वकील-अशील संबंध निर्माण होत नाही, आणि ही कोणत्याही निकालाची हमी देत नाही. कोणत्याही गंभीर, तातडीच्या, फौजदारी, आर्थिक, कौटुंबिक, मालमत्ता किंवा खटल्याशी संबंधित बाबीसाठी कृपया एका पात्र भारतीय वकिलाचा सल्ला घ्या.",
    marathlish: "Hi samanya kaydeshir mahiti tumhala tumchi paristhiti samajnyasathi dili aahe, ani khali dilelya Indian Kanoon strotanvar aadharit aahe — hi vakilacha kaydeshir salla nahi, yamule vakil-ashil sambandh nirman hot nahi, ani hi konatyahi nikalachi hami det nahi. Konatyahi gambhir, tatdichya, faujdari, aarthik, kautumbik, malmatta kinva khatlyashi sambandhit babisathi krupaya ek patra Bharatiya vakilacha salla ghya.",
    ur: "یہ عمومی قانونی معلومات آپ کو اپنی صورتحال سمجھنے میں مدد کے لیے فراہم کی گئی ہیں، اور نیچے دیے گئے Indian Kanoon ذرائع پر مبنی ہیں — یہ کسی وکیل کا قانونی مشورہ نہیں ہے، اس سے وکیل اور موکل کا تعلق قائم نہیں ہوتا، اور یہ کسی نتیجے کی ضمانت نہیں دیتا۔ کسی بھی سنگین، فوری، فوجداری، مالی، خاندانی، جائیداد، یا مقدمہ بازی سے متعلق معاملے کے لیے براہ کرم کسی مستند بھارتی وکیل سے مشورہ کریں۔",
  },
  // Short, plain-words version of the same warning, shown first/boldest — fixed text,
  // never LLM-generated, so it costs zero tokens and never gets skipped by the model.
  aiMistakeNote: {
    en: "This answer is written by AI. AI can make mistakes. Please also talk to a lawyer or expert about your exact problem.",
    hi: "यह जवाब AI ने लिखा है। AI से गलती हो सकती है। अपनी असली समस्या के लिए कृपया किसी वकील या विशेषज्ञ से भी ज़रूर बात करें।",
    hinglish: "Yeh jawab AI ne likha hai. AI se galti ho sakti hai. Apni asli problem ke liye kisi vakeel ya expert se bhi zaroor baat karein.",
    mr: "हे उत्तर AI ने लिहिले आहे. AI कडून चूक होऊ शकते. तुमच्या खऱ्या अडचणीसाठी कृपया एखाद्या वकिलाशी किंवा तज्ञाशी नक्की बोला.",
    marathlish: "He uttar AI ne lihile aahe. AI kadun chuk hou shakte. Tumchya kharya adchanisathi krupaya ekhadya vakilashi kinva tadnyashi nakki bola.",
    ur: "یہ جواب AI نے لکھا ہے۔ AI سے غلطی ہو سکتی ہے۔ اپنے اصل مسئلے کے لیے براہ کرم کسی وکیل یا ماہر سے ضرور بات کریں۔",
  },
  // Fixed 4-step script, always in this order (stay calm -> ask the reason in writing ->
  // tell family -> call a lawyer/free legal aid now) — never generated per-request, same
  // reliability reasoning as the disclaimer above.
  emergencyChecklist: {
    en: [
      "Stay calm.",
      "Politely ask for the reason for the arrest or action — ask for it in writing if you can.",
      "Inform a family member or someone you trust immediately.",
      "Contact a lawyer or free legal aid (Legal Services Authority) right now — do not rely only on this tool.",
    ],
    hi: [
      "शांत रहें।",
      "गिरफ़्तारी या कार्रवाई का कारण विनम्रता से पूछें — हो सके तो लिखित में माँगें।",
      "तुरंत किसी परिजन या भरोसेमंद व्यक्ति को सूचित करें।",
      "अभी किसी वकील या निःशुल्क कानूनी सहायता (Legal Services Authority) से संपर्क करें — केवल इस टूल पर निर्भर न रहें।",
    ],
    hinglish: [
      "Shaant rahein.",
      "Giraftari ya karrawai ka kaaran vinamrata se poochein — ho sake to likhit mein maangein.",
      "Turant kisi parijan ya bharosemand vyakti ko suchit karein.",
      "Abhi kisi vakil ya nishulk legal aid (Legal Services Authority) se sampark karein — sirf is tool par bharosa na karein.",
    ],
    mr: [
      "शांत राहा.",
      "अटक किंवा कारवाईचे कारण नम्रपणे विचारा — शक्य असल्यास लेखी स्वरूपात मागा.",
      "त्वरित कुटुंबातील एखाद्या व्यक्तीला किंवा विश्वासू व्यक्तीला कळवा.",
      "आत्ताच एखाद्या वकिलाशी किंवा मोफत कायदेशीर मदतीशी (Legal Services Authority) संपर्क साधा — केवळ या साधनावर अवलंबून राहू नका.",
    ],
    marathlish: [
      "Shant raha.",
      "Atak kinva karwaiche karan namrapane vichara — shakya asalyas lekhi swarupat maga.",
      "Tvarit kutumbatil ekhadya vyaktila kinva vishwasu vyaktila kalva.",
      "Aatach ekhadya vakilashi kinva mofat kaydeshir madatishi (Legal Services Authority) sampark sadha — keval ya sadhanavar avalambun rahu naka.",
    ],
    ur: [
      "پرسکون رہیں۔",
      "گرفتاری یا کارروائی کی وجہ شائستگی سے پوچھیں — ممکن ہو تو تحریری طور پر مانگیں۔",
      "فوری طور پر کسی گھر والے یا قابلِ اعتماد شخص کو مطلع کریں۔",
      "ابھی کسی وکیل یا مفت قانونی امداد (Legal Services Authority) سے رابطہ کریں — صرف اس ٹول پر بھروسہ نہ کریں۔",
    ],
  },
  lawyerSafetyTitle: {
    en: "Choosing and dealing with a lawyer safely",
    hi: "वकील चुनते और उनसे व्यवहार करते समय सुरक्षित रहें",
    hinglish: "Vakeel chunte aur unse deal karte waqt safe rahein",
    mr: "वकील निवडताना आणि त्यांच्याशी व्यवहार करताना सुरक्षित राहा",
    marathlish: "Vakil nivadtana ani tyanchyashi vyavhar karatana safe raha",
    ur: "وکیل چننے اور اس سے معاملہ کرتے وقت محفوظ رہیں",
  },
  lawyerSafetyTips: {
    en: [
      "Ask for the fee in writing before you pay — what it covers, what's extra, and which court/government charges are separate.",
      "Always take a receipt for every payment. Don't pay cash without one.",
      "A genuine lawyer never guarantees a result, and never asks for money to \"settle\" with police or a judge.",
      "Ask for a copy of every document filed for you, plus the case number and the next hearing date. You can always ask questions or change lawyers.",
    ],
    hi: [
      "भुगतान करने से पहले फीस लिखित में माँगें — इसमें क्या शामिल है, क्या अतिरिक्त है, और अदालत/सरकारी शुल्क अलग से क्या है।",
      "हर भुगतान की रसीद ज़रूर लें। बिना रसीद के नकद भुगतान न करें।",
      "असली वकील कभी नतीजे की गारंटी नहीं देता और पुलिस या जज के साथ \"सेटलमेंट\" कराने के नाम पर पैसे नहीं माँगता।",
      "आपकी ओर से दाखिल हर दस्तावेज़ की कॉपी माँगें, साथ ही केस नंबर और अगली तारीख़। आप सवाल पूछ सकते हैं या वकील बदल भी सकते हैं।",
    ],
    hinglish: [
      "Payment karne se pehle fees likhit mein maangein — isme kya shamil hai, kya extra hai, aur court/government charges alag se kya hain.",
      "Har payment ki receipt zaroor lein. Bina receipt ke cash payment na karein.",
      "Asli vakil kabhi result ki guarantee nahi deta aur police ya judge ke saath \"settlement\" karane ke naam par paise nahi maangta.",
      "Aapki taraf se file ki gayi har document ki copy maangein, saath hi case number aur agli date. Aap sawaal pooch sakte hain ya vakil badal bhi sakte hain.",
    ],
    mr: [
      "पैसे देण्यापूर्वी फी लेखी स्वरूपात मागा — त्यात काय समाविष्ट आहे, काय जास्तीचे आहे, आणि कोर्ट/सरकारी शुल्क वेगळे काय आहे.",
      "प्रत्येक पेमेंटची पावती नक्की घ्या. पावतीशिवाय रोख पैसे देऊ नका.",
      "खरा वकील कधीही निकालाची हमी देत नाही आणि पोलीस किंवा न्यायाधीशांशी \"सेटलमेंट\" करण्याच्या नावाखाली पैसे मागत नाही.",
      "तुमच्या वतीने दाखल केलेल्या प्रत्येक कागदपत्राची प्रत मागा, तसेच केस नंबर आणि पुढील तारीख. तुम्ही प्रश्न विचारू शकता किंवा वकील बदलू शकता.",
    ],
    marathlish: [
      "Paise denyapurvi fee lekhi swarupat maga — tyat kay samavisht aahe, kay jastiche aahe, ani court/sarkari shulk vegle kay aahe.",
      "Pratyek paymentchi pavti nakki ghya. Pavtishivay rokh paise deu naka.",
      "Khara vakil kadhihi nikalachi hami det nahi ani police kinva nyayadhishanshi \"settlement\" karanyachya navakhali paise magat nahi.",
      "Tumchya watine dakhal kelelya pratyek kagadpatrachi prat maga, tasech case number ani pudhil tarikh. Tumhi prashna vicharu shakta kinva vakil badlu shakta.",
    ],
    ur: [
      "ادائیگی کرنے سے پہلے فیس تحریری طور پر مانگیں — اس میں کیا شامل ہے، کیا اضافی ہے، اور عدالتی/سرکاری اخراجات الگ سے کیا ہیں۔",
      "ہر ادائیگی کی رسید ضرور لیں۔ رسید کے بغیر نقد ادائیگی نہ کریں۔",
      "اصل وکیل کبھی نتیجے کی ضمانت نہیں دیتا اور پولیس یا جج کے ساتھ \"سیٹلمنٹ\" کرانے کے نام پر پیسے نہیں مانگتا۔",
      "آپ کی طرف سے داخل کی گئی ہر دستاویز کی کاپی مانگیں، ساتھ ہی کیس نمبر اور اگلی تاریخ۔ آپ سوال پوچھ سکتے ہیں یا وکیل بھی بدل سکتے ہیں۔",
    ],
  },
  immediateActions: {
    en: "Immediate actions", hi: "तत्काल कदम", hinglish: "Turant uthaye jaane wale kadam", mr: "तातडीची पावले", marathlish: "Tatdichi paavale", ur: "فوری اقدامات",
  },
  stepByStep: {
    en: "Step-by-step", hi: "चरण दर चरण", hinglish: "Charan dar charan", mr: "टप्प्याटप्प्याने", marathlish: "Tappa-tappyane", ur: "مرحلہ وار",
  },
  yourRights: {
    en: "Your rights", hi: "आपके अधिकार", hinglish: "Aapke rights", mr: "तुमचे हक्क", marathlish: "Tumche hakk", ur: "آپ کے حقوق",
  },
  applicableLaws: {
    en: "Applicable law", hi: "लागू कानून", hinglish: "Applicable kanoon", mr: "लागू कायदा", marathlish: "Lagu kayda", ur: "قابل اطلاق قانون",
  },
  caseLaw: {
    en: "Court judgments", hi: "न्यायालय के निर्णय", hinglish: "Adalat ke faisle", mr: "न्यायालयाचे निर्णय", marathlish: "Nyayalayache nirnay", ur: "عدالتی فیصلے",
  },
  whereToGetHelp: {
    en: "Where to get help", hi: "मदद कहाँ से लें", hinglish: "Madad kahan se milegi", mr: "मदत कुठे मिळेल", marathlish: "Madad kuthe milel", ur: "مدد کہاں سے ملے گی",
  },
  gapsTitle: {
    en: "A few questions for you", hi: "आपसे कुछ सवाल", hinglish: "Aapse kuch sawal", mr: "तुम्हाला काही प्रश्न", marathlish: "Tumhala kahi prashna", ur: "آپ سے کچھ سوالات",
  },
  followUpTitle: {
    en: "This could change the advice", hi: "इससे सलाह बदल सकती है", hinglish: "Isse salah badal sakti hai", mr: "यामुळे सल्ला बदलू शकतो", marathlish: "Yamule salla badlu shakto", ur: "اس سے مشورہ بدل سکتا ہے",
  },
  confidenceLabel: {
    en: "Confidence", hi: "विश्वसनीयता", hinglish: "Vishwasniyata", mr: "विश्वासार्हता", marathlish: "Vishwasarhata", ur: "اعتماد",
  },
  whereLabel: { en: "Where", hi: "कहाँ", hinglish: "Kahan", mr: "कुठे", marathlish: "Kuthe", ur: "کہاں" },
  documentsLabel: {
    en: "Documents needed", hi: "ज़रूरी दस्तावेज़", hinglish: "Zaroori documents", mr: "आवश्यक कागदपत्रे", marathlish: "Avashyak kagadpatre", ur: "ضروری دستاویزات",
  },
  timeLimitLabel: { en: "Deadline", hi: "समय-सीमा", hinglish: "Deadline", mr: "अंतिम मुदत", marathlish: "Antim mudat", ur: "آخری تاریخ" },
  // Issue 2: the label shown when an answer is NOT grounded in a specific cited source —
  // safe generic guidance from general legal knowledge instead.
  generalGuidanceLabel: {
    en: "General guidance (not from a cited judgment)",
    hi: "सामान्य जानकारी (किसी निर्णय से उद्धृत नहीं)",
    hinglish: "General guidance (kisi judgment se cited nahi)",
    mr: "सामान्य माहिती (कोणत्याही निकालावरून उद्धृत नाही)",
    marathlish: "Samanya mahiti (konatyahi nikalavarun quote keleli nahi)",
    ur: "عمومی رہنمائی (کسی فیصلے سے منسوب نہیں)",
  },
  lawCurrencyWarning: {
    en: "This may reference an old law (IPC/CrPC) — since 1 July 2024 it is BNS/BNSS/BSA. Please also check the current section.",
    hi: "यह पुराने कानून (IPC/CrPC) का संदर्भ हो सकता है — 1 जुलाई 2024 से यह BNS/BNSS/BSA है। कृपया मौजूदा धारा भी देखें।",
    hinglish: "Yeh purane kanoon (IPC/CrPC) ka reference ho sakta hai — 1 July 2024 se yeh BNS/BNSS/BSA hai. Current section bhi check kar lein.",
    mr: "हा जुन्या कायद्याचा (IPC/CrPC) संदर्भ असू शकतो — 1 जुलै 2024 पासून तो BNS/BNSS/BSA आहे. कृपया सध्याचे कलम देखील पाहा.",
    marathlish: "Ha junya kaydyacha (IPC/CrPC) sandarbh asu shakto — 1 July 2024 pasun to BNS/BNSS/BSA aahe. Current kalam pan check kara.",
    ur: "یہ پرانے قانون (IPC/CrPC) کا حوالہ ہو سکتا ہے — 1 جولائی 2024 سے یہ BNS/BNSS/BSA ہے۔ براہ کرم موجودہ سیکشن بھی دیکھیں۔",
  },
  actCitationWarning: {
    en: "An Act is mentioned here without its year — please double-check the exact Act name and year before relying on it.",
    hi: "यहाँ किसी कानून का नाम बिना वर्ष के दिया गया है — भरोसा करने से पहले कृपया सही नाम और वर्ष जांच लें।",
    hinglish: "Yahan kisi Act ka naam bina year ke diya gaya hai — bharosa karne se pehle sahi naam aur year check kar lein.",
    mr: "येथे एखाद्या कायद्याचे नाव वर्षाशिवाय दिले आहे — विश्वास ठेवण्यापूर्वी कृपया बरोबर नाव आणि वर्ष तपासा.",
    marathlish: "Ethe ekhadya kaydyache naav varshashivay dile aahe — vishwas thevnyapurvi krupaya barobar naav ani varsh tapasa.",
    ur: "یہاں کسی قانون کا نام سال کے بغیر دیا گیا ہے — بھروسہ کرنے سے پہلے براہ کرم صحیح نام اور سال چیک کریں۔",
  },
  // Issue 9: the 3-line top summary.
  yourRightLine: { en: "Your right", hi: "आपका हक़", hinglish: "Aapka haq", mr: "तुमचा हक्क", marathlish: "Tumcha hakk", ur: "آپ کا حق" },
  doNowLine: { en: "Do now", hi: "अभी क्या करें", hinglish: "Abhi kya karein", mr: "आता काय करा", marathlish: "Ata kay kara", ur: "ابھی کیا کریں" },
  whereToGoLine: { en: "Where to go", hi: "कहाँ जाएँ", hinglish: "Kahan jaayein", mr: "कुठे जायचे", marathlish: "Kuthe jayche", ur: "کہاں جائیں" },
  freeLegalAid: { en: "Free legal aid", hi: "मुफ़्त कानूनी मदद", hinglish: "Free legal aid", mr: "मोफत कायदेशीर मदत", marathlish: "Free legal aid", ur: "مفت قانونی مدد" },
  talkToLawyer: { en: "Talk to a lawyer", hi: "वकील से बात करें", hinglish: "Vakil se baat karein", mr: "वकिलाशी बोला", marathlish: "Vakilashi bola", ur: "وکیل سے بات کریں" },
  callNow: { en: "Call now", hi: "अभी कॉल करें", hinglish: "Abhi call karein", mr: "आता कॉल करा", marathlish: "Ata call kara", ur: "ابھی کال کریں" },
  readAloud: { en: "Read aloud", hi: "आवाज़ में सुनें", hinglish: "Awaaz mein sunein", mr: "आवाजात ऐका", marathlish: "Awajat aika", ur: "آواز میں سنیں" },
  stop: { en: "Stop", hi: "रोकें", hinglish: "Rokein", mr: "थांबवा", marathlish: "Thamba", ur: "روکیں" },
  more: { en: "More", hi: "और जानें", hinglish: "Aur jaanein", mr: "अधिक पहा", marathlish: "Adhik baga", ur: "مزید" },
  less: { en: "Less", hi: "कम दिखाएँ", hinglish: "Kam dikhaein", mr: "कमी दाखवा", marathlish: "Kami dakhva", ur: "کم دکھائیں" },
  legalNoticeTitle: { en: "Ready legal notice", hi: "तैयार कानूनी नोटिस", hinglish: "Ready legal notice", mr: "तयार कायदेशीर नोटीस", marathlish: "Taiyar legal notice", ur: "تیار قانونی نوٹس" },
  copy: { en: "Copy", hi: "कॉपी करें", hinglish: "Copy karein", mr: "कॉपी करा", marathlish: "Copy kara", ur: "کاپی کریں" },
  copied: { en: "Copied", hi: "कॉपी हो गया", hinglish: "Copy ho gaya", mr: "कॉपी झाले", marathlish: "Copy zhala", ur: "کاپی ہو گیا" },
};

const CONFIDENCE_WORDS = {
  en: { high: "High", medium: "Medium", low: "Low" },
  hi: { high: "उच्च", medium: "मध्यम", low: "कम" },
  hinglish: { high: "Uchch", medium: "Madhyam", low: "Kam" },
  mr: { high: "उच्च", medium: "मध्यम", low: "कमी" },
  marathlish: { high: "Uchch", medium: "Madhyam", low: "Kami" },
  ur: { high: "زیادہ", medium: "درمیانہ", low: "کم" },
};
const CONFIDENCE_TONE = { high: "success", medium: "warning", low: "danger" };

// Six-way script selector — must match legalAssistant.js's SYSTEM_PROMPT contract
// exactly: "hindi"/"marathi" -> Devanagari, "urdu" -> Perso-Arabic, "hinglish"/
// "marathlish" -> Roman letters, else -> English.
function pickScript(result) {
  const lang = (result?.understanding?.language || "").toLowerCase();
  if (lang === "hindi") return "hi";
  if (lang === "marathi") return "mr";
  if (lang === "urdu") return "ur";
  if (lang === "hinglish") return "hinglish";
  if (lang === "marathlish") return "marathlish";
  return "en";
}

function t(strings, script) {
  return strings[script] || strings.en;
}

// For Web Speech APIs (TTS + voice input), which want a BCP-47 locale, not our internal
// 6-way script key.
const SPEECH_LOCALE = { hi: "hi-IN", mr: "mr-IN", ur: "ur-PK", hinglish: "en-IN", marathlish: "en-IN", en: "en-IN" };

// A phone-number-shaped contact (e.g. "112", "15100", "+91 11 2345 6789") becomes a tap-to-
// call link; anything else (an office name, a URL) is shown as plain text.
// dir="auto" lets the number/URL itself (always LTR — digits, dots, .gov.in) render in the
// correct direction even when embedded in an RTL (Urdu) paragraph, where the surrounding
// bidi context would otherwise mis-order it — a no-op in an LTR context.
function TelLink({ contact, children }) {
  if (!contact) return null;
  const digits = contact.replace(/[\s-]/g, "");
  if (!/^\+?\d{3,15}$/.test(digits)) return <span dir="auto">{children ?? contact}</span>;
  return <a href={`tel:${digits}`} dir="auto" style={{ color: "inherit", fontWeight: 700 }}>{children ?? contact}</a>;
}

// Issue 9: collapses what used to be shown as the AI-mistake note AND the full legal
// disclaimer, every single time, into one short line with a "more" toggle for the full text.
function DisclaimerLine({ script }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Callout tone="neutral" style={{ marginTop: 14 }}>
      <div>
        {t(UI_STRINGS.aiMistakeNote, script)}{" "}
        <button onClick={() => setExpanded((e) => !e)} style={{ all: "unset", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>
          {expanded ? t(UI_STRINGS.less, script) : t(UI_STRINGS.more, script)}
        </button>
      </div>
      {expanded && <div style={{ marginTop: 6 }}>{t(UI_STRINGS.disclaimer, script)}</div>}
    </Callout>
  );
}

// Issue 9: a one-tap "Free legal aid" (NALSA 15100) and "Talk to a lawyer" (opens Find a
// lawyer) row, available on every answer — not just when an emergency is detected.
function QuickActions({ script }) {
  const { go } = useUI();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <a href="tel:15100" style={{ textDecoration: "none" }}>
        <Button variant="outline">📞 {t(UI_STRINGS.freeLegalAid, script)} (15100)</Button>
      </a>
      <Button variant="outline" onClick={() => go("find")}>👩‍⚖️ {t(UI_STRINGS.talkToLawyer, script)}</Button>
    </div>
  );
}

// Issue 9: a 3-line skim summary at the very top — the single most load-bearing right,
// the single most load-bearing next action, and where to go — pulled from whatever the
// structured sections already have (no extra backend field needed).
function TopSummary({ sections, script }) {
  const right = sections.yourRights?.[0]?.right || sections.applicableLaws?.[0]?.plainMeaning || null;
  const doNow = sections.immediateActions?.[0]?.step || sections.stepByStep?.[0]?.action || null;
  const help = sections.whereToGetHelp?.[0] || null;
  const whereToGo = help ? [help.name, help.contact].filter(Boolean).join(" — ") : sections.stepByStep?.[0]?.where || null;
  if (!right && !doNow && !whereToGo) return null;
  return (
    <div style={{ background: "#FDF3DC", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
      {right && <div><strong>{t(UI_STRINGS.yourRightLine, script)}:</strong> {right}</div>}
      {doNow && <div><strong>{t(UI_STRINGS.doNowLine, script)}:</strong> {doNow}</div>}
      {whereToGo && <div><strong>{t(UI_STRINGS.whereToGoLine, script)}:</strong> {whereToGo}</div>}
    </div>
  );
}

// Issue 9: reads a block of text aloud via the browser's own speech synthesis — no backend
// call, works offline once the voice is installed. Silently does nothing if unsupported.
function ReadAloudButton({ text, script }) {
  const [speaking, setSpeaking] = useState(false);
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return null;
  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = SPEECH_LOCALE[script] || "en-IN";
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }
  return (
    <Button variant="outline" onClick={toggle}>
      {speaking ? `⏹ ${t(UI_STRINGS.stop, script)}` : `🔊 ${t(UI_STRINGS.readAloud, script)}`}
    </Button>
  );
}

const CITE_MARKER_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

// Issue 8: "show which sentence comes from which source" — renders the summary's own
// [n]/[n,m] citation markers (the generation prompt now requires one per claim-bearing
// sentence) as a small chip naming that source, using the index->source map the server
// sends alongside the answer (evidenceIndex) — independent of which sources survived the
// "only cited sources are listed" trim at the bottom, so a chip always resolves.
function SummaryWithCitations({ text, evidenceIndex }) {
  if (!evidenceIndex || Object.keys(evidenceIndex).length === 0) return <>{text}</>;
  const parts = [];
  let last = 0;
  let match;
  const re = new RegExp(CITE_MARKER_RE);
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const nums = match[1].split(",").map((n) => n.trim());
    parts.push(
      <span key={match.index}>
        [{nums.join(", ")}]
        {nums.map((n) => {
          const src = evidenceIndex[n];
          if (!src) return null;
          const short = src.title?.length > 26 ? `${src.title.slice(0, 24)}…` : src.title;
          return (
            <span key={n} title={`${src.title} (${src.docsource})`} style={{ display: "inline-block", fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)", background: "#F0ECE2", borderRadius: 999, padding: "1px 7px", marginInlineStart: 4 }}>
              {short}
            </span>
          );
        })}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// Issue 5: a ready-to-send legal notice (fixed boilerplate from the server, filled with
// placeholders — never LLM-generated prose, since a document someone might actually copy
// and send should never risk a hallucinated clause).
function LegalNoticeTemplate({ text, script }) {
  const { showToast } = useUI();
  return (
    <Callout tone="neutral" title={t(UI_STRINGS.legalNoticeTitle, script)} style={{ marginTop: 14 }}>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, margin: "0 0 8px" }}>{text}</pre>
      <Button variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => showToast(t(UI_STRINGS.copied, script)))}>
        {t(UI_STRINGS.copy, script)}
      </Button>
    </Callout>
  );
}

function AnswerCard({ turn, onAsk }) {
  const { go } = useUI();
  const { result } = turn;
  if (!result) return null;

  const script = pickScript(result);
  const dir = script === "ur" ? "rtl" : "ltr";
  const emergencyChecklist = result.emergency?.flag ? t(UI_STRINGS.emergencyChecklist, script) : null;
  const sections = result.sections || {};
  const groundedInEvidence = sections.groundedInEvidence !== false; // undefined (older cached answers) counts as grounded

  const stepByStep = [...(sections.stepByStep || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const showLawyerSafety = stepByStep.length > 0 || sections.immediateActions?.length > 0;

  return (
    <Card dir={dir}>
      {result.emergency?.flag && (
        <Callout tone="danger" title={t(UI_STRINGS.timeSensitive, script)} style={{ marginBottom: 12 }}>
          <ol style={{ margin: "0 0 10px", paddingInlineStart: 18 }}>
            {emergencyChecklist.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="tel:112" style={{ textDecoration: "none" }}><Button variant="outline">📞 112</Button></a>
            <a href="tel:15100" style={{ textDecoration: "none" }}><Button variant="outline">📞 NALSA 15100</Button></a>
            <Button variant="outline" onClick={() => onAsk("Mere district ka DLSA office kahan hai?")}>🏛 DLSA</Button>
            <Button onClick={() => go("find")}>👩‍⚖️ {t(UI_STRINGS.talkToLawyer, script)}</Button>
          </div>
        </Callout>
      )}

      <QuickActions script={script} />
      <TopSummary sections={sections} script={script} />

      {!groundedInEvidence && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.generalGuidanceLabel, script)}
        </Callout>
      )}

      {result.lawCurrencyWarning && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.lawCurrencyWarning, script)}
        </Callout>
      )}

      {result.actCitationWarning && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.actCitationWarning, script)}
        </Callout>
      )}

      {result.outcome === "unparsed" && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.unparsedWarning, script)}
        </Callout>
      )}

      {sections.confidence && (
        <div style={{ marginBottom: 10 }}>
          <Badge tone={CONFIDENCE_TONE[sections.confidence] || "neutral"}>
            {t(UI_STRINGS.confidenceLabel, script)}: {t(CONFIDENCE_WORDS, script)[sections.confidence] || sections.confidence}
          </Badge>
        </div>
      )}

      {sections.summary && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            <SummaryWithCitations text={sections.summary} evidenceIndex={result.evidenceIndex} />
          </div>
          <div style={{ marginTop: 8 }}>
            <ReadAloudButton text={sections.summary} script={script} />
          </div>
        </div>
      )}

      {sections.gaps?.length > 0 && (
        <Callout tone="warning" title={t(UI_STRINGS.gapsTitle, script)} style={{ marginBottom: 12 }}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {sections.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Callout>
      )}

      {!stepByStep.length && !sections.immediateActions?.length && (
        <Callout tone="success" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.fallbackNextSteps, script)}
        </Callout>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.immediateActions?.length > 0 && (
          <div>
            <Badge tone="danger">{t(UI_STRINGS.immediateActions, script)}</Badge>
            <ol style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {sections.immediateActions.map((a, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {a.step}
                  {a.why && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.why}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {stepByStep.length > 0 && (
          <div>
            <Badge tone="success">{t(UI_STRINGS.stepByStep, script)}</Badge>
            <ol style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {stepByStep.map((s, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {s.action}
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {s.where && <div>{t(UI_STRINGS.whereLabel, script)}: {s.where}</div>}
                    {s.documentsNeeded?.length > 0 && (
                      <div>{t(UI_STRINGS.documentsLabel, script)}: {s.documentsNeeded.join(", ")}</div>
                    )}
                    {s.timeLimit && <div>{t(UI_STRINGS.timeLimitLabel, script)}: {s.timeLimit}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {sections.yourRights?.length > 0 && (
          <div>
            <Badge tone="info">{t(UI_STRINGS.yourRights, script)}</Badge>
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {sections.yourRights.map((r, i) => (
                <li key={i}>{r.right}</li>
              ))}
            </ul>
          </div>
        )}

        {sections.applicableLaws?.length > 0 && (
          <div>
            <Badge tone="info">{t(UI_STRINGS.applicableLaws, script)}</Badge>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {sections.applicableLaws.map((law, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  <strong dir="auto">{law.act}{law.section ? ` — ${law.section}` : ""}</strong>
                  {law.sourceUrl && (
                    <a href={law.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", marginInlineStart: 4 }} title="Open source">↗</a>
                  )}
                  <div>{law.plainMeaning}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sections.caseLaw?.length > 0 && (
          <div>
            <Badge tone="neutral">{t(UI_STRINGS.caseLaw, script)}</Badge>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {sections.caseLaw.slice(0, 3).map((c, i) => (
                <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  <strong dir="auto">
                    {c.caseName}
                    {c.court ? `, ${c.court}` : ""}
                    {c.year ? ` (${c.year})` : ""}
                  </strong>
                  {c.sourceUrl && (
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", marginInlineStart: 4 }} title="Open source">↗</a>
                  )}
                  <div>{c.whatItMeansForYou}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sections.whereToGetHelp?.length > 0 && (
          <div>
            <Badge tone="warning">{t(UI_STRINGS.whereToGetHelp, script)}</Badge>
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {sections.whereToGetHelp.map((h, i) => (
                <li key={i}>
                  <strong>{h.name}</strong>
                  {h.contact ? <> — <TelLink contact={h.contact} /></> : ""}
                  {h.whenToUse && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{h.whenToUse}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showLawyerSafety && (
        <Callout tone="info" title={t(UI_STRINGS.lawyerSafetyTitle, script)} style={{ marginTop: 14 }}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {t(UI_STRINGS.lawyerSafetyTips, script).map((tip, i) => <li key={i} style={{ marginBottom: 4 }}>{tip}</li>)}
          </ul>
        </Callout>
      )}

      {sections.followUpQuestions?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{t(UI_STRINGS.followUpTitle, script)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sections.followUpQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onAsk(q)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-border)",
                  background: "#fff",
                  fontSize: 12.5,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {result.sources?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{t(UI_STRINGS.sources, script)}</div>
          <ul style={{ fontSize: 12, color: "var(--color-text-muted)", paddingInlineStart: 18, margin: 0 }}>
            {result.sources.map((s) => (
              <li key={s.url || s.tid} style={{ marginBottom: 3 }}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" dir="auto" style={{ color: "inherit" }}>
                  {stripHtmlTags(s.title)}
                </a>{" "}
                <span style={{ opacity: 0.7 }}>({s.docsource})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.evidenceOrigin && (
        <div style={{ fontSize: 11, color: "var(--color-label)", marginTop: 10 }}>
          Evidence: {[
            result.evidenceOrigin.rag > 0 && `${result.evidenceOrigin.rag} passage${result.evidenceOrigin.rag === 1 ? "" : "s"} from the indexed knowledge base`,
            result.evidenceOrigin.indianKanoon > 0 && `${result.evidenceOrigin.indianKanoon} live Indian Kanoon source${result.evidenceOrigin.indianKanoon === 1 ? "" : "s"}`,
            result.evidenceOrigin.web > 0 && `${result.evidenceOrigin.web} trusted web source${result.evidenceOrigin.web === 1 ? "" : "s"}`,
          ].filter(Boolean).join(" + ")}.
        </div>
      )}

      {sections.legalNoticeTemplate && <LegalNoticeTemplate text={sections.legalNoticeTemplate} script={script} />}

      <DisclaimerLine script={script} />
    </Card>
  );
}

// Persists across a refresh (localStorage), scoped per signed-in user so two people sharing a
// browser never see each other's conversation.
const sessionKey = (userId) => `legalAssistant.sessionId.${userId}`;

function getOrCreateSessionId(userId, { fresh = false } = {}) {
  try {
    let id = fresh ? null : window.localStorage.getItem(sessionKey(userId));
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(sessionKey(userId), id);
    }
    return id;
  } catch {
    return crypto.randomUUID(); // localStorage unavailable (private mode) — chat works, just doesn't persist across reloads
  }
}

// Issue 9: voice input for the question box — browser-native speech-to-text, no backend
// call. Silently hidden if the browser doesn't support it (Web Speech API is not
// universal), rather than showing a button that would just fail.
function VoiceInputButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  if (!Recognition) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN"; // works reasonably for Hinglish/Hindi speech in practice
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => onResult(e.results?.[0]?.[0]?.transcript || "");
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <Button type="button" variant="outline" onClick={toggle} title="Voice input">
      {listening ? "⏹" : "🎤"}
    </Button>
  );
}

export function LegalAssistant() {
  const { user } = useAuth();
  const { handoff, takeHandoff, assistantTurns: turns, setAssistantTurns: setTurns, assistantSessionId, setAssistantSessionId } = useUI();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sessionIdRef = useRef(assistantSessionId || getOrCreateSessionId(user.id));

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!assistantSessionId) setAssistantSessionId(sessionId);
    // The conversation already lives in UIState and survives switching tabs — only fetch
    // from the server when there's nothing in memory yet (a genuine first load or a
    // full page refresh), so coming back to this tab never re-fetches over, or flashes
    // empty before, what's already on screen.
    if (!sessionId || turns.length > 0) return;
    getLegalAssistantSession(sessionId)
      .then(({ turns: persisted }) => {
        if (!persisted?.length) return;
        setTurns(persisted.map((t) => ({ id: crypto.randomUUID(), question: t.question, result: t.result })));
      })
      .catch(() => {}); // best-effort rehydrate — a failed fetch just starts a fresh-looking session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A question typed into the header's "Ask Vidhira" box arrives here as a one-shot
  // hand-off. This used to live in the mount-only effect above, which meant it was only
  // ever read once — if the user was ALREADY on this screen and asked a second question
  // from the header, `go()` set the hand-off but nothing re-read it, silently dropping the
  // question. Watching `handoff.legalassistant` directly means a new hand-off is picked up
  // every time, mounted or not.
  useEffect(() => {
    if (handoff?.legalassistant?.question) ask(takeHandoff("legalassistant").question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff?.legalassistant]);

  function newConversation() {
    sessionIdRef.current = getOrCreateSessionId(user.id, { fresh: true });
    setAssistantSessionId(sessionIdRef.current);
    setTurns([]);
    setError("");
  }

  async function ask(question) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    const turnId = crypto.randomUUID();
    setTurns((t) => [...t, { id: turnId, question: q, result: null }]);
    setLoading(true);
    try {
      const result = await askLegalAssistant(q, {}, sessionIdRef.current);
      setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, result } : turn)));
    } catch (err) {
      setError(err.message);
      setTurns((t) => t.filter((turn) => turn.id !== turnId));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Vidhira — AI Legal Assistant</div>
          {turns.length > 0 && <Button variant="outline" onClick={newConversation}>New conversation</Button>}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          Ask a question about Indian law in your own words — English, Hindi, Marathi, Urdu, or a mix (Roman-script Hinglish/Marathlish
          works too). Answers are grounded in real Indian Kanoon sources with citations.
        </div>
      </div>

      {turns.length === 0 && (
        <Callout tone="warning" title="Not a substitute for a lawyer">
          Vidhira gives general legal information, not legal advice — it never guarantees outcomes and can't replace a
          qualified Indian lawyer. For arrests, violence, or urgent deadlines, contact a lawyer or the relevant authority
          immediately.
        </Callout>
      )}

      {turns.length === 0 && (
        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Try asking</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => ask(p)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-border)",
                  background: "#fff",
                  fontSize: 12.5,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {turns.map((turn) => (
          <div key={turn.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "85%",
                background: "var(--color-navy)",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "14px 14px 2px 14px",
                fontSize: 13.5,
              }}
            >
              {turn.question}
            </div>
            {turn.result ? (
              <AnswerCard turn={turn} onAsk={ask} />
            ) : (
              <Card style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Researching sources…</Card>
            )}
          </div>
        ))}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, position: "sticky", bottom: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Mujhe FIR ke baare mein jaanna hai…"
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
        />
        <VoiceInputButton onResult={(text) => text && setInput((cur) => (cur ? `${cur} ${text}` : text))} />
        <Button type="submit" disabled={loading || !input.trim()}>{loading ? "Asking…" : "Ask"}</Button>
      </form>
    </div>
  );
}

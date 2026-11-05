/**
 * Supplier-portal strings. Machine-drafted: have a native speaker from each
 * cluster review them before a pilot (plain words beat formal ones on a shop floor).
 */
import type { Lang } from "@/lib/types";

export const LANG_LABEL: Record<Lang, string> = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી", ta: "தமிழ்", pa: "ਪੰਜਾਬੀ" };

export const STR_KEYS = ["title", "intro", "elec", "fuel", "prod", "purchase", "upload", "reading", "check", "confirm", "edit", "submit", "submitted", "progress", "privacy", "passport", "months", "missing", "done", "products", "save", "photo", "file"] as const;
export type StrKey = (typeof STR_KEYS)[number];

export const STRINGS: Record<Lang, Record<StrKey, string>> = {
  en: {
    title: "Share your electricity, fuel and production records",
    intro: "{buyer} needs your factory's emissions data for the EU carbon border tax (CBAM). Upload photos of your bills: we read them for you.",
    elec: "Electricity bills (every month)",
    fuel: "Fuel bills (diesel, furnace oil, PNG, LPG, coal)",
    prod: "Production register / weighbridge slips",
    purchase: "Raw material purchase bills (billets, wire rod, ingots, clinker)",
    upload: "Take photo or choose file",
    reading: "Reading your document…",
    check: "Please check these numbers",
    confirm: "Correct",
    edit: "Edit",
    submit: "Send to buyer",
    submitted: "Sent. Thank you!",
    progress: "Your progress",
    privacy: "Your documents are shared only with {buyer} and their verifier.",
    passport: "You get a free Carbon Passport you can share with all your buyers. Fill it in once, use it many times.",
    months: "Months covered",
    missing: "Still needed",
    done: "Received",
    products: "Your products",
    save: "Save",
    photo: "Take photo",
    file: "Choose file / PDF",
  },
  hi: {
    title: "अपने बिजली, ईंधन और उत्पादन के रिकॉर्ड साझा करें",
    intro: "{buyer} को EU CBAM (कार्बन बॉर्डर टैक्स) के लिए आपकी फ़ैक्टरी के उत्सर्जन डेटा की ज़रूरत है। अपने बिलों की फ़ोटो अपलोड करें, हम उन्हें आपके लिए पढ़ लेंगे।",
    elec: "बिजली के बिल (हर महीने के)",
    fuel: "ईंधन के बिल (डीज़ल, फ़र्नेस ऑयल, PNG, LPG, कोयला)",
    prod: "उत्पादन रजिस्टर / धर्मकांटा पर्ची",
    purchase: "कच्चे माल की खरीद के बिल (बिलेट, वायर रॉड, इनगॉट, क्लिंकर)",
    upload: "फ़ोटो लें या फ़ाइल चुनें",
    reading: "आपका दस्तावेज़ पढ़ा जा रहा है…",
    check: "कृपया इन आंकड़ों की जाँच करें",
    confirm: "सही है",
    edit: "बदलें",
    submit: "खरीदार को भेजें",
    submitted: "भेज दिया गया। धन्यवाद!",
    progress: "आपकी प्रगति",
    privacy: "आपके दस्तावेज़ केवल {buyer} और उनके सत्यापनकर्ता के साथ साझा किए जाते हैं।",
    passport: "आपको मिलेगा एक मुफ़्त कार्बन पासपोर्ट, जिसे आप अपने सभी खरीदारों के साथ साझा कर सकते हैं। एक बार भरें, बार-बार इस्तेमाल करें।",
    months: "कवर किए गए महीने",
    missing: "अभी चाहिए",
    done: "प्राप्त हुआ",
    products: "आपके उत्पाद",
    save: "सेव करें",
    photo: "फ़ोटो लें",
    file: "फ़ाइल / PDF चुनें",
  },
  gu: {
    title: "તમારા વીજળી, ઇંધણ અને ઉત્પાદનના રેકોર્ડ શેર કરો",
    intro: "{buyer} ને EU CBAM (કાર્બન બોર્ડર ટેક્સ) માટે તમારી ફેક્ટરીના ઉત્સર્જન ડેટાની જરૂર છે. તમારા બિલના ફોટા અપલોડ કરો, અમે તે તમારા માટે વાંચી લઈશું.",
    elec: "વીજળીના બિલ (દર મહિનાના)",
    fuel: "ઇંધણના બિલ (ડીઝલ, ફર્નેસ ઓઇલ, PNG, LPG, કોલસો)",
    prod: "ઉત્પાદન રજિસ્ટર / વજનકાંટાની સ્લિપ",
    purchase: "કાચા માલની ખરીદીના બિલ (બિલેટ, વાયર રોડ, ઇંગોટ, ક્લિંકર)",
    upload: "ફોટો લો અથવા ફાઇલ પસંદ કરો",
    reading: "તમારો દસ્તાવેજ વાંચી રહ્યા છીએ…",
    check: "કૃપા કરીને આ આંકડા તપાસો",
    confirm: "સાચું છે",
    edit: "બદલો",
    submit: "ખરીદનારને મોકલો",
    submitted: "મોકલાઈ ગયું. આભાર!",
    progress: "તમારી પ્રગતિ",
    privacy: "તમારા દસ્તાવેજો ફક્ત {buyer} અને તેમના ચકાસણીકર્તા સાથે જ શેર થાય છે.",
    passport: "તમને મળશે એક મફત કાર્બન પાસપોર્ટ, જે તમે તમારા બધા ખરીદનારાઓ સાથે શેર કરી શકો છો. એક વાર ભરો, વારંવાર વાપરો.",
    months: "આવરી લીધેલા મહિના",
    missing: "હજુ જોઈએ છે",
    done: "મળી ગયું",
    products: "તમારા ઉત્પાદનો",
    save: "સેવ કરો",
    photo: "ફોટો લો",
    file: "ફાઇલ / PDF પસંદ કરો",
  },
  ta: {
    title: "உங்கள் மின்சாரம், எரிபொருள் மற்றும் உற்பத்திப் பதிவுகளைப் பகிருங்கள்",
    intro: "EU CBAM (கார்பன் எல்லை வரி) க்காக {buyer} நிறுவனத்துக்கு உங்கள் தொழிற்சாலையின் உமிழ்வுத் தரவு தேவை. உங்கள் பில்களின் புகைப்படங்களைப் பதிவேற்றுங்கள், நாங்கள் அவற்றைப் படித்துக்கொள்கிறோம்.",
    elec: "மின் கட்டண பில்கள் (ஒவ்வொரு மாதமும்)",
    fuel: "எரிபொருள் பில்கள் (டீசல், ஃபர்னஸ் ஆயில், PNG, LPG, நிலக்கரி)",
    prod: "உற்பத்திப் பதிவேடு / எடைமேடை சீட்டுகள்",
    purchase: "மூலப்பொருள் கொள்முதல் பில்கள் (பில்லெட், வயர் ராட், இங்காட், கிளிங்கர்)",
    upload: "புகைப்படம் எடுங்கள் அல்லது கோப்பைத் தேர்ந்தெடுங்கள்",
    reading: "உங்கள் ஆவணம் படிக்கப்படுகிறது…",
    check: "இந்த எண்களைச் சரிபார்க்கவும்",
    confirm: "சரி",
    edit: "திருத்து",
    submit: "வாங்குபவருக்கு அனுப்பு",
    submitted: "அனுப்பப்பட்டது. நன்றி!",
    progress: "உங்கள் முன்னேற்றம்",
    privacy: "உங்கள் ஆவணங்கள் {buyer} மற்றும் அவர்களின் சரிபார்ப்பாளருடன் மட்டுமே பகிரப்படும்.",
    passport: "உங்கள் எல்லா வாங்குபவர்களுடனும் பகிரக்கூடிய இலவச கார்பன் பாஸ்போர்ட் உங்களுக்குக் கிடைக்கும். ஒருமுறை நிரப்பினால் போதும்.",
    months: "உள்ளடக்கிய மாதங்கள்",
    missing: "இன்னும் தேவை",
    done: "பெறப்பட்டது",
    products: "உங்கள் தயாரிப்புகள்",
    save: "சேமி",
    photo: "புகைப்படம் எடு",
    file: "கோப்பு / PDF",
  },
  pa: {
    title: "ਆਪਣੇ ਬਿਜਲੀ, ਬਾਲਣ ਅਤੇ ਉਤਪਾਦਨ ਦੇ ਰਿਕਾਰਡ ਸਾਂਝੇ ਕਰੋ",
    intro: "{buyer} ਨੂੰ EU CBAM (ਕਾਰਬਨ ਬਾਰਡਰ ਟੈਕਸ) ਲਈ ਤੁਹਾਡੀ ਫੈਕਟਰੀ ਦੇ ਨਿਕਾਸ ਡੇਟਾ ਦੀ ਲੋੜ ਹੈ। ਆਪਣੇ ਬਿੱਲਾਂ ਦੀਆਂ ਫੋਟੋਆਂ ਅੱਪਲੋਡ ਕਰੋ, ਅਸੀਂ ਉਹਨਾਂ ਨੂੰ ਤੁਹਾਡੇ ਲਈ ਪੜ੍ਹ ਲਵਾਂਗੇ।",
    elec: "ਬਿਜਲੀ ਦੇ ਬਿੱਲ (ਹਰ ਮਹੀਨੇ ਦੇ)",
    fuel: "ਬਾਲਣ ਦੇ ਬਿੱਲ (ਡੀਜ਼ਲ, ਫਰਨੇਸ ਆਇਲ, PNG, LPG, ਕੋਲਾ)",
    prod: "ਉਤਪਾਦਨ ਰਜਿਸਟਰ / ਧਰਮ ਕੰਡੇ ਦੀ ਪਰਚੀ",
    purchase: "ਕੱਚੇ ਮਾਲ ਦੀ ਖਰੀਦ ਦੇ ਬਿੱਲ (ਬਿਲੇਟ, ਵਾਇਰ ਰਾਡ, ਇੰਗਟ, ਕਲਿੰਕਰ)",
    upload: "ਫੋਟੋ ਖਿੱਚੋ ਜਾਂ ਫਾਈਲ ਚੁਣੋ",
    reading: "ਤੁਹਾਡਾ ਦਸਤਾਵੇਜ਼ ਪੜ੍ਹਿਆ ਜਾ ਰਿਹਾ ਹੈ…",
    check: "ਕਿਰਪਾ ਕਰਕੇ ਇਹ ਅੰਕੜੇ ਜਾਂਚੋ",
    confirm: "ਸਹੀ ਹੈ",
    edit: "ਬਦਲੋ",
    submit: "ਖਰੀਦਦਾਰ ਨੂੰ ਭੇਜੋ",
    submitted: "ਭੇਜ ਦਿੱਤਾ ਗਿਆ। ਧੰਨਵਾਦ!",
    progress: "ਤੁਹਾਡੀ ਪ੍ਰਗਤੀ",
    privacy: "ਤੁਹਾਡੇ ਦਸਤਾਵੇਜ਼ ਸਿਰਫ਼ {buyer} ਅਤੇ ਉਹਨਾਂ ਦੇ ਤਸਦੀਕਕਰਤਾ ਨਾਲ ਹੀ ਸਾਂਝੇ ਕੀਤੇ ਜਾਂਦੇ ਹਨ।",
    passport: "ਤੁਹਾਨੂੰ ਮਿਲੇਗਾ ਇੱਕ ਮੁਫ਼ਤ ਕਾਰਬਨ ਪਾਸਪੋਰਟ, ਜੋ ਤੁਸੀਂ ਆਪਣੇ ਸਾਰੇ ਖਰੀਦਦਾਰਾਂ ਨਾਲ ਸਾਂਝਾ ਕਰ ਸਕਦੇ ਹੋ। ਇੱਕ ਵਾਰ ਭਰੋ, ਵਾਰ-ਵਾਰ ਵਰਤੋ।",
    months: "ਸ਼ਾਮਲ ਮਹੀਨੇ",
    missing: "ਹਾਲੇ ਚਾਹੀਦਾ ਹੈ",
    done: "ਮਿਲ ਗਿਆ",
    products: "ਤੁਹਾਡੇ ਉਤਪਾਦ",
    save: "ਸੇਵ ਕਰੋ",
    photo: "ਫੋਟੋ ਖਿੱਚੋ",
    file: "ਫਾਈਲ / PDF ਚੁਣੋ",
  },
};

export function t(lang: Lang, key: StrKey, vars: Record<string, string> = {}): string {
  let s = (STRINGS[lang] ?? STRINGS.en)[key] ?? STRINGS.en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** WhatsApp invite: the channel MSME owners actually answer. */
export function whatsappInvite(lang: Lang, phone: string, buyer: string, link: string): string {
  const msg: Record<Lang, string> = {
    en: `Namaste! ${buyer} needs your electricity, fuel and production bills for EU CBAM. Upload photos here (2 minutes, your language): ${link}`,
    hi: `नमस्ते! ${buyer} को EU CBAM के लिए आपके बिजली, ईंधन और उत्पादन के बिल चाहिए। यहाँ फ़ोटो अपलोड करें (2 मिनट): ${link}`,
    gu: `નમસ્તે! ${buyer} ને EU CBAM માટે તમારા વીજળી, ઇંધણ અને ઉત્પાદનના બિલ જોઈએ છે. અહીં ફોટા અપલોડ કરો (2 મિનિટ): ${link}`,
    ta: `வணக்கம்! EU CBAM க்காக ${buyer} நிறுவனத்துக்கு உங்கள் மின்சாரம், எரிபொருள், உற்பத்தி பில்கள் தேவை. இங்கே புகைப்படங்களைப் பதிவேற்றுங்கள் (2 நிமிடம்): ${link}`,
    pa: `ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ${buyer} ਨੂੰ EU CBAM ਲਈ ਤੁਹਾਡੇ ਬਿਜਲੀ, ਬਾਲਣ ਅਤੇ ਉਤਪਾਦਨ ਦੇ ਬਿੱਲ ਚਾਹੀਦੇ ਹਨ। ਇੱਥੇ ਫੋਟੋਆਂ ਅੱਪਲੋਡ ਕਰੋ (2 ਮਿੰਟ): ${link}`,
  };
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg[lang])}`;
}

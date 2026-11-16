/*
 * JD -> Symplicity parser. Pure pattern matching, runs entirely in the browser.
 * Nothing is sent anywhere.
 *
 * Field vocabularies match the CEU Symplicity "New Job" form (Nov 2026).
 */
(function (root) {
  "use strict";

  // ---------- Form vocabulary ----------
  const FORM = {
    positionTypes: ["CareerNext (post by CEU Career Services)", "Full Time (job)", "Part Time (job)", "Internship/traineeship", "Fellowship/grant", "Volunteer Opportunity", "Study"],
    resumeMethods: ["Email", "Accumulate Online", "Other (enter below)"],
    experience: ["0-2 years", "2-5 years", "5+ years"],
    documents: ["Cover Letter", "Unofficial Transcript", "Writing Sample", "Other Documents"],
    degreeLevels: ["Bachelor's", "Master's", "Doctorate", "Non-degree", "Alumni"],
    workAuth: ["O", "EU", "H"],
    titleMax: 60,
  };

  // ---------- Helpers ----------
  const clean = (s) => (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  const uniq = (arr) => [...new Set(arr)];
  const BULLET_RE = /^\s*(?:[-•*·▪●◦–—✓✔➢►>□■o]|\d{1,2}[.)])\s+/;
  const stripBullet = (s) => s.replace(BULLET_RE, "").trim();

  function sentences(text) {
    return text
      .split(/\n+/)
      .flatMap((l) => l.split(/(?<!\b(?:max|min|approx|incl|e\.g|i\.e|no|nr|ca|dr|mr|ms|mrs|prof|etc|vs|ref|bzw|z\.b|u\.a|inkl|ggf|resp|dept|st)\.)(?<=[.!?])\s+(?=[A-Z0-9])/i))
      .map((x) => clean(stripBullet(x)))
      .filter(Boolean);
  }

  // ---------- Section headings ----------
  const SECTIONS = [
    ["about", "About the organisation", /^(about (us|the (company|organi[sz]ation|employer|team))|who we are|our (company|organi[sz]ation|mission|story)|über uns|wer wir sind|company (profile|description)|the (company|organi[sz]ation))\b/i],
    ["role", "The role", /^(about the (role|position|job|internship|opportunity)|the (role|position|opportunity|internship)|(job|position|role) (description|summary|overview|purpose|profile)|overview|summary|purpose( of the (role|position))?|context|background|ihre rolle|die stelle|deine rolle)\b/i],
    ["resp", "Responsibilities", /^((key |main |your |job |primary |core )?(responsibilities|duties|tasks|accountabilities)|what (you('|’)ll|you will|you would) (do|be doing|work on)|your (role|mission|day|tasks|impact)|in this role|ihre aufgaben|aufgaben|deine aufgaben|tasks and responsibilities|the job|main activities|activities)\b/i],
    ["req", "Requirements", /^((required |minimum |essential |key |basic )?(requirements|qualifications|skills( and experience)?|experience)|what (we('|’)re|we are) looking for|who (you are|we('|’)re looking for|we are looking for)|(your|the ideal) (profile|candidate)|(you have|you bring|you are|you should have|you need)|what you bring|what you('|’)?ll need|what you need|competencies|ihr profil|dein profil|anforderungen|qualifikationen|was du mitbringst|was sie mitbringen|eligibility( criteria)?|selection criteria|must[- ]haves?)\b/i],
    ["nice", "Nice to have", /^(nice[- ]to[- ]haves?|preferred( qualifications| skills)?|desirable( qualifications| skills)?|desired( qualifications| skills)?|bonus( points)?|(it('|’)s |it is )?a plus|assets?|advantageous|wünschenswert|von vorteil|additional (assets|qualifications))\b/i],
    ["offer", "What they offer", /^(what we offer|we offer|benefits|perks|why (join|work with|work for) us|our offer|what('|’)s in it for you|what is in it for you|compensation( and benefits)?|salary( and benefits)?|remuneration|(employment )?conditions|terms( and conditions)?|wir bieten|unser angebot|was wir bieten|das bieten wir|what you get)\b/i],
    ["apply", "How to apply", /^(how to apply|application( process| procedure| instructions| details)?|to apply|apply( now| here)?|interested\??|next steps|bewerbung|ihre bewerbung|so bewirbst du dich|submission( of applications)?|application deadline)\b/i],
  ];

  function headingOf(line) {
    const l = clean(line).replace(/^#+\s*/, "").replace(BULLET_RE, "");
    if (!l || l.length > 70) return null;
    const bare = l.replace(/[:?!.]+$/, "").trim();
    for (const [key, label, re] of SECTIONS) {
      const m = bare.match(re);
      if (m) {
        // whole line is a heading, or "Heading: content"
        const rest = l.slice(m[0].length).replace(/^[\s:–—-]+/, "");
        if (!rest || /^[:–—-]/.test(l.slice(m[0].length).trim())) {
          if (rest && rest.split(" ").length > 0 && l.slice(m[0].length).trim().startsWith(":")) return { key, label, rest };
          if (!rest) return { key, label, rest: "" };
        }
        if (bare.split(/\s+/).length <= 6 && !/[.,;]/.test(bare)) return { key, label, rest: "" };
      }
    }
    // generic heading: short, ends with colon, or ALL CAPS
    const words = bare.split(/\s+/).length;
    if (words <= 6 && /:$/.test(l) && !/[.,;]/.test(bare)) return { key: "other", label: bare, rest: "" };
    if (words <= 6 && bare.length >= 4 && bare === bare.toUpperCase() && /[A-Z]/.test(bare)) return { key: "other", label: titleCase(bare), rest: "" };
    return null;
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }

  // Split JD into ordered blocks: [{key,label,lines:[]}]
  function segment(lines) {
    const blocks = [{ key: "intro", label: "", lines: [] }];
    for (const raw of lines) {
      const h = headingOf(raw);
      if (h) {
        blocks.push({ key: h.key, label: h.label, lines: h.rest ? [h.rest] : [] });
      } else {
        blocks[blocks.length - 1].lines.push(raw);
      }
    }
    return blocks.filter((b) => b.lines.some((l) => clean(l)) || b.key !== "intro");
  }

  // ---------- Dates ----------
  const MONTHS = {
    jan: 1, january: 1, januar: 1, jänner: 1, janner: 1,
    feb: 2, february: 2, februar: 2,
    mar: 3, march: 3, märz: 3, marz: 3, maerz: 3,
    apr: 4, april: 4,
    may: 5, mai: 5,
    jun: 6, june: 6, juni: 6,
    jul: 7, july: 7, juli: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, okt: 10, oktober: 10,
    nov: 11, november: 11,
    dec: 12, december: 12, dez: 12, dezember: 12,
  };
  const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validDate = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  function findDates(s, today) {
    const out = [];
    const ty = +today.slice(0, 4);
    const fixYear = (y, m, d) => {
      if (y) return [y < 100 ? 2000 + y : y, false];
      // no year: next occurrence on/after today
      let yy = ty;
      if (iso(yy, m, d) < today) yy += 1;
      return [yy, true];
    };
    let m;
    const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = reIso.exec(s))) if (validDate(+m[1], +m[2], +m[3])) out.push({ iso: iso(+m[1], +m[2], +m[3]), idx: m.index });
    const reNum = /\b(\d{1,2})([./])(\d{1,2})\2(\d{2,4})\b/g;
    while ((m = reNum.exec(s))) {
      let a = +m[1], b = +m[3], y = +m[4];
      y = y < 100 ? 2000 + y : y;
      let d = a, mo = b, ambiguous = false;
      if (m[2] === "/" && b > 12 && a <= 12) { d = b; mo = a; } // US style
      else if (m[2] === "/" && a <= 12 && b <= 12 && a !== b) ambiguous = true;
      if (validDate(y, mo, d)) out.push({ iso: iso(y, mo, d), idx: m.index, ambiguous });
    }
    const reDM = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|\\.)?(?:\\s+of)?\\s+(${MONTH_ALT})\\.?,?(?:\\s+(\\d{4}))?\\b`, "gi");
    while ((m = reDM.exec(s))) {
      const mo = MONTHS[m[2].toLowerCase()];
      const d = +m[1];
      const [y, inferred] = fixYear(m[3] ? +m[3] : 0, mo, d);
      if (validDate(y, mo, d)) out.push({ iso: iso(y, mo, d), idx: m.index, inferredYear: inferred });
    }
    const reMD = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
    while ((m = reMD.exec(s))) {
      const mo = MONTHS[m[1].toLowerCase()];
      const d = +m[2];
      if (d > 31) continue;
      const [y, inferred] = fixYear(m[3] ? +m[3] : 0, mo, d);
      if (validDate(y, mo, d) && !out.some((o) => Math.abs(o.idx - m.index) < 4)) out.push({ iso: iso(y, mo, d), idx: m.index, inferredYear: inferred });
    }
    return out.sort((a, b) => a.idx - b.idx);
  }

  const DEADLINE_RE = /\b(deadline|apply (by|before|until|no later than)|applications? (close|closes|closing|due|must be (received|submitted)|accepted until|will be accepted until|by)|closing date|close(s)? on|no later than|until|by|before|bewerbungsfrist|bewerbungsschluss|einsendeschluss|bis (zum|spätestens)|spätestens|határidő|due date|submit by|last date)\b/i;
  const ROLLING_RE = /\b(rolling basis|on a rolling|asap|as soon as possible|until (the position is|filled)|open until filled|laufend|ongoing basis)\b/i;
  const START_RE = /\b(start(ing)? date|start(s|ing)? (on|in|from)|commencing|beginning|from|eintritt|ab sofort|beginn|duration|period|employment period|contract (end|until))\b/i;

  function findDeadline(text, today) {
    const sents = sentences(text);
    let note = "";
    // Pass 1: sentences with a strong deadline word
    for (const s of sents) {
      if (!DEADLINE_RE.test(s)) continue;
      if (/\b(deadline|bewerbungsfrist|bewerbungsschluss|closing date|határidő|apply by|applications? (close|due))\b/i.test(s) || !START_RE.test(s)) {
        const ds = findDates(s, today).filter((d) => d.iso >= today || /deadline|closing/i.test(s));
        if (ds.length) {
          const d = ds[ds.length > 1 && /\bfrom\b.*\b(to|until)\b/i.test(s) ? ds.length - 1 : 0];
          if (d.ambiguous) note = "Date format ambiguous (day/month vs month/day), check it. ";
          if (d.inferredYear) note += "No year given; assumed the next occurrence. ";
          return { iso: d.iso, note: note.trim(), source: s };
        }
      }
    }
    for (const s of sents) {
      if (!/\b(apply|application|applications|send|submit|bewerb|senden|unterlagen|jelentkez)/i.test(s)) continue;
      if (START_RE.test(s) && !/\b(bis|by|until|before)\b/i.test(s)) continue;
      const ds = findDates(s, today).filter((d) => d.iso >= today);
      if (ds.length) return { iso: ds[0].iso, note: "Deadline inferred from: \"" + s.slice(0, 140) + "\". Check it.", source: s };
    }
    const rolling = sents.find((s) => ROLLING_RE.test(s) && /\b(appl|review|recruit|candidates|bewerb)/i.test(s));
    if (rolling) return { iso: "", note: "Rolling / ASAP: " + rolling.slice(0, 160), source: rolling };
    return { iso: "", note: "", source: "" };
  }

  // ---------- Contacts & links ----------
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()"']+[^\s<>()"'.,;:!?])/gi;
  const APPLY_WORDS = /\b(apply|application|applications|send|submit|cv|resume|résumé|bewerb\w*|senden|unterlagen|jelentkez\w*|candidature)\b/i;
  const GENERIC_MAIL = /@(gmail|yahoo|hotmail|outlook|gmx|icloud|aol|proton(mail)?|web|freemail|citromail)\./i;

  function normUrl(u) {
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  }

  function contactsAndLinks(text) {
    const emails = uniq((text.match(EMAIL_RE) || []).map((e) => e.replace(/\.$/, "")));
    const urls = uniq((text.match(URL_RE) || []).map(normUrl));
    const sents = sentences(text);
    const applyEmail = emails.find((e) => sents.some((s) => s.includes(e) && APPLY_WORDS.test(s))) || "";
    const applyUrl =
      urls.find((u) => sents.some((s) => (s.includes(u) || s.includes(u.replace(/^https?:\/\//, ""))) && APPLY_WORDS.test(s))) ||
      urls.find((u) => /(apply|career|karriere|jobs?|recruit|vacanc|position|stellen|greenhouse|lever\.co|workday|smartrecruiters|personio|teamtailor|bamboohr|join)/i.test(u)) ||
      "";
    return { emails, urls, applyEmail, applyUrl };
  }

  // ---------- Title ----------
  const GENDER_RE = /\s*\((?:m\/w\/d|m\/f\/d|w\/m\/d|f\/m\/d|m\/w\/x|f\/m\/x|all genders?|m\/f\/x|d\/f\/m|gn\*?|w\/m\/x|m\/f|f\/m)\)/gi;

  function findTitle(lines) {
    for (const l of lines.slice(0, 15)) {
      const m = clean(l).match(/^(?:job title|position title|position|role|title|vacancy|job|stelle|stellenbezeichnung|pozíció|munkakör)\s*[:–—-]\s*(.{3,120})$/i);
      if (m) return { title: clean(m[1]), line: l };
    }
    for (const l of lines.slice(0, 6)) {
      const c = clean(stripBullet(l));
      if (c.length < 3 || c.length > 120) continue;
      if (headingOf(c)) continue;
      if (/^(job description|job posting|vacancy announcement|vacancy notice|we('|’)re hiring|now hiring|job offer|stellenausschreibung|stellenangebot|open position)\W*$/i.test(c)) continue;
      if (/[.!?]$/.test(c) && c.split(" ").length > 8) continue;
      if (EMAIL_RE.test(c)) { EMAIL_RE.lastIndex = 0; continue; }
      if (/^(location|deadline|employer|company|organi[sz]ation|salary|contract|start)\b/i.test(c)) continue;
      return { title: c.replace(/^(job title|position)\s*[:–—-]\s*/i, ""), line: l };
    }
    const text = lines.join("\n");
    const m = text.match(/\b(?:looking for|seeking|hiring|recruiting|searching for)\s+(?:an?\s+)?(?:motivated\s+|talented\s+|dedicated\s+|enthusiastic\s+|experienced\s+)?((?:[A-Z][\w&/-]*)(?:\s+(?:[A-Z][\w&/-]*|of|for|and|in|&)){0,6})/);
    if (m) return { title: clean(m[1]).replace(/\s+(of|for|and|in|&)$/, ""), line: null, guessed: true };
    return { title: "", line: null };
  }

  function shortenTitle(t) {
    let s = clean(t);
    const orig = s;
    if (s.length <= FORM.titleMax) return { title: s, original: "" };
    s = s.replace(GENDER_RE, "").trim();
    if (s.length > FORM.titleMax) s = s.replace(/\s*[-–—|,]\s*(ref(erence)?\.?\s*(no\.?|number)?|job id|id)\s*[:#]?\s*[\w-]+$/i, "").trim();
    if (s.length > FORM.titleMax) s = s.replace(/\s*[-–—|,(]\s*[^-–—|,(]*$/, "").trim() || s; // drop trailing qualifier (e.g. location)
    if (s.length > FORM.titleMax) {
      s = s.slice(0, FORM.titleMax + 1);
      s = s.slice(0, s.lastIndexOf(" ") > 30 ? s.lastIndexOf(" ") : FORM.titleMax).replace(/[\s,;:–—-]+$/, "");
    }
    return { title: s, original: orig };
  }

  // ---------- Employer ----------
  const NOT_EMPLOYER = /^(us|the role|the position|the job|you|our team|the team|this role|this position|the internship|the opportunity|it|we)$/i;

  function findEmployer(text, lines, emails) {
    for (const l of lines.slice(0, 40)) {
      const m = clean(l).match(/^(?:company|employer|organi[sz]ation|organisation name|hiring organi[sz]ation|unternehmen|firma|arbeitgeber|institution|cég|munkáltató)\s*[:–—-]\s*(.{2,90})$/i);
      if (m) return { name: clean(m[1]), confidence: "high" };
    }
    for (const l of lines) {
      const m = clean(l).match(/^about\s+(.{2,60}?)\s*:?$/i);
      if (m && !NOT_EMPLOYER.test(m[1]) && /^[A-Z0-9]/.test(m[1])) return { name: m[1], confidence: "medium" };
    }
    const NAME = "((?:[A-Z][\\w&.'’-]*|of|for|and|the|de|der|für|und)(?:[ \\t]+(?:[A-Z][\\w&.'’-]*|of|for|and|the|de|der|für|und)){0,6})";
    const patterns = [
      new RegExp("(?:^|\\n)(?:The[ \\t]+)?" + NAME + "(?:[ \\t]+\\([A-Z]{2,10}\\))?[ \\t]+(?:is|are)[ \\t]+(?:a|an|the|one)[ \\t]", ""),
      new RegExp(NAME + "[ \\t]+(?:is|are)[ \\t]+(?:currently[ \\t]+)?(?:looking|seeking|hiring|searching|recruiting|inviting|offering|accepting)", ""),
      new RegExp("(?:^|[.!]\\s+)(?:At|Join)\\s+" + NAME + "[,!\\s]", "m"),
      new RegExp("(?:join|at|with)[ \\t]+(?:the[ \\t]+)?" + NAME + "[ \\t]+(?:as|team|in)\\b", ""),
      new RegExp(NAME + "[ \\t]+(?:sucht|suchen)\\b", ""),
    ];
    for (const re0 of patterns) {
      const re = new RegExp(re0.source, re0.flags.includes("g") ? re0.flags : re0.flags + "g");
      for (const m of text.matchAll(re)) {
        let n = clean(m[1]).replace(/^(the|we|our)\s+/i, "").replace(/\s+(of|for|and|the|de|der|für|und)$/i, "");
        if (n.length >= 2 && !NOT_EMPLOYER.test(n) && !/^(We|You|Our|This|The|If|In|As|Are|Do|It|He|She|They|Applicants?|Candidates?)$/i.test(n) && n.split(" ").length <= 8) return { name: n, confidence: "medium" };
      }
    }
    const corp = emails.find((e) => !GENERIC_MAIL.test(e));
    if (corp) {
      const dom = corp.split("@")[1].split(".").slice(-2, -1)[0];
      if (dom) return { name: dom.length <= 5 ? dom.toUpperCase() : titleCase(dom), confidence: "low" };
    }
    return { name: "", confidence: "none" };
  }

  // ---------- Location ----------
  const CITIES = {
    vienna: ["Vienna", "Austria"], wien: ["Vienna", "Austria"], graz: ["Graz", "Austria"], linz: ["Linz", "Austria"], salzburg: ["Salzburg", "Austria"], innsbruck: ["Innsbruck", "Austria"], klagenfurt: ["Klagenfurt", "Austria"], laxenburg: ["Laxenburg", "Austria"],
    budapest: ["Budapest", "Hungary"], debrecen: ["Debrecen", "Hungary"], szeged: ["Szeged", "Hungary"], "pécs": ["Pécs", "Hungary"], pecs: ["Pécs", "Hungary"], "győr": ["Győr", "Hungary"],
    berlin: ["Berlin", "Germany"], munich: ["Munich", "Germany"], "münchen": ["Munich", "Germany"], frankfurt: ["Frankfurt", "Germany"], hamburg: ["Hamburg", "Germany"], cologne: ["Cologne", "Germany"], "köln": ["Cologne", "Germany"], bonn: ["Bonn", "Germany"], stuttgart: ["Stuttgart", "Germany"], dusseldorf: ["Düsseldorf", "Germany"], "düsseldorf": ["Düsseldorf", "Germany"], leipzig: ["Leipzig", "Germany"], heidelberg: ["Heidelberg", "Germany"],
    brussels: ["Brussels", "Belgium"], "bruxelles": ["Brussels", "Belgium"], antwerp: ["Antwerp", "Belgium"], geneva: ["Geneva", "Switzerland"], "genève": ["Geneva", "Switzerland"], zurich: ["Zurich", "Switzerland"], "zürich": ["Zurich", "Switzerland"], bern: ["Bern", "Switzerland"], basel: ["Basel", "Switzerland"], lausanne: ["Lausanne", "Switzerland"],
    paris: ["Paris", "France"], strasbourg: ["Strasbourg", "France"], lyon: ["Lyon", "France"], london: ["London", "United Kingdom"], oxford: ["Oxford", "United Kingdom"], cambridge: ["Cambridge", "United Kingdom"], edinburgh: ["Edinburgh", "United Kingdom"], manchester: ["Manchester", "United Kingdom"], dublin: ["Dublin", "Ireland"],
    amsterdam: ["Amsterdam", "Netherlands"], "the hague": ["The Hague", "Netherlands"], rotterdam: ["Rotterdam", "Netherlands"], utrecht: ["Utrecht", "Netherlands"], luxembourg: ["Luxembourg", "Luxembourg"],
    prague: ["Prague", "Czech Republic"], praha: ["Prague", "Czech Republic"], brno: ["Brno", "Czech Republic"], bratislava: ["Bratislava", "Slovakia"], warsaw: ["Warsaw", "Poland"], krakow: ["Kraków", "Poland"], "kraków": ["Kraków", "Poland"], wroclaw: ["Wrocław", "Poland"],
    bucharest: ["Bucharest", "Romania"], "cluj-napoca": ["Cluj-Napoca", "Romania"], sofia: ["Sofia", "Bulgaria"], belgrade: ["Belgrade", "Serbia"], zagreb: ["Zagreb", "Croatia"], ljubljana: ["Ljubljana", "Slovenia"], sarajevo: ["Sarajevo", "Bosnia and Herzegovina"], skopje: ["Skopje", "North Macedonia"], tirana: ["Tirana", "Albania"], podgorica: ["Podgorica", "Montenegro"], pristina: ["Pristina", "Kosovo"], chisinau: ["Chișinău", "Moldova"],
    kyiv: ["Kyiv", "Ukraine"], kiev: ["Kyiv", "Ukraine"], lviv: ["Lviv", "Ukraine"], tbilisi: ["Tbilisi", "Georgia"], yerevan: ["Yerevan", "Armenia"], baku: ["Baku", "Azerbaijan"], istanbul: ["Istanbul", "Turkey"], ankara: ["Ankara", "Turkey"], athens: ["Athens", "Greece"],
    rome: ["Rome", "Italy"], milan: ["Milan", "Italy"], florence: ["Florence", "Italy"], turin: ["Turin", "Italy"], madrid: ["Madrid", "Spain"], barcelona: ["Barcelona", "Spain"], lisbon: ["Lisbon", "Portugal"], copenhagen: ["Copenhagen", "Denmark"], stockholm: ["Stockholm", "Sweden"], oslo: ["Oslo", "Norway"], helsinki: ["Helsinki", "Finland"],
    vilnius: ["Vilnius", "Lithuania"], riga: ["Riga", "Latvia"], tallinn: ["Tallinn", "Estonia"], almaty: ["Almaty", "Kazakhstan"], astana: ["Astana", "Kazakhstan"], bishkek: ["Bishkek", "Kyrgyzstan"], tashkent: ["Tashkent", "Uzbekistan"],
    "new york": ["New York", "United States"], washington: ["Washington, D.C.", "United States"], boston: ["Boston", "United States"], "san francisco": ["San Francisco", "United States"], toronto: ["Toronto", "Canada"], nairobi: ["Nairobi", "Kenya"], "addis ababa": ["Addis Ababa", "Ethiopia"], bangkok: ["Bangkok", "Thailand"], singapore: ["Singapore", "Singapore"], "hong kong": ["Hong Kong", "Hong Kong"], dubai: ["Dubai", "United Arab Emirates"],
  };
  const COUNTRIES = ["Austria", "Hungary", "Germany", "Belgium", "Switzerland", "France", "United Kingdom", "Ireland", "Netherlands", "Czech Republic", "Czechia", "Slovakia", "Poland", "Romania", "Bulgaria", "Serbia", "Croatia", "Slovenia", "Ukraine", "Georgia", "Armenia", "Italy", "Spain", "Portugal", "Greece", "Turkey", "Denmark", "Sweden", "Norway", "Finland", "United States", "USA", "Canada", "Kenya", "Kosovo", "Albania", "Moldova", "Lithuania", "Latvia", "Estonia", "Luxembourg", "Österreich", "Deutschland", "Magyarország"];
  const CITY_RE = new RegExp("(?<![\\w-])(" + Object.keys(CITIES).sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\w-])", "gi");

  function findLocation(text, lines) {
    const remote = /\b(fully remote|100% remote|remote[- ]first|remote position|work from anywhere|remote work|remote|home ?office|telework)\b/i.test(text);
    const hybrid = /\bhybrid\b/i.test(text);
    let label = "";
    for (const l of lines) {
      const m = clean(l).match(/^(?:location|locations|place of work|work location|workplace|based in|arbeitsort|dienstort|standort|einsatzort|duty station|office location|city|helyszín|munkavégzés helye)\s*[:–—-]\s*(.{2,100})$/i);
      if (m) { label = clean(m[1]); break; }
    }
    const scan = label || text;
    const counts = {};
    let first = {};
    let m;
    CITY_RE.lastIndex = 0;
    while ((m = CITY_RE.exec(scan))) {
      const k = m[1].toLowerCase();
      const canon = CITIES[k][0];
      // skip "Cambridge University Press"-like noise only if not in label: accept anyway
      counts[canon] = (counts[canon] || 0) + 1;
      if (!(canon in first)) first[canon] = m.index;
    }
    const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || first[a] - first[b]);
    let loc = "";
    if (ranked.length) {
      const city = ranked[0];
      const country = Object.values(CITIES).find((v) => v[0] === city)[1];
      loc = city === country ? city : `${city}, ${country}`;
    } else if (label) {
      loc = label;
    } else {
      const c = COUNTRIES.find((c) => new RegExp("\\b(in|based in|located in)\\s+" + c + "\\b", "i").test(text));
      if (c) loc = c;
    }
    let mode = hybrid ? "Hybrid" : remote ? "Remote" : "";
    if (!loc && remote) loc = "Remote";
    return { location: loc, mode, others: ranked.slice(1, 4), fromLabel: Boolean(label) };
  }

  // ---------- Position type ----------
  function findPositionTypes(text, title) {
    const t = text.toLowerCase();
    const tt = (title || "").toLowerCase();
    const types = new Set(["CareerNext (post by CEU Career Services)"]);
    const intern = /\b(intern|interns|internship|internships|trainee|traineeship|praktikum|praktikant(in)?|stage|stagiaire|gyakornok|blue book)\b/i;
    const fellow = /\b(fellowship|fellow|grant|scholarship|bursary|stipendium|ösztöndíj|residency programme|residency program)\b/i;
    const study = /\b(summer school|winter school|degree programme|degree program|master'?s programme|master'?s program|phd programme|phd program|doctoral programme|doctoral program|studentship|call for applications for (the )?(program|programme)|course|training programme)\b/i;
    const volunteer = /\b(volunteer|volunteering|ehrenamt|ehrenamtlich|önkéntes)\b/i;
    const partTime = /\b(part[- ]time|teilzeit|részmunkaidő|geringfügig|mini[- ]?job|student job|werkstudent)\b/i;
    const fullTime = /\b(full[- ]time|vollzeit|teljes munkaidő|38[.,]5 hours|40 hours|38,5 stunden|40 stunden)\b/i;
    const hours = t.match(/\b(\d{1,2})(?:[.,]\d)?\s*(?:hours|hrs|h|stunden|wochenstunden)\s*(?:\/|per|a|pro)?\s*(?:week|wk|woche)?/i);

    const strongIntern = /\b(this|the|our|an?|paid|unpaid|full[- ]time|part[- ]time|\d+[- ]months?)\s+(internship|traineeship|praktikum|intern position|intern role)\b|\binternship (position|programme|program|opportunity|period|will)\b/i;
    if (intern.test(tt) || (!tt && intern.test(t)) || (strongIntern.test(t) && !/\b(analyst|manager|officer|associate|specialist|engineer|consultant|coordinator|assistant|director|lead)\b/i.test(tt))) types.add("Internship/traineeship");
    if (fellow.test(tt) || (fellow.test(t) && !intern.test(tt) && /\b(fellowship|grant|scholarship|bursary)\b/i.test(t))) types.add("Fellowship/grant");
    if (study.test(tt) || /\b(summer school|winter school|studentship|call for applications for (the )?(program|programme|course))\b/i.test(t)) types.add("Study");
    if (volunteer.test(tt) || /\b(volunteer (position|opportunity|role)|on a volunteer basis|unpaid volunteer)\b/i.test(t)) types.add("Volunteer Opportunity");
    if (partTime.test(t) || (hours && +hours[1] >= 5 && +hours[1] < 35)) types.add("Part Time (job)");
    if (fullTime.test(t) && !types.has("Internship/traineeship") && (!types.has("Part Time (job)") || fullTime.test(tt))) types.add("Full Time (job)");
    let guessed = false;
    if (types.size === 1) { types.add("Full Time (job)"); guessed = true; }
    // internship that is explicitly full-time: keep internship only (that's what students filter on)
    return { types: [...types], guessed };
  }

  // ---------- Experience ----------
  function findExperience(text, title, types) {
    const re = [
      /(?:at least|minimum(?: of)?|min\.?|over|more than|>\s*)?\s*(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:'|’)?\s+(?:of\s+)?(?:[\w-]+\s+){0,5}?(?:experience|work experience|professional experience|relevant experience|berufserfahrung|erfahrung)/gi,
      /(\d{1,2})\s*(?:\+)?\s*(?:(?:-|–|bis)\s*(\d{1,2}))?\s*jahre?\s+(?:\w+\s+){0,3}?(?:berufserfahrung|erfahrung)/gi,
      /(?:experience|erfahrung)\s*(?:of|:)?\s*(?:at least|minimum(?: of)?|min\.?)?\s*(\d{1,2})\s*(?:\+)?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*(?:years?|jahre)/gi,
    ];
    const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    let src = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s*(?:\+|plus)?\s*(?:\(\d+\)\s*)?(?:years?|yrs?))/gi, (w) => WORDNUM[w.toLowerCase()]);
    src = src.replace(/\b(\d+)\s*\(\d+\)/g, "$1");
    let lo = null, hi = null, quote = "";
    for (const r of re) {
      const m = r.exec(src);
      if (m) { lo = +m[1]; hi = m[2] ? +m[2] : null; quote = clean(m[0]); break; }
    }
    const bands = new Set();
    if (lo !== null && lo <= 30) {
      const top = hi !== null ? hi : lo;
      if (lo < 2) bands.add("0-2 years");
      if ((lo >= 2 && lo < 5) || (top > 2 && lo < 5)) bands.add("2-5 years");
      if (lo >= 5 || (hi !== null && hi > 5)) bands.add("5+ years");
      if (lo === 2 && hi === null) { bands.delete("0-2 years"); bands.add("2-5 years"); }
    } else {
      if (types.includes("Internship/traineeship") || /\b(entry[- ]level|graduate (programme|program|position|role|scheme)|junior|no (prior |previous )?(work )?experience|recent graduates?|fresh graduates?|first job|career starter|berufseinsteiger)/i.test(text + " " + title)) bands.add("0-2 years");
      else if (/\b(senior|head of|principal|director|lead)\b/i.test(title)) bands.add("5+ years");
    }
    return { bands: [...bands], quote };
  }

  // ---------- Documents ----------
  const DOCS = [
    ["Cover Letter", /\b(cover(ing)? letter|motivation(al)? letter|letter of motivation|motivationsschreiben|anschreiben|statement of (interest|motivation|purpose)|personal statement|motivációs levél)\b/i],
    ["Unofficial Transcript", /\b(transcripts?( of records)?|grade (report|sheet)s?|academic record|notenauszug|leistungsnachweis)\b/i],
    ["Writing Sample", /\b(writing samples?|samples? of (your )?(written work|writing)|written work|research paper sample|publication samples?)\b/i],
    ["Other Documents", /\b(references|referees|letters? of (recommendation|reference)|recommendation letters?|reference letters?|portfolio|certificates|diplomas?|degree certificate|work samples?|zeugnisse|copy of (your )?(passport|id|degree))\b/i],
  ];
  const REQ_WORDS = /\b(must|required|mandatory|please (send|submit|include|attach|upload|provide)|should (include|contain)|including|consisting of|together with|along with|accompanied by|include|send (us|your)|submit (a|an|your)|bitte|senden sie)\b/i;

  function findDocuments(text, applyText) {
    const sents = sentences(text);
    const optional = [], required = [], otherWhat = [];
    for (const [name, re] of DOCS) {
      const hits = sents.filter((s) => re.test(s));
      if (!hits.length) continue;
      optional.push(name);
      if (hits.some((s) => REQ_WORDS.test(s) && !/\b(optional|if available|may|can also|welcome)\b/i.test(s)) || (applyText && re.test(applyText) && !/\b(optional|if available)\b/i.test(applyText))) required.push(name);
      if (name === "Other Documents") {
        const m = hits.join(" ").match(re);
        if (m) otherWhat.push(m[0]);
      }
    }
    const notes = sents
      .filter((s) => /\b(pdf|single (file|document|pdf)|one (file|document|pdf)|subject( line)?|reference (number|code|no)|in english|file ?name|max(imum)?\.? \d+ (pages?|words|mb)|\d+ pages?|word limit|not exceed)\b/i.test(s) && (APPLY_WORDS.test(s) || DOCS.some(([, r]) => r.test(s))))
      .slice(0, 3);
    if (otherWhat.length) notes.unshift("Other documents: " + uniq(otherWhat.map((s) => s.toLowerCase())).join(", ") + ".");
    return { optional, required, notes: uniq(notes).join(" ") };
  }

  // ---------- Skills ----------
  const SKILLS = [
    "Python", "SQL", "Excel", "Stata", "SPSS", "SAS", "MATLAB", "Tableau", "Power BI", "Java", "JavaScript", "TypeScript", "C++", "C#", "Git", "HTML", "CSS", "React",
    "Machine Learning", "Data Analysis", "Data Visualization", "Data Visualisation", "Data Management", "Data Collection", "Data Science", "Statistics", "Econometrics", "Quantitative Research", "Qualitative Research", "Mixed Methods", "Survey Design", "Literature Review", "Research",
    "Policy Analysis", "Public Policy", "Project Management", "Programme Management", "Program Management", "Stakeholder Management", "Stakeholder Engagement", "Event Management", "Event Planning", "Grant Writing", "Fundraising", "Proposal Writing", "Report Writing", "Academic Writing", "Copywriting", "Editing", "Proofreading", "Translation", "Interpreting",
    "Communication", "Public Speaking", "Presentation Skills", "Negotiation", "Facilitation", "Training", "Teaching", "Mentoring", "Coaching",
    "Social Media", "Digital Marketing", "Content Creation", "Content Writing", "SEO", "Marketing", "Media Relations", "Public Relations", "Journalism", "Video Editing", "Photography", "Graphic Design", "Adobe Creative Suite", "Photoshop", "InDesign", "Illustrator", "Canva", "WordPress", "Figma", "UX Design",
    "CRM", "Salesforce", "SAP", "Microsoft Office", "MS Office", "PowerPoint", "Google Workspace",
    "Budgeting", "Financial Analysis", "Financial Modelling", "Financial Modeling", "Accounting", "Auditing", "Due Diligence", "Risk Management", "Valuation", "Bloomberg",
    "Legal Research", "Legal Drafting", "Compliance", "Human Rights", "International Law", "EU Law", "Advocacy", "Campaigning", "Monitoring and Evaluation", "Impact Assessment", "Gender Analysis",
    "Teamwork", "Leadership", "Problem Solving", "Critical Thinking", "Time Management", "Attention to Detail", "Organisational Skills", "Organizational Skills", "Analytical Skills", "Intercultural Communication", "Customer Service", "Sales", "Business Development", "Market Research", "Consulting",
    "GIS", "ArcGIS", "QGIS", "NVivo", "ATLAS.ti", "LaTeX", "NLP", "Agile", "Scrum", "Jira", "Procurement", "Logistics", "Recruitment", "HR", "Administration", "Office Management", "AWS", "Azure", "Cybersecurity", "Database Management",
  ];
  const SKILL_ALIASES = {
    "data visualisation": "Data Visualization", "programme management": "Project Management", "program management": "Project Management", "financial modeling": "Financial Modelling",
    "organizational skills": "Organisational Skills", "ms office": "Microsoft Office", "presentation skills": "Presentation Skills", "m&e": "Monitoring and Evaluation",
  };
  const SKILL_PATTERNS = SKILLS.map((s) => {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+").replace(/ /g, "\\s+");
    const caseSensitive = ["SQL", "SAS", "GIS", "SEO", "CRM", "SAP", "HR", "NLP", "AWS", "Git", "Java", "React", "Sales", "Training", "Teaching", "Research", "Marketing", "Communication", "Administration", "Consulting", "Leadership", "Teamwork", "Editing", "Advocacy", "Statistics", "Excel"].includes(s);
    return [s, new RegExp("(?<![\\w])" + esc + "(?![\\w+#])", caseSensitive && s.length <= 4 ? "g" : "gi")];
  });

  function findSkills(text, reqText) {
    const scores = {};
    const scoreIn = (src, weight) => {
      for (const [name, re] of SKILL_PATTERNS) {
        re.lastIndex = 0;
        let m, n = 0, firstIdx = null;
        while ((m = re.exec(src))) { n++; if (firstIdx === null) firstIdx = m.index; }
        if (!n) continue;
        const canon = SKILL_ALIASES[name.toLowerCase()] || name;
        const s = scores[canon] || { score: 0, first: Infinity };
        s.score += n * weight;
        s.first = Math.min(s.first, firstIdx + (weight > 1 ? 0 : 100000));
        scores[canon] = s;
      }
    };
    scoreIn(reqText || "", 3);
    scoreIn(text, 1);
    // R: only if clearly the language
    if (/(?<![\w])R(?![\w])(?=\s*(,|and|or|\/|\)|programming|studio)|\s)/.test(text) && /\b(Python|Stata|SPSS|statistic|programming|SQL)\b/i.test(text) && /(?:\b|^)(?:R|R Studio|RStudio)(?:\b)(?:\s*(?:,|and|or|\/))|(?:,|and|or|\/)\s*R\b/.test(text)) {
      scores["R"] = { score: 2, first: 99999 };
    }
    // Drop generic "Research" if more specific research skills exist
    if (scores["Research"] && (scores["Quantitative Research"] || scores["Qualitative Research"] || scores["Legal Research"] || scores["Market Research"])) delete scores["Research"];
    if (scores["Communication"] && scores["Intercultural Communication"]) scores["Communication"].score -= 1;
    return Object.entries(scores)
      .sort((a, b) => b[1].score - a[1].score || a[1].first - b[1].first)
      .slice(0, 10)
      .map(([k]) => k);
  }

  // ---------- Languages ----------
  const LANGS = { English: /\b(english|englisch\w*|angol)\b/i, German: /\b(german|deutsch\w*|német)\b/i, French: /\b(french|französisch|francia)\b/i, Spanish: /\b(spanish|spanisch)\b/i, Italian: /\b(italian|italienisch)\b/i, Hungarian: /\b(hungarian|ungarisch|magyar)\b/i, Russian: /\b(russian|russisch|orosz)\b/i, Ukrainian: /\bukrainian\b/i, Polish: /\bpolish\b/i, Czech: /\bczech\b/i, Slovak: /\bslovak\b/i, Romanian: /\bromanian\b/i, "BCMS": /\b(serbian|croatian|bosnian|montenegrin|bcs|bcms|serbo-croatian)\b/i, Arabic: /\barabic\b/i, Chinese: /\b(chinese|mandarin)\b/i, Turkish: /\bturkish\b/i, Portuguese: /\bportuguese\b/i, Dutch: /\bdutch\b/i, Persian: /\b(persian|farsi|dari)\b/i, Georgian: /\bgeorgian\b/i, Armenian: /\barmenian\b/i, Bulgarian: /\bbulgarian\b/i, Greek: /\bgreek\b/i, Albanian: /\balbanian\b/i, Japanese: /\bjapanese\b/i, Korean: /\bkorean\b/i, Hindi: /\bhindi\b/i, Swahili: /\bswahili\b/i };
  const LEVEL_RE = /\b([ABC][12]\+?|native|mother tongue|fluent|fluency|full professional|proficient|proficiency|excellent|very good|good|strong|working knowledge|working proficiency|business[- ]level|business fluent|basic|advanced|intermediate|conversational|verhandlungssicher|fließend|sehr gute|gute|ausgezeichnete|muttersprache)\b/i;
  const LEVEL_EN = { "sehr gute": "very good", gute: "good", "fließend": "fluent", verhandlungssicher: "business fluent", muttersprache: "native", ausgezeichnete: "excellent" };
  const LANG_CONTEXT = /\b(language|languages|speak|spoken|written|command|knowledge|skills|proficien|fluen|native|level|sprach|kenntnisse|nyelv)/i;

  function findLanguages(text) {
    const clauses = sentences(text).flatMap((s) => s.split(/;|\s+but\s+|\s+while\s+|,\s+(?=[A-Z])/)).map(clean).filter(Boolean);
    const out = [];
    for (const [lang, re] of Object.entries(LANGS)) {
      const hits = clauses.filter((s) => re.test(s) && (LEVEL_RE.test(s) || LANG_CONTEXT.test(s) || /\b(advantage|asset|plus|required|essential|desirable)\b/i.test(s)));
      const useful = hits.filter((s) => !/\b(not (required|necessary|needed|a requirement)|no .{0,20}(needed|required))\b/i.test(s) && !/\b(applications?|cv|documents?|submitted|send|written)\b[^.]{0,40}\bin\s+(english|german)\b/i.test(s.replace(LEVEL_RE, "")));
      if (!useful.length) continue;
      let level = "";
      for (const s of useful) {
        const li = s.search(re);
        let best = null;
        const lre = new RegExp(LEVEL_RE.source, "gi");
        let m;
        while ((m = lre.exec(s))) {
          const dist = Math.abs(m.index - li);
          if (best === null || dist < best.dist) best = { dist, v: m[1] };
        }
        if (best && best.dist < 60) { level = best.v; break; }
      }
      const opt = useful.every((s) => /\b(advantage|asset|plus|desirable|preferred|nice to have|von vorteil|wünschenswert)\b/i.test(s));
      const lv = level ? (/^[abc][12]\+?$/i.test(level) ? level.toUpperCase() : LEVEL_EN[level.toLowerCase()] || level.toLowerCase()) : "";
      out.push(lang + (lv ? ` (${lv})` : "") + (opt ? " - an advantage" : ""));
    }
    return out.join(", ");
  }

  // ---------- Degree level ----------
  function findDegrees(text) {
    const d = new Set();
    if (/\b(bachelor'?s?|bachelor|undergraduate|BSc|B\.Sc\.?|B\.A\.)\b|(?<![\w.])BA(?![\w])/.test(text) || /\bbachelor/i.test(text)) d.add("Bachelor's");
    if (/\b(master'?s?|MSc|M\.Sc\.?|M\.A\.|LL\.?M\.?|MBA|MPA|MPP|postgraduate|graduate degree|advanced (university )?degree)\b|(?<![\w.])MA(?![\w])/.test(text) || /\bmaster(s|'s|’s)?\b(?!\s+(the|of ceremonies|data|list|class))/i.test(text)) d.add("Master's");
    if (/\b(PhD|Ph\.D\.?|doctoral|doctorate|DPhil|doktorat|promotion)\b/i.test(text)) d.add("Doctorate");
    return [...d];
  }

  // ---------- Work authorisation (codes unconfirmed) ----------
  function findWorkAuth(text) {
    const eu = /\b((EU|EEA|European Union|Schengen)[ -](citizens?|nationals?|citizenship|passport|work (permit|authori[sz]ation)|residents?)|right to work in (the )?(EU|EEA|European Union|Austria|Germany|Hungary|Belgium|Netherlands|France)|(eligible|authori[sz]ed|permitted|entitled) to work in (the )?(EU|EEA|European Union|Austria|Germany|Hungary|Belgium|Netherlands|France)|valid (work|residence) permit|arbeitsbewilligung|arbeitserlaubnis|aufenthaltstitel|no (visa )?sponsorship|not (able to )?sponsor|cannot sponsor|unable to sponsor)\b/i;
    const hu = /\bhungarian (citizens?|nationals?|citizenship|passport)\b|magyar állampolgár/i;
    const nationalOf = text.match(/\b(nationals? of|citizens? of|open to (nationals|citizens) (of|from))\s+([^.;\n]{3,80})/i);
    if (hu.test(text) && !eu.test(text)) return { codes: ["H"], note: "JD restricts to Hungarian nationals." };
    if (eu.test(text)) {
      const m = text.match(eu);
      return { codes: ["EU", "H"], note: "JD mentions a work-authorisation restriction: \"" + clean(m[0]) + "\"." };
    }
    if (nationalOf) return { codes: [], note: "JD restricts by nationality: \"" + clean(nationalOf[0]) + "\". Pick codes manually." };
    return { codes: ["O", "EU", "H"], note: "" };
  }

  // ---------- Salary ----------
  function findSalary(text) {
    const sents = sentences(text);
    const s = sents.find((x) => /(€|EUR|HUF|USD|US\$|\$|£|GBP|CHF|\bFt\b|forint)/i.test(x) && /\d/.test(x)) || sents.find((x) => /\b(salary|gehalt|stipend|remuneration|compensation|pay|wage|bezahlung|entlohnung|bérezés|fizetés|kollektivvertrag|KV)\b/i.test(x) && /\d/.test(x));
    return s ? s.slice(0, 240) : "";
  }

  // ---------- Flags ----------
  function languageOfText(text) {
    const words = text.toLowerCase().match(/\b[\wäöüßőűáéíóú]+\b/g) || [];
    const count = (list) => words.filter((w) => list.includes(w)).length;
    const en = count(["the", "and", "with", "for", "you", "we", "our", "your", "of", "to", "is"]);
    const de = count(["und", "der", "die", "das", "mit", "für", "sie", "wir", "ihre", "ist", "zu", "eine"]);
    const hu = count(["és", "hogy", "vagy", "egy", "nem", "valamint", "munka", "jelentkezés", "számára"]);
    if (de > en && de > hu) return "German";
    if (hu > en && hu > de) return "Hungarian";
    return "English";
  }

  function scamSignals(text) {
    const s = [];
    if (/\b(registration|application|training|processing|placement) fee\b|\bpay (a|the|an) (fee|deposit)\b/i.test(text)) s.push("asks applicants to pay a fee");
    if (/\b(whatsapp|telegram|signal app)\b/i.test(text)) s.push("asks for contact via messaging app");
    if (/\b(crypto|bitcoin|western union|moneygram|gift cards?)\b/i.test(text)) s.push("mentions crypto/money transfer");
    if (/\b(earn up to|unlimited earning|work from home and earn|easy money|no experience (needed|required).{0,40}(€|\$|earn))\b/i.test(text)) s.push("too-good-to-be-true pay claims");
    return s;
  }

  // ---------- Description HTML ----------
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>');
  }

  function blockToHtml(lines) {
    const ls = lines.map((l) => l.replace(/\s+$/, "")).filter((l) => clean(l));
    let html = "";
    let i = 0;
    while (i < ls.length) {
      if (BULLET_RE.test(ls[i])) {
        html += "<ul>";
        while (i < ls.length && BULLET_RE.test(ls[i])) { html += "<li>" + linkify(clean(stripBullet(ls[i]))) + "</li>"; i++; }
        html += "</ul>";
        continue;
      }
      // run of short lines without terminal punctuation -> list (bullets lost in copy-paste)
      let j = i;
      while (j < ls.length && !BULLET_RE.test(ls[j]) && clean(ls[j]).length <= 160 && clean(ls[j]).split(" ").length >= 2 && !/[:]$/.test(clean(ls[j]))) j++;
      const run = ls.slice(i, j);
      const looksList = run.length >= 3 && run.filter((l) => !/[.!?]$/.test(clean(l)) || clean(l).length < 110).length >= run.length * 0.7 && run.every((l) => clean(l).length < 220);
      if (looksList) {
        html += "<ul>" + run.map((l) => "<li>" + linkify(clean(l).replace(/[;,]$/, "")) + "</li>").join("") + "</ul>";
        i = j;
        continue;
      }
      // paragraph: join consecutive lines that look like wrapped text
      let para = clean(ls[i]);
      i++;
      while (i < ls.length && !BULLET_RE.test(ls[i]) && !/[.!?:]$/.test(para) && /^[a-z(]/.test(clean(ls[i]))) { para += " " + clean(ls[i]); i++; }
      html += "<p>" + linkify(para) + "</p>";
    }
    return html;
  }

  function buildDescription(blocks, skipLines, extras) {
    let html = "";
    for (const b of blocks) {
      if (b.key === "apply") continue;
      const lines = b.lines.filter((l) => !skipLines.has(l));
      const body = blockToHtml(lines);
      if (!body && b.key === "intro") continue;
      if (b.label && body) html += `<h3>${esc(b.label)}</h3>`;
      html += body;
    }
    const facts = extras.filter(([, v]) => v && !html.includes(esc(v)));
    if (facts.length) {
      html += "<h3>Key details</h3><ul>" + facts.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${linkify(v)}</li>`).join("") + "</ul>";
    }
    return html;
  }

  // ---------- Main ----------
  function parse(raw, opts = {}) {
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const text = (raw || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[\u200b\ufeff]/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const lines = text.split("\n");
    const nonEmpty = lines.filter((l) => clean(l));
    const flags = [];

    const blocks = segment(lines);
    const sectionText = (key) => blocks.filter((b) => b.key === key).map((b) => b.lines.join("\n")).join("\n");
    const applyText = sectionText("apply");
    const reqText = [sectionText("req"), sectionText("nice")].join("\n");

    const titleHit = findTitle(nonEmpty);
    const t = shortenTitle(titleHit.title.replace(/\s*[|]\s*.*$/, (m) => (titleHit.title.length > FORM.titleMax ? "" : m)));
    const links = contactsAndLinks(text);
    const employer = findEmployer(text, nonEmpty, links.emails);
    const location = findLocation(text, nonEmpty);
    const deadline = findDeadline(text, today);
    const positions = findPositionTypes(text, titleHit.title);
    const experience = findExperience(text, titleHit.title, positions.types);
    const docs = findDocuments(text, applyText);
    const skillText = blocks.filter((b) => !["offer", "about", "apply"].includes(b.key)).map((b) => b.lines.join("\n")).join("\n");
    const skills = findSkills(employer.name ? skillText.split(employer.name).join(" ") : skillText, reqText);
    const languages = findLanguages(text);
    const degrees = findDegrees(text);
    const auth = findWorkAuth(text);
    const salary = findSalary(text);
    const lang = languageOfText(text);

    // How to apply
    let how = "";
    if (applyText.trim()) {
      how = applyText.split("\n").map(clean).filter(Boolean).map(stripBullet).join("\n");
    } else {
      const s = sentences(text).filter((x) => /\b(to apply|apply (via|through|online|here|at|by|now)|send (your|us|an?)|submit (your|an?)|applications? (should|must|can|are to) be|please apply|bewerben sie sich|senden sie|bewirb dich|jelentkez)/i.test(x));
      how = s.slice(0, 4).join("\n");
    }
    if (links.applyUrl && !how.includes(links.applyUrl.replace(/^https?:\/\//, ""))) how += (how ? "\n" : "") + "Apply here: " + links.applyUrl;
    how = how.replace(/(^|[\s(])(www\.[^\s)]+)/g, (m, p, u) => p + "https://" + u);
    if (deadline.iso && !/deadline/i.test(how)) {
      const d = new Date(deadline.iso + "T12:00:00Z");
      how += `\nDeadline: ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
    }

    // Resume method
    const methods = [];
    if (links.applyUrl) methods.push("Other (enter below)");
    if (links.applyEmail && !links.applyUrl) methods.push("Email");
    if (!methods.length && links.emails.length) methods.push("Email");
    if (!methods.length) methods.push("Other (enter below)");

    const resumeEmail = links.applyEmail || (methods.includes("Email") ? links.emails[0] || "" : "");

    // Description: drop title line and label lines that duplicate extracted fields
    const skip = new Set();
    if (titleHit.line) skip.add(titleHit.line);
    for (const l of lines) {
      const c = clean(stripBullet(l));
      if (/^(job title|position title|title|employer|company|organi[sz]ation|unternehmen)\s*[:–—-]/i.test(c)) skip.add(l);
      if (/^(job description|job posting|vacancy announcement|vacancy notice|we('|’)re hiring|now hiring|job offer|stellenausschreibung|stellenangebot|open position)\W*$/i.test(c)) skip.add(l);
      if (!applyText.trim() && c && (how.includes(c) || (links.applyUrl && c.includes(links.applyUrl.replace(/^https?:\/\//, ""))) || /^(applications? (close|closes|due)|deadline|closing date|apply (by|before|via|at|here|now|online))\b/i.test(c))) skip.add(l);
    }
    const contract = (text.match(/\b(fixed[- ]term|permanent|temporary|befristet|unbefristet|határozott idejű|határozatlan idejű)\b[^.\n]{0,80}/i) || [""])[0];
    const startM = text.match(/\b(?:start(?:ing)? date|start(?:s|ing)? (?:on|in|from)|eintritt|dienstbeginn)\s*:?\s*([^.;\n]{3,40})/i) || text.match(/\b(ab sofort)\b/i);
    const start = startM ? clean(startM[1]).replace(/[,(]+$/, "") : "";
    const hours = (text.match(/\b\d{1,2}(?:[.,]\d)?\s*(?:hours|hrs|stunden|wochenstunden)\s*(?:\/|per|a|pro)?\s*(?:week|woche)\b/i) || [""])[0];
    const extras = [
      ["Location", location.location + (location.mode ? ` (${location.mode.toLowerCase()})` : "")],
      ["Contract", clean(contract)],
      ["Hours", hours],
      ["Start", start],
      ["Pay", salary],
      ["Languages", languages],
    ];
    const description = buildDescription(blocks, skip, extras);

    // Flags
    if (!employer.name) flags.push("Employer not found. Fill it in by hand.");
    else if (employer.confidence !== "high") flags.push(`Employer "${employer.name}" is a guess (${employer.confidence} confidence). Check it.`);
    flags.push("Employer must already exist in Symplicity (search the Employer field); if not, add it via the Employer menu first.");
    if (!t.title) flags.push("Job title not found.");
    else if (titleHit.guessed) flags.push(`Job title "${t.title}" was pulled from the text, not a heading. Check it.`);
    if (t.original) flags.push(`Title shortened to fit 60 characters. Original: "${t.original}"`);
    if (!location.location) flags.push("Location not found.");
    else if (!location.fromLabel && location.others.length) flags.push(`Several places mentioned (${[location.location, ...location.others].join(", ")}). Check the location.`);
    if (!deadline.iso) flags.push(deadline.note ? deadline.note : "No application deadline found. Set an Expiration Date by hand.");
    else if (deadline.note) flags.push(deadline.note);
    if (deadline.iso && deadline.iso < today) flags.push("Deadline is in the past.");
    if (positions.guessed) flags.push("Position type guessed as Full Time; nothing explicit in the JD.");
    if (!links.applyUrl && !links.emails.length) flags.push("No application link or email found.");
    if (links.applyUrl && links.applyEmail) flags.push(`Both an apply link and an email (${links.applyEmail}) found. Pick the right route.`);
    if (lang !== "English") flags.push(`JD appears to be in ${lang}. Translate the title and description before posting.`);
    if (/\b(unpaid|no (remuneration|salary|stipend|compensation)|without (pay|remuneration)|unbezahlt|on a voluntary basis)\b/i.test(text)) flags.push("Looks unpaid. Check against your posting policy.");
    const scam = scamSignals(text);
    if (scam.length) flags.push("Possible scam signals: " + scam.join("; ") + ".");
    if (auth.note) flags.push(auth.note);
    if (/\bemail\b/i.test(how) && !links.emails.length) flags.push("Mentions email but no address was found.");

    return {
      form: FORM,
      position_types: positions.types,
      employer_name: employer.name,
      job_title: t.title,
      description_html: description,
      location: location.location,
      location_mode: location.mode,
      posting_date: today,
      expiration_date: deadline.iso,
      resume_submission_methods: methods,
      experience_required: experience.bands,
      experience_quote: experience.quote,
      how_to_apply: how.trim(),
      application_url: links.applyUrl,
      resume_email: resumeEmail,
      all_emails: links.emails,
      optional_documents: docs.optional,
      required_documents: docs.required,
      document_notes: docs.notes,
      skills,
      work_authorization: auth.codes,
      degree_levels: degrees,
      languages,
      salary,
      flags,
    };
  }

  const api = { parse, FORM, _internal: { findDates, findDeadline, shortenTitle, headingOf, segment } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JDParser = api;
})(typeof window !== "undefined" ? window : globalThis);

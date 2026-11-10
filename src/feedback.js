// "개발자에게 한마디": sends feedback from the settings panel to a Google Form.
//
// The form's responses land in the developer's Google Sheet. Besides what the
// user typed (type, title, body, optional name) only the app version and the
// OS name/version are sent. Nothing is sent until the user presses 보내기.
//
// Set OWE_FAKE_FEEDBACK=ok (or =fail) to preview the UI without sending.
const { app, net } = require('electron');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSctNf8J-nGQBdKmgSntebZdzn-wFXKVEk6rLstgSL2Mk8ALTw/formResponse';
// entry ids of the form's questions (유형, 제목, 내용, 이름, 버전, OS)
const ENTRY = {
  type: 'entry.1790107439',
  title: 'entry.16796302',
  body: 'entry.2092761065',
  name: 'entry.858993137',
  version: 'entry.1194715563',
  os: 'entry.2062256336',
};
const TYPES = ['버그', '아이디어', '칭찬', '기타'];
const LIMIT = { title: 100, body: 2000, name: 40 };
const TIMEOUT_MS = 15 * 1000;
const MIN_GAP_MS = 5 * 1000; // ignore double clicks / accidental repeats

let lastSent = 0;
let sending = false;

function osLabel() {
  const name = { win32: 'Windows', darwin: 'macOS' }[process.platform] || process.platform;
  return `${name} ${process.getSystemVersion()}`;
}

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

async function send(input) {
  const data = input && typeof input === 'object' ? input : {};
  const title = clean(data.title, LIMIT.title);
  const body = clean(data.body, LIMIT.body);
  if (!title || !body) return { ok: false, reason: 'empty' };
  if (sending || Date.now() - lastSent < MIN_GAP_MS) return { ok: false, reason: 'busy' };

  const fields = {
    [ENTRY.type]: TYPES.includes(data.type) ? data.type : '기타',
    [ENTRY.title]: title,
    [ENTRY.body]: body,
    [ENTRY.name]: clean(data.name, LIMIT.name),
    [ENTRY.version]: app.getVersion(),
    [ENTRY.os]: osLabel(),
  };

  sending = true;
  try {
    const fake = process.env.OWE_FAKE_FEEDBACK;
    if (fake) {
      await new Promise((r) => setTimeout(r, 900));
      if (fake === 'fail') throw new Error('fake failure');
    } else {
      const res = await net.fetch(FORM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`form ${res.status}`);
    }
    lastSent = Date.now();
    return { ok: true };
  } catch (e) {
    console.warn('feedback failed:', e.message); // offline, timeout, form closed
    return { ok: false, reason: 'network' };
  } finally {
    sending = false;
  }
}

module.exports = { send, TYPES, LIMIT };

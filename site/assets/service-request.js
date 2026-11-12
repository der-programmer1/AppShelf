export const WEBSITE_PRICE = 350;
export const WEBSITE_TYPES = Object.freeze({
  portfolio: 'Persönliches Portfolio oder Bewerbungsseite',
  hobby: 'Hobby oder Leidenschaft',
  projekt: 'Eigenes Projekt',
  andere: 'Andere persönliche Website'
});

const oneLine = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

export function prepareInquiry(fields) {
  const name = oneLine(fields.name);
  const email = oneLine(fields.email);
  const kind = Object.hasOwn(WEBSITE_TYPES, fields.kind) ? WEBSITE_TYPES[fields.kind] : null;
  const description = String(fields.description ?? '').replace(/\r\n?/g, '\n').trim();
  const timeline = oneLine(fields.timeline);
  if (!name || name.length > 80) throw new TypeError('Bitte gib deinen Namen an.');
  if (!kind) throw new TypeError('Bitte wähle die Art deiner Website.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('Bitte prüfe deine E-Mail-Adresse.');
  if (email.length > 160 || timeline.length > 120) throw new TypeError('Bitte kürze deine Angaben.');
  if (description.length < 20 || description.length > 1500) throw new TypeError('Beschreibe deine Idee bitte mit 20 bis 1500 Zeichen.');
  const subject = `Website-Anfrage: ${kind} · ${WEBSITE_PRICE} € einmalig`;
  const body = [
    'Hallo Patrice,', '',
    'ich interessiere mich für eine persönliche Website und möchte die Details unverbindlich mit dir klären.', '',
    `Name: ${name}`,
    ...(email ? [`Antwortadresse: ${email}`] : []),
    `Art der Website: ${kind}`,
    `Wunschtermin: ${timeline || 'Noch offen'}`, '',
    'Meine Idee:', description, '',
    `Angefragtes Paket: ${WEBSITE_PRICE} € einmalig für eine Seite mit bis zu fünf Inhaltsbereichen, mobiloptimierter Gestaltung, einer Korrekturrunde sowie Veröffentlichung und Dateiübergabe.`,
    'Texte und Bilder stelle ich bereit. Umfang, Termin und mögliche externe Domain- oder Hostingkosten möchte ich vor einer Beauftragung abstimmen.', '',
    'Viele Grüße', name
  ].join('\n');
  return {subject, body};
}

export function createMailto(recipient, inquiry) {
  if (!/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient)) throw new TypeError('Ungültige Kontaktadresse.');
  return `mailto:${recipient}?subject=${encodeURIComponent(inquiry.subject)}&body=${encodeURIComponent(inquiry.body)}`;
}

export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  try {
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch { return false; }
}

export function initializeInquiries(doc) {
  doc.querySelectorAll('[data-inquiry]').forEach(section => {
    const form = section.querySelector('form');
    const preview = section.querySelector('[data-request-preview]');
    const message = section.querySelector('[data-prepared-message]');
    const mailLink = section.querySelector('[data-prepared-mail]');
    const status = section.querySelector('[data-inquiry-status]');
    const email = section.dataset.contactEmail;
    form.hidden = false;
    form.addEventListener('input', () => {
      if (!preview.hidden) {
        preview.hidden = true;
        status.textContent = 'Deine Angaben wurden geändert. Bereite die Anfrage erneut vor.';
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      try {
        const fields = Object.fromEntries(new FormData(form));
        const inquiry = prepareInquiry(fields);
        mailLink.href = createMailto(email, inquiry);
        message.value = inquiry.body;
        preview.hidden = false;
        status.textContent = 'Deine Anfrage ist vorbereitet. Prüfe den Text und öffne ihn als E-Mail oder kopiere ihn. Versendet wird erst in deiner Mail-App.';
        preview.scrollIntoView({block:'nearest', behavior:'auto'});
      } catch (error) {
        status.textContent = error.message;
      }
    });
    section.querySelector('[data-copy-request]').addEventListener('click', async () => {
      if (await copyText(message.value)) {
        status.textContent = `Anfragetext kopiert. Füge ihn in eine E-Mail an ${email} ein.`;
      } else {
        message.focus(); message.select();
        status.textContent = 'Der Text ist markiert. Kopiere ihn über das Menü oder mit Strg/Cmd+C und füge ihn in deine E-Mail ein.';
      }
    });
  });
}

if (typeof document !== 'undefined') initializeInquiries(document);

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareInquiry, createMailto, copyText} from '../site/assets/service-request.js';

const fields = {name:'Mia Müller', email:'mia+projekt@example.org', kind:'hobby', description:'Ich möchte meine Zeichnungen und mein Hobby auf einer eigenen Website vorstellen.', timeline:'Im Frühjahr, flexibel'};

test('an inquiry keeps personal details and the agreed package in a readable email draft', () => {
  const {subject, body} = prepareInquiry(fields);
  assert.match(subject, /350 € einmalig/);
  assert.ok(body.includes(fields.name));
  assert.ok(body.includes(fields.description));
  assert.ok(body.includes(fields.timeline));
  assert.ok(body.includes(fields.email));
  assert.match(body, /unverbindlich/);
  assert.match(body, /Domain- oder Hostingkosten/);
});
test('special characters and multiple lines round-trip through the email link', () => {
  const details = prepareInquiry({...fields, description:'Zeichnungen & Fotos? Ja!\nMit Umlauten: äöü und einem #Projekt. <Text bleibt Text>'});
  const uri = new URL(createMailto('ich.der.programmer@gmail.com', details));
  assert.equal(uri.protocol, 'mailto:');
  assert.equal(uri.pathname, 'ich.der.programmer@gmail.com');
  assert.equal(uri.searchParams.get('subject'), details.subject);
  assert.equal(uri.searchParams.get('body'), details.body);
  assert.deepEqual([...uri.searchParams.keys()].sort(), ['body','subject']);
});
test('optional reply address and date can stay empty', () => {
  const result = prepareInquiry({...fields, email:'', timeline:''});
  assert.doesNotMatch(result.body, /Antwortadresse:|undefined/);
  assert.match(result.body, /Wunschtermin: Noch offen/);
});
test('incomplete and unsupported requests cannot produce an email draft', () => {
  for (const change of [{name:''},{name:'x'.repeat(81)},{kind:'invalid'},{kind:'toString'},{email:'broken-address'},{description:'zu kurz'},{description:'x'.repeat(1501)}]) {
    assert.throws(() => prepareInquiry({...fields, ...change}), TypeError);
  }
});
test('a recipient cannot inject query parameters or email headers', () => {
  const inquiry = prepareInquiry(fields);
  for (const recipient of ['a@example.org?cc=other@example.org','a@example.org\r\nBcc: x@example.org','x?subject=oops@example.org','javascript:alert(1)']) {
    assert.throws(() => createMailto(recipient, inquiry), TypeError);
  }
});
test('names and requested dates cannot add misleading field lines', () => {
  const result = prepareInquiry({...fields, name:'Mia\r\nName', timeline:'Montag\noder Dienstag'});
  assert.match(result.body, /Name: Mia Name\n/);
  assert.match(result.body, /Wunschtermin: Montag oder Dienstag\n/);
});
test('copy success is reported only after the clipboard write succeeds', async () => {
  const written = [];
  assert.equal(await copyText('Meine Anfrage', {writeText:async text=>written.push(text)}), true);
  assert.deepEqual(written, ['Meine Anfrage']);
  assert.equal(await copyText('Meine Anfrage', {writeText:async()=>{throw new Error('denied');}}), false);
  assert.equal(await copyText('Meine Anfrage', null), false);
});
test('the offer exposes a direct email route even without the optional request helper', async () => {
  const html = await readFile(new URL('../site/angebot.html', import.meta.url), 'utf8');
  assert.match(html, /href="mailto:ich\.der\.programmer@gmail\.com\?subject=/);
  assert.match(html, /data-contact-email="ich\.der\.programmer@gmail\.com"/);
  assert.match(html, /<form[^>]*hidden[^>]*aria-label="Website-Anfrage vorbereiten"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /readonly rows="10"/);
});

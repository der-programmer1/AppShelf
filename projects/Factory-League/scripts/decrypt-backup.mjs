import {readFile,writeFile} from 'node:fs/promises';
import {privateDecrypt,createDecipheriv,constants} from 'node:crypto';
const [source,keyPath,destination]=process.argv.slice(2);if(!source||!keyPath||!destination)throw new Error('Usage: node scripts/decrypt-backup.mjs BACKUP.flbackup PRIVATE-KEY.pem NEW.json');
const envelope=JSON.parse(await readFile(source,'utf8'));if(envelope.version!==2||envelope.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM')throw new Error('Unknown backup format.');
const key=privateDecrypt({key:await readFile(keyPath),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.key,'base64'));
const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
const data=Buffer.concat([cipher.update(Buffer.from(envelope.data,'base64')),cipher.final()]),backup=JSON.parse(data.toString());
if(backup.format!=='factory-league-backup'||backup.version!==2)throw new Error('Invalid Factory League backup.');
await writeFile(destination,data,{flag:'wx',mode:0o600});console.log('Decrypted backup:',destination);

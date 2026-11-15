import{readFile,writeFile,access}from"node:fs/promises";
import{createDecipheriv,privateDecrypt,constants}from"node:crypto";
const[backupPath,privateKeyPath,destination]=process.argv.slice(2);
if(!backupPath||!privateKeyPath||!destination)throw new Error("Usage: node scripts/decrypt-backup.mjs BACKUP.flbackup PRIVATE-KEY.pem NEW.sqlite");
try{await access(destination);throw new Error("Destination exists. Choose a new filename.");}catch(error){if(error.code!=="ENOENT")throw error;}
const envelope=JSON.parse(await readFile(backupPath,"utf8"));if(envelope.version!==1||envelope.algorithm!=="RSA-OAEP-SHA256+AES-256-GCM")throw new Error("Unknown backup format.");
const key=privateDecrypt({key:await readFile(privateKeyPath),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},Buffer.from(envelope.key,"base64"));
const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
const data=Buffer.concat([decipher.update(Buffer.from(envelope.data,"base64")),decipher.final()]);
if(data.subarray(0,15).toString()!=="SQLite format 3")throw new Error("Decrypted data is not a SQLite backup.");
await writeFile(destination,data,{flag:"wx",mode:0o600});console.log(`Backup decrypted: ${destination}`);

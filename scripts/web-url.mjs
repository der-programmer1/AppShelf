/** Optional public website for a web app hosted outside the catalogue. */
export function publicWebUrl(manifest, slug) {
  if (manifest.webUrl === undefined) return "";
  let url;
  try { url = new URL(manifest.webUrl); } catch { /* Report the manifest field below. */ }
  if (typeof manifest.webUrl !== "string" || !url || url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${slug}: webUrl must be an absolute public HTTPS URL without credentials`);
  }
  if (manifest.demoDir) throw new Error(`${slug}: choose webUrl or demoDir, not both`);
  return url.href;
}

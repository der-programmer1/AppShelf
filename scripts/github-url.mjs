const repositoryUrl = /^https:\/\/github\.com\/[a-z0-9][a-z0-9-]*\/(?!\.{1,2}\/?$)[a-z0-9_.-]+\/?$/i;

export function publicGithubUrl(manifest, slug) {
  const { githubPrivate, githubUrl } = manifest;
  if (githubPrivate !== undefined && typeof githubPrivate !== "boolean") {
    throw new Error(`${slug}: githubPrivate must be a boolean`);
  }
  if (githubPrivate || githubUrl == null || githubUrl === "") return "";
  if (typeof githubUrl !== "string" || !repositoryUrl.test(githubUrl)) {
    throw new Error(`${slug}: githubUrl must be a public GitHub repository URL`);
  }
  return githubUrl;
}

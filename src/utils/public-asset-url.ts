/** Resolve bundled public character images under the Vite base path (including GitHub Pages). */
export function publicAssetUrl(url: string | undefined): string {
  if (!url || !url.startsWith('/characters/')) return url ?? '';
  return `${import.meta.env.BASE_URL}${url.slice(1)}`;
}

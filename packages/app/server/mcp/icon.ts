// Icons are displayed as images, never injected as markup. Prefer the light-theme
// variant for the town's cream background; leave absent/unsupported icons unset.
export function serverIcon(icons: readonly { src: string; theme?: "light" | "dark" | undefined }[] = []): string | undefined {
  for (const icon of [...icons].sort((a, b) => Number(a.theme === "dark") - Number(b.theme === "dark"))) {
    if (icon.src.length > 100000) continue
    if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/.test(icon.src)) return icon.src
    try {
      const url = new URL(icon.src)
      if (url.protocol === "https:" && !url.username && !url.password) return url.href
    } catch { /* Missing or malformed icon: try the next advertised variant. */ }
  }
}

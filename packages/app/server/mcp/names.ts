// Keep package and method names safe to use with JavaScript dot notation, including
// sandbox globals and object/prototype names. Collisions get stable numeric suffixes.
const reserved = new Set(("await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield arguments eval constructor prototype __proto__ then workspace packages console JSON Math Object Array Promise undefined NaN Infinity globalThis fetch").split(" "))
export function uniqueName(label: string, used: Set<string>) {
  let base = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_$]+/g, "_").replace(/^_+|_+$/g, "") || "package"
  if (!/^[a-zA-Z_$]/.test(base) || reserved.has(base)) base = `mcp_${base}`
  let name = base
  for (let suffix = 2; used.has(name); suffix++) name = `${base}_${suffix}`
  used.add(name)
  return name
}

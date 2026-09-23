// Providers may fill unused optional arguments with null. Accept that at the
// schema boundary so the tool handlers can normalize null to an omitted value.
export const toolSchema = (
  properties: Record<string, unknown>,
  required: readonly string[] = []
) => ({
  type: "object",
  properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [
    key,
    required.includes(key) ? value : { anyOf: [value, { type: "null" }] }
  ])),
  required,
  additionalProperties: false
})

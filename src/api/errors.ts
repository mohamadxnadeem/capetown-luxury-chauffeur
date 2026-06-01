import { AxiosError } from "axios";

// Django REST Framework validation errors arrive in arbitrarily nested shapes:
//   "a plain string"
//   ["list", "of", "strings"]
//   { field: ["error message"], other: ["error"] }
//   { days: [ { date: ["This field is required."] }, {}, ... ] }  ← nested
//                                                          list serializer
// A naive `.join()` turns the nested objects into "[object Object]". This
// flattens any shape into readable "field: message" lines.
function flatten(value: unknown, prefix: string): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return [prefix ? `${prefix}: ${value}` : value];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [prefix ? `${prefix}: ${value}` : String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => {
      // Index into the prefix only when the item is itself an object (e.g.
      // each entry in days[]). Arrays of plain strings keep the flat prefix.
      const childPrefix =
        item !== null && typeof item === "object"
          ? `${prefix}[${i + 1}]`
          : prefix;
      return flatten(item, childPrefix);
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([k, v]) => {
        // "non_field_errors" and "detail" are DRF's generic buckets — their
        // messages are self-explanatory, so don't prepend the key name.
        const skipKey = k === "non_field_errors" || k === "detail";
        const childPrefix = skipKey ? prefix : prefix ? `${prefix} → ${k}` : k;
        return flatten(v, childPrefix);
      }
    );
  }
  return [];
}

// Turns any thrown error (axios or otherwise) into a human-readable string
// suitable for an Alert. Surfaces DRF field errors instead of "[object Object]".
export function formatApiError(err: unknown): string {
  const axiosErr = err as AxiosError;
  const status = axiosErr?.response?.status;

  // Expired / invalid JWT — show a plain "log in again" message rather than
  // the raw token_not_valid dump.
  if (status === 401) {
    return "Your session has expired. Please log in again.";
  }

  const resp = axiosErr?.response?.data;
  if (resp != null) {
    const lines = flatten(resp, "");
    if (lines.length > 0) return lines.join("\n");
  }
  const message = (err as Error)?.message;
  return message || "Unknown error";
}

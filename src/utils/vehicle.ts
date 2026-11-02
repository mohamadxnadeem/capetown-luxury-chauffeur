// Label used wherever a vehicle is picked or shown: "<title>  ·  <plate>".
// The plate is omitted when empty.
export function vehicleLabel(v: {
  title: string;
  registration_number?: string | null;
}): string {
  return `${v.title}${v.registration_number ? `  ·  ${v.registration_number}` : ""}`;
}

/**
 * Client naming helpers.
 *
 * Clients have a company/brand ("Lending with Nick") and a contact person
 * ("Nick Smith"). Everywhere we surface a client we want:
 *   "Lending with Nick (Nick Smith)"
 * falling back gracefully when one of the two is missing or duplicated.
 */
type ClientLike = {
  name?: string | null;
  brand?: string | null;
  ghlName?: string | null;
  ghl_name?: string | null;
  contact_name?: string | null;
};

const norm = (v?: string | null) => (v ?? "").trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Company / brand name only. */
export function clientBrandName(c: ClientLike): string {
  return norm(c.brand) || norm(c.ghlName) || norm(c.ghl_name) || norm(c.name);
}

/** Contact person's first & last name, when it differs from the brand. */
export function clientContactName(c: ClientLike): string {
  const person = norm(c.contact_name) || norm(c.name);
  const brand = clientBrandName(c);
  if (!person || (brand && same(person, brand))) return "";
  return person;
}

/**
 * Everything a user might type when looking for a client: brand, business
 * name, the contact person, the GHL sub-account name, email and location id.
 */
export function clientSearchHaystack(c: any): string {
  return [
    c?.name,
    c?.brand,
    c?.contactName,
    c?.contact_name,
    c?.accountName,
    c?.account_name,
    c?.ghlName,
    c?.ghl_name,
    c?.email,
    c?.ghlLocationId,
    c?.ghl_location_id,
    clientDisplayName(c ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** "Brand (First Last)" — the canonical client label. */
export function clientDisplayName(c: ClientLike): string {
  const brand = clientBrandName(c);
  const person = clientContactName(c);
  if (brand && person) return `${brand} (${person})`;
  return brand || person;
}

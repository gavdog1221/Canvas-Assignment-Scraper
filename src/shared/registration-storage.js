// Registration data (RAC code, term code, CRN list) is saved from the
// Registration tab in the dashboard widget (mycourses.unh.edu /
// unh.instructure.com) but needs to be read on a completely different
// origin (webcat.unh.edu) by the autofill content script. localStorage is
// per-origin and wouldn't be visible there, so this uses
// browser.storage.local instead, which is shared across the whole
// extension. Requires the "storage" permission in manifest.json.
//
// Imported by both src/content (dashboard bundle) and src/registration
// (WebCat autofill bundle) -- kept dependency-free so it works in either.

const KEY = 'yace_registration_data';

const EMPTY = { racCode: '', term: '', crns: [''] };

function sanitize(data) {
  return {
    racCode: typeof data?.racCode === 'string' ? data.racCode : '',
    term: typeof data?.term === 'string' ? data.term.trim() : '',
    crns: Array.isArray(data?.crns) && data.crns.length ? data.crns : [''],
  };
}

export async function getRegistrationData() {
  try {
    const result = await browser.storage.local.get(KEY);
    return sanitize(result[KEY]);
  } catch (e) {
    console.warn('[YACE] Failed to read registration data:', e);
    return { ...EMPTY };
  }
}

export async function saveRegistrationData(data) {
  const toSave = {
    racCode: typeof data.racCode === 'string' ? data.racCode : '',
    term: typeof data.term === 'string' ? data.term.trim() : '',
    crns: Array.isArray(data.crns) ? data.crns.map(c => c.trim()).filter(Boolean) : [],
  };
  try {
    await browser.storage.local.set({ [KEY]: toSave });
    return true;
  } catch (e) {
    console.warn('[YACE] Failed to save registration data:', e);
    return false;
  }
}

export async function clearRegistrationData() {
  try {
    await browser.storage.local.remove(KEY);
    return true;
  } catch (e) {
    console.warn('[YACE] Failed to clear registration data:', e);
    return false;
  }
}

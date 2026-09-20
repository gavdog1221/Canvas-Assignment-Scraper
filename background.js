const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
// University of New Hampshire (all campuses) — RMP global ID (legacyId 1231).
const RMP_SCHOOL_ID = 'U2Nob29sLTEyMzE=';
const RMP_TEACHER_QUERY = `query TeacherSearch($query: TeacherSearchQuery!, $first: Int) {
  newSearch {
    teachers(query: $query, first: $first) {
      resultCount
      edges { node { id legacyId firstName lastName avgRatingRounded avgDifficultyRounded numRatings wouldTakeAgainPercentRounded wouldTakeAgainCount department teacherRatingTags { tagName tagCount } school { id legacyId name } } }
    }
  }
}`;

browser.runtime.onMessage.addListener((request) => {
    if (request.type === 'FETCH_RMP') {
        return (async () => {
            try {
                const res = await fetch(RMP_GRAPHQL_URL, {
                    method: 'POST',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic dGVzdDp0ZXN0',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        query: RMP_TEACHER_QUERY,
                        variables: {
                            query: { text: String(request.text || ''), schoolID: RMP_SCHOOL_ID, fallback: true },
                            first: 10
                        }
                    })
                });
                if (!res.ok) return { success: false, error: `Rate My Professor returned HTTP ${res.status}` };
                const json = await res.json();
                const edges = (((json.data || {}).newSearch || {}).teachers || {}).edges || [];
                return { success: true, teachers: edges.map(e => e.node) };
            } catch (e) {
                return { success: false, error: String((e && e.message) || e) };
            }
        })();
    }

    if (request.type === 'FETCH_DINING_HOURS') {
        return (async () => {
            try {
                const res = await fetch('https://www.unh.edu/dining/facilities/hours', { credentials: 'omit' });
                if (res.ok) {
                    const html = await res.text();
                    return { success: true, html };
                }
            } catch (e) {
                console.warn('[YACE] Failed to fetch live UNH hours:', e);
            }
            return { success: false };
        })();
    }

    if (request.type === 'FETCH_DINING_MENU') {
        return (async () => {
            const locationNum = request.locationNum || 80;
            const cleanLocName = encodeURIComponent((request.locationName || 'Holloway Commons').replace(/\+/g, ' '));
            const now = new Date();
            const dtdate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

            // Try with and without dtdate (FoodPro often returns 404/blank if dtdate format doesn't match its server setting)
            const urls = [
                `https://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}&dtdate=${encodeURIComponent(dtdate)}`,
                `https://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}`,
                `http://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}&dtdate=${encodeURIComponent(dtdate)}`,
                `http://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}`
            ];

            for (const url of urls) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);

                    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
                    clearTimeout(timer);

                    if (res.ok) {
                        const html = await res.text();
                        if (html && html.includes('shortmenurecipes')) {
                            return { success: true, html };
                        }
                    }
                } catch (e) {}
            }

            return { success: false, error: 'Could not reach FoodPro.' };
        })();
    }
});

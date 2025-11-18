// ==UserScript==
// @name         Jira PR Badges
// @version      1.14
// @description  Adds badges to tickets in jira scrum board to indicate pull request status and whether work needs to be logged, fix versions set etc
// @match        https://jira.orionhealth.global/secure/RapidBoard.jspa?rapidView=3198*
// ==/UserScript==

const VERSION = "1.14"; // Ensure this matches the metadata at the top.

const ERROR_LIMIT = 20; // Number of errors before we stop this script.
let errorCount = 0;

const BADGE_TYPES = {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    MERGED: 'MERGED',
    LOG_WORK: 'LOG_WORK',
    PUBLICATION: 'PUBLICATION',
    FIX_VERSION: 'FIX_VERSION',
    NO_COMPONENT: 'NO_COMPONENT',
    BLOCKED: 'BLOCKED'
};

// refer to https://aui.atlassian.com/aui/7.4/docs/lozenges.html for class names, though the Orion styles appear to differ
const BADGE_CLASSES = {
    OPEN: 'aui-lozenge-current',
    IN_PROGRESS: 'aui-lozenge-complete',
    MERGED: 'aui-lozenge-success',
    LOG_WORK: 'aui-lozenge-error',
    PUBLICATION: 'aui-lozenge-error',
    FIX_VERSION: 'aui-lozenge-error',
    NO_COMPONENT: 'aui-lozenge-error',
    BLOCKED: 'aui-lozenge-error',
};

const BADGE_TEXT = {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN PROGRESS',
    MERGED: 'MERGED',
    LOG_WORK: 'LOG WORK',
    PUBLICATION: 'PUBLICATION',
    FIX_VERSION: 'FIX VERSION',
    NO_COMPONENT: 'NO COMPONENT',
    BLOCKED: 'BLOCKED',
};

const BADGES_IN_TOP_SUMMARY = [
    BADGE_TYPES.OPEN, 
    BADGE_TYPES.FIX_VERSION, 
    BADGE_TYPES.LOG_WORK, 
    BADGE_TYPES.NO_COMPONENT, 
    BADGE_TYPES.PUBLICATION,
];

const badgesCache = new Map(); // : <string, Set>
let badgesCacheLastUpdated = 0;

const cache = (ticketKey, badges) => {
    const now = new Date();
    badgesCache.set(ticketKey, badges);
    badgesCacheLastUpdated = now;
};

const clearCacheIfExpired = () => {
    const expiry = 1000 * 60 * 30; // 30 mins
    const elapsed = new Date() - badgesCacheLastUpdated;
    if (elapsed > expiry) {
        badgesCache.clear();
    }
};

const CONCURRENT_MAX_REQUESTS = 10;
let concurrentRequests = 0;

const fetchBadgesAndStoreInCache = (ticketKey) => {
    if (concurrentRequests >= CONCURRENT_MAX_REQUESTS) {
        return Promise.resolve(new Set()); // skip this one till next time - don't want too many concurrent requests at a time.
    }
    concurrentRequests++;

    cache(ticketKey, new Set()); // store empty entry in cache immediately so we don't get multiple async fetches for the same ticket
    const badges = new Set();

    return fetch(`https://jira.orionhealth.global/rest/api/latest/issue/${ticketKey}`).then(response => {
        return response.json();

    }).then(responseJson => {
        const ticketId = responseJson.id; // eg 123456
        const issueType = responseJson.fields.issuetype?.name;
        const status = responseJson.fields.status?.name;
        const resolution = responseJson.fields.resolution?.name;
        const ticketFinished = (status === 'Resolved' || status === 'Closed');
        const ticketWasDone = (resolution === 'Fixed' || resolution === 'Done');
        const labels = responseJson.fields.labels;

        // If this is a bug, improvement or support request, we want there to be work logged once the ticket is resolved
        if (issueType === 'Bug' || issueType === 'Improvement' || issueType === 'Support Request') {
            if (!responseJson.fields.worklog?.worklogs.length > 0) {
                if (ticketFinished) {
                    badges.add(BADGE_TYPES.LOG_WORK);
                }
            }
        }
        // If this is a bug, show a badge if publication is not specified or it is publicise or 'publicise in detail' without a public description.
        if (issueType === 'Bug' && ticketFinished) {
            const publication = responseJson.fields.customfield_10055?.value;
            const publicDescription = responseJson.fields.customfield_10051;
            const publicationNotSpecified = publication === "Not Specified";
            const publicationNeeded = (publication === "Publicise" || publication === "Publicise in Detail") && !publicDescription;
            if (publicationNotSpecified || publicationNeeded) {
                badges.add(BADGE_TYPES.PUBLICATION);
            }
        }
        // If this is a bug, improvement or story, show a badge if there is no fix version, and only if the ticket is finished and only if the resolution is Fixed or Done
        if ((issueType === 'Bug' || issueType === 'Improvement' || issueType === 'Story') && ticketFinished && ticketWasDone) {
            if (!responseJson.fields.fixVersions.length > 0) {
                badges.add(BADGE_TYPES.FIX_VERSION);
            }
        }

        // If this is a bug, improvement or story and there is no component, show a badge
        if ((issueType === 'Bug' || issueType === 'Improvement' || issueType === 'Story')) {
            if (!responseJson.fields.components.length > 0) {
                badges.add(BADGE_TYPES.NO_COMPONENT);
            }
        }

        // if blocked, add the blocked badge
        if(labels.includes('blocked')) {
            badges.add(BADGE_TYPES.BLOCKED);
        }

        // TODO - using the proper jira integration it should be this URL, but since the gitlab move we now need to use a proxy integration for it instead:
        // return fetch(`https://jira.orionhealth.global/rest/dev-status/1.0/issue/detail?issueId=${ticketId}&applicationType=stash&dataType=pullrequest`);
        return fetch(`https://cbr-build:3143/${ticketKey}`);

    }).then(response => {
        return response.json();

    }).then(responseJson => {
        if (responseJson?.errors?.length > 0) {
            throw 'Errors detected in response for ' + ticketKey + '. Will retry. The errors are: ' + responseJson?.errors?.map?.(err => err?.error);
        }
        const prList = responseJson?.detail?.[0]?.pullRequests;
        prList.forEach(pr => {
            if (pr.status === 'OPEN') {
                if (!pr.reviewers?.length) {
                    badges.add(BADGE_TYPES.OPEN);
                } else {
                    badges.add(BADGE_TYPES.IN_PROGRESS);
                }
            } else if (pr.status === 'MERGED') {
                badges.add(BADGE_TYPES.MERGED);
            }
        });
        cache(ticketKey, badges);
        return badges;

    }).catch((err) => {
        cache(ticketKey, undefined); // clear this entry from the cache so it'll try to fetch again on the next pass
        errorCount++;
        console.error(err + ' (' + errorCount + ')');
        return new Set();
    }).finally(() => {
        concurrentRequests--;
    });
};

const fetchBadgesOrGetFromCache = (ticketKey) => {
    const cached = badgesCache.get(ticketKey);
    if (cached) {
        return Promise.resolve(cached);
    }
    return fetchBadgesAndStoreInCache(ticketKey);
};

const addBadge = (ticket, keySelector) => {
    const ticketKey = ticket.querySelector(keySelector)?.innerText; // eg MEM-1234
    if (!ticketKey) {
        return;
    }
    const ticketAlreadyHasBadges = ticket.querySelector('.fancy-badge');
    if (ticketAlreadyHasBadges && badgesCache.get(ticketKey)) {
        return; // ticket is cached and already present
    }
    fetchBadgesOrGetFromCache(ticketKey).then(badges => {
        ticket.querySelectorAll('.fancy-badge').forEach(badge => badge.parentNode.removeChild(badge));
        badges.forEach(badge => {
            ticket.innerHTML += ` <span class="fancy-badge aui-lozenge ${BADGE_CLASSES[badge]}">${BADGE_TEXT[badge]}</span>`
        });
    }).catch((err) => console.error(err));
};

const addBadges = () => {
    clearCacheIfExpired();
    const tickets = document.querySelectorAll('.ghx-issue-fields');
    const parentTickets = document.querySelectorAll('.ghx-heading');
    tickets.forEach(ticket => addBadge(ticket, '.ghx-key'));
    parentTickets.forEach(parentTicket => addBadge(parentTicket, '.ghx-parent-key'));
};

const addMetadata = () => {
    const containerClass = 'fancy-badges-metadata';
    if (document.querySelector('.' + containerClass)) {
        return;
    }
    const metadata = document.createElement('span');
    metadata.className = containerClass;
    metadata.innerHTML = 'Jira Badges™ ' + VERSION;
    metadata.style = 'float:right; line-height:30px; font-style:italic; font-size:10px';
    document.querySelector('.ghx-controls-work')?.append(metadata);

    // Re-style the header collapse button because it uses absolute positioning which clashes with what we want to do here:
    const headerCollapseButton = document.querySelector('.ghx-controls-work .ghx-compact-toggle')
    if (headerCollapseButton) {
        headerCollapseButton.style = "position:initial; float:right; margin-left:10px";
    };
};

const getBadgeSummaryHTML = (frequencyMap, badgeType) => {
    const count = frequencyMap.get(badgeType);
    if (!count) {
        return;
    }
    return `<span class="fancy-badge aui-lozenge ${BADGE_CLASSES[badgeType]}">${BADGE_TEXT[badgeType]} ${count}</span>`;
};

const addBadgesSummary = () => {
    const containerClass = "fancy-badges-summary";
    const oldBadgesSummary = document.querySelector("." + containerClass);
    const newBadgesSummary = document.createElement("span");
    newBadgesSummary.className = containerClass;
    const frequencyMap = new Map();
    for (const badges of badgesCache.values()) {
        for (const badge of badges) {
            frequencyMap.set(badge, (frequencyMap.get(badge) || 0) + 1);
        }
    }
    newBadgesSummary.innerHTML = BADGES_IN_TOP_SUMMARY.map((badgeType) =>  getBadgeSummaryHTML(frequencyMap, badgeType)).join(" ");
    newBadgesSummary.style = "float:right; line-height:30px; margin-right: 10px; font-size:12px";
    if (oldBadgesSummary === null) {
        document.querySelector(".ghx-controls-work")?.append(newBadgesSummary);
    } else {
        document.querySelector(".ghx-controls-work")?.replaceChild(newBadgesSummary, oldBadgesSummary);
    }
};

const addError = () => {
    const containerClass = 'fancy-badges-error';
    if (document.querySelector('.' + containerClass)) {
        return;
    }
    const error = document.createElement('span');
    error.className = containerClass;
    error.style = 'float:right; line-height:30px; margin-right:10px; color: red';
    error.innerHTML = 'Error';
    document.querySelector('.ghx-controls-work')?.append(error);
};

const onScrumBoard = () => {
    const viewParams = new URLSearchParams(window.location.search).get('view');
    return viewParams === null || viewParams === 'detail';
}

const main = () => {
    setTimeout(function() {
        if (onScrumBoard()) {
            addMetadata();
            addBadges();
            addBadgesSummary();
        }
        if (errorCount < ERROR_LIMIT) {
            main();
        } else {
            console.error("Detected too many errors - stopping");
            addError();
        }
    }, 2000);
};

setTimeout(function() {
    main();
}, 2000); // extra initial wait for page load
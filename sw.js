// Service worker for the Montana & Wyoming itinerary.
//
// Goal: the whole trip stays readable on a phone with no signal — which is most
// of Glacier, all of the Beartooth, and much of Yellowstone. The site is small
// (~6 MB), so everything is precached up front rather than filled in lazily.
//
// Bump CACHE_VERSION whenever the site content changes; the activate handler
// deletes older caches.

const CACHE_VERSION = "v1";
const CACHE_CORE = `itinerary-core-${CACHE_VERSION}`;

// Everything needed to render the site with no network at all.
const PRECACHE = [
  "./",
  "./index.html",
  "./support.js",
  "./manifest.webmanifest",
  // The page renders through React + in-browser Babel. These used to load from
  // unpkg.com, which made the site unusable without a signal no matter what
  // else was cached — they are vendored into ./vendor now.
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./vendor/babel.min.js",
  // Self-hosted Oswald + Spectral (latin subsets).
  "./vendor/fonts/TK3iWkUHHAIjg752Fz8Gl-1PK62t.woff2",
  "./vendor/fonts/TK3iWkUHHAIjg752GT8Gl-1PKw.woff2",
  "./vendor/fonts/fonts.css",
  "./vendor/fonts/rnCr-xNNww_2s0amA9M3knjsS_ulYHs.woff2",
  "./vendor/fonts/rnCr-xNNww_2s0amA9M5knjsS_ul.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9uSsG3BafaPWnII.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9uSsG3PafaPWnIIMrY.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9vKsW3BafaPWnII.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9vKsW3PafaPWnIIMrY.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9vmtm3BafaPWnII.woff2",
  "./vendor/fonts/rnCs-xNNww_2s0amA9vmtm3PafaPWnIIMrY.woff2",
  "./vendor/fonts/rnCt-xNNww_2s0amA9M8onTmTNmnUHowCw.woff2",
  "./vendor/fonts/rnCt-xNNww_2s0amA9M8onrmTNmnUHo.woff2",
  "./favicon.svg",
  "./hero-skyline.svg",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./Day-3-Going-to-the-Sun-Road.pdf",
  "./images/day1-apgar-rocks.webp",
  "./images/day1-lake-mcdonald.webp",
  "./images/day1-missouri-headwaters.webp",
  "./images/day2-avalanche-lake.webp",
  "./images/day2-mcdonald-lodge.webp",
  "./images/day2-trail-of-cedars.webp",
  "./images/day3-going-to-the-sun.webp",
  "./images/day3-logan-pass.webp",
  "./images/day3-wild-goose.webp",
  "./images/day4-grinnell-lake.webp",
  "./images/day4-many-glacier-sunrise.webp",
  "./images/day4-many-glacier.webp",
  "./images/day5-lamar-valley.webp",
  "./images/day5-lower-falls.webp",
  "./images/day5-mammoth.webp",
  "./images/day6-grand-prismatic.webp",
  "./images/day6-morning-glory.webp",
  "./images/day6-old-faithful.webp",
  "./images/day7-oxbow-bend.webp",
  "./images/day7-string-lake.webp",
  "./images/day8-mormon-row.webp",
  "./images/day8-schwabacher.webp",
  "./images/day8-teton-range.webp",
  "./images/wild-bison.jpg",
  "./images/wild-eagle.jpg",
  "./images/wild-elk.jpg",
  "./images/wild-goat.jpg",
  "./images/wild-grizzly.jpg",
  "./images/wild-moose.jpg",
  "./images/wild-pronghorn.jpg",
  "./images/wild-wolf.jpg",
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_CORE);
      // addAll() is atomic: one 404 would throw away the whole precache and
      // leave the app broken offline. Cache each entry independently instead so
      // a single missing file only costs that file.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch (err) {
            // Offline or missing asset — skip it and keep going.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_CORE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);


  // Anything off-origin (hotel sites, NPS links) is left to the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so a live site picks up edits, but fall back
  // to the cached page the moment the network is unavailable or slow to fail.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_CORE);
          cache.put("./index.html", response.clone());
          return response;
        } catch (err) {
          return (
            (await caches.match("./index.html")) ||
            (await caches.match("./")) ||
            new Response("Offline and no saved copy of the itinerary yet.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  // Same-origin assets: cache-first. They are versioned by CACHE_VERSION, so a
  // stale asset only survives until the next release.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_CORE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});

// Lets the page ask how far along the precache is, so it can tell the user when
// the trip is genuinely safe to take off-grid.
self.addEventListener("message", (event) => {
  if (event.data === "cache-status") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_CORE);
        const keys = await cache.keys();
        event.source?.postMessage({
          type: "cache-status",
          cached: keys.length,
          total: PRECACHE.length,
        });
      })()
    );
  }
});

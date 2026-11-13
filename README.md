# Labtech Ltd. website

Static site for Labtech Ltd. (textile testing & inspection, Dhaka). No build step required.

- `index.html` — page content
- `assets/js/config.js` — contact details, map sites, request-form options
- `assets/js/intro.js` — liquid-glass logo opening (WebGL shader); `?intro=0.5` freezes a frame
- `assets/js/specimen.js` + `cloth.js` — scroll-driven denim tensile test (three.js cloth physics, tearing, fibres)
- `assets/js/aql.js` — ISO 2859-1 sampling tables behind the AQL calculator
- `assets/img/logo*.svg` — logo redrawn as vectors from the company's profile image; replace with official artwork when available

Run locally with any static server, e.g. `python3 -m http.server`, then open http://localhost:8000.

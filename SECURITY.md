# Security

## Reporting a problem

If you find a security problem in Fell Runner, please report it privately through
[GitHub's private vulnerability reporting](https://github.com/rmcrkd/fell-runner/security/advisories/new)
rather than in a public issue. Say what you found and how to reproduce it. You'll get a reply as
soon as possible, and credit in the fix if you'd like it.

Problems with the game's facts or safety advice (a broken donation link, a wrong emergency
number, inaccurate route details) aren't secret: please open an ordinary issue so they're fixed
quickly.

## What the game does and doesn't do

Fell Runner is a static web page. Knowing this helps judge what's in scope:

- **No accounts, server or tracking.** Nothing is sent anywhere: no analytics, no cookies, no
  third-party scripts, fonts or images.
- **Local storage only.** Settings, best times and ghosts stay in your own browser's local
  storage, and Settings can delete them.
- **One outside input.** A challenge link's `fell`, `vest`, `weather` and `seed` parameters are
  checked against fixed lists or turned into a number, so a crafted link can't inject anything.
- **A strict Content-Security-Policy** in `index.html` lets the page run only its own files: no
  inline scripts or styles, no other sites.
- **External links** (the Penrith Mountain Rescue Team donation page, mountain forecasts and
  credits) open in a new tab with `rel="noopener"`. `npm run links` checks them monthly in CI.

## Supported versions

Only the latest version on the `main` branch, which is what
[the live game](https://rmcrkd.github.io/fell-runner/) runs, gets fixes.

## For contributors

- The game has no runtime dependencies. Keep it that way unless there's a strong reason.
- Development tools (`tools/browser`) never ship with the game. The Pages workflow copies only
  `index.html`, `styles.css`, `src/` and `docs/`.
- Don't add inline `<script>` or `<style>` blocks or `style="…"` attributes: the
  Content-Security-Policy blocks them, and the keyboard walkthrough (`npm run keyboard` in
  `tools/browser`) fails on any violation. Set styles through the element's `style` property
  instead.
- Workflows pin each action to an exact commit, with the version in a comment. Dependabot
  proposes updates.
- Never commit secrets. Secret scanning with push protection is on for this repository.

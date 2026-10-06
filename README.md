# Reading Garden

English paper library and Books shelf, Ideas notebook, People directory and customizable New
Papers feeds hosted on GitHub Pages. Browser-only mode works without signing in.

## Multi-user setup

The frontend supports email/password signup and login. Backend activation is
required; deploying GitHub Pages does not modify the Supabase project.

1. Run the complete `setup.sql` in the existing Supabase project's SQL Editor.
   The migration preserves the existing table and all existing owner rows.
   Its RLS policy permits each authenticated user to select, insert or update
   only the row whose `owner_id` equals `auth.uid()`. The write RPC uses the
   caller's UID, checks the expected revision and runs as security invoker.
2. Set Supabase Authentication's Site URL and allowed Redirect URL to
   `https://shannchen.github.io/reading-garden/`.
3. Configure custom SMTP before opening email-confirmed public signup. Supabase's
   default email service sends only to project-team addresses. Keep email
   confirmation enabled and anonymous sign-ins disabled.
4. Enable email/password authentication and allow new users to sign up.
   Alternatively, for a small group, create confirmed user accounts as an admin
   in Authentication > Users and let those users sign in. Public signup and SMTP
   are not required for those manually created, already-confirmed accounts.
5. Verify that the original account still has its records, a new account cannot
   see them, and a new account's records sync across two devices.

See [multi-user-setup.md](multi-user-setup.md) for Chinese step-by-step instructions.
The public capabilities RPC contains no user information and gates the frontend
signup action until the database migration has run. Existing-account login remains
available before migration; the previous owner-only backend policy still applies.

## Data and sync

- Papers, paper color codes, Ideas, People (including stars) and feed preferences belong to individual
  accounts. Public New Papers metadata is shared. Legacy task records remain in
  backups and sync payloads, though Daily Checklist has been removed from the UI.
- Each account has separate browser caches and merge state. The original owner's
  cache prefix is preserved. Signing out restores the browser-only records.
  Browser-only data is uploaded only through explicit Import local records or
  Import Backup. Local caches remain on that browser after logout.
- Revision-checked writes and three-way merge preserve separate edits and
  deletions. Simultaneous edits to the same record pause automatic sync and show
  Resolve conflict. Edits made during a request are kept for the next sync.
- Account switches clear the previous account's visible data immediately.
  Generation checks reject stale responses; requests use captured account tokens
  so a pending request cannot write into a subsequently signed-in account.
- Visible apps sync automatically every 15 seconds; local saves schedule sync
  after 1 second. Offline changes remain cached and retry when connectivity returns.
- Failed sync does not erase a library. New accounts require the backend migration
  before they can write cloud data. Passwords go directly to Supabase Auth over
  HTTPS and are never saved by app code or added to this public repository.
- App scripts use versioned URLs and a versioned service-worker cache so deployed
  changes do not keep using the old cached script.

## New Papers

`.github/workflows/daily-paper-feed.yml` checks public Crossref metadata at four
UTC times daily. GitHub scheduling and publisher indexing can be delayed. The
frontend fetches the feed from the main branch and checks while open. Custom
subscriptions check automatically while the app is open, not in the background
when closed. Partial source coverage is disclosed in the feed.

## Checks

`node tests/multi-user-test.cjs` uses a mocked Supabase API to verify registration,
confirmation-required and immediate-session signup, database-setup gating, legacy
cache preservation, account switches, stale initial activations, stale sync reads,
token-bound writes, revision races, merge/delete behavior and logout separation.
It does not replace live database/RLS, email-delivery or browser UI verification.

Keep database passwords, project management tokens, SMTP credentials, secret
keys and service-role keys out of this repository.

`node tests/paper-colors-test.cjs` and `node tests/paper-feed-colors-test.cjs`
check color selection, clearing, DOI identity across feed and saved papers, and
preservation when reading status changes. Color marks use a separate private
collection, sync per account, and are included in version 8 backups. Existing
backups and payloads without color marks remain supported. Each color has a text
label; card edge colors supplement rather than replace those labels.

## Books and color codes

Books use the same private library storage with `kind: "book"`, and are shown
only in Books. Existing records without a kind remain papers. The book editor
searches Open Library by title; exact unique titles can fill author and first
publication year, while ambiguous matches require selection. Publisher is filled
only when a single publisher is listed. Users can correct all details manually.
Crossref paper lookup is disabled for books. Books retain reading status, tags,
notes, color codes, account sync and backup import/export.

Color selection appears below notes in the create/edit dialog. Cards show a color
edge but no color dropdown, including New Papers cards. Existing color marks remain
intact. `node tests/book-lookup-test.cjs` verifies book lookup and stale-response
isolation; the account test also covers Books separation, creation, reading status,
cloud payloads, backup kind preservation and deletion without removing papers.

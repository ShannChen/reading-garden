# Reading Garden

Static personal paper library hosted on GitHub Pages. Papers, ideas and daily
tasks work without a login. Browser-only data never uploads automatically.

## Private owner sync setup

1. In the Supabase project, create the owner under Authentication > Users.
   Its UID is `3ad0b62f-79e2-4cff-8b78-0352fd42e8f1`.
2. In Authentication > Sign In / Providers, disable **Allow new users to sign
   up** and **Allow anonymous sign-ins**. Save. There is no public signup UI.
3. Open `setup.sql`, copy its complete contents into Supabase SQL Editor >
   New query, and click Run. This creates an owner-only RLS table and a
   revision-checked write function. No client can access the table anonymously;
   other authenticated accounts are also denied by RLS and the function.
4. Open the Mac app and sign in using **Owner sign in**. No database password
   or project secret is used for app login. The owner supplies their email and
   the login password created in Authentication > Users.
5. Export a backup of the original local-mode library before importing. Click
   **Import local records** to explicitly merge the Mac's existing records into
   the private cloud library. A duplicate ID uses the newer `updated` record.
6. Sign in to the same account in the iPhone web app. The cloud records load
   automatically. **Sync now** fetches immediately; otherwise visible apps poll
   every 15 seconds and local saves schedule sync after 1 second.

The frontend uses the project's public publishable key. Database authorization
is enforced by SQL, not by the visible login button or by the UID in JavaScript.
The Supabase JS client stores the auth session in `reading-garden-auth` in
localStorage and manages access-token refresh. Passwords go directly to
Supabase Auth over HTTPS and are not saved by this app. Never add a database
password, secret key, or service-role key to this public repository.

## Data and update behavior

- Owner and browser-only mode use separate localStorage keys. Signing out
  restores browser-only data; it does not erase either local dataset or the
  cloud library. Do not use the owner login on a shared device unless you are
  comfortable with locally cached records remaining there.
- Papers, ideas, tasks, reading state, and To Share flags are synchronized.
- A revision-checked atomic write prevents silent concurrent overwrites.
  Three-way merging combines edits to different records and preserves
  deletions. Simultaneous edits to the same record pause automatic sync and
  ask the owner which version to retain through **Sync now**.
- Changes made during a request stay local and are included in the next sync.
  Failed requests do not clear the library. Offline changes stay on the device
  and retry when connectivity returns. A first sign-in requires a connection.
- The service worker caches app assets and uses network-first navigation.
  Releases change the app cache name; only Reading Garden caches are cleaned.
- If setup SQL has not run, cloud sync shows a setup message and the existing
  local-mode records remain available.

## Checks

`node tests/sync-test.cjs` checks merge conflicts and deletions, explicit
migration, namespace separation, missing backend setup, bidirectional sync,
revision races, changes during requests, and logout with a mocked Supabase API.
It does not replace live SQL/RLS verification or an iPhone/Mac UI test.

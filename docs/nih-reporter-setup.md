# Connect NIH RePORTER search

NIH does not allow browser requests from GitHub Pages. This small Supabase Edge Function calls NIH on the server and returns public project metadata. It does not read or modify your database or store searches.

1. Open your existing Supabase project (`oonwggwdcywukwshwbxx`).
2. In **Edge Functions**, create a function using the editor. Name it exactly **nih-reporter**.
3. Replace the editor's `index.ts` with the entire [function code](../supabase/functions/nih-reporter/index.ts). Use GitHub's **Raw** view to copy the file.
4. Deploy the function. In the function's settings, turn **Verify JWT** off. This endpoint returns public NIH data and does not require database access; the website sends no login token to it.
5. Reload Reading Garden, expand **Grants → NIH RePORTER**, and search **Benjamin Cravatt** or **metabolomics**.

No API key, database table, SQL migration or secret is needed. Calls count toward your Supabase Edge Function usage allowance. Keep the function name unchanged so the website can find it.

The function accepts requests from `https://shannchen.github.io`, validates the search fields, limits each response to 20 records and spaces requests per running instance. Origin checks are browser controls, not authentication. Do not add private data to this function. Funding is reported per fiscal year, not summed over the whole project.

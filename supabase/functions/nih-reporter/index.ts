// Public NIH metadata only. No database, credentials or user records are accessed.
const origin = 'https://shannchen.github.io';
const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'content-type', 'Vary':'Origin'};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{...cors, 'Content-Type':'application/json'}});
let nextRequest = 0;
Deno.serve(async req => {
  if (req.headers.get('Origin') !== origin) return reply({error:'Origin not allowed'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method !== 'POST') return reply({error:'Use POST'},405);
  try {
    const raw = await req.text();
    if (raw.length > 4000) return reply({error:'Query too long'},400);
    const body = JSON.parse(raw), c = body.criteria || {}, criteria: Record<string,unknown> = {exclude_subprojects:true};
    const text = c.advanced_text_search?.search_text;
    if (typeof text === 'string' && text.trim() && text.length <= 250) criteria.advanced_text_search = {operator:'and',search_field:'all',search_text:text.trim()};
    const name = c.pi_names?.[0];
    if (name && typeof name === 'object') {
      const safe: Record<string,string> = {};
      for (const field of ['first_name','last_name','any_name']) if (typeof name[field] === 'string' && name[field].trim() && name[field].length <= 150) safe[field] = name[field].trim();
      if (Object.keys(safe).length) criteria.pi_names = [safe];
    }
    if (!criteria.advanced_text_search && !criteria.pi_names) return reply({error:'Enter keywords or a PI name'},400);
    if (c.include_active_projects === true) criteria.include_active_projects = true;
    else if (Array.isArray(c.fiscal_years) && c.fiscal_years.length <= 1 && c.fiscal_years.every((y:unknown)=>Number.isInteger(y) && Number(y)>=2000 && Number(y)<=2099)) criteria.fiscal_years = c.fiscal_years;
    else return reply({error:'Invalid fiscal-year filter'},400);
    if (criteria.advanced_text_search) criteria.use_relevance = true;
    if (!Number.isInteger(body.offset) || body.offset < 0 || body.offset > 14999) return reply({error:'Invalid page'},400);
    // NIH recommends spacing requests. This gate applies per running instance.
    const wait = Math.max(0,nextRequest-Date.now());
    if (wait > 3000) return reply({error:'Please retry shortly'},429);
    nextRequest = Math.max(nextRequest,Date.now()) + 1100;
    if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
    const response = await fetch('https://api.reporter.nih.gov/v2/projects/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({criteria,offset:body.offset,limit:20}),signal:AbortSignal.timeout(20000)});
    if (!response.ok) return reply({error:'NIH request failed'},response.status===429?429:502);
    const data = await response.json();
    if (!Array.isArray(data.results) || !Number.isFinite(Number(data.meta?.total))) return reply({error:'Unexpected NIH response'},502);
    return reply(data);
  } catch { return reply({error:'Unable to complete NIH search'},502); }
});

// Shared validation for the browser demo and the Cloudflare Worker.
(() => {
  const TABLES = {
    projects: { fields: ['title','summary','description','category','tags','status','release','priority','progress','version','repo_url','color','pinned','archived'], required: ['title'] },
    bugs: { fields: ['project_id','title','description','severity','status','version_found','fix_method','fix_patch','fixed_at'], required: ['project_id','title'] },
    tasks: { fields: ['project_id','text','done','done_at'], required: ['project_id','text'] },
    logs: { fields: ['project_id','kind','text','created_at'], required: ['project_id','text'], noUpdatedAt: true },
    releases: { fields: ['project_id','version','channel','notes','url','released_at'], required: ['project_id','version','channel'] },
  };
  const ENUMS = {
    status: ['idea','research','planning','development','testing','ready','paused','abandoned'],
    release: ['none','prototype','alpha','beta','test','rc','public','private'],
    priority: ['low','medium','high','critical'], severity: ['low','medium','high','critical'],
    bugStatus: ['open','fixed','wontfix'],
  };
  const DEFAULTS = {
    projects: { summary:'',description:'',category:'',tags:'',status:'idea',release:'none',priority:'medium',progress:0,version:'',repo_url:'',color:'#8b7cf8',pinned:0,archived:0 },
    bugs: { description:'',severity:'medium',status:'open',version_found:'',fix_method:'',fix_patch:'',fixed_at:'' },
    tasks: { done:0,done_at:'' }, logs: { kind:'note' },
    releases: { notes:'',url:'',released_at:'' },
  };
  class ValidationError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
  const fail = (message, status) => { throw new ValidationError(message, status); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const date = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
  const MAX_IMPORT_ROWS = 5000;
  const MAX_BODY_BYTES = 8 * 1024 * 1024;
  function validateRow(table, body, create=false) {
    if (!TABLES[table] || !object(body)) fail('Μη έγκυρη εγγραφή.');
    const out = create ? {...DEFAULTS[table]} : {};
    for (const field of TABLES[table].fields) {
      if (!Object.hasOwn(body, field)) continue;
      const value = body[field];
      if (['progress','pinned','done','archived'].includes(field)) {
        const number = Number(value);
        if (value === null || value === '' || !Number.isFinite(number) || !Number.isInteger(number) ||
            (field === 'progress' ? number < 0 || number > 100 : ![0,1].includes(number))) fail(`Μη έγκυρο πεδίο ${field}.`);
        out[field] = number;
      } else {
        if (typeof value !== 'string') fail(`Το πεδίο ${field} πρέπει να είναι κείμενο.`);
        const limit = ({title:300,summary:400,category:60,tags:300,version:40,version_found:40,fix_patch:120,repo_url:500,url:500,color:7,project_id:100,kind:40})[field] || 100000;
        if (value.length > limit) fail(`Το πεδίο ${field} είναι πολύ μεγάλο.`,413);
        out[field] = value;
      }
    }
    for (const field of TABLES[table].required) {
      if ((create || Object.hasOwn(out,field)) && !String(out[field] || '').trim()) fail(`Λείπει το πεδίο ${field}.`);
    }
    for (const field of ['title','text']) if (field in out) out[field] = out[field].trim();
    for (const field of ['status','release','priority','severity']) {
      const values = field === 'status' && table === 'bugs' ? ENUMS.bugStatus : ENUMS[field];
      if (field in out && !values.includes(out[field])) fail(`Μη έγκυρη τιμή ${field}.`);
    }
    if ('project_id' in out && !validId(out.project_id)) fail('Μη έγκυρο project_id.');
    if ('channel' in out && !ENUMS.release.filter(x=>x!=='none').includes(out.channel)) fail('Μη έγκυρο κανάλι release.');
    if ('color' in out && !/^#[0-9a-f]{6}$/i.test(out.color)) fail('Το χρώμα πρέπει να είναι #RRGGBB.');
    for (const field of ['repo_url','url']) if (out[field]) {
      let url; try { url = new URL(out[field]); } catch { fail('Ο σύνδεσμος πρέπει να είναι έγκυρη διεύθυνση HTTPS ή HTTP.'); }
      if (!['https:','http:'].includes(url.protocol)) fail('Μη επιτρεπόμενος σύνδεσμος.');
    }
    for (const field of ['fixed_at','done_at','created_at','released_at']) if (out[field] && !date(out[field])) fail(`Μη έγκυρη ημερομηνία ${field}.`);
    return out;
  }
  function validateBackup(body) {
    if (!object(body) || !Array.isArray(body.projects)) fail('Το αρχείο δεν είναι αντίγραφο του voidproject.');
    if (body.mode && !['merge','replace'].includes(body.mode)) fail('Άγνωστος τρόπος εισαγωγής.');
    const out = {mode:body.mode || 'merge'};
    let total=0;
    for (const table of Object.keys(TABLES)) {
      const rows = body[table] === undefined ? [] : body[table];
      if (!Array.isArray(rows)) fail(`Ο πίνακας ${table} πρέπει να είναι λίστα.`);
      total += rows.length;
      if (total > MAX_IMPORT_ROWS) fail(`Επιτρέπονται έως ${MAX_IMPORT_ROWS} εγγραφές ανά εισαγωγή.`,413);
      const ids = new Set();
      out[table] = rows.map(row => {
        if (!object(row) || !validId(row.id) || ids.has(row.id)) fail(`Μη έγκυρο ή διπλό id στον πίνακα ${table}.`);
        ids.add(row.id);
        const clean = validateRow(table,row,true);
        for (const field of TABLES[table].noUpdatedAt ? ['created_at'] : ['created_at','updated_at']) {
          if (row[field] && !date(row[field])) fail(`Μη έγκυρη ημερομηνία ${field}.`);
          clean[field] = row[field] || new Date().toISOString();
        }
        return {...clean,id:row.id};
      });
    }
    return out;
  }
  globalThis.VPContract = {TABLES,ENUMS,validateRow,validateBackup,ValidationError,MAX_IMPORT_ROWS,MAX_BODY_BYTES};
})();

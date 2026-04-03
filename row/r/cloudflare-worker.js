/*
  Greek Courier Tracker — Cloudflare Worker v10
  Supports:
  - ΕΛΤΑ
  - ACS
  - Speedex
  - Γενική Ταχυδρομική
  - BOX NOW
  - SHOPFLIX
*/

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/track' && request.method === 'POST') {
        return handleTrack(request);
      }

      if (path === '/elta' && request.method === 'POST') return handleElta(request);
      if (path.startsWith('/acs/')) return handleACS(path.replace('/acs/', ''));
      if (path.startsWith('/speedex/')) return handleSpeedex(path.replace('/speedex/', ''));
      if (path.startsWith('/geniki/')) return handleGeniki(path.replace('/geniki/', ''));
      if (path.startsWith('/boxnow/')) return handleBoxNow(path.replace('/boxnow/', ''));
      if (path.startsWith('/shopflix/')) return handleShopflix(path.replace('/shopflix/', ''));

      if (path === '/' && request.method === 'POST') return handleElta(request);

      return ok(JSON.stringify({
        service: 'Greek Courier Tracker v10',
        endpoints: {
          elta: 'POST /elta',
          acs: 'GET /acs/{num}',
          speedex: 'GET /speedex/{num}',
          geniki: 'GET /geniki/{num}',
          boxnow: 'GET /boxnow/{num}',
          shopflix: 'GET /shopflix/{num}',
          track: 'POST /track'
        }
      }));
    } catch (err) {
      return errResp(err);
    }
  }
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function handleTrack(request) {
  try {
    const body = await request.json();
    const courier = String(body.courier || body.provider || '').trim().toLowerCase();
    const code = String(body.code || body.trackingNumber || body.parcelId || '').trim();

    if (!courier) return errJSON(400, 'Missing courier');
    if (!code) return errJSON(400, 'Missing tracking number');

    if (courier === 'boxnow') {
      const rawResp = await handleBoxNow(code);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      return ok(JSON.stringify({
        ok: true,
        courier: 'boxnow',
        trackingNumber: code,
        result: rawJson
      }));
    }

    if (courier === 'elta') {
      const fakeReq = new Request('https://worker.local/elta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `number=${encodeURIComponent(code)}&s=0`
      });
      const rawResp = await handleElta(fakeReq);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      const parsed = parseEltaUnified(rawJson, code);

      return ok(JSON.stringify({
        ok: true,
        courier: 'elta',
        trackingNumber: code,
        result: parsed
      }));
    }

    if (courier === 'acs') {
      const rawResp = await handleACS(code);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      const parsed = parseACSUnified(rawJson, code);

      return ok(JSON.stringify({
        ok: true,
        courier: 'acs',
        trackingNumber: code,
        result: parsed
      }));
    }

    if (courier === 'speedex') {
      const rawResp = await handleSpeedex(code);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      const parsed = parseSpeedexUnified(rawJson, code);

      return ok(JSON.stringify({
        ok: true,
        courier: 'speedex',
        trackingNumber: code,
        result: parsed
      }));
    }

    if (courier === 'geniki') {
      const rawResp = await handleGeniki(code);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      const parsed = parseGenikiUnified(rawJson, code);

      return ok(JSON.stringify({
        ok: true,
        courier: 'geniki',
        trackingNumber: code,
        result: parsed
      }));
    }

    if (courier === 'shopflix') {
      const rawResp = await handleShopflix(code);
      const rawText = await rawResp.text();
      let rawJson = {};
      try { rawJson = JSON.parse(rawText); } catch (_) {}

      const parsed = parseShopflixUnified(rawJson, code);

      return ok(JSON.stringify({
        ok: true,
        courier: 'shopflix',
        trackingNumber: code,
        result: parsed
      }));
    }

    return errJSON(400, `Unsupported courier: ${courier}`);
  } catch (err) {
    return errResp(err);
  }
}

async function handleElta(request) {
  try {
    const body = await request.text();
    const resp = await fetch('https://www.elta-courier.gr/track.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'User-Agent': UA,
        'Referer': 'https://www.elta-courier.gr/search',
        'Origin': 'https://www.elta-courier.gr'
      },
      body
    });
    return ok(await resp.text(), resp.status);
  } catch (err) {
    return errResp(err);
  }
}

async function handleACS(trackingNumber) {
  try {
    const pageResp = await fetch('https://www.acscourier.net/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html',
        'Accept-Language': 'el-GR'
      },
      redirect: 'follow'
    });

    const html = await pageResp.text();
    const tokenMatch = html.match(/publicToken="(CfDJ8[^"]+)"/);

    if (!tokenMatch) return errJSON(500, 'ACS token not found');

    const setCookie = pageResp.headers.get('set-cookie') || '';
    const cookieParts = setCookie.split(/,(?=[^;]*=)/).map(c => c.split(';')[0].trim());
    const cookieStr = cookieParts.filter(c => c.includes('=')).join('; ');

    const apiResp = await fetch(
      `https://api.acscourier.net/api/parcels/search/${encodeURIComponent(trackingNumber)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'el-GR',
          'x-country': 'GR',
          'x-encrypted-key': tokenMatch[1],
          'User-Agent': UA,
          'Referer': 'https://www.acscourier.net/',
          'Origin': 'https://www.acscourier.net',
          'Cookie': cookieStr
        }
      }
    );

    if (apiResp.status === 406) {
      return errJSON(406, 'ACS 406 - token rejected');
    }

    return ok(await apiResp.text(), apiResp.status);
  } catch (err) {
    return errResp(err);
  }
}

async function handleGeniki(trackingNumber) {
  try {
    const trackUrl = 'https://www.taxydromiki.com/track';

    const pageResp = await fetch(trackUrl, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.taxydromiki.com/'
      },
      redirect: 'follow'
    });

    const pageHtml = await pageResp.text();

    if (!pageHtml || pageHtml.length < 300) {
      return errJSON(500, 'Geniki: empty track page', {
        preview: (pageHtml || '').slice(0, 500)
      });
    }

    const cookieStr = extractCookies(pageResp);
    const trackingFormHtml = extractTrackingForm(pageHtml);

    if (!trackingFormHtml) {
      return errJSON(500, 'Geniki: tracking form not found', {
        preview: pageHtml.slice(0, 2000)
      });
    }

    const formBuildId = extractInputValue(trackingFormHtml, 'form_build_id');
    const formId = 'custom_geniki_tracking_page_form';
    const themeToken = extractThemeToken(pageHtml);
    const htmlIds = extractHtmlIds(pageHtml);

    if (!formBuildId) {
      return errJSON(500, 'Geniki: form_build_id not found', {
        form_preview: trackingFormHtml.slice(0, 2000)
      });
    }

    const ajaxBody = new URLSearchParams();
    ajaxBody.set('tracking_number', trackingNumber);
    ajaxBody.set('form_build_id', formBuildId);
    ajaxBody.set('form_id', formId);
    ajaxBody.set('_triggering_element_name', 'op');
    ajaxBody.set('_triggering_element_value', 'Αναζήτηση');
    ajaxBody.set('op', 'Αναζήτηση');
    ajaxBody.set('ajax_page_state[theme]', 'taxydromiki');
    if (themeToken) ajaxBody.set('ajax_page_state[theme_token]', themeToken);

    for (const id of htmlIds) {
      ajaxBody.append('ajax_html_ids[]', id);
    }

    const mustHaveIds = [
      'main-content',
      'tracking-result',
      'custom-geniki-tracking-page-form',
      'custom-geniki-tracking-form',
      'edit-tracking-searchbox',
      'edit-tracking-number',
      'edit-submit'
    ];

    for (const id of mustHaveIds) {
      if (!htmlIds.includes(id)) ajaxBody.append('ajax_html_ids[]', id);
    }

    const ajaxResp = await fetch('https://www.taxydromiki.com/system/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
        'Referer': trackUrl,
        'Origin': 'https://www.taxydromiki.com',
        ...(cookieStr ? { 'Cookie': cookieStr } : {})
      },
      body: ajaxBody.toString(),
      redirect: 'follow'
    });

    const rawText = await ajaxResp.text();

    if (!ajaxResp.ok) {
      return errJSON(ajaxResp.status, 'Geniki AJAX failed', {
        raw: rawText.slice(0, 1500),
        form_build_id: formBuildId,
        form_id: formId,
        theme_token: themeToken || '',
        cookie_present: !!cookieStr,
        ids_count: htmlIds.length
      });
    }

    if (!rawText || !rawText.trim()) {
      return errJSON(500, 'Geniki: empty AJAX response', {
        form_build_id: formBuildId,
        form_id: formId,
        theme_token: themeToken || '',
        cookie_present: !!cookieStr,
        ids_count: htmlIds.length
      });
    }

    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch (e) {
      return errJSON(500, 'Geniki: invalid JSON response', {
        raw: rawText.slice(0, 2000),
        form_build_id: formBuildId,
        form_id: formId,
        theme_token: themeToken || '',
        cookie_present: !!cookieStr
      });
    }

    if (!Array.isArray(payload)) {
      return errJSON(500, 'Geniki: unexpected AJAX payload', {
        raw: rawText.slice(0, 2000)
      });
    }

    const insertCmd = payload.find(x => x && x.command === 'insert' && typeof x.data === 'string');

    if (!insertCmd || !insertCmd.data) {
      return errJSON(404, 'Geniki: no tracking results', {
        raw: rawText.slice(0, 2000)
      });
    }

    const html = insertCmd.data;
    const events = [];
    const splitBlocks = html.split(/<div class="tracking-checkpoint/i).slice(1);

    for (const part of splitBlocks) {
      const block = '<div class="tracking-checkpoint' + part;
      const status = extractField(block, 'checkpoint-status');
      const place = extractField(block, 'checkpoint-location');
      const date = extractField(block, 'checkpoint-date');
      const time = extractField(block, 'checkpoint-time');

      if (status || date || time || place) {
        events.push({
          status: cleanText(status),
          date: cleanText(date),
          time: cleanText(time),
          place: cleanText(place)
        });
      }
    }

    const isDelivered =
      /tracking-delivery/i.test(html) ||
      events.some(e => /παραλήφθηκε από|παραδό/i.test(e.status || ''));

    return ok(JSON.stringify({
      courier: 'geniki',
      trackingNumber,
      count: events.length,
      isDelivered,
      events
    }));
  } catch (err) {
    return errResp(err);
  }
}

async function handleSpeedex(trackingNumber) {
  try {
    const pageUrl = `https://www.speedex.gr/speedex/NewTrackAndTrace.aspx?number=${encodeURIComponent(trackingNumber)}`;

    const resp = await fetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html',
        'Accept-Language': 'el-GR'
      }
    });

    const html = await resp.text();

    const vsMatch = html.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/);
    const evMatch = html.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/);
    const vsgMatch = html.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/);

    if (!vsMatch || !evMatch) {
      return errJSON(500, 'Speedex: could not extract VIEWSTATE');
    }

    const postBody = new URLSearchParams({
      '__EVENTTARGET': 'BtnSearch',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE': vsMatch[1],
      '__VIEWSTATEGENERATOR': vsgMatch ? vsgMatch[1] : '',
      '__EVENTVALIDATION': evMatch[1],
      'TxtConsignmentNumber': trackingNumber
    }).toString();

    const postResp = await fetch(pageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Accept': 'text/html',
        'Referer': pageUrl
      },
      body: postBody
    });

    const resultHtml = await postResp.text();
    const events = [];
    const itemRegex = /<li class="timeline-item[^"]*">([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(resultHtml)) !== null) {
      const block = match[1];
      const titleMatch = block.match(/<h4 class="card-title">\s*([\s\S]*?)\s*<\/h4>/);
      const spans = [];
      const spanRegex = /<span class='?font-small-3'?>([\s\S]*?)<\/span>/g;
      let s;

      while ((s = spanRegex.exec(block)) !== null) {
        const text = s[1].replace(/<[^>]*>/g, '').trim();
        if (text) spans.push(text);
      }

      if (titleMatch) {
        const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
        let date = '';
        let time = '';

        if (spans[0]) {
          const dtMatch = spans[0].match(/(\d{2}\/\d{2}\/\d{4})\s*στις\s*(\d{2}:\d{2})/);
          if (dtMatch) {
            date = dtMatch[1];
            time = dtMatch[2];
          } else {
            date = spans[0];
          }
        }

        const place = (spans[1] || '').replace(/^[,\s]+/, '');
        const extra = spans[2] || '';

        events.push({
          status: title,
          date,
          time,
          place: place || extra
        });
      }
    }

    const isDelivered =
      resultHtml.includes('delivered-speedex') ||
      events.some(e => e.status.includes('ΠΑΡΑΔΟ'));

    return ok(JSON.stringify({
      courier: 'speedex',
      trackingNumber,
      count: events.length,
      isDelivered,
      events
    }));
  } catch (err) {
    return errResp(err);
  }
}

async function handleBoxNow(trackingNumber) {
  try {
    const resp = await fetch('https://api-production.boxnow.gr/api/v1/parcels:track', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'el,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/json',
        'priority': 'u=1, i',
        'user-agent': UA,
        'referer': 'https://boxnow.gr/',
        'origin': 'https://boxnow.gr'
      },
      body: JSON.stringify({ parcelId: trackingNumber })
    });

    const raw = await resp.json().catch(() => null);

    if (!resp.ok) {
      return errJSON(resp.status, 'BOX NOW request failed', { raw });
    }

    const item = raw?.data?.[0];
    if (!item) {
      return ok(JSON.stringify({
        raw,
        summary: {
          trackingNumber,
          status: '',
          locker: '',
          updatedAt: ''
        },
        history: []
      }));
    }

    const events = (item.events || []).map(ev => {
      const dt = toGreekDateTime(ev.createTime);
      return {
        status: mapBoxNowEvent(ev.type),
        date: dt.date,
        time: dt.time,
        place: [ev.locationDisplayName, ev.postalCode].filter(Boolean).join(' ')
      };
    }).reverse();

    const lastEvent = item.events?.[item.events.length - 1];
    const lastDt = toGreekDateTime(lastEvent?.createTime);

    return ok(JSON.stringify({
      raw,
      summary: {
        trackingNumber: item.id || trackingNumber,
        status: mapBoxNowEvent(item.state),
        locker: item.destination?.name || item.destination?.addressLine1 || '',
        updatedAt: [lastDt.date, lastDt.time].filter(Boolean).join(' ')
      },
      history: events
    }));
  } catch (err) {
    return errResp(err);
  }
}

async function handleShopflix(trackingNumber) {
  try {
    const resp = await fetch('https://shopflix.gr/api/courier-center', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'el,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/json',
        'user-agent': UA,
        'referer': `https://shopflix.gr/parakoloythisi-paraggelias?tracking_number=${encodeURIComponent(trackingNumber)}`,
        'origin': 'https://shopflix.gr'
      },
      body: JSON.stringify({
        Identifier: trackingNumber,
        ReturnShipmentInfo: true,
        ReturnPodInfo: true,
        ReturnTrackingInfo: true
      })
    });

    const raw = await resp.json().catch(() => null);

    if (!resp.ok) {
      return errJSON(resp.status, 'SHOPFLIX request failed', { raw });
    }

    return ok(JSON.stringify(raw));
  } catch (err) {
    return errResp(err);
  }
}

function parseEltaUnified(rawJson, trackingNumber) {
  const entry = rawJson?.result?.[trackingNumber];
  const rows = entry?.result || [];

  const history = rows.map(v => ({
    status: v.status || '',
    date: v.date || '',
    time: v.time || '',
    place: v.place || ''
  }));

  const first = history[0] || {};

  return {
    raw: rawJson,
    summary: {
      trackingNumber,
      status: first.status || '',
      locker: '',
      updatedAt: [first.date, first.time].filter(Boolean).join(' ')
    },
    history
  };
}

function parseACSUnified(rawJson, trackingNumber) {
  const item = rawJson?.items?.[0];
  const history = (item?.statusHistory || []).map(h => {
    const dt = toGreekDateTime(h.controlPointDate);
    return {
      status: h.controlPoint || '',
      date: dt.date,
      time: dt.time,
      place: h.controlPointCode || h.info || ''
    };
  }).reverse();

  const first = history[0] || {};

  return {
    raw: rawJson,
    summary: {
      trackingNumber,
      status: item?.isDelivered ? 'Παραδόθηκε' : (first.status || ''),
      locker: '',
      updatedAt: [first.date, first.time].filter(Boolean).join(' ')
    },
    history
  };
}

function parseSpeedexUnified(rawJson, trackingNumber) {
  const history = (rawJson?.events || []).map(v => ({
    status: v.status || '',
    date: v.date || '',
    time: v.time || '',
    place: v.place || ''
  })).reverse();

  const first = history[0] || {};

  return {
    raw: rawJson,
    summary: {
      trackingNumber,
      status: rawJson?.isDelivered ? 'Παραδόθηκε' : (first.status || ''),
      locker: '',
      updatedAt: [first.date, first.time].filter(Boolean).join(' ')
    },
    history
  };
}

function parseGenikiUnified(rawJson, trackingNumber) {
  const history = (rawJson?.events || []).map(v => ({
    status: v.status || '',
    date: v.date || '',
    time: v.time || '',
    place: v.place || ''
  })).reverse();

  const first = history[0] || {};

  return {
    raw: rawJson,
    summary: {
      trackingNumber,
      status: rawJson?.isDelivered ? 'Παραδόθηκε' : (first.status || ''),
      locker: '',
      updatedAt: [first.date, first.time].filter(Boolean).join(' ')
    },
    history
  };
}

function parseShopflixUnified(rawJson, trackingNumber) {
  const detail = rawJson?.ShipmentDetails?.[0] || {};
  const info = detail?.ShipmentInfo || {};
  const pod = detail?.ShipmentPodInfo || {};
  const tracking = Array.isArray(detail?.ShipmentTrackingInfo) ? detail.ShipmentTrackingInfo : [];

  const history = tracking.map(item => ({
    status: item.SystemTrackingName || item.SystemTrackingNameLatin || item.Action || '',
    date: toGreekDate(item.Date),
    time: toGreekTime(item.Time),
    place: [item.Area, item.Action].filter(Boolean).join(' — ')
  }));

  const latest = history[0] || {};
  const delivered =
    info?.ShipmentStatus === 29 ||
    /deliverycompleted|delivered/i.test(info?.ShipmentStatusDesc || '') ||
    /παραδ/i.test(pod?.DeliveredTo || '');

  return {
    raw: rawJson,
    summary: {
      trackingNumber: info?.ShipmentAwb || trackingNumber,
      status: delivered ? 'Παραδόθηκε' : (latest.status || info?.ShipmentStatusDesc || ''),
      locker: [info?.DestinationFrom, info?.DestinationTo].filter(Boolean).join(' → '),
      updatedAt: [latest.date, latest.time].filter(Boolean).join(' ')
    },
    history
  };
}

function mapBoxNowEvent(type) {
  const map = {
    'new': 'Νέο',
    'in-depot': 'Σε depot',
    'final-destination': 'Στο τελικό σημείο',
    'delivered': 'Παραδόθηκε',
    'returned': 'Επιστροφή',
    'cancelled': 'Ακυρώθηκε',
    'lost': 'Χάθηκε',
    'missing': 'Αγνοείται',
    'waiting-for-pickup': 'Αναμονή παραλαβής'
  };
  return map[type] || type || '';
}

function toGreekDateTime(value) {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { date: '', time: '' };

  return {
    date: d.toLocaleDateString('el-GR'),
    time: d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
  };
}

function toGreekDate(value) {
  if (!value || value === '1900-01-01') return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('el-GR');
}

function toGreekTime(value) {
  if (!value || value === '00:00:00') return '';
  return String(value).slice(0, 5);
}

function extractTrackingForm(html) {
  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];

  for (const form of forms) {
    if (
      /custom-geniki-tracking-page-form/i.test(form) ||
      /custom_geniki_tracking_page_form/i.test(form)
    ) {
      return form;
    }
  }

  for (const form of forms) {
    if (/tracking_number/i.test(form)) {
      return form;
    }
  }

  return '';
}

function extractInputValue(html, name) {
  const re = new RegExp(`name=["']${escapeRegExp(name)}["'][^>]*value=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

function extractThemeToken(html) {
  const patterns = [
    /"theme_token":"([^"]+)"/i,
    /"theme_token"\s*:\s*"([^"]+)"/i,
    /ajaxPageState"[^>]*"theme_token":"([^"]+)"/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return '';
}

function extractHtmlIds(html) {
  const ids = new Set();
  const re = /\sid=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = (m[1] || '').trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function extractCookies(resp) {
  const setCookie = resp.headers.get('set-cookie') || '';
  if (!setCookie) return '';
  return setCookie
    .split(/,(?=[^;]*=)/)
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function extractField(html, cls) {
  const re = new RegExp(`<div class="${cls}">([\\s\\S]*?)<\\/div>`, 'i');
  const m = html.match(re);
  if (!m) return '';
  return m[1].replace(/<strong>[\s\S]*?<\/strong>/i, '').trim();
}

function cleanText(s) {
  return (s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ok(data, status = 200) {
  return new Response(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function errResp(err) {
  return new Response(JSON.stringify({ error: err.message }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function errJSON(status, msg, debug = {}) {
  return new Response(JSON.stringify({ error: msg, ...debug }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

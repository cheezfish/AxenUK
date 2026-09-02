const GITHUB_REPO = 'cheezfish/AxenUK';
const GITHUB_FILE = 'index.html';

const ALLOWED_ORIGIN = 'https://axenuk.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const AUTO_REPLY_HTML = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px">
  <p>Thank you for getting in touch with Axen Business House (UK) Limited, an independent energy broker. Someone will be assigned to your case immediately. We endeavour to respond within the next 24–48 working hours.</p>
  <p>Ensuring best services and best quotes from the live energy market.</p>
  <p>Best Regards,<br><strong>AXEN BUSINESS HOUSE</strong></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:11px;color:#888;line-height:1.6">This email and any attachments are confidential to the intended recipient and remain the property of the sender. If you are not the intended recipient, please advise the sender, delete this email, and do not use or disclose it. AXEN BUSINESS HOUSE (UK) LIMITED is not responsible for the accuracy or completeness of this email as it has been transmitted over a public network. AXEN BUSINESS HOUSE (UK) LIMITED is incorporated and registered in England and Wales with company number 17085162. Registered Office: 16 Centreway, Ilford, IG1 1ND.<br><br>Please consider the environment before printing this email.</p>
</div>
`;

async function verifyTurnstile(token, remoteIp, env) {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: remoteIp,
    }),
  });
  const data = await res.json();
  console.log('turnstile-debug', JSON.stringify({ hasSecret: !!env.TURNSTILE_SECRET, tokenLen: token.length, remoteIp, data }));
  return data.success === true;
}

async function sendEmail(env, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Axen UK <noreply@comms.axenuk.com>',
      to,
      subject,
      html,
    }),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes all HTML, then re-allows a small safelist of bare presentational
// tags (no attributes possible, since an attribute would fail the exact-match
// regex and stay escaped). Used only for admin-panel content pushes.
const ADMIN_SAFELIST_TAGS = ['em', 'strong', 'br'];
function sanitizeAdminValue(str) {
  let escaped = escapeHtml(str);
  for (const tag of ADMIN_SAFELIST_TAGS) {
    escaped = escaped
      .replace(new RegExp(`&lt;${tag}&gt;`, 'gi'), `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, 'gi'), `</${tag}>`)
      .replace(new RegExp(`&lt;${tag}\\s*/&gt;`, 'gi'), `<${tag}/>`);
  }
  return escaped;
}

function isValidEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const ADMIN_RATE_LIMIT_MAX = 5;
const ADMIN_RATE_LIMIT_WINDOW_SECONDS = 60;
const FORM_RATE_LIMIT_MAX = 5;
const FORM_RATE_LIMIT_WINDOW_SECONDS = 600;

// KV-backed counter (not perfectly atomic under heavy parallel load, but more
// than sufficient to make brute-forcing or flooding impractical). Each hit
// refreshes the TTL, so the window resets after the last attempt.
async function checkRateLimit(env, prefix, key, max, windowSeconds) {
  const kvKey = `${prefix}:${key}`;
  const raw = await env.ADMIN_LOGIN_ATTEMPTS.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) {
    return false;
  }
  await env.ADMIN_LOGIN_ATTEMPTS.put(kvKey, String(count + 1), {
    expirationTtl: windowSeconds,
  });
  return true;
}

async function handleAdmin(fields, env, clientIp) {
  const withinLimit = await checkRateLimit(env, 'admin-login', clientIp || 'unknown', ADMIN_RATE_LIMIT_MAX, ADMIN_RATE_LIMIT_WINDOW_SECONDS);
  if (!withinLimit) {
    return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  if (fields['password'] !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: 'Invalid password' }, 401);
  }

  let changes;
  try {
    changes = JSON.parse(fields['changes']);
  } catch {
    return jsonResponse({ error: 'Invalid changes payload' }, 400);
  }

  // Fetch current file from GitHub
  const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AxenUK-Admin',
    },
  });

  if (!ghRes.ok) {
    return jsonResponse({ error: 'Failed to fetch file from GitHub' }, 502);
  }

  const ghData = await ghRes.json();
  const sha = ghData.sha;
  let html = decodeBase64(ghData.content);

  // Apply each text change between markers
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'logos-visibility') {
      // Special case: this toggles a data-visibility attribute, not comment-delimited text
      const attrRegex = /(marquee-container py-4" data-visibility=")(none|block)(")/;
      if (attrRegex.test(html)) {
        html = html.replace(attrRegex, `$1${value === 'none' ? 'none' : 'block'}$3`);
      }
      continue;
    }
    const regex = new RegExp(`(<!-- E:${key} -->)[\\s\\S]*?(<!-- /E:${key} -->)`);
    if (regex.test(html)) {
      const safeValue = sanitizeAdminValue(value);
      html = html.replace(regex, `$1${safeValue.replace(/\$/g, '$$$$')}$2`);
    }
  }

  // Commit updated file to GitHub
  const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AxenUK-Admin',
    },
    body: JSON.stringify({
      message: 'Content update via admin panel',
      content: encodeBase64(html),
      sha,
    }),
  });

  if (!commitRes.ok) {
    const err = await commitRes.text();
    return jsonResponse({ error: 'GitHub commit failed', detail: err }, 502);
  }

  return jsonResponse({ success: true });
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let fields;
    try {
      const formData = await request.formData();
      fields = Object.fromEntries(formData);
    } catch {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    const formType = fields._form_type;

    // Admin handler — returns JSON, not a redirect
    if (formType === 'admin') {
      return handleAdmin(fields, env, request.headers.get('CF-Connecting-IP'));
    }

    // Honeypot protection: reject if honeypot field is filled
    if (fields.website && fields.website.trim() !== '') {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    // Per-IP rate limit: caps how many emails a single flooding source can trigger
    const formWithinLimit = await checkRateLimit(env, 'form-submit', request.headers.get('CF-Connecting-IP') || 'unknown', FORM_RATE_LIMIT_MAX, FORM_RATE_LIMIT_WINDOW_SECONDS);
    if (!formWithinLimit) {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    // Turnstile protection: verify the challenge token server-side
    const turnstileToken = fields['cf-turnstile-response'];
    const remoteIp = request.headers.get('CF-Connecting-IP');
    const turnstileOk = await verifyTurnstile(turnstileToken, remoteIp, env);
    if (!turnstileOk) {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    let subject, html, senderEmail, senderName;

    // All submitted field values are attacker-controlled — escape before
    // interpolating into HTML email bodies to prevent injecting fake content,
    // phishing links, or tracking pixels into notification emails.
    const f = (key) => escapeHtml(fields[key] || '—');

    if (formType === 'quote') {
      senderEmail = fields['Email'];
      senderName = fields['Contact Name'] || fields['Business Name'] || 'Customer';
      subject = `New Quote Request — ${escapeHtml(fields['Business Name'] || 'Unknown Business')}`;
      html = `
        <h2>New Quote Request</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Business Name</b></td><td>${f('Business Name')}</td></tr>
          <tr><td><b>Contact Name</b></td><td>${f('Contact Name')}</td></tr>
          <tr><td><b>Site Address</b></td><td>${f('Site Address')}</td></tr>
          <tr><td><b>Email</b></td><td>${f('Email')}</td></tr>
          <tr><td><b>Phone</b></td><td>${f('Phone')}</td></tr>
          <tr><td><b>Mobile</b></td><td>${f('Mobile')}</td></tr>
          <tr><td><b>Current Suppliers</b></td><td>${f('Current Suppliers')}</td></tr>
          <tr><td><b>Contract End Date</b></td><td>${f('Contract End Date')}</td></tr>
          <tr><td><b>Meter Serial Numbers</b></td><td>${f('Meter Serial Numbers')}</td></tr>
          <tr><td><b>Special Circumstances</b></td><td>${f('Special Circumstances')}</td></tr>
        </table>
      `;
    } else if (formType === 'join') {
      senderEmail = fields['Email Address'];
      senderName = fields['Name'] || 'Applicant';
      subject = `New Partner Application — ${escapeHtml(fields['Name'] || 'Unknown')}`;
      html = `
        <h2>New Partner Application</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Name</b></td><td>${f('Name')}</td></tr>
          <tr><td><b>Business Name</b></td><td>${f('Business Name')}</td></tr>
          <tr><td><b>Company Address</b></td><td>${f('Company Address')}</td></tr>
          <tr><td><b>Trading Address</b></td><td>${f('Trading Address')}</td></tr>
          <tr><td><b>Phone Number</b></td><td>${f('Phone Number')}</td></tr>
          <tr><td><b>Mobile Number</b></td><td>${f('Mobile Number')}</td></tr>
          <tr><td><b>Email Address</b></td><td>${f('Email Address')}</td></tr>
          <tr><td><b>Website</b></td><td>${f('Website')}</td></tr>
          <tr><td><b>ADR Registration Number</b></td><td>${f('ADR Registration Number')}</td></tr>
        </table>
      `;
    } else if (formType === 'contact') {
      senderEmail = fields['Email'];
      senderName = fields['Name'] || 'Visitor';
      subject = `New Message from ${escapeHtml(fields['Name'] || 'Unknown')}`;
      html = `
        <h2>New Contact Message</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Name</b></td><td>${f('Name')}</td></tr>
          <tr><td><b>Email</b></td><td>${f('Email')}</td></tr>
          <tr><td><b>Message</b></td><td>${f('Message')}</td></tr>
        </table>
      `;
    } else {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    const requests = [
      sendEmail(env, { to: ['admin@axenuk.com'], subject, html }),
    ];

    if (isValidEmail(senderEmail)) {
      requests.push(sendEmail(env, {
        to: [senderEmail],
        subject: 'Thank you for contacting Axen Business House (UK) Limited',
        html: AUTO_REPLY_HTML,
      }));
    }

    const results = await Promise.all(requests);

    if (!results[0].ok) {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    return Response.redirect('https://axenuk.com/?status=success', 302);
  },
};

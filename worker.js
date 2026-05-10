const AUTO_REPLY_HTML = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px">
  <p>Thank you for getting in touch with Axen Business House (UK) Limited, an independent energy broker. Someone will be assigned to your case immediately. We endeavour to respond within the next 24–48 working hours.</p>
  <p>Ensuring best services and best quotes from the live energy market.</p>
  <p>Best Regards,<br><strong>AXEN BUSINESS HOUSE</strong></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:11px;color:#888;line-height:1.6">This email and any attachments are confidential to the intended recipient and remain the property of the sender. If you are not the intended recipient, please advise the sender, delete this email, and do not use or disclose it. AXEN BUSINESS HOUSE (UK) LIMITED is not responsible for the accuracy or completeness of this email as it has been transmitted over a public network. AXEN BUSINESS HOUSE (UK) LIMITED is incorporated and registered in England and Wales with company number 17085162. Registered Office: Flat 803, 450, Charter House, High Road, Essex, IG2 7JB.<br><br>Please consider the environment before printing this email.</p>
</div>
`;

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

export default {
  async fetch(request, env) {
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
    let subject, html, senderEmail, senderName;

    if (formType === 'quote') {
      senderEmail = fields['Email'];
      senderName = fields['Contact Name'] || fields['Business Name'] || 'Customer';
      subject = `New Quote Request — ${fields['Business Name'] || 'Unknown Business'}`;
      html = `
        <h2>New Quote Request</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Business Name</b></td><td>${fields['Business Name'] || '—'}</td></tr>
          <tr><td><b>Contact Name</b></td><td>${fields['Contact Name'] || '—'}</td></tr>
          <tr><td><b>Site Address</b></td><td>${fields['Site Address'] || '—'}</td></tr>
          <tr><td><b>Email</b></td><td>${fields['Email'] || '—'}</td></tr>
          <tr><td><b>Phone</b></td><td>${fields['Phone'] || '—'}</td></tr>
          <tr><td><b>Mobile</b></td><td>${fields['Mobile'] || '—'}</td></tr>
          <tr><td><b>Current Suppliers</b></td><td>${fields['Current Suppliers'] || '—'}</td></tr>
          <tr><td><b>Contract End Date</b></td><td>${fields['Contract End Date'] || '—'}</td></tr>
          <tr><td><b>Meter Serial Numbers</b></td><td>${fields['Meter Serial Numbers'] || '—'}</td></tr>
          <tr><td><b>Special Circumstances</b></td><td>${fields['Special Circumstances'] || '—'}</td></tr>
        </table>
      `;
    } else if (formType === 'join') {
      senderEmail = fields['Email Address'];
      senderName = fields['Name'] || 'Applicant';
      subject = `New Partner Application — ${fields['Name'] || 'Unknown'}`;
      html = `
        <h2>New Partner Application</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Name</b></td><td>${fields['Name'] || '—'}</td></tr>
          <tr><td><b>Business Name</b></td><td>${fields['Business Name'] || '—'}</td></tr>
          <tr><td><b>Company Address</b></td><td>${fields['Company Address'] || '—'}</td></tr>
          <tr><td><b>Trading Address</b></td><td>${fields['Trading Address'] || '—'}</td></tr>
          <tr><td><b>Phone Number</b></td><td>${fields['Phone Number'] || '—'}</td></tr>
          <tr><td><b>Mobile Number</b></td><td>${fields['Mobile Number'] || '—'}</td></tr>
          <tr><td><b>Email Address</b></td><td>${fields['Email Address'] || '—'}</td></tr>
          <tr><td><b>Website</b></td><td>${fields['Website'] || '—'}</td></tr>
          <tr><td><b>ADR Registration Number</b></td><td>${fields['ADR Registration Number'] || '—'}</td></tr>
        </table>
      `;
    } else if (formType === 'contact') {
      senderEmail = fields['Email'];
      senderName = fields['Name'] || 'Visitor';
      subject = `New Message from ${fields['Name'] || 'Unknown'}`;
      html = `
        <h2>New Contact Message</h2>
        <table cellpadding="6" style="border-collapse:collapse;width:100%">
          <tr><td><b>Name</b></td><td>${fields['Name'] || '—'}</td></tr>
          <tr><td><b>Email</b></td><td>${fields['Email'] || '—'}</td></tr>
          <tr><td><b>Message</b></td><td>${fields['Message'] || '—'}</td></tr>
        </table>
      `;
    } else {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    // Send notification to admin and auto-reply to sender in parallel
    const requests = [
      sendEmail(env, { to: ['admin@axenuk.com'], subject, html }),
    ];

    if (senderEmail) {
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

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
    let subject, html;

    if (formType === 'quote') {
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Axen UK <noreply@comms.axenuk.com>',
        to: ['admin@axenuk.com'],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      return Response.redirect('https://axenuk.com/?status=error', 302);
    }

    return Response.redirect('https://axenuk.com/?status=success', 302);
  },
};

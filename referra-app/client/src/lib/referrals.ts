export interface ReferralLocation {
  name: string;
  organizationType?: string | null;
  phone?: string | null;
  email?: string | null;
  url?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  doctors?: string | null;
  capacity?: string | null;
  specialties?: string | null;
  procedures?: string | null;
  equipment?: string | null;
  capabilities?: string | null;
}

function clean(value: string | null | undefined) {
  return value?.trim() || '';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function referralAddress(referral: ReferralLocation) {
  return [
    clean(referral.address),
    [clean(referral.city), clean(referral.state), clean(referral.postalCode)].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' | ');
}

function referralLines(referral: ReferralLocation): Array<[string, string]> {
  const rows: Array<[string, string | null | undefined]> = [
    ['Organization type', referral.organizationType],
    ['Phone', referral.phone],
    ['Email', referral.email],
    ['URL', referral.url],
    ['Address', referralAddress(referral)],
    ['Doctors', referral.doctors],
    ['Capacity', referral.capacity],
    ['Specialties', referral.specialties],
    ['Procedures', referral.procedures],
    ['Equipment', referral.equipment],
    ['Capabilities', referral.capabilities],
  ];

  return rows
    .map(([label, value]) => [label, clean(value)] as [string, string])
    .filter(([, value]) => value);
}

export function printReferralPacket(referrals: ReferralLocation[]) {
  if (referrals.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const generatedAt = new Date().toLocaleString();
  const cards = referrals
    .map((referral, index) => {
      const detailRows = referralLines(referral)
        .map(([label, value]) => {
          const text = clean(value);
          const renderedValue =
            label === 'URL' && /^https?:\/\//i.test(text)
              ? `<a href="${escapeHtml(text)}">${escapeHtml(text)}</a>`
              : escapeHtml(text);

          return `
            <div class="row">
              <dt>${escapeHtml(label)}</dt>
              <dd>${renderedValue}</dd>
            </div>
          `;
        })
        .join('');

      return `
        <section class="card">
          <div class="eyebrow">Referral ${index + 1}</div>
          <h2>${escapeHtml(referral.name)}</h2>
          <dl>${detailRows}</dl>
        </section>
      `;
    })
    .join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Referra referral packet</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
            line-height: 1.35;
          }
          header {
            border-bottom: 2px solid #111827;
            margin-bottom: 24px;
            padding-bottom: 16px;
          }
          h1 {
            font-size: 24px;
            margin: 0;
          }
          .meta {
            color: #4b5563;
            font-size: 12px;
            margin-top: 6px;
          }
          .card {
            border: 1px solid #d1d5db;
            break-inside: avoid;
            margin-bottom: 16px;
            padding: 18px;
          }
          .eyebrow {
            color: #4b5563;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          h2 {
            font-size: 18px;
            margin: 4px 0 14px;
          }
          dl {
            display: grid;
            gap: 8px;
            margin: 0;
          }
          .row {
            display: grid;
            gap: 10px;
            grid-template-columns: 145px 1fr;
          }
          dt {
            color: #4b5563;
            font-weight: 700;
          }
          dd {
            margin: 0;
            overflow-wrap: anywhere;
          }
          footer {
            border-top: 1px solid #d1d5db;
            color: #4b5563;
            font-size: 12px;
            margin-top: 24px;
            padding-top: 12px;
          }
          @page { margin: 0.6in; }
        </style>
      </head>
      <body>
        <header>
          <h1>Referra referral packet</h1>
          <div class="meta">${referrals.length} location${referrals.length === 1 ? '' : 's'} | Generated ${escapeHtml(generatedAt)}</div>
        </header>
        ${cards}
        <footer>Confirm availability, eligibility, and appointment details directly with each clinic.</footer>
        <script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

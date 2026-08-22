import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const openidMode = searchParams.get('openid.mode');

  if (openidMode === 'id_res') {
    const claimedId = searchParams.get('openid.claimed_id') || '';
    const steamId = claimedId.split('/').pop() || '';

    // Build the "please double check this" request using the exact same
    // parameters Steam sent us, just switching the mode.
    const verifyParams = new URLSearchParams(searchParams);
    verifyParams.set('openid.mode', 'check_authentication');

    const verifyResponse = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
    const verifyText = await verifyResponse.text();
    const isValid = verifyText.includes('is_valid:true');

    if (isValid && steamId && steamId.match(/^\d{17}$/)) {
      if (!process.env.JWT_SECRET) {
        console.error('❌ Missing JWT_SECRET in frontend environment.');
        return new Response('Server misconfigured.', { status: 500 });
      }

      // Build a short-lived, signed "proof" that only OUR server could have
      // made, since it's stamped with a secret key the browser never sees.
      const expires = Date.now() + 60_000; // valid for 60 seconds
      const payload = `${steamId}:${expires}`;
      const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(payload)
        .digest('hex');
      const proof = `${payload}:${signature}`;

      return new Response(
        `<html>
          <body>
            <script>
              window.opener.postMessage({ type: 'STEAM_LOGIN', proof: '${proof}' }, '*');
              window.close();
            </script>
            <p>Authentication complete! You can close this window now.</p>
          </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Steam said no, or the data was malformed — don't hand out anything.
    return new Response('Steam login could not be verified.', { status: 401 });
  }

  const realm = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const returnTo = `${realm}/api/auth/steam`;

  const steamOpenIdUrl = `https://steamcommunity.com/openid/login?` + new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  }).toString();

  return NextResponse.redirect(steamOpenIdUrl);
}

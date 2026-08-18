import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const openidMode = searchParams.get('openid.mode');

  // Steam OpenID return callback handler
  if (openidMode === 'id_res') {
    const claimedId = searchParams.get('openid.claimed_id') || '';
    const steamId = claimedId.split('/').pop() || '';

    if (steamId && steamId.match(/^\d{17}$/)) {
      // Return HTML script to pass the SteamID back to our main client app window safely
      return new Response(
        `<html>
          <body>
            <script>
              window.opener.postMessage({ type: 'STEAM_LOGIN', steamId: '${steamId}' }, '*');
              window.close();
            </script>
            <p>Authentication complete! You can close this window now.</p>
          </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
  }

  // Redirect to Steam Community OpenID login page manually
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

